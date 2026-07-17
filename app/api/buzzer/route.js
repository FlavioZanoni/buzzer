import { initState, getRoom, resetBuzzes, broadcastToRoom, publicGame, persistRoom } from '@/lib/state';

// Host opens/closes the buzz race for the current clue.
export async function POST(request) {
  initState();

  const body = await request.json();
  const roomCode = (body.room || '').toUpperCase();
  const { name, open } = body;

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

  if (open && !room.game?.active) {
    return Response.json({ error: 'No active clue' }, { status: 400 });
  }

  resetBuzzes(room); // fresh race: clear buzzes, lock, kill timer
  room.game.buzzerOpen = Boolean(open);

  broadcastToRoom(room, { type: 'reset', buzzes: [], locked: true });
  broadcastToRoom(room, { type: 'game', game: publicGame(room.game) });
  persistRoom(room.code, room);

  return Response.json({ ok: true });
}
