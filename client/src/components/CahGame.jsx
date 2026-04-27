import { useEffect, useMemo, useRef, useState } from 'react';
import socket from '../socket';
import CreateCard from './CreateCard';
import MusicControls from './MusicControls';
import Confetti from './Confetti';
import { formatCardsForSpeech, useAudioTimeWarnings, useGameAnnouncer } from '../hooks/useGameAnnouncer';

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

export default function CahGame({ gameState, hand, playerId, roomCode, musicState, isHost }) {
  const [selected, setSelected] = useState([]);
  const [showCreateCard, setShowCreateCard] = useState(false);
  const announcer = useGameAnnouncer({ rate: 1.24 });
  const [phaseSecondsLeft, setPhaseSecondsLeft] = useState(90);
  const spokenResultRef = useRef(null);

  const myCustomCount = gameState.customCardCounts?.[playerId] || 0;
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

  function handleVote(winnerId) {
    socket.emit('cah_vote', { code: roomCode, winnerId });
  }

  function handleNextRound() {
    socket.emit('cah_next_round', { code: roomCode });
  }

  const alreadySubmitted = gameState.submittedIds?.includes(playerId);
  const alreadyVoted = gameState.votedIds?.includes(playerId);
  const playerById = useMemo(() => Object.fromEntries((gameState.players || []).map(p => [p.id, p])), [gameState.players]);
  const roundWinnerPlayer = gameState.players?.find(p => p.id === gameState.roundWinner);
  const phaseDuration = gameState.phase === 'judging' ? 45 : gameState.phase === 'results' ? 20 : 90;
  const phaseTimerKey = `${gameState.currentBlackCard?.id || gameState.currentBlackCard?.text || 'round'}:${gameState.phase}`;

  useEffect(() => {
    setPhaseSecondsLeft(phaseDuration);
    const started = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      setPhaseSecondsLeft(Math.max(0, phaseDuration - elapsed));
    }, 1000);
    return () => clearInterval(timer);
  }, [phaseTimerKey, phaseDuration]);

  useAudioTimeWarnings({
    announcer,
    gameKey: 'wild-cards',
    timerKey: phaseTimerKey,
    secondsLeft: phaseSecondsLeft,
    thresholds: gameState.phase === 'results' ? [10] : [30, 10],
    enabled: ['playing', 'judging', 'results'].includes(gameState.phase),
  });

  function answerText(cards = []) {
    return cards.map(c => c.text).join(' and ');
  }

  const submissionEntries = useMemo(() => Object.entries(gameState.submissions || {}), [gameState.submissions]);

  useEffect(() => {
    const prompt = gameState.currentBlackCard?.text || 'the prompt';
    const roundKey = gameState.currentBlackCard?.id || gameState.currentBlackCard?.text || 'round';

    if (gameState.phase === 'playing') {
      announcer.speak(
        `New Wild Cards round. Prompt: ${prompt}. Everyone pick ${pick} card${pick > 1 ? 's' : ''}.`,
        `wild-cards:playing:${roundKey}`,
        { interrupt: true }
      );
    }

    if (gameState.phase === 'judging' && submissionEntries.length) {
      const lines = [
        `Voting phase. Everyone vote for the funniest response. Prompt: ${prompt}.`,
        ...submissionEntries.map(([pid, cards], index) => `Player pick ${index + 1}. ${playerById[pid]?.name || 'A player'} picked: ${formatCardsForSpeech(cards)}.`),
      ];
      announcer.speakSequence(lines, `wild-cards:voting:${roundKey}:${submissionEntries.map(([pid]) => pid).join('-')}`, { interrupt: true, rate: 1.26 });
    }

    if (gameState.phase === 'results' && gameState.roundWinner && gameState.submissions) {
      const resultKey = `${roundKey}-${gameState.roundWinner}`;
      if (spokenResultRef.current === resultKey) return;
      spokenResultRef.current = resultKey;
      const winnerName = playerById[gameState.roundWinner]?.name || 'The winner';
      const winnerChoice = formatCardsForSpeech(gameState.submissions[gameState.roundWinner]);
      announcer.speak(`${winnerName} wins the round with ${winnerChoice}.`, `wild-cards:result:${resultKey}`, { interrupt: true, rate: 1.24 });
    }
  }, [announcer, gameState.phase, gameState.roundWinner, gameState.currentBlackCard, gameState.submissions, submissionEntries, playerById, pick]);

  return (
    <div className="cah-game">
      <Confetti active={gameState.phase === 'results'} />
      <MusicControls roomCode={roomCode} isHost={isHost} musicState={musicState} />
      {/* Header */}
      <div className="cah-header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <h2>Wild Cards</h2>
          <span style={{ fontSize: '0.72rem', color: 'var(--muted)' }}>
            Playing as <strong style={{ color: 'var(--accent)' }}>{gameState.players?.find(p => p.id === playerId)?.name || 'You'}</strong>
            &nbsp;· Room <strong style={{ color: 'var(--accent)', letterSpacing: 1 }}>{roomCode}</strong>
          </span>
        </div>
        <div className="cah-scores">
          {gameState.players?.slice(0, 4).map(p => (
            <div key={p.id} className="score-badge" title={p.name} style={p.id === playerId ? { borderColor: 'var(--accent)', border: '1px solid' } : {}}>
              <span style={{ maxWidth: 40, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name.split(' ')[0]}</span>
              <span className="pts">{p.score}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="cah-body">
        {/* Black card */}
        <BlackCard card={gameState.currentBlackCard} />

        {/* Custom card creator */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn-sm" onClick={() => setShowCreateCard(v => !v)}>
            ✨ {showCreateCard ? 'Hide Custom Card Creator' : 'Create a Custom Card'}
          </button>
          <div className="cah-status" style={{ flex: 1 }}>
Everyone plays an answer to the prompt, then everyone votes for the funniest response.
          </div>
        </div>

        {showCreateCard && (
          <CreateCard
            roomCode={roomCode}
            myCustomCount={myCustomCount}
            onClose={() => setShowCreateCard(false)}
          />
        )}

        {/* PLAYING PHASE */}
        {gameState.phase === 'playing' && (
          <>
            {alreadySubmitted ? (
              <div className="waiting-msg">
                <div className="spinner" />
                Waiting for others ({gameState.submittedIds?.length}/{gameState.players?.length})
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

        {/* VOTING PHASE */}
        {gameState.phase === 'judging' && (
          <>
            {alreadyVoted ? (
              <div className="waiting-msg">
                <div className="spinner" />
                Waiting for votes ({gameState.votedIds?.length || 0}/{gameState.players?.length})
              </div>
            ) : (
              <div>
                <div className="section-label">Voting phase — vote for the funniest response (not your own)</div>
                <div className="submissions-grid">
                  {gameState.submissions && Object.entries(gameState.submissions).map(([pid, cards]) => {
                    const isMine = pid === playerId;
                    return (
                      <div
                        key={pid}
                        className={`submission-group ${isMine ? 'disabled' : ''}`}
                        onClick={() => !isMine && handleVote(pid)}
                      >
                        <div className="submission-player-name">{playerById[pid]?.name || 'Player'}{isMine ? ' (you)' : ''}</div>
                        {cards.map((c, i) => (
                          <div key={i} className="submission-card-text">{c.text}</div>
                        ))}
                      </div>
                    );
                  })}
                </div>
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
                    <span className="s-name">{p.name}</span>
                    <span className="s-pts">{gameState.scores?.[p.id] || 0} pts</span>
                  </div>
                ))}
            </div>

            {!showCreateCard && (
              <div style={{ padding: '10px 0' }}>
                <div className="section-label">Create another custom card</div>
                <button className="btn-sm" onClick={() => setShowCreateCard(true)}>
                  ✨ Create a Custom Card
                </button>
              </div>
            )}

            {showCreateCard && (
              <CreateCard
                roomCode={roomCode}
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
