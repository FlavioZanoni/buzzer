import { initState, resetBuzzes, broadcast } from '@/lib/state';

export async function POST(request) {
  initState();

  resetBuzzes();
  const event = {
    type: 'reset',
    buzzes: [],
  };
  broadcast(event);

  return Response.json({ ok: true });
}
