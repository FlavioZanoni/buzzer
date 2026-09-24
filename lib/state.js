import { loadRoom, saveRoom as dbSaveRoom } from '@/lib/db';

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
        answerKind: 'empty',
        answer: '',
        tip: '',
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
    buzzerOpen: false,
    // A single standalone bonus question, separate from the board: worth a
    // custom (usually higher) value, but still a normal open-buzzer race.
    bonus: {
      value: 1000,
      kind: 'empty',
      content: '',
      answerKind: 'empty',
      answer: '',
      tip: '',
      used: false,
    },
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
    buzzerOpen: !!game.buzzerOpen,
    reveal: game.reveal || null,
    bonus: game.bonus
      ? {
          value: game.bonus.value,
          filled: game.bonus.kind !== 'empty',
          used: game.bonus.used,
        }
      : null,
    active: game.active
      ? {
          cat: game.active.cat,
          row: game.active.row,
          value: game.active.value,
          kind: game.active.kind,
          content: game.active.content,
          attempted: game.active.attempted,
          isBonus: !!game.active.isBonus,
          // The tip's existence is public (so the host knows there's one to
          // reveal); its text stays hidden until tipRevealed flips.
          hasTip: !!game.active.tip,
          tipRevealed: !!game.active.tipRevealed,
          tip: game.active.tipRevealed ? game.active.tip : null,
        }
      : null,
  };
}

// Load room data from database if it exists (synchronous)
function loadRoomFromDisk(code) {
  try {
    return loadRoom(code);
  } catch (e) {
    return null; // Database error or room doesn't exist
  }
}

// Persist room to database (fire-and-forget safety: wrap in try/catch)
export function persistRoom(code, room) {
  try {
    dbSaveRoom(code, room.owner, room.game);
  } catch (e) {
    console.error(`Failed to persist room ${code}:`, e);
  }
}

// Rebuild an in-memory room from its saved row: code, owner and game are
// preserved; runtime state (buzzes, locks, open clue) starts fresh.
function restoreRoom(savedData) {
  return {
    code: savedData.code,
    owner: savedData.owner,
    game: { ...savedData.game, buzzerOpen: false, active: null },
    locked: true,
    unlockAt: 0,
    buzzes: [],
    clients: new Set(),
  };
}

// Get or create a room. If creating, owner is the provided name.
export function getOrCreateRoom(code, owner) {
  if (!globalThis.__buzzer.rooms.has(code)) {
    // Try to load from disk first
    const savedData = loadRoomFromDisk(code);

    let newRoom;
    if (savedData) {
      newRoom = restoreRoom(savedData);
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

// Existing rooms only (never creates one). Falls back to disk because memory
// is empty after a restart/redeploy until someone reconnects to the stream —
// without this, the host's uploads and autosaves 404 in that window.
export function getRoom(code) {
  const rooms = globalThis.__buzzer.rooms;
  if (!rooms.has(code)) {
    const savedData = loadRoomFromDisk(code);
    if (!savedData) return undefined;
    rooms.set(code, restoreRoom(savedData));
  }
  return rooms.get(code);
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
  room.timerEndsAt = 0;
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
        answerKind: newClue.answerKind || 'empty',
        answer:
          newClue.answerKind && newClue.answerKind !== 'empty'
            ? newClue.answer || ''
            : '',
        tip: typeof newClue.tip === 'string' ? newClue.tip : '',
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

// Save the standalone bonus question from the editor. `used` is preserved
// from whatever it was before (editing doesn't un-use an already-played one).
export function updateBonus(room, bonus) {
  const oldUsed = room.game.bonus?.used || false;
  const rawValue = Number(bonus.value);
  // Round, but never discard a submitted positive value by rounding it to 0
  const value = Number.isFinite(rawValue) && rawValue > 0
    ? Math.max(1, Math.round(rawValue))
    : NaN;

  room.game.bonus = {
    value: Number.isFinite(value) ? value : room.game.bonus?.value || 1000,
    kind: bonus.kind || 'empty',
    content: bonus.kind === 'empty' ? '' : bonus.content || '',
    answerKind: bonus.answerKind || 'empty',
    answer:
      bonus.answerKind && bonus.answerKind !== 'empty' ? bonus.answer || '' : '',
    tip: typeof bonus.tip === 'string' ? bonus.tip : '',
    used: oldUsed,
  };
}

export function openClue(room, cat, row) {
  const clue = room.game.categories[cat]?.clues[row];
  if (!clue || clue.kind === 'empty' || clue.used) {
    return false; // Invalid
  }

  room.game.reveal = null;
  room.game.buzzerOpen = false;
  room.game.active = {
    cat,
    row,
    value: clue.value,
    kind: clue.kind,
    content: clue.content,
    tip: clue.tip || '',
    tipRevealed: false,
    isBonus: false,
    attempted: [],
  };

  // Lock buzzers and clear current buzzes
  resetBuzzes(room);
  return true;
}

// Open the standalone bonus question. Like a normal clue, it's still an
// open buzzer race anyone can win — it's just worth its own custom value
// and isn't tied to a category/row.
export function openBonus(room) {
  const bonus = room.game.bonus;
  if (!bonus || bonus.kind === 'empty' || bonus.used) {
    return false; // Not configured, or already played
  }
  if (room.game.active) {
    return false; // A clue is already in progress — judge or skip it first
  }

  room.game.reveal = null;
  room.game.buzzerOpen = false;
  room.game.active = {
    cat: null,
    row: null,
    value: bonus.value,
    kind: bonus.kind,
    content: bonus.content,
    tip: bonus.tip || '',
    tipRevealed: false,
    isBonus: true,
    attempted: [],
  };

  resetBuzzes(room);
  return true;
}

// Host reveals the hint for the currently active clue/bonus question.
export function revealTip(room) {
  if (!room.game.active || !room.game.active.tip) {
    return false;
  }
  room.game.active.tipRevealed = true;
  return true;
}

export function judgeAnswer(room, verdict, electedPlayer) {
  if (!room.game.active) return null; // No active clue
  const active = room.game.active;
  const clue = active.isBonus
    ? room.game.bonus
    : room.game.categories[active.cat].clues[active.row];
  const firstBuzzer = room.buzzes[0]?.name;
  let result = null;

  const markUsed = () => {
    if (active.isBonus) {
      room.game.bonus.used = true;
    } else {
      room.game.categories[active.cat].clues[active.row].used = true;
    }
  };

  const setReveal = (player) => {
    room.game.reveal = {
      kind: clue.answer ? clue.answerKind || 'text' : 'empty',
      content: clue.answer || '',
      category: active.isBonus ? 'BONUS QUESTION' : room.game.categories[active.cat].name,
      value: active.value,
      verdict,
      player,
    };
  };

  if (verdict === 'correct') {
    // Host can elect any player as winner; falls back to the first buzzer
    const winner = electedPlayer || firstBuzzer;
    if (!winner || !(winner in room.game.scores)) return null;
    room.game.scores[winner] += active.value;
    markUsed();
    setReveal(winner);
    room.game.active = null;
    room.game.buzzerOpen = false;
    resetBuzzes(room);
    result = { verdict, player: winner };
  } else if (verdict === 'wrong') {
    if (!firstBuzzer) return null; // Requires a buzz
    room.game.scores[firstBuzzer] = (room.game.scores[firstBuzzer] || 0) - active.value;
    room.game.active.attempted.push(firstBuzzer);
    // Keep active open, clear buzzes, lock for steals
    room.buzzes = [];
    room.locked = true;
    room.unlockAt = 0;
    room.timerEndsAt = 0;
    result = { verdict, player: firstBuzzer };
  } else if (verdict === 'skip') {
    markUsed();
    setReveal(null);
    room.game.active = null;
    room.game.buzzerOpen = false;
    resetBuzzes(room);
    result = { verdict };
  }

  return result;
}

export function clearReveal(room) {
  room.game.reveal = null;
}

export function adjustScore(room, player, delta) {
  if (!(player in room.game.scores)) {
    return false; // Player doesn't exist
  }
  room.game.scores[player] += delta;
  return true;
}
