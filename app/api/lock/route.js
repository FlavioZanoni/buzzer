import { initState, getRoom, setLocked, broadcastToRoom } from '@/lib/state';

export async function POST(request) {
  initState();

  const body = await request.json();
  const roomCode = (body.room || '').toUpperCase();
  const { name, locked } = body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return Response.json({ error: 'Invalid name' }, { status: 400 });
  }

  const room = getRoom(roomCode);
  if (!room) {
    return Response.json({ error: 'Room not found' }, { status: 404 });
  }

  // ponytail: owner auth is just the name; token auth if strangers ever join
  if (room.owner !== name.trim()) {
    return Response.json({ error: 'Not owner' }, { status: 403 });
  }

  setLocked(room, Boolean(locked));
  const event = {
    type: 'lock',
    locked: Boolean(locked),
  };
  broadcastToRoom(room, event);

  return Response.json({ ok: true });
}
