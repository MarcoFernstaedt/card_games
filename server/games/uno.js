function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function createDeck() {
  const colors = ['red', 'blue', 'green', 'yellow'];
  const cards = [];
  let id = 0;

  for (const color of colors) {
    cards.push({ id: id++, color, value: '0' });
    for (let n = 1; n <= 9; n++) {
      cards.push({ id: id++, color, value: String(n) });
      cards.push({ id: id++, color, value: String(n) });
    }
    for (const value of ['skip', 'reverse', 'draw_two']) {
      cards.push({ id: id++, color, value });
      cards.push({ id: id++, color, value });
    }
  }
  for (let i = 0; i < 4; i++) {
    cards.push({ id: id++, color: 'wild', value: 'wild' });
    cards.push({ id: id++, color: 'wild', value: 'wild_draw_four' });
  }

  return shuffle(cards);
}

function canPlay(card, topCard, currentColor) {
  if (card.color === 'wild') return true;
  if (card.color === currentColor) return true;
  if (card.value === topCard.value) return true;
  return false;
}

function reshuffleDeck(gameState) {
  const topCard = gameState.discardPile[gameState.discardPile.length - 1];
  const reshuffled = gameState.discardPile.slice(0, -1).map(c =>
    c.color === 'wild' ? { ...c, color: 'wild' } : { ...c }
  );
  gameState.deck = shuffle(reshuffled);
  gameState.discardPile = [topCard];
}

function getNextIndex(count, current, direction, skip = false) {
  let next = (current + direction + count) % count;
  if (skip) next = (next + direction + count) % count;
  return next;
}

function createGameState(players, unoMode = 'classic') {
  const deck = createDeck();
  const hands = {};

  for (const player of players) {
    hands[player.id] = deck.splice(0, 7);
  }

  // First card must be a number card
  let startIdx = deck.findIndex(c => !isNaN(parseInt(c.value)));
  const startCard = deck.splice(startIdx, 1)[0];

  return {
    deck,
    discardPile: [startCard],
    hands,
    currentPlayerIndex: 0,
    direction: 1,
    currentColor: startCard.color,
    winner: null,
    unoMode,
    drawStack: 0,
    pendingDrawType: null,
    mercyVotes: {},
    mercyVoteTarget: null,
  };
}

function playCard(gameState, playerIndex, cardIndex, chosenColor, players) {
  const playerId = players[playerIndex].id;
  const hand = gameState.hands[playerId];
  const card = hand[cardIndex];

  if (!card) return { error: 'Card not found' };

  const topCard = gameState.discardPile[gameState.discardPile.length - 1];

  // Mercy mode stacking: when a draw stack is pending, only matching draw cards are allowed
  if (gameState.unoMode === 'mercy' && gameState.drawStack > 0) {
    const isDrawTwo = card.value === 'draw_two';
    const isDrawFour = card.value === 'wild_draw_four';
    const canStack = (gameState.pendingDrawType === 'draw_two' && isDrawTwo) ||
                     (gameState.pendingDrawType === 'wild_draw_four' && isDrawFour);
    if (!canStack) {
      return { error: `Must stack a ${gameState.pendingDrawType === 'draw_two' ? '+2' : '+4'} or draw ${gameState.drawStack} cards` };
    }
  } else if (!canPlay(card, topCard, gameState.currentColor)) {
    return { error: 'Cannot play that card' };
  }

  hand.splice(cardIndex, 1);

  const playedCard = { ...card };
  if (card.color === 'wild') {
    playedCard.chosenColor = chosenColor || 'red';
  }
  gameState.discardPile.push(playedCard);

  const count = players.length;
  let skip = false;

  switch (card.value) {
    case 'skip':
      skip = true;
      break;
    case 'reverse':
      if (count === 2) {
        skip = true;
      } else {
        gameState.direction *= -1;
      }
      break;
    case 'draw_two': {
      if (gameState.unoMode === 'mercy') {
        // Stack the draw instead of applying immediately
        gameState.drawStack += 2;
        gameState.pendingDrawType = 'draw_two';
        skip = true;
      } else {
        const nextIdx = getNextIndex(count, playerIndex, gameState.direction);
        const nextId = players[nextIdx].id;
        for (let i = 0; i < 2; i++) {
          if (gameState.deck.length === 0) reshuffleDeck(gameState);
          gameState.hands[nextId].push(gameState.deck.pop());
        }
        skip = true;
      }
      break;
    }
    case 'wild_draw_four': {
      if (gameState.unoMode === 'mercy') {
        gameState.drawStack += 4;
        gameState.pendingDrawType = 'wild_draw_four';
        skip = true;
      } else {
        const nextIdx = getNextIndex(count, playerIndex, gameState.direction);
        const nextId = players[nextIdx].id;
        for (let i = 0; i < 4; i++) {
          if (gameState.deck.length === 0) reshuffleDeck(gameState);
          gameState.hands[nextId].push(gameState.deck.pop());
        }
        skip = true;
      }
      break;
    }
  }

  gameState.currentColor = card.color === 'wild' ? (chosenColor || 'red') : card.color;

  if (hand.length === 0) {
    gameState.winner = playerId;
    return { winner: playerId };
  }

  gameState.currentPlayerIndex = getNextIndex(count, playerIndex, gameState.direction, skip);
  return { success: true };
}

function drawCard(gameState, playerIndex, players) {
  const playerId = players[playerIndex].id;
  const count = players.length;

  // Mercy mode: absorb the full accumulated draw stack
  if (gameState.unoMode === 'mercy' && gameState.drawStack > 0) {
    const total = gameState.drawStack;
    for (let i = 0; i < total; i++) {
      if (gameState.deck.length === 0) reshuffleDeck(gameState);
      if (gameState.deck.length === 0) break;
      gameState.hands[playerId].push(gameState.deck.pop());
    }
    gameState.drawStack = 0;
    gameState.pendingDrawType = null;
    // Drawing while stacked skips the drawing player's turn
    gameState.currentPlayerIndex = getNextIndex(count, playerIndex, gameState.direction, true);
    return { drawn: true, absorbed: total };
  }

  if (gameState.deck.length === 0) reshuffleDeck(gameState);
  if (gameState.deck.length === 0) return { error: 'Deck is empty' };

  const card = gameState.deck.pop();
  gameState.hands[playerId].push(card);

  gameState.currentPlayerIndex = getNextIndex(count, playerIndex, gameState.direction);

  return { card, drawn: true };
}

// Mercy vote: any player can nominate a player with 15+ cards to be reduced to 7
function mercyVote(gameState, voterId, targetPlayerId, players) {
  if (gameState.unoMode !== 'mercy') return { error: 'Not in mercy mode' };
  if (voterId === targetPlayerId) return { error: 'Cannot vote for yourself' };

  const targetHand = gameState.hands[targetPlayerId];
  if (!targetHand || targetHand.length < 15) {
    return { error: 'Player does not have enough cards for mercy (need 15+)' };
  }

  // Only one active vote target at a time; reset votes if target changed
  if (gameState.mercyVoteTarget && gameState.mercyVoteTarget !== targetPlayerId) {
    gameState.mercyVotes = {};
  }
  gameState.mercyVoteTarget = targetPlayerId;
  gameState.mercyVotes[voterId] = targetPlayerId;

  // Threshold: majority of non-target players must vote
  const eligibleVoters = players.filter(p => p.id !== targetPlayerId);
  const threshold = Math.ceil(eligibleVoters.length / 2);
  const voteCount = Object.values(gameState.mercyVotes).filter(v => v === targetPlayerId).length;

  if (voteCount >= threshold) {
    // Mercy granted: discard down to 7
    const removed = targetHand.length - 7;
    gameState.hands[targetPlayerId] = targetHand.slice(0, 7);
    gameState.mercyVotes = {};
    gameState.mercyVoteTarget = null;
    return { passed: true, removed };
  }

  return { passed: false, votes: voteCount, threshold };
}

module.exports = { createGameState, canPlay, playCard, drawCard, mercyVote };
