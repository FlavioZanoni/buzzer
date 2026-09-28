import { initState, getRoom, setZoomStep, broadcastToRoom, publicGame, persistRoom } from '@/lib/state';

// Host zooms the active "zoom reveal" image out (or back in) for everyone.
export async function POST(request) {
  initState();

  const body = await request.json();
  const roomCode = (body.room || '').toUpperCase();
  const { name, step } = body;

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

  if (!setZoomStep(room, step)) {
    return Response.json({ error: 'No zoom reveal on this clue' }, { status: 400 });
  }

  broadcastToRoom(room, { type: 'game', game: publicGame(room.game) });
  persistRoom(room.code, room);

  return Response.json({ ok: true });
}
