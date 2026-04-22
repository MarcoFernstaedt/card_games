import { useState } from 'react';
import socket from '../socket';
import CreateCard from './CreateCard';

function BlackCard({ card }) {
  if (!card) return null;
  const parts = card.text.split('___');
  return (
    <div className="black-card">
      <div className="bc-text">
        {parts.map((part, i) => (
          <span key={i}>
            {part}
            {i < parts.length - 1 && <span className="blank" />}
          </span>
        ))}
      </div>
      <div className="bc-footer">
        <span className="bc-brand">Wild Cards</span>
        {card.pick > 1 && <span className="bc-pick">Pick {card.pick}</span>}
      </div>
    </div>
  );
}

function WhiteCard({ card, selected, onClick, winner }) {
  return (
    <div
      className={`white-card ${selected ? 'selected' : ''} ${winner ? 'winner-card' : ''} ${card.isCustom ? 'custom-card' : ''}`}
      onClick={onClick}
    >
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 4 }}>
        <span className="wc-text">{card.text}</span>
        {card.isCustom && <span className="custom-badge">Custom</span>}
      </div>
    </div>
  );
}

export default function CahGame({ gameState, hand, playerId, roomCode }) {
  const [selected, setSelected] = useState([]);
  const [showCreateCard, setShowCreateCard] = useState(false);

  const isHost = gameState.host === playerId;
  const isCzar = gameState.czarId === playerId;
  const myScore = gameState.scores?.[playerId] || 0;
  const myCustomCount = gameState.customCardCounts?.[playerId] || 0;
  const canCreateCard = myScore >= 3 && myCustomCount < Math.floor(myScore / 3);
  const pick = gameState.currentBlackCard?.pick || 1;

  function toggleCard(idx) {
    if (selected.includes(idx)) {
      setSelected(selected.filter(i => i !== idx));
    } else if (selected.length < pick) {
      setSelected([...selected, idx]);
    } else if (pick === 1) {
      setSelected([idx]);
    }
  }

  function handleSubmit() {
    if (selected.length !== pick) return;
    socket.emit('cah_submit', { code: roomCode, cardIndices: selected });
    setSelected([]);
  }

  function handleCzarPick(winnerId) {
    socket.emit('cah_czar_pick', { code: roomCode, winnerId });
  }

  function handleNextRound() {
    socket.emit('cah_next_round', { code: roomCode });
  }

  const alreadySubmitted = gameState.submittedIds?.includes(playerId);
  const czarPlayer = gameState.players?.find(p => p.id === gameState.czarId);
  const roundWinnerPlayer = gameState.players?.find(p => p.id === gameState.roundWinner);

  return (
    <div className="cah-game">
      {/* Header */}
      <div className="cah-header">
        <h2>Wild Cards</h2>
        <div className="cah-scores">
          {gameState.players?.slice(0, 4).map(p => (
            <div key={p.id} className="score-badge">
              <span>{p.name.charAt(0)}</span>
              <span className="pts">{p.score}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="cah-body">
        {/* Black card */}
        <BlackCard card={gameState.currentBlackCard} />

        {/* Czar indicator */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="czar-badge">
            👑 Card Czar: {czarPlayer?.name}
          </div>
          {isCzar && (
            <div className="cah-status" style={{ flex: 1 }}>
              You are the Czar — wait for submissions
            </div>
          )}
        </div>

        {/* PLAYING PHASE */}
        {gameState.phase === 'playing' && !isCzar && (
          <>
            {alreadySubmitted ? (
              <div className="waiting-msg">
                <div className="spinner" />
                Waiting for others ({gameState.submittedIds?.length}/{gameState.players?.length - 1})
              </div>
            ) : (
              <>
                <div>
                  <div className="section-label">
                    Your Hand — Select {pick} card{pick > 1 ? 's' : ''} ({selected.length}/{pick})
                  </div>
                  <div className="hand-grid">
                    {hand.map((card, idx) => (
                      <WhiteCard
                        key={card.id}
                        card={card}
                        selected={selected.includes(idx)}
                        onClick={() => toggleCard(idx)}
                      />
                    ))}
                  </div>
                </div>

                <div className="submit-area">
                  <div className="selected-preview">
                    {selected.length === 0 ? 'Tap cards to select' : `${selected.length} of ${pick} selected`}
                  </div>
                  <button
                    className="btn-submit"
                    onClick={handleSubmit}
                    disabled={selected.length !== pick}
                  >
                    Submit
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {gameState.phase === 'playing' && isCzar && (
          <div className="czar-wait">
            <div className="czar-icon">⏳</div>
            <p>Waiting for {gameState.players?.length - 1 - (gameState.submittedIds?.length || 0)} more player(s) to submit...</p>
            <p style={{ marginTop: 8, fontSize: '0.82rem' }}>{gameState.submittedIds?.length || 0} / {gameState.players?.length - 1} submitted</p>
          </div>
        )}

        {/* JUDGING PHASE */}
        {gameState.phase === 'judging' && (
          <>
            {isCzar ? (
              <div>
                <div className="section-label">Tap the funniest response to pick a winner</div>
                <div className="submissions-grid">
                  {gameState.submissions && Object.entries(gameState.submissions).map(([pid, cards]) => (
                    <div
                      key={pid}
                      className="submission-group"
                      onClick={() => handleCzarPick(pid)}
                    >
                      {cards.map((c, i) => (
                        <div key={i} className="submission-card-text">{c.text}</div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="waiting-msg">
                <div className="spinner" />
                The Czar is judging...
              </div>
            )}
          </>
        )}

        {/* RESULTS PHASE */}
        {gameState.phase === 'results' && (
          <>
            <div className="results-banner">
              <h3>🏆 {roundWinnerPlayer?.name} Wins the Round!</h3>
              <p>{roundWinnerPlayer?.name} now has {gameState.scores?.[gameState.roundWinner]} point{gameState.scores?.[gameState.roundWinner] !== 1 ? 's' : ''}</p>
            </div>

            {gameState.submissions?.[gameState.roundWinner] && (
              <div>
                <div className="section-label">Winning Answer</div>
                <div className="submission-group winner">
                  {gameState.submissions[gameState.roundWinner].map((c, i) => (
                    <div key={i} className="submission-card-text">{c.text}</div>
                  ))}
                </div>
              </div>
            )}

            <div className="section-label" style={{ marginBottom: 6 }}>Scoreboard</div>
            <div className="score-table">
              {[...gameState.players]
                .sort((a, b) => (gameState.scores?.[b.id] || 0) - (gameState.scores?.[a.id] || 0))
                .map(p => (
                  <div key={p.id} className={`score-row ${p.id === playerId ? 's-me' : ''}`}>
                    <span className="s-name">{p.name} {p.id === gameState.czarId ? '👑' : ''}</span>
                    <span className="s-pts">{gameState.scores?.[p.id] || 0} pts</span>
                  </div>
                ))}
            </div>

            {canCreateCard && !showCreateCard && (
              <div style={{ padding: '10px 0' }}>
                <div className="section-label">You unlocked a custom card!</div>
                <button className="btn-sm" onClick={() => setShowCreateCard(true)}>
                  ✨ Create a Custom Card
                </button>
              </div>
            )}

            {showCreateCard && (
              <CreateCard
                roomCode={roomCode}
                myScore={myScore}
                myCustomCount={myCustomCount}
                onClose={() => setShowCreateCard(false)}
              />
            )}

            {isHost && (
              <button className="btn-primary" onClick={handleNextRound} style={{ marginTop: 8 }}>
                Next Round →
              </button>
            )}
            {!isHost && (
              <div className="waiting-msg" style={{ padding: '12px 0' }}>
                Waiting for host to start next round...
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
