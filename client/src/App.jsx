import { useState, useEffect } from 'react';
import socket, { pid } from './socket';
import Lobby from './components/Lobby';
import UnoGame from './components/UnoGame';
import CahGame from './components/CahGame';
import MonopolyGame from './components/MonopolyGame';
import ActionGame from './components/ActionGame';
import Confetti from './components/Confetti';
import Particles from './components/Particles';

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
  const [musicState, setMusicState] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);

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

  function showToast(msg) {
    setError(msg);
    setTimeout(() => setError(null), 3500);
  }

  // Attempt to rejoin saved session on connect
  useEffect(() => {
    function tryRejoin() {
      const saved = (() => {
        try { return JSON.parse(localStorage.getItem('cg_session')); } catch { return null; }
      })();
      if (saved?.roomCode && saved?.pid === pid) {
        socket.emit('rejoin_room', { code: saved.roomCode, pid });
        setPlayerName(saved.name || '');
      }
    }

    socket.on('connect', tryRejoin);

    socket.on('room_created', ({ code, playerId: pId }) => {
      setRoomCode(code);
      setPlayerId(pId);
    });

    socket.on('room_joined', ({ code, playerId: pId }) => {
      setRoomCode(code);
      setPlayerId(pId);
    });

    socket.on('game_state', state => {
      setGameState(state);
    });

    socket.on('hand_update', ({ hand: h }) => {
      setHand(h);
    });

    socket.on('error', ({ message }) => {
      showToast(message);
    });

    socket.on('game_over', data => {
      setGameOver(data);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 5000);
      localStorage.removeItem('cg_session');
    });

    socket.on('monopoly_dice_rolled', ({ dice, playerId: rollerId }) => {
      // Dice animation handled inside MonopolyGame via gameState diff
    });

    socket.on('mercy_vote_update', data => {
      if (data.passed) {
        // No additional handling needed; game_state covers it
      }
    });

    socket.on('player_left', ({ playerName: name }) => {
      showToast(`${name} left the game`);
    });

    socket.on('player_disconnected', ({ playerName: name }) => {
      showToast(`${name} disconnected (30s to rejoin...)`);
    });

    socket.on('player_rejoined', ({ playerName: name }) => {
      showToast(`${name} reconnected!`);
    });

    socket.on('custom_card_added', ({ creatorName }) => {
      showToast(`✨ ${creatorName} added a custom card to the deck!`);
    });

    socket.on('music_state', state => {
      setMusicState(state);
    });

    return () => {
      socket.off('connect');
      socket.off('room_created');
      socket.off('room_joined');
      socket.off('game_state');
      socket.off('hand_update');
      socket.off('error');
      socket.off('game_over');
      socket.off('player_left');
      socket.off('player_disconnected');
      socket.off('player_rejoined');
      socket.off('custom_card_added');
      socket.off('music_state');
      socket.off('monopoly_dice_rolled');
      socket.off('mercy_vote_update');
    };
  }, []);

  // Save session to localStorage whenever we're in a room
  useEffect(() => {
    if (roomCode && playerId && playerName) {
      localStorage.setItem('cg_session', JSON.stringify({ roomCode, pid, name: playerName }));
    }
  }, [roomCode, playerId, playerName]);

  const isInGame = gameState && gameState.phase !== 'lobby';
  const isHost = gameState?.host === playerId;
  const particleMode = gameOver ? 'victory' : isInGame ? 'playing' : 'lobby';

  function resetSession() {
    setGameOver(null);
    setGameState(null);
    setHand([]);
    setRoomCode(null);
    setPlayerId(null);
    localStorage.removeItem(STORAGE_KEY);
  }

  if (gameOver) {
    const gameType = gameState?.gameType;
    const subtitle =
      gameType === 'monopoly' ? (gameOver.reason === 'time_limit' ? 'Monopoly — Time Up!' : 'Monopoly Champion!') :
      gameType === 'action' ? (gameState?.actionMode === 'firefight' ? 'Firefight MVP!' : 'Impostor Showdown!') :
      gameType === 'uno' ? 'UNO Champion!' :
      'Game Over!';

    return (
      <div className="game-over-screen">
        <Particles mode="victory" />
        <Confetti active={showConfetti} />
        <div className="game-over-card" style={{ position: 'relative', zIndex: 1 }}>
          <div className="game-over-icon">🏆</div>
          {gameOver.winnerName ? (
            <>
              <h1>{gameOver.winnerName} Wins!</h1>
              <p>{subtitle}</p>
            </>
          ) : (
            <>
              <h1>Game Over!</h1>
              <div className="score-list">
                {[...(gameState?.players || [])].sort((a, b) => (gameOver.scores?.[b.id] || 0) - (gameOver.scores?.[a.id] || 0)).map(p => (
                  <div key={p.id} className="score-row">
                    <span>{p.name}</span>
                    <span className="score-pts">{gameOver.scores?.[p.id] || 0} pts</span>
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
      <Particles mode={particleMode} />
      {error && <div className="error-toast">{error}</div>}
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        {!isInGame ? (
          <Lobby
            gameState={gameState}
            roomCode={roomCode}
            playerId={playerId}
            playerName={playerName}
            setPlayerName={setPlayerName}
            musicState={musicState}
            isHost={isHost}
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
            musicState={musicState}
            isHost={isHost}
          />
        ) : gameState.gameType === 'monopoly' ? (
          <MonopolyGame
            gameState={gameState}
            playerId={playerId}
            roomCode={roomCode}
            isHost={isHost}
          />
        ) : gameState.gameType === 'action' ? (
          <ActionGame
            gameState={gameState}
            playerId={playerId}
            roomCode={roomCode}
            isHost={isHost}
          />
        ) : (
          <CahGame
            gameState={gameState}
            hand={hand}
            playerId={playerId}
            roomCode={roomCode}
            musicState={musicState}
            isHost={isHost}
          />
        )}
      </div>
    </div>
  );
}
