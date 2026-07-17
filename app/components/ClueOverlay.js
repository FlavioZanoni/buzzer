'use client';

import { useState, useEffect, useRef } from 'react';
import MediaContent from './MediaContent';

// Short "time's up" beep via the shared AudioContext
function playTimeUp() {
  try {
    const ctx =
      window.audioContext ||
      new (window.AudioContext || window.webkitAudioContext)();
    window.audioContext = ctx;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(330, now + 0.35);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch (e) {
    // no audio, no problem
  }
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
  timerEndsAt,
}) {
  const [remainingMs, setRemainingMs] = useState(null);
  const [initialRemainingMs, setInitialRemainingMs] = useState(null);
  const beepedRef = useRef(false);

  // Tick the countdown against the server clock (endsAt is server time)
  useEffect(() => {
    if (!timerEndsAt) {
      setRemainingMs(null);
      setInitialRemainingMs(null);
      beepedRef.current = false;
      return;
    }
    const tick = () => {
      const left = Math.max(
        0,
        timerEndsAt - (offsetRef?.current || 0) - Date.now()
      );
      setRemainingMs(left);
      // Capture initial remaining time when timer first starts
      if (initialRemainingMs === null && left > 0) {
        setInitialRemainingMs(left);
      }
      if (left === 0 && !beepedRef.current) {
        beepedRef.current = true;
        playTimeUp();
      }
    };
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [timerEndsAt, offsetRef, initialRemainingMs]);

  if (!game?.active) return null;

  const timeUp = timerEndsAt > 0 && remainingMs === 0;
  const startTimer = async (seconds) => {
    await fetch('/api/timer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ room: persistedRoom, name: persistedName, seconds }),
    });
  };

  const { active } = game;
  const category = game.categories[active.cat];
  const isOwner = owner === persistedName;
  const isAttempted = active.attempted?.includes(persistedName);
  const firstBuzzer = buzzes[0];

  // Determine buzz button state
  let buzzState = 'buzz';
  if (isAttempted) {
    buzzState = 'locked-out';
  } else if (timeUp) {
    buzzState = 'time-up';
  } else if (locked) {
    buzzState = 'locked';
  }

  // Calculate timer progress percentage
  const timerProgress = initialRemainingMs && remainingMs !== null
    ? Math.max(0, Math.min(100, (remainingMs / initialRemainingMs) * 100))
    : 100;

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
      {timerEndsAt > 0 && remainingMs !== null && (
        <div className="clue-timer-bar" style={{ width: `${timerProgress}%` }} />
      )}
      <div className="clue-container">
        <div className="clue-header">
          <div className="clue-title">
            <span className="category-name">{category.name}</span>
            <span className="clue-value">${active.value}</span>
          </div>
          {timerEndsAt > 0 && remainingMs !== null && (
            <div className={`clue-timer-pill ${timeUp ? 'time-up' : ''} ${!timeUp && remainingMs < 5000 ? 'urgent' : ''}`}>
              <span className="timer-icon">⏱</span>
              <span className="timer-text">
                {timeUp ? "TIME'S UP" : Math.ceil(remainingMs / 1000)}
              </span>
            </div>
          )}
        </div>

        <div className="clue-content">
          <MediaContent kind={active.kind} content={active.content} />
        </div>

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
                <div className="timer-btns">
                  {[5, 10, 15, 30].map((s) => (
                    <button
                      key={s}
                      className="judge-btn timer-btn"
                      onClick={() => startTimer(s)}
                    >
                      {s}s
                    </button>
                  ))}
                  {timerEndsAt > 0 && (
                    <button
                      className="judge-btn timer-btn cancel"
                      onClick={() => startTimer(0)}
                    >
                      ✕
                    </button>
                  )}
                </div>
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
                disabled={buzzState !== 'buzz'}
              >
                <span className="buzz-text">
                  {buzzState === 'locked' && 'LOCKED'}
                  {buzzState === 'time-up' && "TIME'S UP"}
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
