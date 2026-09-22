import { initState, getRoom, openBonus, broadcastToRoom, publicGame, persistRoom } from '@/lib/state';

// Host launches the standalone bonus question (custom value, open buzzer race).
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

  const success = openBonus(room);
  if (!success) {
    return Response.json(
      { error: 'Bonus question not available' },
      { status: 400 }
    );
  }

  broadcastToRoom(room, { type: 'reset', buzzes: [], locked: true });
  broadcastToRoom(room, { type: 'game', game: publicGame(room.game) });
  persistRoom(room.code, room);

  return Response.json({ ok: true });
}
