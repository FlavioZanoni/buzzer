import { initState, getRoom, updateBoard, updateBonus, broadcastToRoom, publicGame, persistRoom } from '@/lib/state';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  initState();

  const url = new URL(request.url);
  const roomCode = (url.searchParams.get('room') || '').toUpperCase();
  const name = url.searchParams.get('name');

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

  // Return full game with contents
  return Response.json({ game: room.game });
}

export async function POST(request) {
  initState();

  const body = await request.json();
  const roomCode = (body.room || '').toUpperCase();
  const { name, categories, bonus, baseRev } = body;

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

  // Saves send the board revision their editor loaded. A mismatch means
  // another tab/device saved since, and this (stale) board would silently
  // overwrite that work. null (or an old client sending nothing) skips it.
  const currentRev = room.game.boardRev || 0;
  if (baseRev != null && baseRev !== currentRev) {
    return Response.json(
      { error: 'Board was changed in another tab or device', rev: currentRev },
      { status: 409 }
    );
  }

  // Validate categories: 1-10 columns, 1-10 uniform rows
  if (
    !Array.isArray(categories) ||
    categories.length < 1 ||
    categories.length > 10
  ) {
    return Response.json(
      { error: 'Must have 1-10 categories' },
      { status: 400 }
    );
  }

  const rows = categories[0]?.clues?.length;
  if (!Number.isInteger(rows) || rows < 1 || rows > 10) {
    return Response.json({ error: 'Must have 1-10 rows' }, { status: 400 });
  }

  for (const cat of categories) {
    if (typeof cat.name !== 'string' || cat.name.length > 60) {
      return Response.json(
        { error: 'Category name must be a string <= 60 chars' },
        { status: 400 }
      );
    }

    if (!Array.isArray(cat.clues) || cat.clues.length !== rows) {
      return Response.json(
        { error: 'All categories must have the same number of clues' },
        { status: 400 }
      );
    }

    const KINDS = ['empty', 'text', 'image', 'audio', 'youtube'];
    for (const clue of cat.clues) {
      if (!clue.kind || !KINDS.includes(clue.kind)) {
        return Response.json(
          { error: 'Invalid clue kind' },
          { status: 400 }
        );
      }
      if (clue.answerKind && !KINDS.includes(clue.answerKind)) {
        return Response.json(
          { error: 'Invalid answer kind' },
          { status: 400 }
        );
      }

      for (const field of [clue.content || '', clue.answer || '']) {
        if (typeof field !== 'string' || field.length > 2_000_000) {
          return Response.json(
            { error: 'Clue content must be a string <= 2,000,000 chars' },
            { status: 400 }
          );
        }
      }

      if (clue.tip !== undefined) {
        if (typeof clue.tip !== 'string' || clue.tip.length > 2000) {
          return Response.json(
            { error: 'Tip must be a string <= 2000 chars' },
            { status: 400 }
          );
        }
      }
    }
  }

  // Validate the optional standalone bonus question
  if (bonus !== undefined) {
    const KINDS = ['empty', 'text', 'image', 'audio', 'youtube'];
    if (typeof bonus !== 'object' || bonus === null) {
      return Response.json({ error: 'Invalid bonus question' }, { status: 400 });
    }
    if (!Number.isFinite(Number(bonus.value)) || Number(bonus.value) <= 0) {
      return Response.json({ error: 'Bonus value must be a positive number' }, { status: 400 });
    }
    if (!bonus.kind || !KINDS.includes(bonus.kind)) {
      return Response.json({ error: 'Invalid bonus kind' }, { status: 400 });
    }
    if (bonus.answerKind && !KINDS.includes(bonus.answerKind)) {
      return Response.json({ error: 'Invalid bonus answer kind' }, { status: 400 });
    }
    for (const field of [bonus.content || '', bonus.answer || '']) {
      if (typeof field !== 'string' || field.length > 2_000_000) {
        return Response.json(
          { error: 'Bonus content must be a string <= 2,000,000 chars' },
          { status: 400 }
        );
      }
    }
    if (bonus.tip !== undefined && (typeof bonus.tip !== 'string' || bonus.tip.length > 2000)) {
      return Response.json({ error: 'Bonus tip must be a string <= 2000 chars' }, { status: 400 });
    }
  }

  // Update board and broadcast
  updateBoard(room, categories);
  if (bonus !== undefined) {
    updateBonus(room, bonus);
  }
  room.game.boardRev = currentRev + 1;
  if (!persistRoom(room.code, room)) {
    // The editor keeps the edits and retries on a 5xx
    return Response.json({ error: 'Could not save to disk' }, { status: 500 });
  }

  const gameEvent = {
    type: 'game',
    game: publicGame(room.game),
  };
  broadcastToRoom(room, gameEvent);

  return Response.json({ ok: true, rev: room.game.boardRev });
}
