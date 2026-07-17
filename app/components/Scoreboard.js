'use client';

import { useState } from 'react';

export default function Scoreboard({ game, users, owner, persistedName, persistedRoom }) {
  const [expandedPlayer, setExpandedPlayer] = useState(null);

  const isOwner = owner === persistedName;
  const scores = game.scores || {};

  // Sort by score descending
  const sortedPlayers = Object.entries(scores)
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score);

  const maxScore = sortedPlayers.length > 0 ? sortedPlayers[0].score : 0;
  const onlineUsers = users.map((u) => u.name);

  const handleScoreAdjust = async (playerName, delta) => {
    await fetch('/api/score', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        room: persistedRoom,
        name: persistedName,
        player: playerName,
        delta,
      }),
    });
    setExpandedPlayer(null);
  };

  const handleCustomAdjust = (playerName) => {
    const deltaStr = window.prompt('Enter score adjustment (e.g., +200, -100)');
    if (deltaStr === null) return;
    const delta = parseInt(deltaStr, 10);
    if (isNaN(delta)) {
      alert('Invalid number');
      return;
    }
    handleScoreAdjust(playerName, delta);
  };

  return (
    <div className="scoreboard">
      <div className="scoreboard-title">Scores</div>
      <div className="scoreboard-list">
        {/* Host always shown */}
        <div className="scoreboard-item host-row">
          <div className="score-player">
            <span className="host-badge">HOST</span>
            <span className="player-name">{owner}</span>
          </div>
          <div className="score-value">—</div>
          {onlineUsers.includes(owner) && <div className="online-dot" title="Online" />}
        </div>

        {/* Player scores */}
        {sortedPlayers.length === 0 ? (
          <div className="scoreboard-empty">No scores yet</div>
        ) : (
          sortedPlayers.map((entry, idx) => {
            const isLeader = idx === 0 && entry.score > 0;
            const isYou = entry.name === persistedName;
            const isOnline = onlineUsers.includes(entry.name);
            const isExpanded = expandedPlayer === entry.name;

            return (
              <div
                key={entry.name}
                className={`scoreboard-item ${isLeader ? 'leader' : ''} ${isYou ? 'is-you' : ''}`}
              >
                <div className="score-player">
                  <span className="player-rank">{idx + 1}.</span>
                  <span className="player-name">{entry.name}</span>
                </div>
                <div className={`score-value ${entry.score < 0 ? 'negative' : ''}`}>
                  {entry.score < 0 ? `−$${Math.abs(entry.score)}` : `$${entry.score}`}
                </div>
                {isOnline && <div className="online-dot" title="Online" />}

                {isOwner && (
                  <div
                    className="score-expand-btn"
                    onClick={() =>
                      setExpandedPlayer(isExpanded ? null : entry.name)
                    }
                  >
                    ⋮
                  </div>
                )}

                {isExpanded && isOwner && (
                  <div className="score-adjust-panel">
                    <button
                      onClick={() => handleScoreAdjust(entry.name, 200)}
                    >
                      +200
                    </button>
                    <button
                      onClick={() => handleScoreAdjust(entry.name, -200)}
                    >
                      −200
                    </button>
                    <button onClick={() => handleCustomAdjust(entry.name)}>
                      ±
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
