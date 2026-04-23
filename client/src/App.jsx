import { useState, useEffect } from 'react';
import socket, { pid } from './socket';
import Lobby from './components/Lobby';
import UnoGame from './components/UnoGame';
import CahGame from './components/CahGame';
import Confetti from './components/Confetti';
import Particles from './components/Particles';

export default function App() {
  const [playerId, setPlayerId] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [hand, setHand] = useState([]);
  const [error, setError] = useState(null);
  const [gameOver, setGameOver] = useState(null);
  const [musicState, setMusicState] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);

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
      setTimeout(() => setShowConfetti(false), 4000);
      localStorage.removeItem('cg_session');
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

  if (gameOver) {
    return (
      <div className="game-over-screen">
        <Particles mode="victory" />
        <Confetti active={showConfetti} />
        <div className="game-over-card" style={{ position: 'relative', zIndex: 1 }}>
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
          <button className="btn-primary" onClick={() => {
            setGameOver(null); setGameState(null); setHand([]);
            setRoomCode(null); setPlayerId(null);
            localStorage.removeItem('cg_session');
          }}>
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
