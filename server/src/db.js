import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { SPHINX_STOCK_DEFAULT } from '../../shared/balance.js'
import { normalizeProfile } from '../../shared/logic.js'

/**
 * Persistence, behind one small async API with two backends:
 *
 * - MongoDB when MONGODB_URI is set: Bloxity Legion gives every game (and channel) its
 *   own managed database, shared by all of the game's pods.
 * - Otherwise one SQLite file through Node's built-in driver, for local development.
 *
 * Profiles are stored whole as JSON, with the leaderboard numbers copied alongside so
 * the boards are plain indexed queries.
 *
 * Saves are owned. Loading a profile claims it for the session that loaded it
 * (`owner`), and a save from any other owner is dropped: when a player refreshes, or
 * is moved to another pod, the session they left can never write stale progress over
 * the one they're playing in now.
 */

const DB_PATH = process.env.DB_PATH || fileURLToPath(new URL('../data/slide.db', import.meta.url))

const BOARDS = { rebirths: 'rebirths', playtime: 'playtime', distance: 'bestDistance' }

const leaderboardFields = (profile) => ({
  name: profile.name,
  rebirths: profile.rebirths,
  playtime: profile.stats.playtime,
  bestDistance: profile.stats.bestDistance,
  updatedAt: profile.lastSeen,
})

async function openMongo(uri) {
  const { MongoClient } = await import('mongodb')
  const client = new MongoClient(uri, { maxPoolSize: 10 })
  await client.connect()
  // The database named in the URI: the one Legion scoped to this game.
  const db = client.db()
  const profiles = db.collection('profiles')
  const kv = db.collection('kv')
  await Promise.all([
    ...Object.values(BOARDS).map((field) => profiles.createIndex({ [field]: -1 })),
    kv.updateOne({ _id: 'sphinxStock' }, { $setOnInsert: { value: SPHINX_STOCK_DEFAULT } }, { upsert: true }),
  ])

  return {
    async load(id, owner) {
      const doc = await profiles.findOneAndUpdate({ _id: id }, { $set: { owner } }, { returnDocument: 'after' })
      return doc ? doc.data : null
    },
    async save(profile, owner) {
      try {
        // Matches only while `owner` still owns it; if someone else took it over the
        // upsert collides on _id instead of overwriting their progress.
        await profiles.updateOne(
          { _id: profile.id, owner },
          { $set: { owner, data: JSON.stringify(profile), ...leaderboardFields(profile) } },
          { upsert: true },
        )
        return true
      } catch (err) {
        if (err?.code === 11000) return false
        throw err
      }
    },
    async top(limit) {
      const out = {}
      for (const [board, field] of Object.entries(BOARDS)) {
        const docs = await profiles
          .find({}, { projection: { name: 1, [field]: 1 } })
          .sort({ [field]: -1 })
          .limit(limit)
          .toArray()
        out[board] = docs.map((d) => ({ name: d.name, value: d[field] ?? 0 }))
      }
      return out
    },
    async stock() {
      const doc = await kv.findOne({ _id: 'sphinxStock' })
      return doc ? doc.value : SPHINX_STOCK_DEFAULT
    },
    async take() {
      const doc = await kv.findOneAndUpdate({ _id: 'sphinxStock', value: { $gt: 0 } }, { $inc: { value: -1 } }, { returnDocument: 'after' })
      return doc ? doc.value : null
    },
    close: () => client.close(),
  }
}

async function openSqlite(path) {
  const { DatabaseSync } = await import('node:sqlite')
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      rebirths INTEGER NOT NULL DEFAULT 0,
      playtime REAL NOT NULL DEFAULT 0,
      best_distance REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS profiles_rebirths ON profiles (rebirths DESC);
    CREATE INDEX IF NOT EXISTS profiles_playtime ON profiles (playtime DESC);
    CREATE INDEX IF NOT EXISTS profiles_distance ON profiles (best_distance DESC);
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `)
  const columns = { rebirths: 'rebirths', playtime: 'playtime', distance: 'best_distance' }
  const readStock = () => {
    const row = db.prepare("SELECT value FROM kv WHERE key = 'sphinxStock'").get()
    return row ? Number(row.value) : SPHINX_STOCK_DEFAULT
  }

  // One process owns this file, so `owner` has nothing to guard against here.
  return {
    async load(id) {
      return db.prepare('SELECT data FROM profiles WHERE id = ?').get(id)?.data ?? null
    },
    async save(profile) {
      const f = leaderboardFields(profile)
      db.prepare(
        `INSERT INTO profiles (id, name, data, rebirths, playtime, best_distance, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, data = excluded.data, rebirths = excluded.rebirths,
           playtime = excluded.playtime, best_distance = excluded.best_distance,
           updated_at = excluded.updated_at`,
      ).run(profile.id, f.name, JSON.stringify(profile), f.rebirths, f.playtime, f.bestDistance, f.updatedAt)
      return true
    },
    async top(limit) {
      const out = {}
      for (const [board, column] of Object.entries(columns)) {
        out[board] = db
          .prepare(`SELECT name, ${column} AS value FROM profiles ORDER BY ${column} DESC LIMIT ?`)
          .all(limit)
          .map((r) => ({ name: r.name, value: r.value }))
      }
      return out
    },
    async stock() {
      return readStock()
    },
    async take() {
      const stock = readStock()
      if (stock <= 0) return null
      db.prepare("INSERT INTO kv (key, value) VALUES ('sphinxStock', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
        String(stock - 1),
      )
      return stock - 1
    },
    close: async () => db.close(),
  }
}

let store = null
/** Sphinx stock as last known here; kept current from the database. */
let stock = SPHINX_STOCK_DEFAULT

/** Opens the database: MongoDB if MONGODB_URI is set, else the local SQLite file. */
export async function openStorage({ mongoUri = process.env.MONGODB_URI, path = DB_PATH } = {}) {
  store = mongoUri ? await openMongo(mongoUri) : await openSqlite(path)
  stock = await store.stock()
  console.log(`[db] using ${mongoUri ? 'MongoDB' : `SQLite at ${path}`}`)
}

export async function closeStorage() {
  await store?.close()
  store = null
}

/** Loads (or creates) the profile for `id`, normalised, and claims it for `owner`. */
export async function loadProfile(id, name, owner) {
  const data = await store.load(id, owner)
  let raw = null
  if (data) {
    try {
      raw = JSON.parse(data)
    } catch {
      console.warn(`[db] corrupt profile for ${id}, starting fresh`)
    }
  }
  return normalizeProfile(raw, id, name)
}

/**
 * Saves a profile if `owner` still owns it. Resolves false when it was dropped (owned
 * by a newer session) or failed; never throws, so a save can't break a leave.
 */
export async function saveProfile(profile, owner) {
  profile.lastSeen = Date.now()
  try {
    return await store.save(profile, owner)
  } catch (err) {
    console.error(`[db] save failed for ${profile.id}`, err)
    return false
  }
}

/** Top `limit` players per board: `{ rebirths: [{ name, value }], ... }`. */
export const topPlayers = (limit = 10) => store.top(limit)

export const getSphinxStock = () => stock

/**
 * Takes one Sphinx. Synchronous for the purchase rules: decided on the stock known
 * here, then made permanent in the database, which has the final say (another pod may
 * have sold the last one a moment ago). Returns false when sold out.
 */
export function takeSphinx() {
  if (stock <= 0) return false
  stock -= 1
  store
    .take()
    .then((left) => {
      stock = left ?? 0
    })
    .catch((err) => console.error('[db] sphinx stock update failed', err))
  return true
}

/** Re-reads the stock, so sales on other pods show up here. */
export async function refreshStock() {
  stock = await store.stock()
  return stock
}
