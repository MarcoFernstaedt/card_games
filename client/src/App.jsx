import { useState, useEffect } from 'react';
import socket from './socket';
import Lobby from './components/Lobby';
import UnoGame from './components/UnoGame';
import CahGame from './components/CahGame';

const STORAGE_KEY = 'card_games_session';
const MUSIC_TRACKS = [
  {
    id: 'lobby',
    label: 'Lobby Groove',
    src: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8d6c644a5.mp3?filename=lofi-study-112191.mp3',
  },
  {
    id: 'arcade',
    label: 'Arcade Pulse',
    src: 'https://cdn.pixabay.com/download/audio/2022/02/22/audio_d1718ab41b.mp3?filename=gaming-music-8-bit-console-play-background-intro-theme-112191.mp3',
  },
  {
    id: 'chill',
    label: 'Chill Table',
    src: 'https://cdn.pixabay.com/download/audio/2021/11/25/audio_cb089b35f9.mp3?filename=relaxing-music-11750.mp3',
  },
];

function loadSavedSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function App() {
  const saved = typeof window !== 'undefined' ? loadSavedSession() : null;
  const [playerId, setPlayerId] = useState(saved?.playerId ?? null);
  const [playerName, setPlayerName] = useState(saved?.playerName ?? '');
  const [roomCode, setRoomCode] = useState(saved?.roomCode ?? null);
  const [gameState, setGameState] = useState(null);
  const [hand, setHand] = useState([]);
  const [error, setError] = useState(null);
  const [gameOver, setGameOver] = useState(null);
  const [musicEnabled, setMusicEnabled] = useState(saved?.musicEnabled ?? false);
  const [musicTrack, setMusicTrack] = useState(saved?.musicTrack ?? MUSIC_TRACKS[0].id);
  const [musicVolume, setMusicVolume] = useState(saved?.musicVolume ?? 0.35);

  useEffect(() => {
    const current = {
      playerId,
      playerName,
      roomCode,
      musicEnabled,
      musicTrack,
      musicVolume,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  }, [playerId, playerName, roomCode, musicEnabled, musicTrack, musicVolume]);

  useEffect(() => {
    const selected = MUSIC_TRACKS.find(track => track.id === musicTrack) || MUSIC_TRACKS[0];
    const audio = new Audio(selected.src);
    audio.loop = true;
    audio.volume = musicVolume;

    if (musicEnabled) {
      audio.play().catch(() => {});
    }

    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, [musicEnabled, musicTrack, musicVolume]);

  useEffect(() => {
    socket.on('room_created', ({ code, playerId: pid }) => {
      setRoomCode(code);
      setPlayerId(pid);
    });

    socket.on('room_joined', ({ code, playerId: pid }) => {
      setRoomCode(code);
      setPlayerId(pid);
    });

    socket.on('game_state', state => {
      setGameState(state);
    });

    socket.on('hand_update', ({ hand: h }) => {
      setHand(h);
    });

    socket.on('error', ({ message }) => {
      setError(message);
      setTimeout(() => setError(null), 3500);
    });

    socket.on('game_over', data => {
      setGameOver(data);
    });

    socket.on('player_left', ({ playerName: name }) => {
      setError(`${name} left the game`);
      setTimeout(() => setError(null), 3500);
    });

    socket.on('custom_card_added', ({ creatorName }) => {
      setError(`✨ ${creatorName} added a custom card to the deck!`);
      setTimeout(() => setError(null), 3500);
    });

    return () => {
      socket.off('room_created');
      socket.off('room_joined');
      socket.off('game_state');
      socket.off('hand_update');
      socket.off('error');
      socket.off('game_over');
      socket.off('player_left');
      socket.off('custom_card_added');
    };
  }, []);

  const isInGame = gameState && gameState.phase !== 'lobby';

  function resetSession() {
    setGameOver(null);
    setGameState(null);
    setHand([]);
    setRoomCode(null);
    setPlayerId(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  if (gameOver) {
    return (
      <div className="game-over-screen">
        <div className="game-over-card">
          <div className="game-over-icon">🏆</div>
          {gameOver.winnerName ? (
            <>
              <h1>{gameOver.winnerName} Wins!</h1>
              <p>UNO Champion</p>
            </>
          ) : (
            <>
              <h1>Game Over!</h1>
              <div className="score-list">
                {[...(gameState?.players || [])].sort((a, b) => (gameOver.scores[b.id] || 0) - (gameOver.scores[a.id] || 0)).map(p => (
                  <div key={p.id} className="score-row">
                    <span>{p.name}</span>
                    <span className="score-pts">{gameOver.scores[p.id] || 0} pts</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <button className="btn-primary" onClick={resetSession}>
            Play Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {error && <div className="error-toast">{error}</div>}
      {!isInGame ? (
        <Lobby
          gameState={gameState}
          roomCode={roomCode}
          playerId={playerId}
          playerName={playerName}
          setPlayerName={setPlayerName}
          musicEnabled={musicEnabled}
          setMusicEnabled={setMusicEnabled}
          musicTrack={musicTrack}
          setMusicTrack={setMusicTrack}
          musicVolume={musicVolume}
          setMusicVolume={setMusicVolume}
          musicTracks={MUSIC_TRACKS}
          onLeaveRoom={resetSession}
        />
      ) : gameState.gameType === 'uno' ? (
        <UnoGame
          gameState={gameState}
          hand={hand}
          playerId={playerId}
          roomCode={roomCode}
        />
      ) : (
        <CahGame
          gameState={gameState}
          hand={hand}
          playerId={playerId}
          roomCode={roomCode}
        />
      )}
    </div>
  );
}
