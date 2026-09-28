'use client';

import { useState, useEffect, useRef } from 'react';

// Watch-party playback: the host's player is the source of truth. Every
// play/pause/seek on it is posted to the server (stamped with server time)
// and each player's copy follows along. Players get no controls of their
// own, so nobody drifts off by accident.
//
// sync = { state, isHost, onReport(playing, pos), offsetRef }
//   state: { playing, pos, at } from the server, or null before first play

// Seconds a follower may drift before we jump it back in line
const DRIFT = 1;

// Where the host's playhead is right now, according to a synced state
function expectedPos(state, offsetRef) {
  if (!state.playing) return state.pos;
  const serverNow = Date.now() + (offsetRef?.current || 0);
  return state.pos + Math.max(0, serverNow - state.at) / 1000;
}

let ytApiPromise = null;
function loadYouTubeApi() {
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve, reject) => {
    if (window.YT?.Player) {
      resolve(window.YT);
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve(window.YT);
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onerror = () => {
      ytApiPromise = null; // let a later clue try again
      reject(new Error('YouTube API failed to load'));
    };
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

// Shared follow/report logic over a small player adapter:
// { time(), seek(t), play(onBlocked), pause(), mute(), unmute(), isMuted() }
function usePlaybackSync(adapterRef, ready, sync) {
  const { state, isHost, onReport, offsetRef } = sync;
  const [muted, setMuted] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const reportRef = useRef(onReport);
  reportRef.current = onReport;
  // Host: what we last told everyone, in local time, to spot seeks that the
  // player fires no event for (e.g. scrubbing YouTube while paused)
  const lastReportRef = useRef(null);
  // Reports go out one at a time: a quick play-then-pause must not reach
  // the server in the wrong order and leave everyone playing.
  const sendChainRef = useRef(Promise.resolve());

  const report = (playing) => {
    const a = adapterRef.current;
    if (!a) return;
    const pos = a.time();
    lastReportRef.current = { playing, pos, t: Date.now() };
    sendChainRef.current = sendChainRef.current.then(() => reportRef.current?.(playing, pos));
  };

  const follow = () => {
    const a = adapterRef.current;
    const s = stateRef.current;
    if (!a || !s) return;
    const target = expectedPos(s, offsetRef);
    if (Math.abs(a.time() - target) > DRIFT) a.seek(target);
    if (s.playing) {
      // Browsers refuse to autoplay with sound until the page has been
      // interacted with (e.g. a player who rejoined by reloading): play
      // muted and offer a tap to turn the sound on.
      a.play(() => {
        a.mute();
        a.play();
        setMuted(true);
      });
    } else {
      a.pause();
    }
  };

  // Followers: snap to every new host state
  useEffect(() => {
    if (!isHost && ready) follow();
  }, [state, ready, isHost]);

  useEffect(() => {
    if (!ready) return;
    const id = setInterval(() => {
      const a = adapterRef.current;
      if (!a) return;
      if (!isHost) {
        // Keep followers in line (buffering, slow devices, tab switches)
        if (stateRef.current?.playing) follow();
        return;
      }
      const last = lastReportRef.current;
      if (!last) return;
      const expected = last.pos + (last.playing ? (Date.now() - last.t) / 1000 : 0);
      if (Math.abs(a.time() - expected) > 1.5) report(last.playing);
    }, 2000);
    return () => clearInterval(id);
  }, [ready, isHost]);

  const toggleMute = () => {
    const a = adapterRef.current;
    if (!a) return;
    if (a.isMuted()) {
      a.unmute();
      setMuted(false);
      // The tap counts as a user gesture, so this play can have sound
      if (stateRef.current?.playing) a.play(() => {});
    } else {
      a.mute();
      setMuted(true);
    }
  };

  return { report, muted, toggleMute };
}

function FollowerBar({ state, muted, onToggleMute }) {
  const status = !state
    ? 'Waiting for the host to press play'
    : state.playing
      ? '▶ Host is playing'
      : '⏸ Paused by host';
  return (
    <div className="synced-bar">
      <span className="synced-status">{status}</span>
      <button className={`synced-sound ${muted ? 'muted' : ''}`} onClick={onToggleMute}>
        {muted ? '🔇 Tap for sound' : '🔊 Mute'}
      </button>
    </div>
  );
}

function HostBar() {
  return (
    <div className="synced-bar host">
      <span className="synced-status">📡 Play, pause and seek here — everyone follows you</span>
    </div>
  );
}

export function SyncedYouTube({ videoId, sync }) {
  const { isHost } = sync;
  const mountRef = useRef(null);
  const adapterRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const { report, muted, toggleMute } = usePlaybackSync(adapterRef, ready, sync);
  const reportRef = useRef(report);
  reportRef.current = report;

  useEffect(() => {
    let cancelled = false;
    let player = null;
    loadYouTubeApi()
      .then((YT) => {
        if (cancelled || !mountRef.current) return;
        const el = document.createElement('div');
        mountRef.current.appendChild(el);
        player = new YT.Player(el, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            controls: isHost ? 1 : 0,
            disablekb: isHost ? 0 : 1,
            fs: isHost ? 1 : 0,
            rel: 0,
            playsinline: 1,
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              adapterRef.current = {
                time: () => player.getCurrentTime() || 0,
                seek: (t) => player.seekTo(t, true),
                play: (onBlocked) => {
                  // Playing a finished video restarts it: a follower that
                  // got to the end a moment before the host just waits
                  if (player.getPlayerState() === YT.PlayerState.ENDED) return;
                  player.playVideo();
                  // YouTube gives no error for a blocked autoplay, it just
                  // doesn't start: check shortly after
                  setTimeout(() => {
                    if (cancelled) return;
                    const st = player.getPlayerState();
                    if (
                      st !== YT.PlayerState.PLAYING &&
                      st !== YT.PlayerState.BUFFERING &&
                      st !== YT.PlayerState.ENDED
                    ) {
                      onBlocked();
                    }
                  }, 1500);
                },
                pause: () => player.pauseVideo(),
                mute: () => player.mute(),
                unmute: () => player.unMute(),
                isMuted: () => player.isMuted(),
              };
              setReady(true);
            },
            onStateChange: (e) => {
              if (!isHost) return;
              if (e.data === YT.PlayerState.PLAYING) reportRef.current(true);
              else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) {
                reportRef.current(false);
              }
            },
          },
        });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      adapterRef.current = null;
      setReady(false);
      try {
        player?.destroy();
      } catch (e) {
        // already gone
      }
    };
  }, [videoId, isHost]);

  if (failed) {
    // No sync possible without the API; still show the video
    return (
      <div className="media-content youtube-content">
        <div className="synced-frame">
          <iframe
            src={`https://www.youtube.com/embed/${videoId}`}
            title="Media Video"
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    );
  }

  return (
    <div className="media-content youtube-content synced">
      <div className="synced-frame">
        <div ref={mountRef} className="synced-mount" />
        {/* Players can't click the video: the host drives it */}
        {!isHost && <div className="synced-shield" />}
      </div>
      {isHost ? (
        <HostBar />
      ) : (
        <FollowerBar state={sync.state} muted={muted} onToggleMute={toggleMute} />
      )}
    </div>
  );
}

// <audio> / <video> file URLs
export function SyncedFile({ kind, src, sync }) {
  const { isHost } = sync;
  const elRef = useRef(null);
  const adapterRef = useRef(null);
  const [ready, setReady] = useState(false);
  const { report, muted, toggleMute } = usePlaybackSync(adapterRef, ready, sync);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    adapterRef.current = {
      time: () => el.currentTime || 0,
      seek: (t) => {
        el.currentTime = t;
      },
      play: (onBlocked) => {
        if (el.ended) return; // see the YouTube adapter
        el.play().catch((err) => {
          if (err?.name === 'NotAllowedError') onBlocked();
        });
      },
      pause: () => el.pause(),
      mute: () => {
        el.muted = true;
      },
      unmute: () => {
        el.muted = false;
      },
      isMuted: () => el.muted,
    };
    setReady(true);
    return () => {
      adapterRef.current = null;
      setReady(false);
    };
  }, [src]);

  const hostEvents = isHost
    ? {
        onPlay: () => report(true),
        onPause: () => report(false),
        onSeeked: () => report(!elRef.current.paused),
      }
    : {};

  const Tag = kind === 'video' ? 'video' : 'audio';
  return (
    <div className={`media-content ${kind}-content synced`}>
      {kind === 'audio' && <div className="audio-icon">♪</div>}
      <Tag
        ref={elRef}
        src={src}
        controls={isHost}
        playsInline
        preload="auto"
        className={kind === 'video' ? 'synced-video' : undefined}
        {...hostEvents}
      />
      {isHost ? (
        <HostBar />
      ) : (
        <FollowerBar state={sync.state} muted={muted} onToggleMute={toggleMute} />
      )}
    </div>
  );
}
