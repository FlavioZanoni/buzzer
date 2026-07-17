import { initState, getRoom, updateBoard, broadcastToRoom, publicGame, persistRoom } from '@/lib/state';

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
  const { name, categories } = body;

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

  // Validate categories
  if (!Array.isArray(categories) || categories.length !== 6) {
    return Response.json(
      { error: 'Must have exactly 6 categories' },
      { status: 400 }
    );
  }

  for (const cat of categories) {
    if (typeof cat.name !== 'string' || cat.name.length > 60) {
      return Response.json(
        { error: 'Category name must be a string <= 60 chars' },
        { status: 400 }
      );
    }

    if (!Array.isArray(cat.clues) || cat.clues.length !== 5) {
      return Response.json(
        { error: 'Each category must have exactly 5 clues' },
        { status: 400 }
      );
    }

    for (const clue of cat.clues) {
      if (
        !clue.kind ||
        !['empty', 'text', 'image', 'audio', 'youtube'].includes(clue.kind)
      ) {
        return Response.json(
          { error: 'Invalid clue kind' },
          { status: 400 }
        );
      }

      const content = clue.content || '';
      if (typeof content !== 'string' || content.length > 2_000_000) {
        return Response.json(
          { error: 'Clue content must be a string <= 2,000,000 chars' },
          { status: 400 }
        );
      }
    }
  }

  // Update board and broadcast
  updateBoard(room, categories);
  persistRoom(room.code, room);

  const gameEvent = {
    type: 'game',
    game: publicGame(room.game),
  };
  broadcastToRoom(room, gameEvent);

  return Response.json({ ok: true });
}
