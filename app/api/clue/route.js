import { initState, getRoom, openClue, broadcastToRoom, publicGame, persistRoom } from '@/lib/state';

export async function POST(request) {
  initState();

  const body = await request.json();
  const roomCode = (body.room || '').toUpperCase();
  const { name, cat, row } = body;

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

  // Validate cat and row
  if (typeof cat !== 'number' || typeof row !== 'number') {
    return Response.json({ error: 'Invalid cat or row' }, { status: 400 });
  }

  if (cat < 0 || cat >= 6 || row < 0 || row >= 5) {
    return Response.json({ error: 'Cat/row out of range' }, { status: 400 });
  }

  const clue = room.game?.categories[cat]?.clues[row];
  if (!clue) {
    return Response.json({ error: 'Clue not found' }, { status: 400 });
  }

  if (clue.kind === 'empty') {
    return Response.json({ error: 'Clue is empty' }, { status: 400 });
  }

  if (clue.used) {
    return Response.json({ error: 'Clue already used' }, { status: 400 });
  }

  // Open clue
  const success = openClue(room, cat, row);
  if (!success) {
    return Response.json({ error: 'Cannot open clue' }, { status: 400 });
  }

  // Broadcast reset (clears buzzes, locks)
  const resetEvent = {
    type: 'reset',
    buzzes: [],
    locked: true,
  };
  broadcastToRoom(room, resetEvent);

  // Broadcast game with active clue
  const gameEvent = {
    type: 'game',
    game: publicGame(room.game),
  };
  broadcastToRoom(room, gameEvent);

  persistRoom(room.code, room);

  return Response.json({ ok: true });
}
