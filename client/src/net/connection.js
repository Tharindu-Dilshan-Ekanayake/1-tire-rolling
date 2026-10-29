import { waitForSDK } from '../bloxity/sdk'
import { runtime } from '../game/runtime'
import { getGame } from '../store/game'
import { setTransport } from './actions'
import { handleServerEvent } from './events'
import { createLocalServer } from './localServer'
import { clearRemotePlayers, removeRemotePlayer, upsertRemotePlayer } from './remotePlayers'

/** Position reports per second (the server validates each against the last). */
const POSITION_HZ = 10
const JOIN_RETRIES = 4
const RETRY_DELAY_MS = 4000
/** Server code for "you joined from another window". */
const DUPLICATE_LOGIN = 4100
/** Matchmaker: give up and play offline after this long (it holds a cold start ~45 s). */
const MATCHMAKER_GIVE_UP_MS = 60_000
const MATCHMAKER_BACKOFF_MS = [1000, 2000, 4000, 8000, 10000]

const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')

/**
 * Where to play. `?offline` forces offline play, and in development `?server=` points
 * straight at a server. A build with VITE_LEGION_GAME_ID (the hosted game on Bloxity
 * Legion) goes through Legion's matchmaker, which picks a pod with room or starts one.
 * Otherwise VITE_SERVER_URL; in development, this game's server on the same host
 * (see findDevServer). A production build with neither plays offline.
 *
 * @returns {{ kind: 'matchmaker', gameId: string } | { kind: 'direct', url: string } | { kind: 'dev' } | null}
 */
function serverTarget() {
  if (params.has('offline')) return null
  if (import.meta.env.DEV && params.get('server')) return { kind: 'direct', url: params.get('server') }
  if (import.meta.env.VITE_LEGION_GAME_ID) return { kind: 'matchmaker', gameId: import.meta.env.VITE_LEGION_GAME_ID }
  if (import.meta.env.VITE_SERVER_URL) return { kind: 'direct', url: import.meta.env.VITE_SERVER_URL }
  return import.meta.env.DEV ? { kind: 'dev' } : null
}

/**
 * Local development: the game server's usual port, then 3000, where older server .env
 * files put it. Only a server that says it's this game counts, so another project's
 * server on one of those ports (the +1 Frisbee one, say) is skipped.
 */
const DEV_PORTS = [2567, 3000]
async function findDevServer() {
  for (const port of DEV_PORTS) {
    const url = `${window.location.protocol}//${window.location.hostname}:${port}`
    const health = await healthOf(url)
    if (health?.ok && health.game === 'slide') return url
  }
  return null
}

let active = null
let generation = 0
let lastIdentity = null
/** What our avatar wears, as last shared; sent again on every join. */
let localLook = null
/** Sends `look` to the room now, if there is one. */
let sendLook = () => {}

/**
 * Shares what our Bloxity avatar wears so other players can dress our character the
 * same. Kept and re-sent on every (re)join.
 */
export function shareLook(equipped, proportions) {
  localLook = { equipped: equipped || {}, proportions: proportions || {} }
  sendLook()
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** The server's /api/health answer, or null if it can't be reached. */
async function healthOf(url) {
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2500) })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

function startLocal(identity, message) {
  const local = createLocalServer({ ...identity, onEvent: handleServerEvent })
  active = { kind: 'local', close: () => local.close() }
  setTransport(local)
  getGame().setNet({ mode: 'offline', players: 1, lobbyId: null, code: null, isPrivate: false, message })
}

function join(client, options, lobby) {
  if (lobby.mode === 'private') return client.create('game', { ...options, private: true })
  if (lobby.mode === 'join') return client.joinById(String(lobby.code).trim().toUpperCase(), options)
  return client.joinOrCreate('game', options)
}

/** Wires a joined room into the game: events, other players, position reports. */
function attachRoom(room, identity, Callbacks) {
  const callbacks = Callbacks.get(room)
  let leaving = false
  /** Set when the same account joined from another window and took over. */
  let replaced = false

  // Closing or refreshing the page leaves properly, so the server lets go of us at
  // once instead of holding our seat (and a frozen copy of us) for a reconnect.
  const onPageHide = () => {
    leaving = true
    room.leave(true)
  }
  window.addEventListener('pagehide', onPageHide)

  const syncLobby = () => {
    const players = room.state.players?.size ?? 1
    const isPrivate = Boolean(room.state.isPrivate)
    getGame().setNet({
      mode: 'online',
      lobbyId: room.roomId,
      code: isPrivate ? room.state.code : null,
      isPrivate,
      players,
      message: null,
    })
  }

  room.onMessage('*', (type, payload) => {
    switch (type) {
      case 'spawn':
        runtime.player.position.set(payload.x, 0, payload.z)
        break
      case 'correct':
        runtime.player.position.set(payload.x, payload.y, payload.z)
        break
      case 'stock':
        getGame().setSphinxStock(payload.sphinx)
        break
      case 'leaderboards':
        getGame().setLeaderboards(payload)
        break
      case 'ghostSlide':
        runtime.ghostSlides.set(payload.sid, { ...payload, startedAt: performance.now() })
        break
      case 'kicked':
        leaving = true
        replaced = true
        break
      default:
        handleServerEvent(type, payload)
    }
  })

  callbacks.onAdd('players', (player, sessionId) => {
    if (sessionId !== room.sessionId) {
      upsertRemotePlayer(sessionId, player)
      callbacks.onChange(player, () => upsertRemotePlayer(sessionId, player))
    }
    syncLobby()
  })
  callbacks.onRemove('players', (_player, sessionId) => {
    removeRemotePlayer(sessionId)
    syncLobby()
  })
  callbacks.listen('isPrivate', syncLobby)

  sendLook = () => {
    if (localLook) room.send('look', localLook)
  }
  sendLook()

  // ~10 Hz position reports, skipped while standing still and doing nothing new.
  let last = { x: NaN, y: NaN, z: NaN, a: '' }
  let lastSentAt = 0
  const posId = setInterval(() => {
    const p = runtime.player.position
    const a = runtime.player.anim
    const now = performance.now()
    const moved = Math.abs(p.x - last.x) + Math.abs(p.y - last.y) + Math.abs(p.z - last.z) > 0.03
    if (!moved && a === last.a && now - lastSentAt < 1000) return
    last = { x: p.x, y: p.y, z: p.z, a }
    lastSentAt = now
    room.send('pos', { x: p.x, y: p.y, z: p.z, r: runtime.player.yaw, a })
  }, 1000 / POSITION_HZ)

  room.onDrop(() => getGame().setNet({ mode: 'connecting', message: 'Reconnecting…' }))
  room.onReconnect(syncLobby)
  room.onLeave((code) => {
    window.removeEventListener('pagehide', onPageHide)
    clearInterval(posId)
    sendLook = () => {}
    clearRemotePlayers()
    if (replaced || code === DUPLICATE_LOGIN) {
      getGame().setNet({ mode: 'replaced', message: 'Playing in another window' })
      return
    }
    if (leaving) {
      getGame().setNet({ mode: 'offline', message: 'Disconnected' })
      return
    }
    // Lost the room for good (server restart, reconnect window missed): rejoin.
    if (active?.room === room) {
      getGame().setNet({ mode: 'connecting', message: 'Reconnecting…' })
      setTimeout(() => startConnection(identity), 1500)
    }
  })

  active = {
    kind: 'online',
    room,
    close: () => {
      leaving = true
      clearInterval(posId)
      clearRemotePlayers()
      room.leave(true)
    },
  }
  setTransport({ send: (type, payload) => room.send(type, payload) })
  syncLobby()
}

/**
 * Connects `identity` ({ id, name }) to a lobby. `lobby.mode` is 'public' (matchmade,
 * the default), 'private' (a new private lobby) or 'join' (with `lobby.code`).
 * Falls back to offline play when no server is reachable.
 */
export async function startConnection(identity, lobby = { mode: 'public' }) {
  const gen = ++generation
  lastIdentity = identity
  stopConnection()
  const target = serverTarget()
  if (!target) {
    startLocal(identity, null)
    return
  }

  getGame().setNet({ mode: 'connecting', message: 'Connecting…' })
  if (target.kind === 'matchmaker') {
    await joinThroughMatchmaker(gen, identity, target.gameId)
    return
  }
  const url = target.kind === 'dev' ? await findDevServer() : (await healthOf(target.url)) && target.url
  if (gen !== generation) return
  if (!url) {
    startLocal(identity, 'Server unreachable - playing offline')
    return
  }

  // Loaded on demand: offline play never downloads the networking code, and online play
  // fetches it in parallel with the lobby rather than in front of it.
  const { Client, Callbacks } = await import('@colyseus/sdk')
  if (gen !== generation) return
  const client = new Client(url)
  const options = { playerId: identity.id, name: identity.name }
  for (let attempt = 0; attempt <= JOIN_RETRIES; attempt += 1) {
    try {
      // After a failed private/join attempt, fall back to a public lobby.
      const room = await join(client, options, attempt === 0 ? lobby : { mode: 'public' })
      if (gen !== generation) {
        room.leave(true)
        return
      }
      attachRoom(room, identity, Callbacks)
      return
    } catch (err) {
      if (gen !== generation) return
      console.warn('[net] join failed', err)
      if (attempt >= 1) getGame().setNet({ mode: 'connecting', message: 'Server full, retrying…' })
      await wait(attempt === 0 ? 300 : RETRY_DELAY_MS)
      if (gen !== generation) return
    }
  }
  startLocal(identity, 'Could not join a lobby - playing offline')
}

/**
 * Hosted on Bloxity Legion: every attempt asks the matchmaker for a seat (it picks a
 * pod with room, or cold-starts one), then joins the endpoint it returns with a NEW
 * Client - each endpoint is pinned to one pod. Retries with backoff for up to a
 * minute, then plays offline.
 */
async function joinThroughMatchmaker(gen, identity, gameId) {
  const options = { playerId: identity.id, name: identity.name }
  const started = performance.now()
  const [{ Client, Callbacks }, sdk] = await Promise.all([import('@colyseus/sdk'), waitForSDK().catch(() => null)])
  if (gen !== generation) return
  if (!sdk?.net?.resolveEndpoint) {
    startLocal(identity, 'Server unreachable - playing offline')
    return
  }
  for (let attempt = 0; ; attempt += 1) {
    try {
      const { endpoint } = await sdk.net.resolveEndpoint(gameId)
      if (gen !== generation) return
      const room = await new Client(endpoint).joinOrCreate('game', options)
      if (gen !== generation) {
        room.leave(true)
        return
      }
      attachRoom(room, identity, Callbacks)
      return
    } catch (err) {
      if (gen !== generation) return
      console.warn('[net] matchmaker join failed', err)
      if (performance.now() - started > MATCHMAKER_GIVE_UP_MS) break
      getGame().setNet({ mode: 'connecting', message: attempt === 0 ? 'Starting a server…' : 'Still connecting…' })
      await wait(MATCHMAKER_BACKOFF_MS[Math.min(attempt, MATCHMAKER_BACKOFF_MS.length - 1)])
      if (gen !== generation) return
    }
  }
  startLocal(identity, 'Could not reach the game server - playing offline')
}

/** Takes the game back after another window of the same account replaced this one. */
export function playHere() {
  if (lastIdentity) startConnection(lastIdentity)
}

/** Moves to another lobby with the same identity (from the lobby panel). */
export function switchLobby(lobby) {
  if (lastIdentity) startConnection(lastIdentity, lobby)
}

export function isOnline() {
  return active?.kind === 'online'
}

export function stopConnection() {
  if (!active) return
  setTransport(null)
  active.close()
  active = null
}
