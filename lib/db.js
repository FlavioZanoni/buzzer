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

    globalThis.__buzzerDb = db;
  }
  return globalThis.__buzzerDb;
}

export function saveRoom(code, owner, game) {
  const db = getDb();
  const gameJson = JSON.stringify(game);
  const stmt = db.prepare(
    'INSERT INTO rooms (code, owner, game) VALUES (?, ?, ?) ON CONFLICT(code) DO UPDATE SET owner = excluded.owner, game = excluded.game'
  );
  stmt.run(code, owner, gameJson);
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
