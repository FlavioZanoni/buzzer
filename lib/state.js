// Initialize global state
if (!globalThis.__buzzer) {
  globalThis.__buzzer = {
    buzzes: [],
    clients: new Set(),
  };
}

export function initState() {
  return globalThis.__buzzer;
}

export function getBuzzes() {
  return globalThis.__buzzer.buzzes;
}

export function addBuzz(name, pressedAt) {
  const state = globalThis.__buzzer;
  // Check if this name already buzzed in the current round
  if (state.buzzes.some((b) => b.name === name)) {
    return false;
  }
  const now = Date.now();
  // Trust the client's clock-synced press time, but clamp it: no more than
  // 1.5s before arrival (anti-cheat) and never in the future.
  const ts = Math.min(now, Math.max(now - 1500, Number(pressedAt) || now));
  state.buzzes.push({ name, ts });
  // Order by press time, not arrival — a slow connection can still win.
  state.buzzes.sort((a, b) => a.ts - b.ts);
  return true;
}

export function resetBuzzes() {
  globalThis.__buzzer.buzzes = [];
}

export function registerClient(controller) {
  globalThis.__buzzer.clients.add(controller);
}

export function unregisterClient(controller) {
  globalThis.__buzzer.clients.delete(controller);
}

export function broadcast(event) {
  globalThis.__buzzer.clients.forEach((controller) => {
    try {
      controller.enqueue(
        `data: ${JSON.stringify(event)}\n\n`
      );
    } catch (e) {
      // Client disconnected
      globalThis.__buzzer.clients.delete(controller);
    }
  });
}
