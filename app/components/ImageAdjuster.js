'use client';

import { useState, useEffect, useRef } from 'react';
import {
  ASPECT_PRESETS,
  DEFAULT_VIEW,
  MIN_ZOOM,
  MAX_ZOOM,
  sanitizeView,
  frameStyle,
  imageStyle,
} from '@/lib/imageView';

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// Small modal to frame an image for the card: pick the frame shape, drag to
// reposition, wheel/pinch/slider to zoom. Works on the stored view values
// only; the image itself is left untouched.
export default function ImageAdjuster({ src, initialView, onSave, onCancel }) {
  const [view, setView] = useState(() => sanitizeView(initialView) || DEFAULT_VIEW);
  const [natural, setNatural] = useState(null);
  const frameRef = useRef(null);
  const viewRef = useRef(view);
  const naturalRef = useRef(null);
  // Active pointers (for drag and two-finger pinch) and the gesture's start
  const pointersRef = useRef(new Map());
  const pinchRef = useRef(null);

  const update = (patch) => {
    const next = { ...viewRef.current, ...patch };
    viewRef.current = next;
    setView(next);
  };

  // How far the image overhangs the frame on each axis, in pixels. Panning
  // x from 0 to 100 slides the image across exactly that distance, so a
  // drag of dx pixels is dx / overhang of the range. Negative overhang (a
  // small image in Fit mode) just flips the direction, which is still right.
  const overhang = () => {
    const frame = frameRef.current;
    const nat = naturalRef.current;
    if (!frame || !nat) return null;
    const { width: fw, height: fh } = frame.getBoundingClientRect();
    const v = viewRef.current;
    const fitScale = v.fit === 'cover'
      ? Math.max(fw / nat.w, fh / nat.h)
      : Math.min(fw / nat.w, fh / nat.h);
    const s = fitScale * v.zoom;
    return { x: nat.w * s - fw, y: nat.h * s - fh };
  };

  const pan = (dx, dy) => {
    const o = overhang();
    if (!o) return;
    const v = viewRef.current;
    update({
      x: Math.abs(o.x) < 1 ? v.x : clamp(v.x - (dx / o.x) * 100, 0, 100),
      y: Math.abs(o.y) < 1 ? v.y : clamp(v.y - (dy / o.y) * 100, 0, 100),
    });
  };

  const setZoom = (zoom) => update({ zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM) });

  const pinchDistance = () => {
    const [a, b] = [...pointersRef.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const handlePointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      pinchRef.current = { dist: pinchDistance(), zoom: viewRef.current.zoom };
    }
  };

  const handlePointerMove = (e) => {
    const prev = pointersRef.current.get(e.pointerId);
    if (!prev) return;
    const point = { x: e.clientX, y: e.clientY };
    pointersRef.current.set(e.pointerId, point);
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const { dist, zoom } = pinchRef.current;
      if (dist > 0) setZoom((zoom * pinchDistance()) / dist);
    } else if (pointersRef.current.size === 1) {
      pan(point.x - prev.x, point.y - prev.y);
    }
  };

  const handlePointerUp = (e) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
  };

  const handleKeyDown = (e) => {
    const step = e.shiftKey ? 10 : 2;
    const moves = {
      ArrowLeft: { x: -step },
      ArrowRight: { x: step },
      ArrowUp: { y: -step },
      ArrowDown: { y: step },
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      const v = viewRef.current;
      update({
        x: clamp(v.x + (move.x || 0), 0, 100),
        y: clamp(v.y + (move.y || 0), 0, 100),
      });
    } else if (e.key === '+' || e.key === '=') {
      setZoom(viewRef.current.zoom + 0.1);
    } else if (e.key === '-') {
      setZoom(viewRef.current.zoom - 0.1);
    }
  };

  // React registers wheel listeners as passive, so preventDefault (to stop
  // the modal scrolling while zooming) needs a native listener.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onWheel = (e) => {
      e.preventDefault();
      setZoom(viewRef.current.zoom * Math.exp(-e.deltaY * 0.0015));
    };
    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const handleLoad = (e) => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    if (w && h) {
      naturalRef.current = { w, h };
      setNatural({ w, h });
    }
  };

  const originalAspect = natural ? natural.w / natural.h : null;
  const presets = originalAspect
    ? [...ASPECT_PRESETS, { label: 'Original', aspect: originalAspect }]
    : ASPECT_PRESETS;
  const isActiveAspect = (aspect) => Math.abs(view.aspect - aspect) < 0.01;

  return (
    <div className="editor-modal-overlay image-adjuster-overlay" onClick={onCancel}>
      <div className="editor-modal image-adjuster" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Adjust image</div>
          <button className="modal-close-btn" onClick={onCancel}>✕</button>
        </div>

        <div className="adjuster-stage">
          <div
            ref={frameRef}
            className="image-frame adjuster-frame"
            style={frameStyle(view)}
            tabIndex={0}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={handleKeyDown}
          >
            <img src={src} alt="" style={imageStyle(view)} onLoad={handleLoad} draggable={false} />
          </div>
        </div>
        <div className="hint-line adjuster-hint">
          Drag to move · scroll or pinch to zoom · this is how it will look on the card
        </div>

        <div className="adjuster-controls">
          <div className="adjuster-row">
            <span className="adjuster-label">Shape</span>
            <div className="adjuster-options">
              {presets.map((p) => (
                <button
                  key={p.label}
                  className={`adjuster-chip ${isActiveAspect(p.aspect) ? 'active' : ''}`}
                  onClick={() => update({ aspect: p.aspect })}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="adjuster-row">
            <span className="adjuster-label">Mode</span>
            <div className="adjuster-options">
              <button
                className={`adjuster-chip ${view.fit === 'cover' ? 'active' : ''}`}
                onClick={() => update({ fit: 'cover' })}
                title="Fill the whole frame, cropping the edges"
              >
                Fill
              </button>
              <button
                className={`adjuster-chip ${view.fit === 'contain' ? 'active' : ''}`}
                onClick={() => update({ fit: 'contain' })}
                title="Show the whole image, with bars if the shape differs"
              >
                Fit
              </button>
            </div>
          </div>

          <div className="adjuster-row">
            <label className="adjuster-label" htmlFor="adjuster-zoom">Zoom</label>
            <input
              id="adjuster-zoom"
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step="0.01"
              value={view.zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="adjuster-zoom"
            />
            <span className="adjuster-zoom-value">{view.zoom.toFixed(1)}×</span>
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="btn btn-secondary"
            onClick={() => update({ ...DEFAULT_VIEW, aspect: view.aspect })}
          >
            Reset
          </button>
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(viewRef.current)}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
