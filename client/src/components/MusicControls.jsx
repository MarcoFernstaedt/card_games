import { useState, useEffect, useRef } from 'react';
import socket from '../socket';
import { music, TRACK_LIST } from '../services/music';

export default function MusicControls({ roomCode, isHost, musicState }) {
  const [volume, setVolume] = useState(0.5);
  const [vizHeights, setVizHeights] = useState([4, 4, 4, 4, 4]);
  const animRef = useRef(null);

  // Sync music engine to server state
  useEffect(() => {
    if (!musicState) return;
    if (musicState.playing) {
      music.start(musicState.track, musicState.startedAt);
    } else {
      music.stop();
    }
  }, [musicState?.playing, musicState?.track]);

  // Visualizer driven by analyser or beat callbacks
  useEffect(() => {
    let frame;
    function tick() {
      const data = music.getAnalyserData();
      if (data && music.playing) {
        const step = Math.floor(data.length / 5);
        setVizHeights([
          4 + (data[step * 0] / 255) * 24,
          4 + (data[step * 1] / 255) * 24,
          4 + (data[step * 2] / 255) * 24,
          4 + (data[step * 3] / 255) * 24,
          4 + (data[step * 4] / 255) * 24,
        ]);
      } else {
        setVizHeights([4, 4, 4, 4, 4]);
      }
      frame = requestAnimationFrame(tick);
    }
    tick();
    return () => cancelAnimationFrame(frame);
  }, []);

  function handlePlay() {
    const startedAt = Date.now();
    socket.emit('music_control', {
      code: roomCode,
      action: 'play',
      track: musicState?.track || 'hype',
      startedAt,
    });
  }

  function handleStop() {
    socket.emit('music_control', { code: roomCode, action: 'stop' });
  }

  function handleTrack(trackId) {
    const startedAt = Date.now();
    socket.emit('music_control', {
      code: roomCode,
      action: musicState?.playing ? 'play' : 'track',
      track: trackId,
      startedAt: musicState?.playing ? startedAt : null,
    });
  }

  function handleVolume(e) {
    const v = parseFloat(e.target.value);
    setVolume(v);
    music.setVolume(v);
  }

  const isPlaying = musicState?.playing;
  const activeTrack = musicState?.track || 'hype';

  return (
    <div className="music-bar">
      <div className="music-viz">
        {vizHeights.map((h, i) => (
          <div key={i} className="viz-bar" style={{ height: h }} />
        ))}
      </div>

      {isHost ? (
        <>
          <div className="music-tracks">
            {TRACK_LIST.map(t => (
              <button
                key={t.id}
                className={`music-track-btn ${activeTrack === t.id ? 'active' : ''}`}
                onClick={() => handleTrack(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
          <button
            className={`music-play-btn ${isPlaying ? 'playing' : ''}`}
            onClick={isPlaying ? handleStop : handlePlay}
            title={isPlaying ? 'Stop music' : 'Play music'}
          >
            {isPlaying ? '⏹' : '▶'}
          </button>
        </>
      ) : (
        <div className="music-label">
          {isPlaying ? `♪ ${TRACK_LIST.find(t => t.id === activeTrack)?.name || activeTrack}` : 'Music off'}
        </div>
      )}

      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={volume}
        onChange={handleVolume}
        className="volume-slider"
        title="Volume"
      />
    </div>
  );
}
