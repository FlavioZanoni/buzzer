import { getRoom } from '@/lib/state';
import { insertImage } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const url = new URL(request.url);
  const roomCode = (url.searchParams.get('room') || '').toUpperCase();
  const name = url.searchParams.get('name');

  // Validate room code
  if (!roomCode || !/^[A-Z]{4}$/.test(roomCode)) {
    return Response.json({ error: 'Invalid room code' }, { status: 400 });
  }

  // Validate name
  if (!name || typeof name !== 'string' || !name.trim()) {
    return Response.json({ error: 'Invalid name' }, { status: 400 });
  }

  // Check if room exists
  const room = getRoom(roomCode);
  if (!room) {
    return Response.json({ error: 'Room not found' }, { status: 404 });
  }

  // Check ownership
  const trimmedName = name.trim();
  if (room.owner !== trimmedName) {
    return Response.json({ error: 'Not owner' }, { status: 403 });
  }

  // Get content-type header
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    return Response.json(
      { error: 'Content-Type must be image/*' },
      { status: 400 }
    );
  }

  // Read body as buffer
  try {
    const arrayBuffer = await request.arrayBuffer();

    // Check size (5MB limit)
    if (arrayBuffer.byteLength > 5 * 1024 * 1024) {
      return Response.json(
        { error: 'Image too large (max 5MB)' },
        { status: 413 }
      );
    }

    // Store in database
    const token = insertImage(roomCode, contentType, Buffer.from(arrayBuffer));

    return Response.json({ url: `/api/image/${token}` });
  } catch (e) {
    console.error('Image upload error:', e);
    return Response.json({ error: 'Upload failed' }, { status: 500 });
  }
}
