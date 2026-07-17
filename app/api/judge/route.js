import { initState, getRoom, judgeAnswer, clearReveal, broadcastToRoom, publicGame, persistRoom } from '@/lib/state';

export async function POST(request) {
  initState();

  const body = await request.json();
  const roomCode = (body.room || '').toUpperCase();
  const { name, verdict, player } = body;

  if (!roomCode || !/^[A-Z]{4}$/.test(roomCode)) {
    return Response.json({ error: 'Invalid room code' }, { status: 400 });
  }

  if (!name || typeof name !== 'string' || !name.trim()) {
    return Response.json({ error: 'Invalid name' }, { status: 400 });
  }

  if (!verdict || !['correct', 'wrong', 'skip', 'continue'].includes(verdict)) {
    return Response.json({ error: 'Invalid verdict' }, { status: 400 });
  }

  const room = getRoom(roomCode);
  if (!room) {
    return Response.json({ error: 'Room not found' }, { status: 404 });
  }

  const trimmedName = name.trim();
  if (room.owner !== trimmedName) {
    return Response.json({ error: 'Not owner' }, { status: 403 });
  }

  // 'continue' just dismisses the answer-reveal screen (no active clue then)
  if (verdict === 'continue') {
    clearReveal(room);
    broadcastToRoom(room, { type: 'game', game: publicGame(room.game) });
    persistRoom(room.code, room);
    return Response.json({ ok: true });
  }

  if (!room.game?.active) {
    return Response.json({ error: 'No active clue' }, { status: 400 });
  }

  // Apply verdict ('correct' may carry an elected player name)
  const result = judgeAnswer(
    room,
    verdict,
    typeof player === 'string' ? player.trim() : undefined
  );
  if (!result) {
    return Response.json({ error: 'Judge failed' }, { status: 400 });
  }

  // Broadcast reset (clears buzzes, locks)
  const resetEvent = {
    type: 'reset',
    buzzes: [],
    locked: true,
  };
  broadcastToRoom(room, resetEvent);

  // Broadcast game
  const gameEvent = {
    type: 'game',
    game: publicGame(room.game),
  };
  broadcastToRoom(room, gameEvent);

  persistRoom(room.code, room);

  return Response.json({ ok: true, result });
}
