import { getImage } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { id } = await params;

    // Retrieve image from database (id is a random token)
    const image = getImage(id);

    if (!image) {
      return Response.json({ error: 'Image not found' }, { status: 404 });
    }

    // Return image with appropriate headers
    return new Response(image.data, {
      headers: {
        'Content-Type': image.mime,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (e) {
    console.error('Image retrieval error:', e);
    return Response.json({ error: 'Retrieval failed' }, { status: 500 });
  }
}
