import { initState, addBuzz, getBuzzes, broadcast } from '@/lib/state';

export async function POST(request) {
  initState();

  const body = await request.json();
  const { name, pressedAt } = body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    return Response.json({ error: 'Invalid name' }, { status: 400 });
  }

  const added = addBuzz(name.trim(), pressedAt);

  if (added) {
    const buzzes = getBuzzes();
    const event = {
      type: 'buzz',
      buzzes: buzzes.map((b) => ({
        name: b.name,
        delta: b.ts - buzzes[0].ts,
      })),
    };
    broadcast(event);
  }

  return Response.json({ ok: true });
}
