// CACHE PERSISTENTE del teléfono (SQLite local, expo-sqlite). Guarda la HISTORIA COMPLETA de cada chat en el propio celular;
// de la red baja SOLO el DELTA (mensajes con rev > el que ya tengo). Así los mensajes viejos no se re-descargan — abrir es instantáneo.
// Un item = una fila (thread, id, ts, rev, json). La metadata del hilo (nombre/foto/maxRev/oldestTs/hasMore) va en tmeta.
import * as SQLite from "expo-sqlite"

let _dbP
function db() {
  if (_dbP) return _dbP
  _dbP = (async () => {
    const d = await SQLite.openDatabaseAsync("pipe.db")
    await d.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS msgs (thread TEXT, id TEXT, ts INTEGER, rev INTEGER, json TEXT, PRIMARY KEY(thread, id));
      CREATE INDEX IF NOT EXISTS idx_msgs_thread_ts ON msgs(thread, ts);
      CREATE TABLE IF NOT EXISTS tmeta (thread TEXT PRIMARY KEY, json TEXT);
    `)
    return d
  })()
  return _dbP
}

// carga los items del hilo (ordenados por ts) + la metadata. limit = solo la cola (para hilos enormes no traemos todo a memoria).
export async function loadThread(key, limit = 400) {
  try {
    const d = await db()
    const rows = await d.getAllAsync("SELECT json FROM msgs WHERE thread=? ORDER BY ts DESC LIMIT ?", [key, limit])
    const items = rows.map((r) => { try { return JSON.parse(r.json) } catch { return null } }).filter(Boolean).reverse()
    const m = await d.getFirstAsync("SELECT json FROM tmeta WHERE thread=?", [key])
    let meta = {}; if (m) { try { meta = JSON.parse(m.json) } catch {} }
    return { items, meta }
  } catch { return { items: [], meta: {} } }
}

// upsert de items (por id, ignora los optimistas) + merge de la metadata del hilo
export async function saveThread(key, items, metaPatch) {
  try {
    const d = await db()
    const real = (items || []).filter((it) => it && it.id && !String(it.id).startsWith("opt-"))
    if (real.length) {
      await d.withTransactionAsync(async () => {
        for (const it of real) await d.runAsync("INSERT OR REPLACE INTO msgs (thread, id, ts, rev, json) VALUES (?,?,?,?,?)", [key, String(it.id), it.ts || 0, it.rev || 0, JSON.stringify(it)])
      })
    }
    if (metaPatch) {
      const cur = await d.getFirstAsync("SELECT json FROM tmeta WHERE thread=?", [key])
      let prev = {}; if (cur) { try { prev = JSON.parse(cur.json) } catch {} }
      await d.runAsync("INSERT OR REPLACE INTO tmeta (thread, json) VALUES (?,?)", [key, JSON.stringify({ ...prev, ...metaPatch })])
    }
  } catch {}
}
