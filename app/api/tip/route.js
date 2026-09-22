import { initState, getRoom, revealTip, broadcastToRoom, publicGame, persistRoom } from '@/lib/state';

// Host reveals the hint for the currently active clue/bonus question.
export async function POST(request) {
  initState();

  const body = await request.json();
  const roomCode = (body.room || '').toUpperCase();
  const { name } = body;

  if (!roomCode || !/^[A-Z]{4}$/.test(roomCode)) {
    return Response.json({ error: 'Invalid room code' }, { status: 400 });
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    return Response.json({ error: 'Invalid name' }, { status: 400 });
  }

  const room = getRoom(roomCode);
  if (!room) {
    return Response.json({ error: 'Room not found' }, { status: 404 });
  }

  if (room.owner !== name.trim()) {
    return Response.json({ error: 'Not owner' }, { status: 403 });
  }

  const success = revealTip(room);
  if (!success) {
    return Response.json({ error: 'No tip to reveal' }, { status: 400 });
  }

  broadcastToRoom(room, { type: 'game', game: publicGame(room.game) });
  persistRoom(room.code, room);

  return Response.json({ ok: true });
}
