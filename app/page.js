'use client';

import { useState, useEffect, useRef } from 'react';

const playAirhorn = async () => {
  try {
    const audio = new Audio('/airhorn.mp3');
    audio.volume = 0.5;
    await audio.play();
  } catch (e) {
    // Fallback to synthesized airhorn if file not found
    synthesizeAirhorn();
  }
};

const synthesizeAirhorn = () => {
  const audioContext =
    window.audioContext ||
    new (window.AudioContext || window.webkitAudioContext)();
  window.audioContext = audioContext;

  // Resume if suspended
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }

  const now = audioContext.currentTime;
  const duration = 1.2;

  // Create 4 detuned sawtooth oscillators
  const freqs = [415, 440, 466, 493];
  freqs.forEach((freq, i) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);
    // Quick pitch rise
    osc.frequency.exponentialRampToValueAtTime(freq * 1.2, now + 0.1);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.9, now + duration);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.start(now);
    osc.stop(now + duration);
  });
};

const unlockAudio = () => {
  const audioContext =
    window.audioContext ||
    new (window.AudioContext || window.webkitAudioContext)();
  window.audioContext = audioContext;
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
};

export default function Page() {
  const [name, setName] = useState('');
  const [persistedName, setPersistedName] = useState('');
  const [buzzes, setBuzzes] = useState([]);
  const [flash, setFlash] = useState(false);
  const [ping, setPing] = useState(null);
  const prevLenRef = useRef(0);
  const offsetRef = useRef(0); // serverTime ≈ Date.now() + offset
  const nameInputRef = useRef(null);

  // NTP-style clock sync: 5 samples, keep the lowest-RTT one.
  // Lets the server order buzzes by actual press time instead of arrival.
  useEffect(() => {
    if (!persistedName) return;
    let stop = false;
    const sync = async () => {
      let best = { rtt: Infinity, offset: 0 };
      for (let i = 0; i < 5 && !stop; i++) {
        const t0 = Date.now();
        try {
          const res = await fetch('/api/ping', { cache: 'no-store' });
          const { now } = await res.json();
          const t1 = Date.now();
          const rtt = t1 - t0;
          if (rtt < best.rtt) best = { rtt, offset: now + rtt / 2 - t1 };
        } catch (e) {
          // ignore failed sample
        }
      }
      if (!stop && best.rtt < Infinity) {
        offsetRef.current = best.offset;
        setPing(best.rtt);
      }
    };
    sync();
    // ponytail: resync every 30s in case ping changes mid-game
    const id = setInterval(sync, 30000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [persistedName]);

  // Load persisted name
  useEffect(() => {
    const stored = localStorage.getItem('buzzer_name');
    if (stored) {
      setPersistedName(stored);
    }
  }, []);

  // Set up EventSource connection
  useEffect(() => {
    if (!persistedName) return;

    const es = new EventSource('/api/stream');

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'init') {
        setBuzzes(data.buzzes);
        prevLenRef.current = data.buzzes.length;
      } else if (data.type === 'buzz') {
        setBuzzes(data.buzzes);
        if (data.buzzes.length > prevLenRef.current) {
          playAirhorn();
          setFlash(true);
          setTimeout(() => setFlash(false), 300);
        }
        prevLenRef.current = data.buzzes.length;
      } else if (data.type === 'reset') {
        setBuzzes([]);
        prevLenRef.current = 0;
      }
    };

    // no onerror handler: EventSource auto-reconnects, and 'init' resyncs state

    return () => {
      es.close();
    };
  }, [persistedName]);

  const handleNameSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      const trimmed = name.trim();
      setPersistedName(trimmed);
      localStorage.setItem('buzzer_name', trimmed);
      setName('');
      unlockAudio();
    }
  };

  const handleBuzz = async () => {
    if (!persistedName) return;
    await fetch('/api/buzz', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: persistedName,
        pressedAt: Date.now() + offsetRef.current,
      }),
    });
    unlockAudio();
  };

  const handleReset = async () => {
    await fetch('/api/reset', { method: 'POST' });
  };

  // Spacebar listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in input field or if it's a key repeat
      if (
        nameInputRef.current === document.activeElement ||
        e.repeat
      ) {
        return;
      }

      if (e.code === 'Space' && persistedName) {
        e.preventDefault();
        handleBuzz();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [persistedName]);

  // Screen 1: Name entry
  if (!persistedName) {
    return (
      <div className="container entry-screen">
        <h1>BUZZER</h1>
        <div className="entry-card">
          <p>Enter your name to join</p>
          <form onSubmit={handleNameSubmit}>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoFocus
            />
            <button type="submit">Join Game</button>
          </form>
        </div>
      </div>
    );
  }

  // Screen 2: Buzz screen
  return (
    <div className={`container buzz-screen ${flash ? 'flash' : ''}`}>
      <h1>BUZZER</h1>

      <button className="buzz-btn" onClick={handleBuzz}>
        <span className="buzz-text">BUZZ</span>
        <span className="buzz-hint">or press SPACE</span>
      </button>

      <div className="buzzer-list">
        {buzzes.length === 0 ? (
          <div className="empty-state">Waiting for buzzers...</div>
        ) : (
          buzzes.map((buzz, idx) => (
            <div
              key={`${buzz.name}-${idx}`}
              className={`buzz-row ${idx === 0 ? 'first-place' : ''} ${
                buzz.name === persistedName ? 'is-you' : ''
              }`}
            >
              <span className="rank">{idx + 1}</span>
              <span className="buzz-name">{buzz.name}</span>
              {idx > 0 && (
                <span className="delta">+{buzz.delta}ms</span>
              )}
              {idx === 0 && buzz.name === persistedName && (
                <span className="you-badge">You're first!</span>
              )}
            </div>
          ))
        )}
      </div>

      <div className="controls">
        <button className="reset-btn" onClick={handleReset}>
          Reset Round
        </button>
        <div className="player-info">
          Playing as: <strong>{persistedName}</strong>
          {ping !== null && <span> · ping {ping}ms</span>}
        </div>
      </div>
    </div>
  );
}
