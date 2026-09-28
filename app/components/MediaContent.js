'use client';

import {
  sanitizeView,
  sanitizeZoomReveal,
  frameStyle,
  imageStyle,
  zoomRevealStyle,
} from '@/lib/imageView';
import { SyncedYouTube, SyncedFile } from './SyncedMedia';

// Extract YouTube ID from various URL formats
function extractYouTubeId(content) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// zoom: a "zoom reveal" { x, y, from, steps } plus the current `step`.
// sync: live playback sync for audio/video/YouTube (see SyncedMedia);
// without it the media just plays locally, as in the editor previews.
export default function MediaContent({ kind, content, view, zoom, sync }) {
  if (!kind || kind === 'empty') {
    return (
      <div className="media-content empty-placeholder">
        <div className="placeholder-text">No content set</div>
      </div>
    );
  }

  if (kind === 'text') {
    return (
      <div className="media-content text-content">
        <p>{content}</p>
      </div>
    );
  }

  if (kind === 'image') {
    const framing = sanitizeView(view);
    const zoomReveal = sanitizeZoomReveal(zoom);
    // The zoom layer scales the (already framed) picture inside the frame,
    // around a spot given in frame percent; the frame clips it.
    const zoomStyle = zoomReveal ? zoomRevealStyle(zoomReveal, zoom.step || 0) : null;
    if (framing) {
      const img = (
        <img src={content} alt="Media" style={imageStyle(framing)} draggable={false} />
      );
      return (
        <div className="media-content image-content framed">
          <div className="image-frame" style={frameStyle(framing)}>
            {zoomStyle ? (
              <div className="zoom-layer" style={zoomStyle}>{img}</div>
            ) : (
              img
            )}
          </div>
        </div>
      );
    }
    if (zoomStyle) {
      return (
        <div className="media-content image-content">
          <div className="zoom-box">
            <img src={content} alt="Media" style={zoomStyle} draggable={false} />
          </div>
        </div>
      );
    }
    return (
      <div className="media-content image-content">
        <img src={content} alt="Media" />
      </div>
    );
  }

  if ((kind === 'audio' || kind === 'video') && sync) {
    return <SyncedFile key={content} kind={kind} src={content} sync={sync} />;
  }

  if (kind === 'video') {
    return (
      <div className="media-content video-content">
        <video src={content} controls playsInline preload="metadata" className="synced-video" />
      </div>
    );
  }

  if (kind === 'audio') {
    return (
      <div className="media-content audio-content">
        <div className="audio-icon">♪</div>
        <audio controls>
          <source src={content} />
        </audio>
      </div>
    );
  }

  if (kind === 'youtube') {
    const youtubeId = extractYouTubeId(content);
    if (youtubeId && sync) {
      return <SyncedYouTube key={youtubeId} videoId={youtubeId} sync={sync} />;
    }
    if (youtubeId) {
      return (
        <div className="media-content youtube-content">
          <iframe
            width="560"
            height="315"
            src={`https://www.youtube.com/embed/${youtubeId}`}
            title="Media Video"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
  }

  return null;
}
