import { initState, registerClient, unregisterClient, getBuzzes } from '@/lib/state';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  initState();
  const state = globalThis.__buzzer;

  let ctrl;
  const readable = new ReadableStream({
    start(controller) {
      ctrl = controller;
      // Register this client
      registerClient(controller);

      // Send current state immediately
      const buzzes = getBuzzes();
      const event = {
        type: 'init',
        buzzes: buzzes.map((b, idx) => ({
          name: b.name,
          delta: buzzes.length > 0 ? b.ts - buzzes[0].ts : 0,
        })),
      };
      controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
    },

    cancel() {
      unregisterClient(ctrl);
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
