import fs from 'fs';
import path from 'path';

// Initialize global state with rooms
if (!globalThis.__buzzer) {
  globalThis.__buzzer = {
    rooms: new Map(), // code -> { code, owner, locked, buzzes: [], clients: Set, game }
  };
}

export function initState() {
  return globalThis.__buzzer;
}

// Initialize a default empty game (6 categories × 5 clues, all kind 'empty')
function initDefaultGame() {
  const categories = [];
  for (let i = 0; i < 6; i++) {
    const clues = [];
    for (let j = 0; j < 5; j++) {
      clues.push({
        value: 200 * (j + 1), // 200, 400, 600, 800, 1000
        kind: 'empty',
        content: '',
        used: false,
      });
    }
    categories.push({
      name: '',
      clues,
    });
  }
  return {
    categories,
    scores: {},
    active: null,
  };
}

// Convert full game to public version (no clue contents unless in active)
export function publicGame(game) {
  if (!game) return null;
  return {
    categories: game.categories.map((cat) => ({
      name: cat.name,
      clues: cat.clues.map((clue) => ({
        value: clue.value,
        used: clue.used,
        filled: clue.kind !== 'empty',
      })),
    })),
    scores: game.scores,
    active: game.active
      ? {
          cat: game.active.cat,
          row: game.active.row,
          value: game.active.value,
          kind: game.active.kind,
          content: game.active.content,
          attempted: game.active.attempted,
        }
      : null,
  };
}

// Load room data from disk if it exists (synchronous for startup)
function loadRoomFromDisk(code) {
  try {
    const dataDir = path.join(process.cwd(), 'data');
    const filePath = path.join(dataDir, `${code}.json`);
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return null; // File doesn't exist or can't be read
  }
}

// Persist room to disk asynchronously (fire-and-forget)
export function persistRoom(code, room) {
  // Use dynamic import of fs.promises to avoid issues
  import('fs/promises')
    .then((fsPromises) => {
      const dataDir = path.join(process.cwd(), 'data');
      return fsPromises
        .mkdir(dataDir, { recursive: true })
        .then(() => {
          const filePath = path.join(dataDir, `${code}.json`);
          const toSave = {
            code: room.code,
            owner: room.owner,
            game: room.game,
          };
          return fsPromises.writeFile(filePath, JSON.stringify(toSave), 'utf-8');
        });
    })
    .catch((e) => {
      console.error(`Failed to persist room ${code}:`, e);
    });
}

// Get or create a room. If creating, owner is the provided name.
export function getOrCreateRoom(code, owner) {
  if (!globalThis.__buzzer.rooms.has(code)) {
    // Try to load from disk first
    const savedData = loadRoomFromDisk(code);

    let newRoom;
    if (savedData) {
      // Restore from disk: code, owner, game preserved; reset runtime state
      newRoom = {
        code: savedData.code,
        owner: savedData.owner,
        game: savedData.game,
        locked: true,
        unlockAt: 0,
        buzzes: [],
        clients: new Set(),
      };
    } else {
      // Create new room with default game
      newRoom = {
        code,
        owner,
        game: initDefaultGame(),
        locked: true,
        unlockAt: 0,
        buzzes: [],
        clients: new Set(),
      };
      // Persist immediately
      persistRoom(code, newRoom);
    }

    globalThis.__buzzer.rooms.set(code, newRoom);
  }
  return globalThis.__buzzer.rooms.get(code);
}

export function getRoom(code) {
  return globalThis.__buzzer.rooms.get(code);
}

export function getBuzzes(room) {
  return room.buzzes;
}

export function addBuzz(room, name, pressedAt) {
  // Check if this name already buzzed in the current round
  if (room.buzzes.some((b) => b.name === name)) {
    return false;
  }
  const now = Date.now();
  // Trust the client's clock-synced press time, but clamp it: no more than
  // 1.5s before arrival (anti-cheat), never in the future, and never before
  // the synchronized unlock instant.
  let ts = Math.min(now, Math.max(now - 1500, Number(pressedAt) || now));
  ts = Math.max(ts, room.unlockAt || 0);
  room.buzzes.push({ name, ts });
  // Order by press time, not arrival — a slow connection can still win.
  room.buzzes.sort((a, b) => a.ts - b.ts);
  return true;
}

export function resetBuzzes(room) {
  room.buzzes = [];
  room.locked = true;
  room.unlockAt = 0;
}

export function setLocked(room, locked, unlockAt = 0) {
  room.locked = locked;
  room.unlockAt = locked ? 0 : unlockAt;
}

export function registerClient(room, controller, name) {
  room.clients.add({ controller, name });
}

export function unregisterClient(room, controller) {
  room.clients = new Set(
    Array.from(room.clients).filter((c) => c.controller !== controller)
  );
}

export function getPresentUsers(room) {
  const seen = new Set();
  const users = [];
  room.clients.forEach((c) => {
    if (!seen.has(c.name)) {
      users.push({ name: c.name, isOwner: c.name === room.owner });
      seen.add(c.name);
    }
  });
  // Owner first, then join order
  users.sort((a, b) => b.isOwner - a.isOwner);
  return users;
}

export function broadcastToRoom(room, event) {
  room.clients.forEach((client) => {
    try {
      client.controller.enqueue(
        `data: ${JSON.stringify(event)}\n\n`
      );
    } catch (e) {
      // Client disconnected
      room.clients.delete(client);
    }
  });
}

// Game state mutations

export function ensurePlayerScore(room, name) {
  if (name !== room.owner && !(name in room.game.scores)) {
    room.game.scores[name] = 0;
  }
}

export function updateBoard(room, categories) {
  // Preserve used flags for cells matching by cat/row index
  const newCategories = [];
  for (let catIdx = 0; catIdx < categories.length; catIdx++) {
    const newCat = categories[catIdx];
    const oldCat = room.game.categories[catIdx];

    const clues = [];
    for (let rowIdx = 0; rowIdx < newCat.clues.length; rowIdx++) {
      const newClue = newCat.clues[rowIdx];
      const oldClue = oldCat?.clues[rowIdx];
      const used = oldClue?.used || false;

      clues.push({
        value: 200 * (rowIdx + 1), // Server-assigned values only
        kind: newClue.kind,
        content: newClue.kind === 'empty' ? '' : newClue.content,
        used,
      });
    }

    newCategories.push({
      name: newCat.name,
      clues,
    });
  }

  room.game.categories = newCategories;
}

export function openClue(room, cat, row) {
  const clue = room.game.categories[cat]?.clues[row];
  if (!clue || clue.kind === 'empty' || clue.used) {
    return false; // Invalid
  }

  room.game.active = {
    cat,
    row,
    value: clue.value,
    kind: clue.kind,
    content: clue.content,
    attempted: [],
  };

  // Lock buzzers and clear current buzzes
  resetBuzzes(room);
  return true;
}

export function judgeAnswer(room, verdict) {
  if (!room.game.active) return null; // No active clue
  const active = room.game.active;
  const firstBuzzer = room.buzzes[0]?.name;
  let result = null;

  if (verdict === 'correct') {
    if (!firstBuzzer) return null; // Requires a buzz
    room.game.scores[firstBuzzer] = (room.game.scores[firstBuzzer] || 0) + active.value;
    room.game.categories[active.cat].clues[active.row].used = true;
    room.game.active = null;
    resetBuzzes(room);
    result = { verdict, player: firstBuzzer };
  } else if (verdict === 'wrong') {
    if (!firstBuzzer) return null; // Requires a buzz
    room.game.scores[firstBuzzer] = (room.game.scores[firstBuzzer] || 0) - active.value;
    room.game.active.attempted.push(firstBuzzer);
    // Keep active open, clear buzzes, lock for steals
    room.buzzes = [];
    room.locked = true;
    room.unlockAt = 0;
    result = { verdict, player: firstBuzzer };
  } else if (verdict === 'skip') {
    room.game.categories[active.cat].clues[active.row].used = true;
    room.game.active = null;
    resetBuzzes(room);
    result = { verdict };
  }

  return result;
}

export function adjustScore(room, player, delta) {
  if (!(player in room.game.scores)) {
    return false; // Player doesn't exist
  }
  room.game.scores[player] += delta;
  return true;
}
