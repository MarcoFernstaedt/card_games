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
    roundWinner: null,
    scores: Object.fromEntries(players.map(p => [p.id, 0])),
    customCards: [],
    customCardCounts: {},
  };
}

function submitResponse(gameState, playerId, cardIndices, players) {
  const czarId = players[gameState.czarIndex].id;
  if (playerId === czarId) return { error: 'The Czar cannot submit cards' };
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

  const nonCzar = players.filter(p => p.id !== czarId);
  const allSubmitted = nonCzar.every(p => gameState.submissions[p.id]);
  if (allSubmitted) gameState.phase = 'judging';

  return { success: true, allSubmitted };
}

function czarPick(gameState, winnerId) {
  if (!gameState.submissions[winnerId]) return { error: 'Invalid selection' };

  gameState.scores[winnerId] = (gameState.scores[winnerId] || 0) + 1;
  gameState.roundWinner = winnerId;
  gameState.phase = 'results';

  return { success: true };
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
  gameState.roundWinner = null;
  gameState.phase = 'playing';

  return { success: true };
}

function addCustomCard(gameState, playerId, cardText) {
  const score = gameState.scores[playerId] || 0;
  const used = gameState.customCardCounts[playerId] || 0;
  const allowed = Math.floor(score / 3);

  if (used >= allowed) {
    return { error: `Need ${(used + 1) * 3} points to create another card (you have ${score})` };
  }

  const card = {
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    text: cardText.trim().slice(0, 150),
    isCustom: true,
    creatorId: playerId,
  };

  gameState.customCards.push(card);
  gameState.whiteDeck.push(card);
  gameState.customCardCounts[playerId] = used + 1;

  return { success: true, card };
}

module.exports = { createGameState, submitResponse, czarPick, nextRound, addCustomCard };
