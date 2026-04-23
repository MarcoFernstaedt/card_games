import { useState, useEffect } from 'react';
import socket, { pid } from '../socket';
import MusicControls from './MusicControls';

export default function Lobby({ gameState, roomCode, playerId, playerName, setPlayerName, musicState, isHost, musicEnabled, setMusicEnabled, musicTrack, setMusicTrack, musicVolume, setMusicVolume, musicTracks, onLeaveRoom }) {
  const [view, setView] = useState('home');
  const [joinCode, setJoinCode] = useState('');
  const [savedSession, setSavedSession] = useState(null);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('cg_session'));
      if (s?.roomCode && s?.pid === pid && !roomCode) setSavedSession(s);
    } catch {}
  }, [roomCode]);

  useEffect(() => {
    if (roomCode) return;
    setView('home');
  }, [roomCode]);

  const inRoom = !!roomCode;

  function handleCreate() {
    if (!playerName.trim()) return;
    socket.emit('create_room', { name: playerName.trim(), gameType: 'cah', pid });
  }

  function handleJoin() {
    if (!playerName.trim() || !joinCode.trim()) return;
    socket.emit('join_room', { name: playerName.trim(), code: joinCode.trim().toUpperCase(), pid });
  }

  function handleStart() {
    socket.emit('start_game', { code: roomCode });
  }

  function handleGameTypeChange(type) {
    socket.emit('change_game_type', { code: roomCode, gameType: type });
  }

  function handleRejoin() {
    if (!savedSession) return;
    socket.emit('rejoin_room', { code: savedSession.roomCode, pid });
    setSavedSession(null);
  }

  function handleDismissRejoin() {
    localStorage.removeItem('cg_session');
    setSavedSession(null);
  }

  if (inRoom && gameState) {
    return (
      <div className="lobby">
        <div className="lobby-logo">
          <h1>Card Games</h1>
          <p>Share the code to invite friends</p>
        </div>

        <div className="lobby-card">
          <div className="room-code-display">
            <div className="label">Room Code</div>
            <div className="code">{roomCode}</div>
            <div className="hint">Share this with up to 5 friends</div>
          </div>

          {isHost && (
            <>
              <div className="section-label" style={{ margin: '0 0 8px' }}>Game Mode</div>
              <div className="game-type-toggle">
                <button
                  className={`game-type-btn ${gameState.gameType === 'cah' ? 'active' : ''}`}
                  onClick={() => handleGameTypeChange('cah')}
                >
                  🃏 Wild Cards
                </button>
                <button
                  className={`game-type-btn ${gameState.gameType === 'uno' ? 'active' : ''}`}
                  onClick={() => handleGameTypeChange('uno')}
                >
                  🎴 UNO
                </button>
              </div>
            </>
          )}

          {!isHost && (
            <div className="cah-status" style={{ marginBottom: 14 }}>
              <div className="status-dot" />
              Game type: <strong style={{ marginLeft: 4 }}>{gameState.gameType === 'cah' ? 'Wild Cards' : 'UNO'}</strong>
            </div>
          )}

          <div className="player-list">
            <div className="player-list-title">Players ({gameState.players?.length}/6)</div>
            {gameState.players?.map(p => (
              <div key={p.id} className={`player-chip ${p.disconnected ? 'disconnected' : ''}`}>
                <div className="avatar">{p.name.charAt(0).toUpperCase()}</div>
                <span style={{ fontWeight: p.id === playerId ? 700 : 400 }}>{p.name}</span>
                {p.disconnected && <span style={{ fontSize: '0.7rem', color: 'var(--muted)', marginLeft: 4 }}>⏳</span>}
                {p.id === gameState.host && (
                  <span className="host-badge">{p.id === playerId ? 'HOST (YOU)' : 'HOST'}</span>
                )}
                {p.id === playerId && p.id !== gameState.host && (
                  <span className="host-badge" style={{ background: 'rgba(233,69,96,0.15)', color: 'var(--accent2)' }}>YOU</span>
                )}
              </div>
            ))}
          </div>

          {isHost ? (
            <button
              className="btn-primary"
              onClick={handleStart}
              disabled={!gameState.players || gameState.players.length < 2}
            >
              {gameState.players?.length < 2 ? 'Waiting for players...' : 'Start Game'}
            </button>
          ) : (
            <div className="waiting-msg">
              <div className="spinner" />
              Waiting for host to start...
            </div>
          )}

          <button className="btn-secondary" onClick={onLeaveRoom}>
            Leave Room
          </button>
        </div>

        <div className="music-panel">
          <div className="music-panel-title">Music</div>
          <label className="music-toggle-row">
            <input type="checkbox" checked={musicEnabled} onChange={e => setMusicEnabled(e.target.checked)} />
            <span>{musicEnabled ? 'Music on' : 'Music off'}</span>
          </label>
          <select className="input-field" value={musicTrack} onChange={e => setMusicTrack(e.target.value)}>
            {musicTracks.map(track => (
              <option key={track.id} value={track.id}>{track.label}</option>
            ))}
          </select>
          <label className="slider-label">Volume: {Math.round(musicVolume * 100)}%</label>
          <input className="volume-slider" type="range" min="0" max="1" step="0.05" value={musicVolume} onChange={e => setMusicVolume(Number(e.target.value))} />
          <div className="music-help">Music stays with this device after refresh.</div>
        </div>

        {roomCode && <MusicControls roomCode={roomCode} isHost={isHost} musicState={musicState} />}
      </div>
    );
  }

  return (
    <div className="lobby">
      <div className="lobby-logo">
        <h1>Card Games</h1>
        <p>Wild Cards & UNO — up to 6 players</p>
      </div>

      {savedSession && (
        <div className="rejoin-banner">
          <span>Rejoin room <strong>{savedSession.roomCode}</strong> as <strong>{savedSession.name}</strong>?</span>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn-sm" onClick={handleRejoin}>Rejoin</button>
            <button className="btn-sm" style={{ background: 'var(--surface2)', color: 'var(--muted)' }} onClick={handleDismissRejoin}>Dismiss</button>
          </div>
        </div>
      )}

      <div className="lobby-card">
        {view === 'home' && (
          <>
            <h2>Welcome!</h2>
            <div className="input-group">
              <label>Your Name</label>
              <input
                className="input-field"
                type="text"
                placeholder="Enter your name"
                value={playerName}
                onChange={e => setPlayerName(e.target.value)}
                maxLength={20}
                autoComplete="off"
              />
            </div>
            <button
              className="btn-primary"
              onClick={() => { if (playerName.trim()) setView('create'); }}
              disabled={!playerName.trim()}
            >
              Create Room
            </button>
            <button
              className="btn-secondary"
              onClick={() => { if (playerName.trim()) setView('join'); }}
              disabled={!playerName.trim()}
            >
              Join Room
            </button>
            {!playerName.trim() && (
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center' }}>
                Enter your name to continue
              </p>
            )}

            <div className="music-panel compact">
              <div className="music-panel-title">Music</div>
              <label className="music-toggle-row">
                <input type="checkbox" checked={musicEnabled} onChange={e => setMusicEnabled(e.target.checked)} />
                <span>{musicEnabled ? 'Music on' : 'Music off'}</span>
              </label>
              <select className="input-field" value={musicTrack} onChange={e => setMusicTrack(e.target.value)}>
                {musicTracks.map(track => (
                  <option key={track.id} value={track.id}>{track.label}</option>
                ))}
              </select>
              <label className="slider-label">Volume: {Math.round(musicVolume * 100)}%</label>
              <input className="volume-slider" type="range" min="0" max="1" step="0.05" value={musicVolume} onChange={e => setMusicVolume(Number(e.target.value))} />
            </div>
          </>
        )}

        {view === 'create' && (
          <>
            <h2>Create a Room</h2>
            <p style={{ fontSize: '0.88rem', color: 'var(--muted)', marginBottom: 16 }}>
              You'll be the host. Share the room code with friends!
            </p>
            <button className="btn-primary" onClick={handleCreate}>
              Create Room as <strong style={{ marginLeft: 4 }}>{playerName}</strong>
            </button>
            <button className="btn-secondary" onClick={() => setView('home')}>Back</button>
          </>
        )}

        {view === 'join' && (
          <>
            <h2>Join a Room</h2>
            <div className="input-group">
              <label>Room Code</label>
              <input
                className="input-field code-input"
                type="text"
                placeholder="XXXX"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                maxLength={4}
                autoComplete="off"
              />
            </div>
            <button
              className="btn-primary"
              onClick={handleJoin}
              disabled={!joinCode.trim() || joinCode.length < 4}
            >
              Join Room
            </button>
            <button className="btn-secondary" onClick={() => setView('home')}>Back</button>
          </>
        )}
      </div>
    </div>
  );
}
