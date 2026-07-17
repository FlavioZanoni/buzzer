'use client';

import MediaContent from './MediaContent';

export default function RevealOverlay({
  game,
  persistedName,
  persistedRoom,
  owner,
}) {
  if (!game?.reveal || game.active) {
    return null;
  }

  const isOwner = owner === persistedName;
  const reveal = game.reveal;
  const isCorrect = reveal.verdict === 'correct';
  const isSkip = reveal.verdict === 'skip';

  const handleContinue = async () => {
    await fetch('/api/judge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        room: persistedRoom,
        name: persistedName,
        verdict: 'continue',
      }),
    });
  };

  return (
    <div className="reveal-overlay">
      <div className="reveal-container">
        <div className="reveal-header">
          <div className="reveal-title">
            <span className="reveal-label">THE ANSWER</span>
            {reveal.category && (
              <span className="reveal-category">{reveal.category}</span>
            )}
            <span className="reveal-value">${reveal.value}</span>
          </div>
        </div>

        <div className="reveal-content">
          <MediaContent kind={reveal.kind} content={reveal.content} />
        </div>

        <div className={`reveal-verdict ${isCorrect ? 'correct' : isSkip ? 'skip' : ''}`}>
          {isCorrect && (
            <div className="verdict-message">
              <span className="verdict-text">✓ {reveal.player} got it</span>
              <span className="verdict-points">+${reveal.value}</span>
            </div>
          )}
          {isSkip && (
            <div className="verdict-message">
              <span className="verdict-text">Nobody got it</span>
            </div>
          )}
        </div>

        {isOwner && (
          <div className="reveal-actions">
            <button className="btn btn-primary" onClick={handleContinue}>
              CONTINUE
            </button>
          </div>
        )}

        {!isOwner && (
          <div className="reveal-waiting">
            <span>Waiting for host…</span>
          </div>
        )}
      </div>
    </div>
  );
}
