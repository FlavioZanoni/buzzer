import { listRoomsByOwner } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  const name = url.searchParams.get('name');

  if (!name || typeof name !== 'string' || !name.trim()) {
    return Response.json({ error: 'Invalid name' }, { status: 400 });
  }

  return Response.json({ rooms: listRoomsByOwner(name).slice(0, 20) });
}
