import { useState, useEffect } from 'react';
import socket from './socket';
import Lobby from './components/Lobby';
import UnoGame from './components/UnoGame';
import CahGame from './components/CahGame';

export default function App() {
  const [playerId, setPlayerId] = useState(null);
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [hand, setHand] = useState([]);
  const [error, setError] = useState(null);
  const [gameOver, setGameOver] = useState(null);

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
                {gameState?.players?.sort((a, b) => (gameOver.scores[b.id] || 0) - (gameOver.scores[a.id] || 0)).map(p => (
                  <div key={p.id} className="score-row">
                    <span>{p.name}</span>
                    <span className="score-pts">{gameOver.scores[p.id] || 0} pts</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <button className="btn-primary" onClick={() => { setGameOver(null); setGameState(null); setHand([]); setRoomCode(null); setPlayerId(null); }}>
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
