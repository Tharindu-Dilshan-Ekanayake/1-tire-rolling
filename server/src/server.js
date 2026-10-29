import cors from 'cors'
import express from 'express'
import { defineRoom, defineServer } from '@colyseus/core'
import { WebSocketTransport } from '@colyseus/ws-transport'

import { closeStorage, openStorage } from './db.js'
import { startLeaderboards } from './leaderboards.js'
import { activePlayers } from './registry.js'
import { GameRoom } from './rooms/GameRoom.js'

// Bloxity Legion injects PORT (HTTP and WebSocket share it); 2567 is Colyseus's usual.
const PORT = Number(process.env.PORT || 2567)

/**
 * Browser origins allowed to call /api: Legion's CLIENT_ORIGIN (the game's site), the
 * Bloxity-hosted frontends, extra ones from CLIENT_ORIGINS, and Vite dev servers.
 */
const gameId = process.env.BLOXITY_GAME_ID
const ALLOWED_ORIGINS = [
  process.env.CLIENT_ORIGIN,
  gameId && `https://${gameId}.play.bloxity.io`,
  gameId && `https://${gameId}.dev.play.bloxity.io`,
  ...(process.env.CLIENT_ORIGINS || '').split(',').map((s) => s.trim()),
  ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173', 'http://localhost:5180', 'http://127.0.0.1:5180']),
].filter(Boolean)

/** HTTP endpoints next to the Colyseus matchmaker on the same port. */
function routes(app) {
  // Legion's readiness and liveness probes. Answers at once, whatever else is going on.
  app.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.use('/api', cors({ origin: ALLOWED_ORIGINS, credentials: true }))
  app.use('/api', express.json())

  app.get('/api/health', (_req, res) => {
    // `game` lets a development client tell this server from another project's.
    res.json({ ok: true, game: 'slide', players: activePlayers.size })
  })

  /**
   * Auth passthrough for the Bloxity SDK: the frontend POSTs `{ token, user }` from
   * `Legion.SDK.auth.authenticateWithServer('/api/legion-auth')`.
   */
  app.post('/api/legion-auth', (req, res) => {
    // TODO: verify the Bloxity JWT here before trusting req.body.user. Until then
    // `req.body.user` is attacker-controlled - anyone can POST any legionId. Verify
    // `req.body.token` against Bloxity's public key / introspection endpoint and
    // derive the user from the *verified* claims, not from the body.
    res.json({ accessToken: 'stub', user: { legionId: req.body?.user?._id } })
  })
}

await openStorage()

const server = defineServer({
  transport: new WebSocketTransport(),
  rooms: {
    game: defineRoom(GameRoom).enableRealtimeListing(),
  },
  express: routes,
  greet: false,
})

// SIGTERM (a deploy or scale-in) runs Colyseus' graceful shutdown: every room saves
// and hands its players to another pod (GameRoom.onBeforeShutdown), then this.
server.onShutdown(() => closeStorage())

await server.listen(PORT)
startLeaderboards()
console.log(`[server] listening on port ${PORT}${process.env.POD_NAME ? ` (${process.env.POD_NAME}, ${process.env.BLOXITY_CHANNEL})` : ''}`)
