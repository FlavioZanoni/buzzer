'use client';

import { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import Grid from './components/Grid';
import Scoreboard from './components/Scoreboard';
import ClueOverlay from './components/ClueOverlay';
import RevealOverlay from './components/RevealOverlay';
import Editor from './components/Editor';

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

const generateRoomCode = () => {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += String.fromCharCode(65 + Math.floor(Math.random() * 26));
  }
  return code;
};

export default function Page() {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [persistedName, setPersistedName] = useState('');
  const [persistedRoom, setPersistedRoom] = useState('');
  const [buzzes, setBuzzes] = useState([]);
  const [flash, setFlash] = useState(false);
  const [ping, setPing] = useState(null);
  const [locked, setLocked] = useState(true);
  const [owner, setOwner] = useState('');
  const [users, setUsers] = useState([]);
  const [copied, setCopied] = useState(false);
  const [game, setGame] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [timerEndsAt, setTimerEndsAt] = useState(0);
  const [celebration, setCelebration] = useState(null); // {winners, score}
  const prevOverRef = useRef(null);
  const prevLenRef = useRef(0);
  const offsetRef = useRef(0); // serverTime ≈ Date.now() + offset
  const revealTimerRef = useRef(null);
  const nameInputRef = useRef(null);
  const roomInputRef = useRef(null);

  // NTP-style clock sync: 5 samples, keep the lowest-RTT one.
  // Lets the server order buzzes by actual press time instead of arrival.
  useEffect(() => {
    if (!persistedName || !persistedRoom) return;
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
  }, [persistedName, persistedRoom]);

  // Load persisted name and room; a ?room=ABCD link wins over the stored room
  useEffect(() => {
    const storedName = localStorage.getItem('buzzer_name');
    const storedRoom = localStorage.getItem('buzzer_room');
    const urlRoom = (
      new URLSearchParams(window.location.search).get('room') || ''
    ).toUpperCase();

    if (storedName) {
      setPersistedName(storedName);
    }
    if (/^[A-Z]{4}$/.test(urlRoom)) {
      setRoomCode(urlRoom); // prefill entry form
      if (storedName) {
        setPersistedRoom(urlRoom);
        localStorage.setItem('buzzer_room', urlRoom);
      }
    } else if (storedRoom && /^[A-Z]{4}$/.test(storedRoom)) {
      setPersistedRoom(storedRoom);
    } else if (storedRoom) {
      // stored code the server would reject (e.g. "AA") — drop it so the
      // user lands on the entry screen instead of a dead room
      localStorage.removeItem('buzzer_room');
    }
  }, []);

  // Set up EventSource connection
  useEffect(() => {
    if (!persistedName || !persistedRoom) return;

    // Keep the address bar shareable
    window.history.replaceState(null, '', `/?room=${persistedRoom}`);

    // Unlocks carry a server-clock instant `at`; reveal the button at that
    // exact moment (translated to local time) so nobody's ping is a head start.
    const applyLock = (isLocked, at) => {
      clearTimeout(revealTimerRef.current);
      if (isLocked) {
        setLocked(true);
        return;
      }
      const delay = (at || 0) - offsetRef.current - Date.now();
      if (delay > 0) {
        revealTimerRef.current = setTimeout(() => setLocked(false), delay);
      } else {
        setLocked(false);
      }
    };

    const es = new EventSource(
      `/api/stream?room=${persistedRoom}&name=${encodeURIComponent(persistedName)}`
    );

    es.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'init') {
        setBuzzes(data.buzzes);
        applyLock(data.locked, data.unlockAt);
        setOwner(data.owner);
        setUsers(data.users || []);
        if (data.game) {
          setGame(data.game);
        }
        prevLenRef.current = data.buzzes.length;
      } else if (data.type === 'game') {
        setGame(data.game);
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
        applyLock(data.locked, 0);
        setTimerEndsAt(0);
        prevLenRef.current = 0;
      } else if (data.type === 'timer') {
        setTimerEndsAt(data.endsAt || 0);
      } else if (data.type === 'lock') {
        applyLock(data.locked, data.at);
      } else if (data.type === 'presence') {
        setUsers(data.users || []);
      }
    };

    // no onerror handler: EventSource auto-reconnects, and 'init' resyncs state

    return () => {
      clearTimeout(revealTimerRef.current);
      es.close();
    };
  }, [persistedName, persistedRoom]);

  // Game over = every filled cell used → crown the leader with confetti.
  // Only fires on the transition, not when (re)joining an already-finished game.
  useEffect(() => {
    if (!game) return;
    const filled = game.categories
      .flatMap((c) => c.clues)
      .filter((cl) => cl.filled);
    const over =
      filled.length > 0 && filled.every((cl) => cl.used) && !game.active;

    if (prevOverRef.current === null) {
      prevOverRef.current = over;
      return;
    }
    if (over && !prevOverRef.current) {
      const entries = Object.entries(game.scores || {});
      if (entries.length > 0) {
        const top = Math.max(...entries.map(([, s]) => s));
        const winners = entries.filter(([, s]) => s === top).map(([n]) => n);
        setCelebration({ winners, score: top });

        const isWinner = winners.includes(persistedName);
        const end = Date.now() + (isWinner ? 6000 : 3000);
        const burst = () => {
          confetti({
            particleCount: isWinner ? 8 : 3,
            angle: 60,
            spread: 60,
            origin: { x: 0, y: 0.7 },
          });
          confetti({
            particleCount: isWinner ? 8 : 3,
            angle: 120,
            spread: 60,
            origin: { x: 1, y: 0.7 },
          });
          if (Date.now() < end) requestAnimationFrame(burst);
        };
        burst();
      }
    }
    prevOverRef.current = over;
  }, [game, persistedName]);

  const [roomError, setRoomError] = useState('');

  const handleNameAndRoomSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      const trimmed = name.trim();
      const typed = roomCode.toUpperCase();
      if (typed && !/^[A-Z]{4}$/.test(typed)) {
        setRoomError('Room code must be exactly 4 letters');
        return;
      }
      setRoomError('');
      const code = typed || generateRoomCode();
      setPersistedName(trimmed);
      setPersistedRoom(code);
      localStorage.setItem('buzzer_name', trimmed);
      localStorage.setItem('buzzer_room', code);
      setName('');
      setRoomCode('');
      unlockAudio();
    }
  };

  const handleLeaveRoom = () => {
    setPersistedName('');
    setPersistedRoom('');
    localStorage.removeItem('buzzer_room');
    window.history.replaceState(null, '', '/');
    setUsers([]);
    setLocked(true);
    setOwner('');
    setBuzzes([]);
  };

  const handleCopyLink = async () => {
    const link = `${window.location.origin}/?room=${persistedRoom}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch (e) {
      // clipboard API needs a secure context; plain http over LAN doesn't have one
      const ta = document.createElement('textarea');
      ta.value = link;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleBuzz = async () => {
    if (!persistedName || !persistedRoom || locked || !game?.active || !game?.buzzerOpen) return;
    const isAttempted = game.active.attempted?.includes(persistedName);
    if (isAttempted) return;
    await fetch('/api/buzz', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        room: persistedRoom,
        name: persistedName,
        pressedAt: Date.now() + offsetRef.current,
      }),
    });
    unlockAudio();
  };

  const handleLock = async () => {
    if (!persistedRoom || owner !== persistedName) return;
    await fetch('/api/lock', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        room: persistedRoom,
        name: persistedName,
        locked: !locked,
      }),
    });
  };

  // Spacebar listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore if typing in any input/textarea or if it's a key repeat
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.repeat) {
        return;
      }

      if (e.code === 'Space' && persistedName && persistedRoom && !locked && game?.active && game?.buzzerOpen) {
        const isAttempted = game.active.attempted?.includes(persistedName);
        if (!isAttempted) {
          e.preventDefault();
          handleBuzz();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [persistedName, persistedRoom, locked, game]);

  // Screen 1: Name and room entry
  if (!persistedName || !persistedRoom) {
    return (
      <div className="container entry-screen">
        <h1>BUZZER</h1>
        <div className="entry-card">
          <p>Enter your name and room code to join</p>
          <form onSubmit={handleNameAndRoomSubmit}>
            <input
              ref={nameInputRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoFocus
            />
            <input
              ref={roomInputRef}
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 4))}
              placeholder="Room code (leave blank for new)"
              maxLength="4"
            />
            {roomError && <p className="form-error">{roomError}</p>}
            <button type="submit">Join Game</button>
          </form>
        </div>
      </div>
    );
  }

  // Screen 2: Game screen
  const isOwner = owner === persistedName;

  // If editor is open, show it
  if (showEditor && isOwner) {
    return (
      <Editor
        game={game}
        persistedName={persistedName}
        persistedRoom={persistedRoom}
        onDone={() => setShowEditor(false)}
      />
    );
  }

  // If a clue is active, show overlay
  if (game?.active) {
    return (
      <ClueOverlay
        game={game}
        buzzes={buzzes}
        locked={locked}
        persistedName={persistedName}
        persistedRoom={persistedRoom}
        owner={owner}
        flash={flash}
        onBuzz={handleBuzz}
        onLock={handleLock}
        offsetRef={offsetRef}
        timerEndsAt={timerEndsAt}
      />
    );
  }

  // If reveal is showing, show reveal overlay
  if (game?.reveal && !game?.active) {
    return (
      <RevealOverlay
        game={game}
        persistedName={persistedName}
        persistedRoom={persistedRoom}
        owner={owner}
      />
    );
  }

  // Normal game screen with board and scoreboard
  return (
    <div className={`container game-screen ${flash ? 'flash' : ''}`}>
      {celebration && (
        <div className="winner-banner" onClick={() => setCelebration(null)}>
          <div className="winner-trophy">🏆</div>
          <div className="winner-names">{celebration.winners.join(' & ')}</div>
          <div className="winner-score">
            {celebration.score < 0
              ? `−$${Math.abs(celebration.score)}`
              : `$${celebration.score}`}
          </div>
          <div className="winner-hint">tap to dismiss</div>
        </div>
      )}
      <div className="game-header">
        <h1>JEOPARDY!</h1>
        <div className="room-badge">
          ROOM {persistedRoom}
          <button className="copy-btn" onClick={handleCopyLink}>
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </div>

      <div className="game-main">
        <div className="grid-container">
          {game ? (
            <Grid game={game} isOwner={isOwner} persistedName={persistedName} persistedRoom={persistedRoom} />
          ) : (
            <div className="connecting">Connecting to room…</div>
          )}
        </div>
        <div className="scoreboard-container">
          {game && (
            <Scoreboard
              game={game}
              users={users}
              owner={owner}
              persistedName={persistedName}
              persistedRoom={persistedRoom}
            />
          )}
        </div>
      </div>

      <div className="game-controls">
        {isOwner && (
          <div className="host-bar">
            <button className="host-btn" onClick={() => setShowEditor(true)}>
              Edit Board
            </button>
          </div>
        )}
        <div className="player-info">
          <div>
            Playing as: <strong>{persistedName}</strong>
            {ping !== null && <span> · ping {ping}ms</span>}
          </div>
          <button className="leave-btn" onClick={handleLeaveRoom}>
            Leave room
          </button>
        </div>
      </div>
    </div>
  );
}
