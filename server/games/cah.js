const { blackCards, whiteCards: defaultWhiteCards } = require('../cards/cahCards');

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createGameState(players) {
  const shuffledBlack = shuffle([...blackCards]);
  const whiteDeck = shuffle([...defaultWhiteCards]);
  const hands = {};

  for (const player of players) {
    hands[player.id] = whiteDeck.splice(0, 7);
  }

  return {
    blackDeck: shuffledBlack.slice(1),
    whiteDeck,
    currentBlackCard: shuffledBlack[0],
    hands,
    czarIndex: 0,
    phase: 'playing',
    submissions: {},
    votes: {},
    roundWinner: null,
    scores: Object.fromEntries(players.map(p => [p.id, 0])),
    customCards: [],
    customCardCounts: {},
  };
}

function submitResponse(gameState, playerId, cardIndices, players) {
  if (gameState.submissions[playerId]) return { error: 'Already submitted this round' };

  const pick = gameState.currentBlackCard.pick;
  if (cardIndices.length !== pick) return { error: `Must pick exactly ${pick} card(s)` };

  const hand = gameState.hands[playerId];
  const sorted = [...cardIndices].sort((a, b) => b - a);
  const submitted = sorted.map(i => {
    const card = hand[i];
    hand.splice(i, 1);
    return card;
  }).reverse();

  gameState.submissions[playerId] = submitted;

  const allSubmitted = players.every(p => gameState.submissions[p.id]);
  if (allSubmitted) gameState.phase = 'judging';

  return { success: true, allSubmitted };
}

function finishRound(gameState, winnerId) {
  if (!gameState.submissions[winnerId]) return { error: 'Invalid selection' };

  gameState.scores[winnerId] = (gameState.scores[winnerId] || 0) + 1;
  gameState.roundWinner = winnerId;
  gameState.phase = 'results';

  return { success: true };
}

function voteForWinner(gameState, voterId, winnerId, players) {
  if (gameState.phase !== 'judging') return { error: 'Not time to vote yet' };
  if (!gameState.submissions[voterId]) return { error: 'You must submit before voting' };
  if (!gameState.submissions[winnerId]) return { error: 'Invalid selection' };
  if (voterId === winnerId) return { error: 'You cannot vote for your own answer' };
  if (gameState.votes[voterId]) return { error: 'Already voted this round' };

  gameState.votes[voterId] = winnerId;

  const activeSubmitters = players.filter(p => gameState.submissions[p.id]);
  const allVoted = activeSubmitters.every(p => gameState.votes[p.id]);
  if (!allVoted) return { success: true, allVoted: false };

  const totals = {};
  for (const votedFor of Object.values(gameState.votes)) {
    totals[votedFor] = (totals[votedFor] || 0) + 1;
  }

  const topVoteCount = Math.max(...Object.values(totals));
  const tied = Object.entries(totals)
    .filter(([, count]) => count === topVoteCount)
    .map(([pid]) => pid);
  const winnerIdFromVotes = tied[Math.floor(Math.random() * tied.length)];
  const finish = finishRound(gameState, winnerIdFromVotes);
  return finish.error ? finish : { success: true, allVoted: true, winnerId: winnerIdFromVotes };
}

function czarPick(gameState, winnerId) {
  return finishRound(gameState, winnerId);
}

function nextRound(gameState, players) {
  if (gameState.blackDeck.length === 0) return { gameOver: true };

  gameState.czarIndex = (gameState.czarIndex + 1) % players.length;
  gameState.currentBlackCard = gameState.blackDeck.shift();

  const deck = shuffle([...gameState.whiteDeck, ...gameState.customCards]);
  for (const player of players) {
    const hand = gameState.hands[player.id];
    while (hand.length < 7 && deck.length > 0) {
      hand.push(deck.shift());
    }
  }
  gameState.whiteDeck = deck;
  gameState.submissions = {};
  gameState.votes = {};
  gameState.roundWinner = null;
  gameState.phase = 'playing';

  return { success: true };
}

function addCustomCard(gameState, playerId, cardText) {
  const used = gameState.customCardCounts[playerId] || 0;

  const card = {
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    text: cardText.trim().slice(0, 150),
    isCustom: true,
    creatorId: playerId,
  };

  gameState.customCards.push(card);
  gameState.customCardCounts[playerId] = used + 1;

  // Let the creator use their own card right away when possible; otherwise it goes into the shared deck.
  const hand = gameState.hands[playerId];
  if (hand && hand.length < 10) {
    hand.push(card);
  } else {
    gameState.whiteDeck.push(card);
  }

  return { success: true, card };
}

module.exports = { createGameState, submitResponse, czarPick, voteForWinner, nextRound, addCustomCard };
