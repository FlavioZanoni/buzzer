// How an image is framed on the clue/answer card. The original upload is
// never modified: the host's framing is stored next to it as
//   { aspect, fit, zoom, x, y }
// aspect = frame width / height, fit = 'cover' (fill the frame, cropping)
// or 'contain' (whole image, letterboxed), zoom >= 1, and x/y = the focal
// point in percent (0 = left/top edge, 100 = right/bottom edge).
// Everything is relative, so the editor preview and the real card match
// at any size.

export const ASPECT_PRESETS = [
  { label: 'Wide', aspect: 16 / 9 },
  { label: '4:3', aspect: 4 / 3 },
  { label: 'Square', aspect: 1 },
  { label: 'Tall', aspect: 3 / 4 },
];

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

export const DEFAULT_VIEW = { aspect: 16 / 9, fit: 'cover', zoom: 1, x: 50, y: 50 };

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// Returns a clean view, or null for anything that isn't one (so an old or
// malformed value falls back to showing the image unframed).
export function sanitizeView(view) {
  if (!view || typeof view !== 'object') return null;
  const aspect = Number(view.aspect);
  const zoom = Number(view.zoom);
  const x = Number(view.x);
  const y = Number(view.y);
  if (![aspect, zoom, x, y].every(Number.isFinite)) return null;
  return {
    aspect: clamp(aspect, 0.25, 4),
    fit: view.fit === 'contain' ? 'contain' : 'cover',
    zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM),
    x: clamp(x, 0, 100),
    y: clamp(y, 0, 100),
  };
}

// object-position puts image point (x%, y%) on frame point (x%, y%), and
// scaling around that same point keeps it there, so the focal point never
// drifts off-frame while zooming.
export function frameStyle(view) {
  return { '--frame-aspect': view.aspect };
}

export function imageStyle(view) {
  const pos = `${view.x}% ${view.y}%`;
  return {
    objectFit: view.fit,
    objectPosition: pos,
    transform: `scale(${view.zoom})`,
    transformOrigin: pos,
  };
}

// "Zoom reveal": an image clue starts zoomed way in on one spot and the
// host zooms it out step by step for everyone. Stored next to the framing as
//   { x, y, from, steps }
// x/y = the spot in percent of the card frame (so it lands on the same
// detail whatever the framing), from = the starting zoom, steps = how many
// host clicks it takes to get back to the full picture.
export const ZOOM_FROM_MIN = 2;
export const ZOOM_FROM_MAX = 12;
export const ZOOM_STEPS_MIN = 1;
export const ZOOM_STEPS_MAX = 10;
export const DEFAULT_ZOOM_REVEAL = { x: 50, y: 50, from: 6, steps: 4 };

export function sanitizeZoomReveal(zoom) {
  if (!zoom || typeof zoom !== 'object') return null;
  const x = Number(zoom.x);
  const y = Number(zoom.y);
  const from = Number(zoom.from);
  const steps = Number(zoom.steps);
  if (![x, y, from, steps].every(Number.isFinite)) return null;
  return {
    x: clamp(x, 0, 100),
    y: clamp(y, 0, 100),
    from: clamp(from, ZOOM_FROM_MIN, ZOOM_FROM_MAX),
    steps: clamp(Math.round(steps), ZOOM_STEPS_MIN, ZOOM_STEPS_MAX),
  };
}

// Zoom at a given step: `from` at step 0, 1 (the full card) at the last
// step. Geometric, so every click feels like the same amount of zoom-out.
export function zoomRevealScale(zoom, step) {
  const s = clamp(step, 0, zoom.steps);
  return Math.pow(zoom.from, (zoom.steps - s) / zoom.steps);
}

export function zoomRevealStyle(zoom, step) {
  return {
    transform: `scale(${zoomRevealScale(zoom, step)})`,
    transformOrigin: `${zoom.x}% ${zoom.y}%`,
  };
}
