import { DatabaseSync } from 'node:sqlite';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Lazy init (on first query, not at import) so `next build` page-data
// collection never opens the database; globalThis survives HMR.
export function getDb() {
  if (!globalThis.__buzzerDb) {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const db = new DatabaseSync(path.join(dataDir, 'buzzer.db'));
    db.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        code TEXT PRIMARY KEY,
        owner TEXT NOT NULL,
        game TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS images (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT NOT NULL UNIQUE,
        room TEXT NOT NULL,
        mime TEXT NOT NULL,
        data BLOB NOT NULL,
        created INTEGER NOT NULL
      );
    `);

    // Added after launch: rooms created before it just have a NULL timestamp.
    const cols = db.prepare('PRAGMA table_info(rooms)').all();
    if (!cols.some((c) => c.name === 'updated')) {
      db.exec('ALTER TABLE rooms ADD COLUMN updated INTEGER');
    }

    globalThis.__buzzerDb = db;
    startBackups(db, dataDir);
  }
  return globalThis.__buzzerDb;
}

const BACKUP_EVERY_MS = 6 * 60 * 60 * 1000;
const BACKUPS_KEPT = 8; // ~2 days

// Rolling snapshots in data/backups, so a bad edit, a stale editor tab or a
// bug can be rolled back by copying one over buzzer.db. They live on the
// same volume, so they don't replace off-server backups of that volume.
function startBackups(db, dataDir) {
  if (globalThis.__buzzerBackupTimer) return;
  const dir = path.join(dataDir, 'backups');

  const backup = () => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(dir, `buzzer-${stamp}.db`);
      db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
      globalThis.__buzzerDirty = false;
      const old = fs
        .readdirSync(dir)
        .filter((f) => /^buzzer-.*\.db$/.test(f))
        .sort()
        .slice(0, -BACKUPS_KEPT);
      for (const f of old) fs.unlinkSync(path.join(dir, f));
    } catch (e) {
      console.error('Database backup failed:', e);
    }
  };

  // One at startup (before this run changes anything), then only when
  // something was written since the last one.
  if (db.prepare('SELECT COUNT(*) AS n FROM rooms').get().n > 0) backup();
  globalThis.__buzzerBackupTimer = setInterval(() => {
    if (globalThis.__buzzerDirty) backup();
  }, BACKUP_EVERY_MS);
  globalThis.__buzzerBackupTimer.unref?.();
}

export function saveRoom(code, owner, game) {
  const db = getDb();
  const gameJson = JSON.stringify(game);
  const stmt = db.prepare(
    'INSERT INTO rooms (code, owner, game, updated) VALUES (?, ?, ?, ?) ON CONFLICT(code) DO UPDATE SET owner = excluded.owner, game = excluded.game, updated = excluded.updated'
  );
  stmt.run(code, owner, gameJson, Date.now());
  globalThis.__buzzerDirty = true;
}

// Case- and accent-insensitive, so "flavia" still finds rooms hosted as "Flávia"
const foldName = (s) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

// Rooms hosted under a given name, newest first, with a fill summary so the
// host can tell a real board apart from an empty room made by accident.
export function listRoomsByOwner(name) {
  const db = getDb();
  const wanted = foldName(name);
  const matches = db
    .prepare('SELECT code, owner, updated FROM rooms')
    .all()
    .filter((r) => foldName(r.owner) === wanted);

  const gameStmt = db.prepare('SELECT game FROM rooms WHERE code = ?');
  return matches
    .map((r) => {
      const game = JSON.parse(gameStmt.get(r.code).game);
      const clues = game.categories.flatMap((c) => c.clues);
      return {
        code: r.code,
        owner: r.owner,
        updated: r.updated || 0,
        filled: clues.filter((c) => c.kind !== 'empty').length,
        total: clues.length,
        categories: game.categories.map((c) => c.name).filter(Boolean),
      };
    })
    .sort((a, b) => b.updated - a.updated || b.filled - a.filled);
}

export function loadRoom(code) {
  const db = getDb();
  const stmt = db.prepare('SELECT code, owner, game FROM rooms WHERE code = ?');
  const row = stmt.get(code);

  if (!row) {
    return null;
  }

  return {
    code: row.code,
    owner: row.owner,
    game: JSON.parse(row.game),
  };
}

export function insertImage(room, mime, buffer) {
  const db = getDb();
  // Random token instead of the rowid: sequential ids would let players
  // enumerate and peek at unopened clue images.
  const token = crypto.randomBytes(8).toString('hex');
  const stmt = db.prepare(
    'INSERT INTO images (token, room, mime, data, created) VALUES (?, ?, ?, ?, ?)'
  );
  stmt.run(token, room, mime, buffer, Date.now());
  globalThis.__buzzerDirty = true;
  return token;
}

export function getImage(token) {
  const db = getDb();
  const stmt = db.prepare('SELECT mime, data FROM images WHERE token = ?');
  const row = stmt.get(String(token));

  if (!row) {
    return null;
  }

  return {
    mime: row.mime,
    data: row.data,
  };
}
