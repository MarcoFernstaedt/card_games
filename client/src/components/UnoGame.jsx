import { useState } from 'react';
import socket from '../socket';

const VALUE_DISPLAY = {
  skip: '⊘',
  reverse: '↺',
  draw_two: '+2',
  wild: 'W',
  wild_draw_four: '+4',
};

function UnoCard({ card, size = 'normal', playable, onClick, showBack }) {
  const val = VALUE_DISPLAY[card?.value] ?? card?.value;
  const colorClass = showBack ? 'back' : (card?.chosenColor || card?.color || 'wild');
  const sizeClass = size === 'large' ? 'large' : size === 'small' ? 'small' : '';
  const playableClass = !showBack && playable !== undefined ? (playable ? 'playable' : 'unplayable') : '';

  const isWild = card?.color === 'wild' && !showBack;

  return (
    <div
      className={`uno-card ${colorClass} ${sizeClass} ${playableClass}`}
      onClick={playable !== false ? onClick : undefined}
      style={playable === false ? { pointerEvents: 'none' } : {}}
    >
      {!showBack && (
        <>
          <div className="card-oval" />
          {isWild ? (
            <div className="wild-colors">
              <div className="wild-q r" />
              <div className="wild-q b" />
              <div className="wild-q g" />
              <div className="wild-q y" />
            </div>
          ) : (
            <div className="card-value">{val}</div>
          )}
          <div className="card-corner tl">{isWild ? (card.value === 'wild_draw_four' ? '+4' : 'W') : val}</div>
          <div className="card-corner br">{isWild ? (card.value === 'wild_draw_four' ? '+4' : 'W') : val}</div>
        </>
      )}
      {showBack && (
        <div style={{ fontSize: '1.5rem', opacity: 0.4 }}>🃏</div>
      )}
    </div>
  );
}

function ColorPicker({ onPick }) {
  const colors = ['red', 'blue', 'green', 'yellow'];
  const labels = { red: '🔴 Red', blue: '🔵 Blue', green: '🟢 Green', yellow: '🟡 Yellow' };
  return (
    <div className="modal-overlay">
      <div className="modal">
        <h3>Choose a Color</h3>
        <div className="color-grid">
          {colors.map(c => (
            <button key={c} className={`color-choice ${c}`} onClick={() => onPick(c)}>
              {labels[c]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function UnoGame({ gameState, hand, playerId, roomCode }) {
  const [pendingWild, setPendingWild] = useState(null); // { cardIndex }

  const myPlayerIndex = gameState.players?.findIndex(p => p.id === playerId);
  const isMyTurn = gameState.currentPlayerIndex === myPlayerIndex;
  const currentPlayer = gameState.players?.[gameState.currentPlayerIndex];
  const topCard = gameState.topCard;

  const canPlayCard = (card) => {
    if (!isMyTurn) return false;
    if (card.color === 'wild') return true;
    if (card.color === gameState.currentColor) return true;
    if (topCard && card.value === topCard.value) return true;
    return false;
  };

  function handleCardClick(card, idx) {
    if (!isMyTurn) return;
    if (!canPlayCard(card)) return;

    if (card.color === 'wild') {
      setPendingWild({ cardIndex: idx });
    } else {
      socket.emit('uno_play_card', { code: roomCode, cardIndex: idx });
    }
  }

  function handleColorPick(color) {
    socket.emit('uno_play_card', {
      code: roomCode,
      cardIndex: pendingWild.cardIndex,
      chosenColor: color,
    });
    setPendingWild(null);
  }

  function handleDraw() {
    if (!isMyTurn) return;
    socket.emit('uno_draw_card', { code: roomCode });
  }

  const otherPlayers = gameState.players?.filter(p => p.id !== playerId) || [];
  const myInfo = gameState.players?.find(p => p.id === playerId);

  return (
    <div className="uno-game">
      {pendingWild && <ColorPicker onPick={handleColorPick} />}

      {/* Other players */}
      <div className="uno-players-bar">
        {otherPlayers.map(p => (
          <div key={p.id} className={`uno-player-chip ${p.isCurrentPlayer ? 'current' : ''}`}>
            <div className="p-name">{p.name}</div>
            <div className="p-count" style={{ color: p.isCurrentPlayer ? 'var(--accent)' : 'var(--text)' }}>
              {p.cardCount}
            </div>
            {p.cardCount === 1 && <div className="uno-flag">UNO!</div>}
          </div>
        ))}
      </div>

      {/* Board */}
      <div className="uno-board">
        <div className={`turn-banner ${isMyTurn ? 'your-turn' : ''}`}>
          {isMyTurn ? '🔥 Your Turn!' : `⏳ ${currentPlayer?.name}'s Turn`}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="color-dot" style={{
            width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.2)',
            background: `var(--uno-${gameState.currentColor})`
          }} />
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)', fontWeight: 600 }}>
            Active color: <span style={{ color: 'var(--text)', textTransform: 'capitalize' }}>{gameState.currentColor}</span>
          </span>
          <span style={{ fontSize: '0.8rem', color: 'var(--muted)', marginLeft: 8 }}>
            {gameState.direction === 1 ? '→ clockwise' : '← counter'}
          </span>
        </div>

        <div className="piles">
          <div>
            <div className="pile-label">Discard</div>
            {topCard && (
              <UnoCard card={topCard} size="large" />
            )}
          </div>

          <div>
            <div className="pile-label">Draw Pile</div>
            <div
              className="deck-pile"
              onClick={isMyTurn ? handleDraw : undefined}
              style={!isMyTurn ? { opacity: 0.5, cursor: 'default' } : {}}
            >
              <div className="deck-count">{gameState.deckCount}</div>
              <div className="deck-label">{isMyTurn ? 'Tap to draw' : 'cards left'}</div>
            </div>
          </div>
        </div>

        {myInfo && (
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            {hand.length === 1 && (
              <span style={{ color: 'var(--accent2)', fontWeight: 800, fontSize: '0.9rem' }}>UNO! </span>
            )}
            You have <strong style={{ color: 'var(--text)', margin: '0 4px' }}>{hand.length}</strong> card{hand.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {/* Hand */}
      <div className="uno-hand">
        <div className="uno-hand-label">Your Hand {!isMyTurn && '(not your turn)'}</div>
        <div className="hand-scroll">
          {hand.map((card, idx) => (
            <UnoCard
              key={card.id}
              card={card}
              playable={isMyTurn && canPlayCard(card)}
              onClick={() => handleCardClick(card, idx)}
            />
          ))}
          {hand.length === 0 && (
            <div style={{ color: 'var(--muted)', fontSize: '0.9rem', padding: '20px 0' }}>No cards</div>
          )}
        </div>
      </div>
    </div>
  );
}
