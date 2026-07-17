'use client';

import { useState } from 'react';

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

export default function ClueOverlay({
  game,
  buzzes,
  locked,
  persistedName,
  persistedRoom,
  owner,
  flash,
  onBuzz,
  onLock,
  offsetRef,
}) {
  const [showDetails, setShowDetails] = useState(false);

  if (!game?.active) return null;

  const { active } = game;
  const category = game.categories[active.cat];
  const isOwner = owner === persistedName;
  const isAttempted = active.attempted?.includes(persistedName);
  const firstBuzzer = buzzes[0];

  // Determine buzz button state
  let buzzState = 'buzz';
  if (locked) {
    buzzState = 'locked';
  } else if (!active) {
    buzzState = 'no-clue';
  } else if (isAttempted) {
    buzzState = 'locked-out';
  }

  // Render clue content by kind
  let clueContent = null;
  if (active.kind === 'text') {
    clueContent = (
      <div className="clue-text">
        <p>{active.content}</p>
      </div>
    );
  } else if (active.kind === 'image') {
    clueContent = (
      <div className="clue-image">
        <img src={active.content} alt="Clue" />
      </div>
    );
  } else if (active.kind === 'audio') {
    clueContent = (
      <div className="clue-audio">
        <div className="audio-icon">♪</div>
        <audio controls>
          <source src={active.content} />
        </audio>
      </div>
    );
  } else if (active.kind === 'youtube') {
    const youtubeId = extractYouTubeId(active.content);
    if (youtubeId) {
      clueContent = (
        <div className="clue-youtube">
          <iframe
            width="560"
            height="315"
            src={`https://www.youtube.com/embed/${youtubeId}`}
            title="Clue Video"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      );
    }
  }

  const handleJudge = async (verdict) => {
    await fetch('/api/judge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        room: persistedRoom,
        name: persistedName,
        verdict,
      }),
    });
  };

  return (
    <div className={`clue-overlay ${flash ? 'flash' : ''}`}>
      <div className="clue-container">
        <div className="clue-header">
          <div className="clue-title">
            <span className="category-name">{category.name}</span>
            <span className="clue-value">${active.value}</span>
          </div>
        </div>

        <div className="clue-content">{clueContent}</div>

        {/* Buzz list for players, judge bar for host */}
        <div className="clue-bottom">
          {isOwner ? (
            <div className="judge-bar">
              <div className="judge-controls">
                <button
                  className="judge-btn lock-btn"
                  onClick={() => onLock()}
                >
                  {locked ? 'UNLOCK' : 'LOCK'}
                </button>
              </div>

              {firstBuzzer && (
                <div className="first-buzzer">
                  <span className="first-label">First: {firstBuzzer.name}</span>
                  <button
                    className="judge-btn verdict-correct"
                    onClick={() => handleJudge('correct')}
                  >
                    CORRECT
                  </button>
                  <button
                    className="judge-btn verdict-wrong"
                    onClick={() => handleJudge('wrong')}
                  >
                    WRONG
                  </button>
                </div>
              )}

              <button
                className="judge-btn skip-btn"
                onClick={() => handleJudge('skip')}
              >
                SKIP
              </button>
            </div>
          ) : (
            <div className="buzz-area">
              <button
                className={`buzz-btn overlay-buzz ${buzzState}`}
                onClick={onBuzz}
                disabled={buzzState === 'locked' || buzzState === 'locked-out' || buzzState === 'no-clue'}
              >
                <span className="buzz-text">
                  {buzzState === 'locked' && 'LOCKED'}
                  {buzzState === 'no-clue' && 'NO CLUE'}
                  {buzzState === 'locked-out' && 'LOCKED OUT'}
                  {buzzState === 'buzz' && 'BUZZ'}
                </span>
                <span className="buzz-hint">or press SPACE</span>
              </button>

              {buzzes.length > 0 && (
                <div className="buzz-list">
                  {buzzes.map((buzz, idx) => {
                    const isAttemptedBuzzer =
                      active.attempted?.includes(buzz.name);
                    return (
                      <div
                        key={`${buzz.name}-${idx}`}
                        className={`buzz-list-item ${isAttemptedBuzzer ? 'attempted' : ''}`}
                      >
                        <span className="rank">{idx + 1}</span>
                        <span className="name">{buzz.name}</span>
                        {isAttemptedBuzzer && (
                          <span className="status">locked out</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
