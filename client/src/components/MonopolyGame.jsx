import { useState, useEffect, useRef } from 'react';
import socket from '../socket';
import Confetti from './Confetti';

// Player token colors
const TOKEN_COLORS = ['#7c6bff', '#e94560', '#00c896', '#ffab00', '#00b4ff', '#ff6b6b'];
const TOKEN_ICONS = ['♟', '♠', '★', '♦', '♣', '♥'];

// Board layout: corners at 0 (GO), 7 (Jail), 14 (FP), 21 (GTJ)
// Side A (bottom): 0→6, Side B (left): 7→13, Side C (top): 14→20, Side D (right): 21→27
const SPACE_ICONS = {
  go: '▶',
  jail: '⚖',
  free_parking: '🅿',
  go_to_jail: '🚔',
  chance: '?',
  tax: '$',
  railroad: '🚂',
  utility: '⚡',
  property: '',
};

// Precompute grid positions for 28 spaces in a 9×9 visual grid
// Corners occupy 2×2, edge spaces are 1×2 or 2×1
// Simple approach: map each space to a (col, row) in a 9×9 CSS grid
function getBoardPos(id) {
  // Bottom row (right→left): 0=col8,row8  1=col7,row8 ... 6=col2,row8 | 7=col1,row8 (corner)
  if (id === 0)  return { col: 9, row: 9, corner: true };
  if (id >= 1 && id <= 6) return { col: 9 - id, row: 9 };
  if (id === 7)  return { col: 1, row: 9, corner: true };
  // Left col (bottom→top): 8=col1,row7 ... 13=col1,row2
  if (id >= 8 && id <= 13) return { col: 1, row: 9 - (id - 7) };
  if (id === 14) return { col: 1, row: 1, corner: true };
  // Top row (left→right): 15=col2,row1 ... 20=col7,row1
  if (id >= 15 && id <= 20) return { col: 1 + (id - 14), row: 1 };
  if (id === 21) return { col: 9, row: 1, corner: true };
  // Right col (top→bottom): 22=col9,row2 ... 27=col9,row7
  if (id >= 22 && id <= 27) return { col: 9, row: 1 + (id - 21) };
  return { col: 1, row: 1 };
}

function SpaceIcon({ space }) {
  if (space.type === 'property' && space.color) {
    return <div style={{ width: 10, height: 10, borderRadius: 2, background: space.color, flexShrink: 0 }} />;
  }
  return <span style={{ fontSize: '0.6rem' }}>{SPACE_ICONS[space.type] || ''}</span>;
}

function BoardSpace({ space, players, isHighlighted, onClick }) {
  const pos = getBoardPos(space.id);
  const tokens = players.filter(p => p.position === space.id && !p.bankrupt);
  const isCorner = pos.corner;

  return (
    <div
      onClick={onClick}
      style={{
        gridColumn: pos.col,
        gridRow: pos.row,
        background: isHighlighted
          ? 'rgba(124,107,255,0.3)'
          : space.ownerId
            ? `${space.color}18`
            : 'var(--surface2)',
        border: isHighlighted
          ? '2px solid var(--accent)'
          : `1px solid ${space.type === 'property' && space.color ? space.color + '44' : 'var(--border)'}`,
        borderRadius: isCorner ? 6 : 3,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        cursor: onClick ? 'pointer' : 'default',
        position: 'relative',
        padding: isCorner ? '2px' : '1px',
        minWidth: 0,
        overflow: 'hidden',
        transition: 'background 0.3s, border 0.3s',
      }}
    >
      {space.mortgaged && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.5rem', color: 'var(--muted)',
        }}>M</div>
      )}
      <SpaceIcon space={space} />
      <div style={{
        fontSize: isCorner ? '0.45rem' : '0.4rem',
        color: 'var(--muted)',
        textAlign: 'center',
        lineHeight: 1.1,
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        width: '100%',
      }}>
        {isCorner ? space.name : space.name.split(' ')[0]}
      </div>
      {tokens.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 1, justifyContent: 'center' }}>
          {tokens.map((p, i) => (
            <div key={p.id} style={{
              width: 10, height: 10, borderRadius: '50%',
              background: TOKEN_COLORS[i % TOKEN_COLORS.length],
              fontSize: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800,
              boxShadow: '0 0 4px rgba(0,0,0,0.6)',
            }}>
              {p.name.charAt(0)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DiceDisplay({ dice, rolling }) {
  const faces = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
  return (
    <div style={{ display: 'flex', gap: 12, justifyContent: 'center', alignItems: 'center' }}>
      {[dice[0], dice[1]].map((d, i) => (
        <div
          key={i}
          style={{
            width: 52, height: 52,
            background: rolling ? 'var(--surface2)' : 'var(--surface)',
            border: '2px solid var(--accent)',
            borderRadius: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2.2rem',
            transform: rolling ? `rotate(${Math.random() * 360}deg) scale(1.1)` : 'rotate(0deg) scale(1)',
            transition: rolling ? 'none' : 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)',
            boxShadow: rolling ? '0 0 16px var(--accent)' : '0 4px 12px rgba(0,0,0,0.4)',
            userSelect: 'none',
          }}
        >
          {rolling ? '🎲' : (d > 0 ? faces[d] : '🎲')}
        </div>
      ))}
    </div>
  );
}

function PropertyModal({ space, canBuy, myMoney, onBuy, onPass }) {
  if (!space) return null;
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 320 }}>
        <div style={{
          height: 6, background: space.color || 'var(--accent)',
          borderRadius: '8px 8px 0 0', margin: '-20px -20px 16px',
        }} />
        <h3 style={{ marginBottom: 4 }}>{space.name}</h3>
        <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 12 }}>
          {space.type === 'railroad' ? 'Railroad' :
           space.type === 'utility' ? 'Utility' : 'Property'}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ color: 'var(--muted)' }}>Price</span>
          <span style={{ fontWeight: 700, color: '#00c896' }}>${space.price}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <span style={{ color: 'var(--muted)' }}>Rent</span>
          <span style={{ fontWeight: 700 }}>${space.rent}</span>
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 16 }}>
          Your balance: <strong style={{ color: canBuy ? 'var(--text)' : 'var(--accent2)' }}>${myMoney}</strong>
        </div>
        {canBuy ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-primary" onClick={onBuy} style={{ flex: 1 }}>
              Buy ${space.price}
            </button>
            <button className="btn-secondary" onClick={onPass} style={{ flex: 1 }}>
              Pass
            </button>
          </div>
        ) : (
          <>
            <div style={{ color: 'var(--accent2)', fontSize: '0.85rem', textAlign: 'center', marginBottom: 10 }}>
              Not enough money to buy
            </div>
            <button className="btn-secondary" onClick={onPass} style={{ width: '100%' }}>
              Pass
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ChanceModal({ card, onDismiss }) {
  if (!card) return null;
  const isGain = card.effect === 'gain' || card.effect === 'advance_go' || card.effect === 'birthday' || card.effect === 'income_tax';
  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 300, textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', marginBottom: 12 }}>
          {card.effect === 'go_to_jail' ? '🚔' : isGain ? '🎉' : '💸'}
        </div>
        <h3 style={{ marginBottom: 12 }}>Chance!</h3>
        <p style={{ fontSize: '0.9rem', color: 'var(--muted)', lineHeight: 1.5, marginBottom: 20 }}>
          {card.text}
        </p>
        <button className="btn-primary" onClick={onDismiss}>OK</button>
      </div>
    </div>
  );
}

export default function MonopolyGame({ gameState, playerId, roomCode, isHost }) {
  const [rolling, setRolling] = useState(false);
  const [chanceCard, setChanceCard] = useState(null);
  const [selectedSpace, setSelectedSpace] = useState(null);
  const [prevDice, setPrevDice] = useState([0, 0]);

  const myPlayer = gameState.players?.find(p => p.id === playerId);
  const currentPlayer = gameState.players?.[gameState.currentPlayerIndex];
  const isMyTurn = currentPlayer?.id === playerId;
  const board = gameState.board || [];

  // Detect chance card from last state
  useEffect(() => {
    if (gameState.lastChanceCard) {
      setChanceCard(gameState.lastChanceCard);
    }
  }, [gameState.lastChanceCard]);

  // Dice roll animation
  useEffect(() => {
    if (gameState.dice && (gameState.dice[0] !== prevDice[0] || gameState.dice[1] !== prevDice[1])) {
      setRolling(true);
      const t = setTimeout(() => {
        setRolling(false);
        setPrevDice(gameState.dice);
      }, 700);
      return () => clearTimeout(t);
    }
  }, [gameState.dice]);

  function handleRoll() {
    if (!isMyTurn || rolling || gameState.phase !== 'rolling') return;
    socket.emit('monopoly_roll', { code: roomCode });
  }

  function handleBuy() {
    socket.emit('monopoly_buy', { code: roomCode });
  }

  function handlePass() {
    socket.emit('monopoly_pass', { code: roomCode });
  }

  function handleMortgage(spaceId) {
    socket.emit('monopoly_mortgage', { code: roomCode, spaceId });
    setSelectedSpace(null);
  }

  const pendingSpace = gameState.pendingDecision
    ? board.find(s => s.id === gameState.pendingDecision.spaceId)
    : null;
  const isMyDecision = gameState.pendingDecision?.playerId === playerId;

  const timeLeft = gameState.timeLimit - (gameState.elapsedTime || 0);
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: 'var(--bg)' }}>
      <Confetti active={!!gameState.winner} />

      {/* Pending property purchase */}
      {isMyDecision && pendingSpace && (
        <PropertyModal
          space={pendingSpace}
          canBuy={myPlayer?.money >= pendingSpace.price}
          myMoney={myPlayer?.money}
          onBuy={handleBuy}
          onPass={handlePass}
        />
      )}
      {!isMyDecision && pendingSpace && (
        <div style={{
          position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '10px 20px', fontSize: '0.85rem',
          color: 'var(--muted)', zIndex: 100,
        }}>
          {currentPlayer?.name} is deciding on {pendingSpace.name}...
        </div>
      )}

      {/* Chance card modal */}
      {chanceCard && (
        <ChanceModal card={chanceCard} onDismiss={() => setChanceCard(null)} />
      )}

      {/* Space detail modal (mortgage) */}
      {selectedSpace && (
        <div className="modal-overlay" onClick={() => setSelectedSpace(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 280 }}>
            <h3 style={{ marginBottom: 8 }}>{selectedSpace.name}</h3>
            {selectedSpace.ownerId === playerId && !selectedSpace.mortgaged && (
              <>
                <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: 12 }}>
                  Mortgage value: <strong>${Math.floor(selectedSpace.price / 2)}</strong>
                </p>
                <button className="btn-primary" onClick={() => handleMortgage(selectedSpace.id)}>
                  Mortgage for ${Math.floor(selectedSpace.price / 2)}
                </button>
              </>
            )}
            {selectedSpace.mortgaged && (
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>This property is mortgaged.</p>
            )}
            {selectedSpace.ownerId && selectedSpace.ownerId !== playerId && (
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                Owned by {gameState.players?.find(p => p.id === selectedSpace.ownerId)?.name}
              </p>
            )}
            <button className="btn-secondary" onClick={() => setSelectedSpace(null)} style={{ marginTop: 10 }}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.2rem' }}>🎲</span>
          <span style={{ fontWeight: 700 }}>Monopoly</span>
        </div>
        <span style={{ fontSize: '0.8rem', color: timeLeft < 120 ? 'var(--accent2)' : 'var(--muted)' }}>
          ⏱ {minutes}:{String(seconds).padStart(2, '0')}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
          Room: <strong style={{ color: 'var(--accent)', letterSpacing: 2 }}>{roomCode}</strong>
        </span>
      </div>

      {/* Board */}
      <div style={{
        flex: '0 0 auto',
        display: 'grid',
        gridTemplateColumns: 'repeat(9, 1fr)',
        gridTemplateRows: 'repeat(9, 1fr)',
        gap: 2,
        padding: 8,
        aspectRatio: '1',
        maxWidth: 380,
        margin: '0 auto',
        width: '100%',
      }}>
        {/* Center area */}
        <div style={{
          gridColumn: '2 / 9', gridRow: '2 / 9',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--surface2)', borderRadius: 8,
          flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, background: 'linear-gradient(135deg,#7c6bff,#e94560)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            MONOPOLY
          </div>
          <DiceDisplay dice={rolling ? [Math.ceil(Math.random()*6), Math.ceil(Math.random()*6)] : (gameState.dice || [0, 0])} rolling={rolling} />
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'center' }}>
            {isMyTurn && gameState.phase === 'rolling' && !rolling && (
              <span style={{ color: 'var(--accent)' }}>🔥 Your turn!</span>
            )}
            {!isMyTurn && currentPlayer && (
              <span>⏳ {currentPlayer.name}'s turn</span>
            )}
          </div>
        </div>

        {/* Board spaces */}
        {board.map(space => (
          <BoardSpace
            key={space.id}
            space={space}
            players={gameState.players || []}
            isHighlighted={space.id === myPlayer?.position}
            onClick={space.ownerId === playerId ? () => setSelectedSpace(space) : undefined}
          />
        ))}
      </div>

      {/* Action button */}
      {isMyTurn && gameState.phase === 'rolling' && (
        <div style={{ padding: '0 16px 8px' }}>
          <button
            className="btn-primary"
            onClick={handleRoll}
            disabled={rolling}
            style={{ width: '100%', fontSize: '1rem', padding: '14px', letterSpacing: 1 }}
          >
            {rolling ? '🎲 Rolling...' : '🎲 Roll Dice'}
          </button>
        </div>
      )}

      {/* Players HUD */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '0 12px 12px',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', fontWeight: 600, padding: '4px 0' }}>Players</div>
        {(gameState.players || []).map((p, i) => {
          const isCurrent = currentPlayer?.id === p.id;
          const isMe = p.id === playerId;
          const myProps = board.filter(s => s.ownerId === p.id);
          return (
            <div
              key={p.id}
              style={{
                background: isCurrent ? 'rgba(124,107,255,0.15)' : 'var(--surface)',
                border: `1px solid ${isCurrent ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 8,
                padding: '8px 12px',
                display: 'flex', alignItems: 'center', gap: 10,
                opacity: p.bankrupt ? 0.5 : 1,
                transition: 'all 0.3s',
              }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: TOKEN_COLORS[i % TOKEN_COLORS.length],
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: '1rem',
                boxShadow: isCurrent ? `0 0 10px ${TOKEN_COLORS[i % TOKEN_COLORS.length]}88` : 'none',
                transition: 'box-shadow 0.3s',
              }}>
                {TOKEN_ICONS[i % TOKEN_ICONS.length]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {p.name}
                  {isMe && <span style={{ fontSize: '0.65rem', background: 'rgba(124,107,255,0.2)', color: 'var(--accent)', borderRadius: 4, padding: '1px 5px' }}>YOU</span>}
                  {p.inJail && <span style={{ fontSize: '0.65rem', color: 'var(--accent2)' }}>⚖ Jail</span>}
                  {p.bankrupt && <span style={{ fontSize: '0.65rem', color: 'var(--accent2)' }}>💀 Out</span>}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
                  <span style={{ fontSize: '0.8rem', color: '#00c896', fontWeight: 700 }}>${p.money}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{myProps.length} prop{myProps.length !== 1 ? 's' : ''}</span>
                </div>
                {myProps.length > 0 && (
                  <div style={{ display: 'flex', gap: 3, marginTop: 3, flexWrap: 'wrap' }}>
                    {myProps.map(s => s.color && (
                      <div key={s.id} style={{
                        width: 12, height: 5, borderRadius: 2,
                        background: s.mortgaged ? 'var(--muted)' : s.color,
                        opacity: s.mortgaged ? 0.5 : 1,
                      }} />
                    ))}
                  </div>
                )}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}>
                {board.find(s => s.id === p.position)?.name?.split(' ')[0] || ''}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
