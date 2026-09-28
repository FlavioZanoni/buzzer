'use client';

import {
  sanitizeView,
  sanitizeZoomReveal,
  frameStyle,
  imageStyle,
  zoomRevealStyle,
  DEFAULT_ZOOM_REVEAL,
  ZOOM_FROM_MIN,
  ZOOM_FROM_MAX,
  ZOOM_STEPS_MIN,
  ZOOM_STEPS_MAX,
} from '@/lib/imageView';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// The picture as it sits on the card (framed or not), with an optional
// zoom applied: the same layers MediaContent draws, at thumbnail size.
function Thumb({ src, view, zoomStyle, onPick, marker }) {
  const img = <img src={src} alt="" draggable={false} style={view ? imageStyle(view) : zoomStyle} />;
  const inner = view && zoomStyle ? <div className="zoom-layer" style={zoomStyle}>{img}</div> : img;
  const markerEl = marker && (
    <span className="zoom-marker" style={{ left: `${marker.x}%`, top: `${marker.y}%` }} />
  );
  return view ? (
    <div className={`image-frame ${onPick ? 'zoom-pick' : ''}`} style={frameStyle(view)} onClick={onPick}>
      {inner}
      {markerEl}
    </div>
  ) : (
    <div className={`zoom-box ${onPick ? 'zoom-pick' : ''}`} onClick={onPick}>
      {inner}
      {markerEl}
    </div>
  );
}

// Editor settings for a "zoom reveal" image clue: turn it on, click the
// spot the card starts zoomed into, and pick how far in and how many steps
// the host takes to zoom back out.
export default function ZoomRevealEditor({ src, view, zoom, onChange }) {
  const current = sanitizeZoomReveal(zoom);
  const framing = sanitizeView(view);

  const pick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    onChange({
      ...current,
      x: Math.round(clamp(((e.clientX - r.left) / r.width) * 100, 0, 100)),
      y: Math.round(clamp(((e.clientY - r.top) / r.height) * 100, 0, 100)),
    });
  };

  return (
    <div className="zoom-reveal-editor">
      <label className="zoom-toggle">
        <input
          type="checkbox"
          checked={!!current}
          onChange={(e) => onChange(e.target.checked ? DEFAULT_ZOOM_REVEAL : null)}
        />
        <span>
          🔍 <strong>Zoom reveal</strong> — the card starts zoomed in and you zoom out for
          everyone while they guess
        </span>
      </label>

      {current && (
        <>
          <div className="zoom-reveal-previews">
            <div className="zoom-reveal-col">
              <div className="preview-label">Click the spot to zoom into</div>
              <Thumb src={src} view={framing} onPick={pick} marker={current} />
            </div>
            <div className="zoom-reveal-col">
              <div className="preview-label">Players see first</div>
              <Thumb src={src} view={framing} zoomStyle={zoomRevealStyle(current, 0)} />
            </div>
          </div>

          <div className="adjuster-row">
            <label className="adjuster-label" htmlFor="zoom-from">Start zoom</label>
            <input
              id="zoom-from"
              type="range"
              min={ZOOM_FROM_MIN}
              max={ZOOM_FROM_MAX}
              step="0.5"
              value={current.from}
              onChange={(e) => onChange({ ...current, from: Number(e.target.value) })}
              className="adjuster-zoom"
            />
            <span className="adjuster-zoom-value">{current.from}×</span>
          </div>
          <div className="adjuster-row">
            <label className="adjuster-label" htmlFor="zoom-steps">Steps out</label>
            <input
              id="zoom-steps"
              type="range"
              min={ZOOM_STEPS_MIN}
              max={ZOOM_STEPS_MAX}
              step="1"
              value={current.steps}
              onChange={(e) => onChange({ ...current, steps: Number(e.target.value) })}
              className="adjuster-zoom"
            />
            <span className="adjuster-zoom-value">{current.steps}</span>
          </div>
        </>
      )}
    </div>
  );
}
