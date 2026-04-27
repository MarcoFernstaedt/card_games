import { useState } from 'react';
import socket from '../socket';
import MusicControls from './MusicControls';
import Confetti from './Confetti';

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

export default function UnoGame({ gameState, hand, playerId, roomCode, musicState, isHost }) {
  const [pendingWild, setPendingWild] = useState(null);
  const [mercyVoteNotice, setMercyVoteNotice] = useState(null);

  const myPlayerIndex = gameState.players?.findIndex(p => p.id === playerId);
  const isMyTurn = gameState.currentPlayerIndex === myPlayerIndex;
  const currentPlayer = gameState.players?.[gameState.currentPlayerIndex];
  const topCard = gameState.topCard;
  const isMercyMode = gameState.unoMode === 'mercy';
  const drawStack = gameState.drawStack || 0;
  const pendingDrawType = gameState.pendingDrawType;

  const canPlayCard = (card) => {
    if (!isMyTurn) return false;

    // Mercy mode stacking: when a draw stack is pending, only the right draw card type is playable
    if (isMercyMode && drawStack > 0) {
      if (pendingDrawType === 'draw_two') return card.value === 'draw_two';
      if (pendingDrawType === 'wild_draw_four') return card.value === 'wild_draw_four';
      return false;
    }

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

  function handleMercyVote(targetId) {
    socket.emit('uno_mercy_vote', { code: roomCode, targetPlayerId: targetId });
    setMercyVoteNotice(targetId);
    setTimeout(() => setMercyVoteNotice(null), 3000);
  }

  const otherPlayers = gameState.players?.filter(p => p.id !== playerId) || [];
  const myInfo = gameState.players?.find(p => p.id === playerId);

  const winner = gameState.winner;

  // Mercy vote state
  const mercyTarget = gameState.mercyVoteTarget;
  const mercyVotes = gameState.mercyVotes || {};
  const mercyTargetPlayer = gameState.players?.find(p => p.id === mercyTarget);
  const myVoteForTarget = mercyVotes[playerId] === mercyTarget;
  const voteCount = Object.values(mercyVotes).filter(v => v === mercyTarget).length;
  const eligibleVoters = (gameState.players?.length || 1) - 1;
  const threshold = Math.ceil(eligibleVoters / 2);

  // Players eligible for mercy votes (15+ cards, not me)
  const mercyCandidates = isMercyMode
    ? (gameState.players?.filter(p => p.id !== playerId && p.cardCount >= 15) || [])
    : [];

  return (
    <div className="uno-game">
      <Confetti active={!!winner} />
      {pendingWild && <ColorPicker onPick={handleColorPick} />}

      {/* Identity bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), var(--accent2))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.78rem' }}>
            {myInfo?.name?.charAt(0).toUpperCase() || '?'}
          </div>
          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{myInfo?.name || 'You'}</span>
          {isMercyMode && (
            <span style={{ fontSize: '0.7rem', background: 'rgba(233,69,96,0.15)', color: 'var(--accent2)', borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>
              MERCY
            </span>
          )}
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>Room: <strong style={{ color: 'var(--accent)', letterSpacing: 2 }}>{roomCode}</strong></span>
      </div>

      {/* Draw stack alert (Mercy mode) */}
      {isMercyMode && drawStack > 0 && (
        <div style={{
          background: 'rgba(233,69,96,0.15)', border: '1px solid var(--accent2)',
          borderRadius: 8, margin: '8px 14px', padding: '10px 14px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--accent2)' }}>
              Stack: +{drawStack}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 2 }}>
              {isMyTurn
                ? `Stack a ${pendingDrawType === 'draw_two' ? '+2' : '+4'} to pass it on, or draw ${drawStack} cards`
                : `Next player must stack a ${pendingDrawType === 'draw_two' ? '+2' : '+4'} or draw ${drawStack}`}
            </div>
          </div>
          {isMyTurn && (
            <button
              onClick={handleDraw}
              style={{ background: 'var(--accent2)', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem' }}
            >
              Draw {drawStack}
            </button>
          )}
        </div>
      )}

      {/* Other players */}
      <div className="uno-players-bar">
        {otherPlayers.map(p => (
          <div key={p.id} className={`uno-player-chip ${p.isCurrentPlayer ? 'current' : ''}`}>
            <div className="p-name">{p.name}</div>
            <div className="p-count" style={{ color: p.isCurrentPlayer ? 'var(--accent)' : 'var(--text)' }}>
              {p.cardCount}
            </div>
            {p.cardCount === 1 && <div className="uno-flag">UNO!</div>}
            {isMercyMode && p.cardCount >= 15 && (
              <div style={{ fontSize: '0.65rem', color: 'var(--accent2)', fontWeight: 700 }}>MANY</div>
            )}
          </div>
        ))}
      </div>

      {/* Mercy vote active banner */}
      {isMercyMode && mercyTarget && mercyTargetPlayer && (
        <div style={{
          background: 'rgba(107,77,255,0.12)', border: '1px solid var(--accent)',
          borderRadius: 8, margin: '0 14px 8px', padding: '10px 14px',
        }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 4 }}>
            Mercy vote for {mercyTargetPlayer.name} ({voteCount}/{threshold} votes)
          </div>
          <div style={{ background: 'var(--surface)', borderRadius: 4, height: 6, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{ width: `${Math.min((voteCount / threshold) * 100, 100)}%`, background: 'var(--accent)', height: '100%', transition: 'width 0.3s' }} />
          </div>
          {!myVoteForTarget && mercyTarget !== playerId && (
            <button
              onClick={() => handleMercyVote(mercyTarget)}
              style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 12px', fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem' }}
            >
              Vote Mercy
            </button>
          )}
          {myVoteForTarget && (
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>You voted</span>
          )}
        </div>
      )}

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
              onClick={isMyTurn && !(isMercyMode && drawStack > 0) ? handleDraw : undefined}
              style={!isMyTurn || (isMercyMode && drawStack > 0) ? { opacity: 0.5, cursor: 'default' } : {}}
            >
              <div className="deck-count">{gameState.deckCount}</div>
              <div className="deck-label">{isMyTurn && !(isMercyMode && drawStack > 0) ? 'Tap to draw' : 'cards left'}</div>
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

      {/* Mercy vote candidates */}
      {isMercyMode && mercyCandidates.length > 0 && !mercyTarget && (
        <div style={{ padding: '0 14px 8px' }}>
          {mercyCandidates.map(p => (
            <button
              key={p.id}
              onClick={() => handleMercyVote(p.id)}
              disabled={mercyVoteNotice === p.id}
              style={{
                background: 'rgba(107,77,255,0.1)', border: '1px solid var(--accent)',
                color: 'var(--accent)', borderRadius: 6, padding: '5px 10px',
                fontSize: '0.75rem', cursor: 'pointer', marginRight: 6,
              }}
            >
              {mercyVoteNotice === p.id ? 'Voted!' : `Show mercy to ${p.name} (${p.cardCount} cards)`}
            </button>
          ))}
        </div>
      )}

      <MusicControls roomCode={roomCode} isHost={isHost} musicState={musicState} />

      {/* Hand */}
      <div className="uno-hand" style={{ paddingBottom: 68 }}>
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
