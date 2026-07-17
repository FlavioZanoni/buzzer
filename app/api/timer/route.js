import { initState, getRoom, broadcastToRoom } from '@/lib/state';

export async function POST(request) {
  initState();

  const body = await request.json();
  const roomCode = (body.room || '').toUpperCase();
  const { name, seconds } = body;

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

  if (!room.game?.active) {
    return Response.json({ error: 'No active clue' }, { status: 400 });
  }

  if (!Number.isFinite(seconds) || seconds < 0 || seconds > 120) {
    return Response.json({ error: 'Invalid seconds' }, { status: 400 });
  }

  // seconds = 0 cancels the timer
  room.timerEndsAt = seconds > 0 ? Date.now() + seconds * 1000 : 0;
  broadcastToRoom(room, { type: 'timer', endsAt: room.timerEndsAt });

  return Response.json({ ok: true });
}
