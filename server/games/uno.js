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

function createGameState(players) {
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
  };
}

function playCard(gameState, playerIndex, cardIndex, chosenColor, players) {
  const playerId = players[playerIndex].id;
  const hand = gameState.hands[playerId];
  const card = hand[cardIndex];

  if (!card) return { error: 'Card not found' };

  const topCard = gameState.discardPile[gameState.discardPile.length - 1];
  if (!canPlay(card, topCard, gameState.currentColor)) {
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
      const nextIdx = getNextIndex(count, playerIndex, gameState.direction);
      const nextId = players[nextIdx].id;
      for (let i = 0; i < 2; i++) {
        if (gameState.deck.length === 0) reshuffleDeck(gameState);
        gameState.hands[nextId].push(gameState.deck.pop());
      }
      skip = true;
      break;
    }
    case 'wild_draw_four': {
      const nextIdx = getNextIndex(count, playerIndex, gameState.direction);
      const nextId = players[nextIdx].id;
      for (let i = 0; i < 4; i++) {
        if (gameState.deck.length === 0) reshuffleDeck(gameState);
        gameState.hands[nextId].push(gameState.deck.pop());
      }
      skip = true;
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
  if (gameState.deck.length === 0) reshuffleDeck(gameState);
  if (gameState.deck.length === 0) return { error: 'Deck is empty' };

  const playerId = players[playerIndex].id;
  const card = gameState.deck.pop();
  gameState.hands[playerId].push(card);

  const count = players.length;
  gameState.currentPlayerIndex = getNextIndex(count, playerIndex, gameState.direction);

  return { card, drawn: true };
}

module.exports = { createGameState, canPlay, playCard, drawCard };
