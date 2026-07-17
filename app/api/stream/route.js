import {
  initState,
  getOrCreateRoom,
  registerClient,
  unregisterClient,
  getBuzzes,
  getPresentUsers,
  broadcastToRoom,
  publicGame,
  ensurePlayerScore,
  persistRoom,
} from '@/lib/state';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  initState();

  const url = new URL(request.url);
  const roomCode = (url.searchParams.get('room') || '').toUpperCase();
  const name = url.searchParams.get('name');

  // Validation
  if (!roomCode || !/^[A-Z]{4}$/.test(roomCode)) {
    return Response.json(
      { error: 'Invalid room code' },
      { status: 400 }
    );
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    return Response.json(
      { error: 'Invalid name' },
      { status: 400 }
    );
  }

  const room = getOrCreateRoom(roomCode, name.trim());
  const trimmedName = name.trim();

  let ctrl;
  const readable = new ReadableStream({
    start(controller) {
      ctrl = controller;
      // Register this client
      registerClient(room, controller, trimmedName);

      // Ensure non-owner has a score entry
      const isNonOwner = trimmedName !== room.owner;
      if (isNonOwner) {
        ensurePlayerScore(room, trimmedName);
        persistRoom(room.code, room);
      }

      // Send current state immediately
      const buzzes = getBuzzes(room);
      const users = getPresentUsers(room);
      const event = {
        type: 'init',
        buzzes: buzzes.map((b, idx) => ({
          name: b.name,
          delta: buzzes.length > 0 ? b.ts - buzzes[0].ts : 0,
        })),
        locked: room.locked,
        unlockAt: room.unlockAt || 0,
        owner: room.owner,
        users: users.map((u) => ({
          name: u.name,
          isOwner: u.isOwner,
        })),
        game: publicGame(room.game),
      };
      controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);

      // Broadcast presence and game if this is a non-owner join
      const presenceEvent = {
        type: 'presence',
        users: users.map((u) => ({
          name: u.name,
          isOwner: u.isOwner,
        })),
      };
      broadcastToRoom(room, presenceEvent);

      // Broadcast game event for non-owner joins so scoreboard updates
      if (isNonOwner) {
        const gameEvent = {
          type: 'game',
          game: publicGame(room.game),
        };
        broadcastToRoom(room, gameEvent);
      }
    },

    cancel() {
      unregisterClient(room, ctrl);
      // Broadcast updated presence after disconnect
      const users = getPresentUsers(room);
      const presenceEvent = {
        type: 'presence',
        users: users.map((u) => ({
          name: u.name,
          isOwner: u.isOwner,
        })),
      };
      broadcastToRoom(room, presenceEvent);
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
