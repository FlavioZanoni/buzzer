import { initState, getRoom, addBuzz, getBuzzes, broadcastToRoom } from '@/lib/state';

export async function POST(request) {
  initState();

  const body = await request.json();
  const roomCode = (body.room || '').toUpperCase();
  const { name, pressedAt } = body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return Response.json({ error: 'Invalid name' }, { status: 400 });
  }

  const room = getRoom(roomCode);
  if (!room) {
    return Response.json({ error: 'Room not found' }, { status: 404 });
  }

  const trimmedName = name.trim();

  // New validations
  if (!room.game?.active) {
    return Response.json({ error: 'no-clue' }, { status: 409 });
  }

  if (trimmedName === room.owner) {
    return Response.json({ error: 'host-cannot-buzz' }, { status: 403 });
  }

  if (room.game.active.attempted.includes(trimmedName)) {
    return Response.json({ error: 'already-attempted' }, { status: 409 });
  }

  if (room.locked || Date.now() < (room.unlockAt || 0)) {
    return Response.json({ error: 'locked' }, { status: 409 });
  }

  const added = addBuzz(room, trimmedName, pressedAt);

  if (added) {
    const buzzes = getBuzzes(room);
    const event = {
      type: 'buzz',
      buzzes: buzzes.map((b) => ({
        name: b.name,
        delta: b.ts - buzzes[0].ts,
      })),
    };
    broadcastToRoom(room, event);
  }

  return Response.json({ ok: true });
}
