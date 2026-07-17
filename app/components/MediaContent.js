'use client';

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

export default function MediaContent({ kind, content, isPreview = false }) {
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
    return (
      <div className="media-content image-content">
        <img src={content} alt="Media" />
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
