import { initState, getRoom, adjustScore, broadcastToRoom, publicGame, persistRoom } from '@/lib/state';

export async function POST(request) {
  initState();

  const body = await request.json();
  const roomCode = (body.room || '').toUpperCase();
  const { name, player, delta } = body;

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

  const trimmedName = name.trim();
  if (room.owner !== trimmedName) {
    return Response.json({ error: 'Not owner' }, { status: 403 });
  }

  // Validate player and delta
  if (typeof player !== 'string' || typeof delta !== 'number') {
    return Response.json({ error: 'Invalid player or delta' }, { status: 400 });
  }

  if (!Number.isInteger(delta) || delta < -10000 || delta > 10000) {
    return Response.json(
      { error: 'Delta must be an integer between -10000 and 10000' },
      { status: 400 }
    );
  }

  const success = adjustScore(room, player, delta);
  if (!success) {
    return Response.json({ error: 'Player not found' }, { status: 400 });
  }

  // Broadcast game
  const gameEvent = {
    type: 'game',
    game: publicGame(room.game),
  };
  broadcastToRoom(room, gameEvent);

  persistRoom(room.code, room);

  return Response.json({ ok: true });
}
