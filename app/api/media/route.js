import { initState, getRoom, setMedia, broadcastToRoom, publicGame } from '@/lib/state';

// Host's video/audio player changed (play, pause, seek): mirror it to
// everyone. target = 'clue' for the open clue, 'answer' for the reveal.
export async function POST(request) {
  initState();

  const body = await request.json();
  const roomCode = (body.room || '').toUpperCase();
  const { name, target, playing, pos } = body;

  if (!roomCode || !/^[A-Z]{4}$/.test(roomCode)) {
    return Response.json({ error: 'Invalid room code' }, { status: 400 });
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    return Response.json({ error: 'Invalid name' }, { status: 400 });
  }

  if (target !== 'clue' && target !== 'answer') {
    return Response.json({ error: 'Invalid target' }, { status: 400 });
  }

  if (typeof playing !== 'boolean' || !Number.isFinite(pos) || pos < 0) {
    return Response.json({ error: 'Invalid player state' }, { status: 400 });
  }

  const room = getRoom(roomCode);
  if (!room) {
    return Response.json({ error: 'Room not found' }, { status: 404 });
  }

  if (room.owner !== name.trim()) {
    return Response.json({ error: 'Not owner' }, { status: 403 });
  }

  if (!setMedia(room, target, playing, pos)) {
    return Response.json({ error: 'Nothing is showing' }, { status: 400 });
  }

  // Playback is live-only state (a restart closes the clue anyway), so it
  // isn't worth a disk write on every play/pause/seek.
  broadcastToRoom(room, { type: 'game', game: publicGame(room.game) });

  return Response.json({ ok: true });
}
