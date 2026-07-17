// Initialize global state with rooms
if (!globalThis.__buzzer) {
  globalThis.__buzzer = {
    rooms: new Map(), // code -> { code, owner, locked, buzzes: [], clients: Set }
  };
}

export function initState() {
  return globalThis.__buzzer;
}

// Get or create a room. If creating, owner is the provided name.
export function getOrCreateRoom(code, owner) {
  if (!globalThis.__buzzer.rooms.has(code)) {
    globalThis.__buzzer.rooms.set(code, {
      code,
      owner,
      locked: true,
      buzzes: [],
      clients: new Set(),
    });
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
