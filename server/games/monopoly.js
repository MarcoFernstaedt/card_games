function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Board: 28 spaces, corners at 0 (GO), 7 (Jail), 14 (Free Parking), 21 (Go To Jail)
// Bottom side 0→6 (right to left), left side 7→13 (up), top side 14→20 (left to right), right side 21→27 (down)
const BOARD = [
  { id: 0,  type: 'go',           name: 'GO',              price: 0,   rent: 0,   color: null,      group: null },
  { id: 1,  type: 'property',     name: 'Mediterranean',   price: 60,  rent: 2,   color: '#8B4513', group: 'brown' },
  { id: 2,  type: 'tax',          name: 'Income Tax',      price: 0,   rent: 150, color: null,      group: null },
  { id: 3,  type: 'property',     name: 'Baltic',          price: 60,  rent: 4,   color: '#8B4513', group: 'brown' },
  { id: 4,  type: 'railroad',     name: 'Railroad 1',      price: 200, rent: 25,  color: '#222',    group: 'railroad' },
  { id: 5,  type: 'property',     name: 'Oriental',        price: 100, rent: 6,   color: '#87CEEB', group: 'light-blue' },
  { id: 6,  type: 'property',     name: 'Vermont',         price: 100, rent: 6,   color: '#87CEEB', group: 'light-blue' },
  { id: 7,  type: 'jail',         name: 'Jail',            price: 0,   rent: 0,   color: null,      group: null },
  { id: 8,  type: 'property',     name: 'St. Charles',     price: 140, rent: 10,  color: '#FF69B4', group: 'pink' },
  { id: 9,  type: 'utility',      name: 'Electric Co.',    price: 150, rent: 0,   color: '#FFD700', group: 'utility' },
  { id: 10, type: 'property',     name: 'States',          price: 140, rent: 10,  color: '#FF69B4', group: 'pink' },
  { id: 11, type: 'property',     name: 'Virginia',        price: 160, rent: 12,  color: '#FF69B4', group: 'pink' },
  { id: 12, type: 'railroad',     name: 'Railroad 2',      price: 200, rent: 25,  color: '#222',    group: 'railroad' },
  { id: 13, type: 'property',     name: 'St. James',       price: 180, rent: 14,  color: '#FFA500', group: 'orange' },
  { id: 14, type: 'free_parking', name: 'Free Parking',    price: 0,   rent: 0,   color: null,      group: null },
  { id: 15, type: 'property',     name: 'Tennessee',       price: 180, rent: 14,  color: '#FFA500', group: 'orange' },
  { id: 16, type: 'property',     name: 'New York',        price: 200, rent: 16,  color: '#FFA500', group: 'orange' },
  { id: 17, type: 'chance',       name: 'Chance',          price: 0,   rent: 0,   color: null,      group: null },
  { id: 18, type: 'property',     name: 'Kentucky',        price: 220, rent: 18,  color: '#FF0000', group: 'red' },
  { id: 19, type: 'railroad',     name: 'Railroad 3',      price: 200, rent: 25,  color: '#222',    group: 'railroad' },
  { id: 20, type: 'property',     name: 'Illinois',        price: 240, rent: 20,  color: '#FF0000', group: 'red' },
  { id: 21, type: 'go_to_jail',   name: 'Go To Jail',      price: 0,   rent: 0,   color: null,      group: null },
  { id: 22, type: 'property',     name: 'Atlantic',        price: 260, rent: 22,  color: '#FFFF00', group: 'yellow' },
  { id: 23, type: 'property',     name: 'Ventnor',         price: 260, rent: 22,  color: '#FFFF00', group: 'yellow' },
  { id: 24, type: 'utility',      name: 'Water Works',     price: 150, rent: 0,   color: '#00BFFF', group: 'utility' },
  { id: 25, type: 'chance',       name: 'Chance',          price: 0,   rent: 0,   color: null,      group: null },
  { id: 26, type: 'property',     name: 'Boardwalk',       price: 400, rent: 50,  color: '#00008B', group: 'dark-blue' },
  { id: 27, type: 'tax',          name: 'Luxury Tax',      price: 0,   rent: 100, color: null,      group: null },
];

const BOARD_SIZE = BOARD.length;

const CHANCE_CARDS = shuffle([
  { id: 'advance_go',    text: 'Advance to GO! Collect $200.', effect: 'advance_go' },
  { id: 'bank_error',    text: 'Bank error in your favor! Collect $200.', effect: 'gain', amount: 200 },
  { id: 'doctor_fee',    text: "Doctor's fee. Pay $50.", effect: 'lose', amount: 50 },
  { id: 'stock_sale',    text: 'From sale of stock you get $50.', effect: 'gain', amount: 50 },
  { id: 'go_to_jail',    text: 'Go to Jail!', effect: 'go_to_jail' },
  { id: 'holiday_fund',  text: 'Holiday fund matures. Receive $100.', effect: 'gain', amount: 100 },
  { id: 'income_tax',    text: 'Income tax refund. Collect $20.', effect: 'gain', amount: 20 },
  { id: 'birthday',      text: "It's your birthday! Collect $10 from each player.", effect: 'birthday', amount: 10 },
  { id: 'life_insurance', text: 'Life insurance matures. Collect $100.', effect: 'gain', amount: 100 },
  { id: 'hospital_fee',  text: 'Pay hospital fees of $100.', effect: 'lose', amount: 100 },
  { id: 'school_fees',   text: 'Pay school fees of $150.', effect: 'lose', amount: 150 },
  { id: 'consultancy',   text: 'Receive $25 consultancy fee.', effect: 'gain', amount: 25 },
  { id: 'repairs',       text: 'You are assessed for street repairs. Pay $40 per property.', effect: 'repairs', amount: 40 },
  { id: 'prize',         text: 'You have won second prize in a beauty contest. Collect $10.', effect: 'gain', amount: 10 },
  { id: 'inheritance',   text: 'You inherit $100.', effect: 'gain', amount: 100 },
]);

function createGameState(players, options = {}) {
  const configuredTimeLimit = Number(options.timeLimitSeconds);
  const timeLimit = Number.isFinite(configuredTimeLimit) && configuredTimeLimit > 0 ? configuredTimeLimit : 20 * 60;
  const playerStates = {};
  for (const p of players) {
    playerStates[p.id] = {
      position: 0,
      money: 1500,
      properties: [],
      inJail: false,
      jailTurns: 0,
      bankrupt: false,
    };
  }

  const board = BOARD.map(space => ({ ...space, ownerId: null, mortgaged: false }));

  return {
    phase: 'rolling',
    currentPlayerIndex: 0,
    board,
    players: playerStates,
    dice: [0, 0],
    lastRoll: null,
    winner: null,
    bankruptedOrder: [],
    chanceCards: [...CHANCE_CARDS],
    chanceDiscard: [],
    pendingDecision: null,
    timeLimit,
    elapsedTime: 0,
  };
}

function rollDice() {
  return [
    Math.floor(Math.random() * 6) + 1,
    Math.floor(Math.random() * 6) + 1,
  ];
}

function drawChanceCard(gameState) {
  if (gameState.chanceCards.length === 0) {
    gameState.chanceCards = shuffle(gameState.chanceDiscard);
    gameState.chanceDiscard = [];
  }
  const card = gameState.chanceCards.shift();
  gameState.chanceDiscard.push(card);
  return card;
}

function getNextPlayerIndex(gameState, players) {
  let idx = gameState.currentPlayerIndex;
  for (let i = 0; i < players.length; i++) {
    idx = (idx + 1) % players.length;
    if (!gameState.players[players[idx].id]?.bankrupt) return idx;
  }
  return gameState.currentPlayerIndex;
}

function activePlayers(gameState, players) {
  return players.filter(p => !gameState.players[p.id]?.bankrupt);
}

function checkWinner(gameState, players) {
  const alive = activePlayers(gameState, players);
  if (alive.length === 1) return alive[0].id;
  return null;
}

function applyChanceCard(gameState, card, playerId, players) {
  const ps = gameState.players[playerId];
  const events = [];

  switch (card.effect) {
    case 'advance_go':
      ps.position = 0;
      ps.money += 200;
      events.push({ type: 'gain', playerId, amount: 200, reason: 'GO salary' });
      break;
    case 'gain':
      ps.money += card.amount;
      events.push({ type: 'gain', playerId, amount: card.amount });
      break;
    case 'lose':
      ps.money -= card.amount;
      events.push({ type: 'lose', playerId, amount: card.amount });
      break;
    case 'go_to_jail':
      ps.position = 7;
      ps.inJail = true;
      ps.jailTurns = 0;
      events.push({ type: 'go_to_jail', playerId });
      break;
    case 'birthday': {
      const others = players.filter(p => p.id !== playerId && !gameState.players[p.id].bankrupt);
      let total = 0;
      for (const other of others) {
        const pay = Math.min(card.amount, gameState.players[other.id].money);
        gameState.players[other.id].money -= pay;
        total += pay;
      }
      ps.money += total;
      events.push({ type: 'birthday', playerId, amount: total });
      break;
    }
    case 'repairs': {
      const propCount = ps.properties.length;
      const fee = propCount * card.amount;
      ps.money -= fee;
      events.push({ type: 'lose', playerId, amount: fee, reason: 'repairs' });
      break;
    }
  }

  return events;
}

function doRoll(gameState, playerIndex, players) {
  if (gameState.phase !== 'rolling') return { error: 'Not time to roll' };
  const currentId = players[playerIndex].id;
  if (gameState.currentPlayerIndex !== playerIndex) return { error: 'Not your turn' };

  const ps = gameState.players[currentId];
  if (ps.bankrupt) return { error: 'You are bankrupt' };

  const dice = rollDice();
  const total = dice[0] + dice[1];
  const doubles = dice[0] === dice[1];
  gameState.dice = dice;
  gameState.lastRoll = { dice, doubles, playerId: currentId };

  // Jail logic
  if (ps.inJail) {
    if (doubles) {
      ps.inJail = false;
      ps.jailTurns = 0;
    } else {
      ps.jailTurns += 1;
      if (ps.jailTurns >= 3) {
        ps.inJail = false;
        ps.jailTurns = 0;
      } else {
        gameState.phase = 'rolling';
        gameState.currentPlayerIndex = getNextPlayerIndex(gameState, players);
        return { dice, doubles, jailStay: true };
      }
    }
  }

  // Move player
  const oldPos = ps.position;
  ps.position = (oldPos + total) % BOARD_SIZE;

  // Collect GO salary if passed GO
  if (ps.position < oldPos || (oldPos === 0 && total > 0)) {
    ps.money += 200;
  }

  const space = gameState.board[ps.position];
  const events = [];

  if (space.type === 'go_to_jail') {
    ps.position = 7;
    ps.inJail = true;
    ps.jailTurns = 0;
    events.push({ type: 'go_to_jail', playerId: currentId });
    gameState.phase = 'rolling';
    gameState.currentPlayerIndex = getNextPlayerIndex(gameState, players);
  } else if (space.type === 'tax') {
    ps.money -= space.rent;
    events.push({ type: 'lose', playerId: currentId, amount: space.rent, reason: space.name });
    gameState.phase = 'rolling';
    gameState.currentPlayerIndex = getNextPlayerIndex(gameState, players);
  } else if (space.type === 'chance') {
    const card = drawChanceCard(gameState);
    const cardEvents = applyChanceCard(gameState, card, currentId, players);
    events.push(...cardEvents, { type: 'chance_card', card });
    gameState.pendingDecision = null;
    gameState.phase = 'rolling';
    gameState.currentPlayerIndex = getNextPlayerIndex(gameState, players);
  } else if (space.type === 'property' || space.type === 'railroad' || space.type === 'utility') {
    if (!space.ownerId) {
      // Unowned — offer to buy
      gameState.phase = 'property_decision';
      gameState.pendingDecision = { spaceId: space.id, playerId: currentId };
    } else if (space.ownerId === currentId || space.mortgaged) {
      // Own it or mortgaged — nothing to pay
      gameState.phase = 'rolling';
      gameState.currentPlayerIndex = getNextPlayerIndex(gameState, players);
    } else {
      // Pay rent
      let rent = space.rent;
      if (space.type === 'utility') {
        rent = total * 4;
      } else if (space.type === 'railroad') {
        // Count railroads owned by same player
        const rrsOwned = gameState.board.filter(s => s.type === 'railroad' && s.ownerId === space.ownerId).length;
        rent = 25 * rrsOwned;
      } else {
        // Double rent if owner has full color group
        const groupSpaces = gameState.board.filter(s => s.group === space.group);
        const ownsAll = groupSpaces.every(s => s.ownerId === space.ownerId);
        if (ownsAll) rent *= 2;
      }

      const actualRent = Math.min(rent, ps.money);
      ps.money -= actualRent;
      gameState.players[space.ownerId].money += actualRent;
      events.push({ type: 'rent', from: currentId, to: space.ownerId, amount: actualRent });

      if (ps.money <= 0) {
        ps.bankrupt = true;
        // Properties go back to bank
        ps.properties.forEach(propId => {
          const prop = gameState.board.find(s => s.id === propId);
          if (prop) { prop.ownerId = null; prop.mortgaged = false; }
        });
        ps.properties = [];
        gameState.bankruptedOrder.push(currentId);
        events.push({ type: 'bankrupt', playerId: currentId });
      }

      gameState.phase = 'rolling';
      gameState.currentPlayerIndex = getNextPlayerIndex(gameState, players);
    }
  } else {
    // go, jail/visit, free_parking — nothing happens
    gameState.phase = 'rolling';
    gameState.currentPlayerIndex = getNextPlayerIndex(gameState, players);
  }

  const winner = checkWinner(gameState, players);
  if (winner) {
    gameState.winner = winner;
    gameState.phase = 'finished';
  }

  return { dice, doubles, position: ps.position, events };
}

function buyProperty(gameState, playerIndex, players) {
  if (gameState.phase !== 'property_decision') return { error: 'No purchase pending' };
  const decision = gameState.pendingDecision;
  const currentId = players[playerIndex].id;
  if (decision.playerId !== currentId) return { error: 'Not your decision' };

  const space = gameState.board.find(s => s.id === decision.spaceId);
  if (!space || space.ownerId) return { error: 'Property not available' };

  const ps = gameState.players[currentId];
  if (ps.money < space.price) return { error: 'Not enough money' };

  ps.money -= space.price;
  ps.properties.push(space.id);
  space.ownerId = currentId;

  gameState.pendingDecision = null;
  gameState.phase = 'rolling';
  gameState.currentPlayerIndex = getNextPlayerIndex(gameState, players);

  return { success: true };
}

function passProperty(gameState, playerIndex, players) {
  if (gameState.phase !== 'property_decision') return { error: 'No purchase pending' };
  const decision = gameState.pendingDecision;
  const currentId = players[playerIndex].id;
  if (decision.playerId !== currentId) return { error: 'Not your decision' };

  gameState.pendingDecision = null;
  gameState.phase = 'rolling';
  gameState.currentPlayerIndex = getNextPlayerIndex(gameState, players);

  return { success: true };
}

function mortgageProperty(gameState, playerIndex, spaceId, players) {
  const currentId = players[playerIndex].id;
  const ps = gameState.players[currentId];
  const space = gameState.board.find(s => s.id === spaceId);

  if (!space || space.ownerId !== currentId) return { error: 'You do not own this property' };
  if (space.mortgaged) return { error: 'Already mortgaged' };

  const mortgageValue = Math.floor(space.price / 2);
  space.mortgaged = true;
  ps.money += mortgageValue;

  return { success: true, amount: mortgageValue };
}

function getNetWorth(gameState, playerId) {
  const ps = gameState.players[playerId];
  if (!ps) return 0;
  let worth = ps.money;
  for (const propId of ps.properties) {
    const space = gameState.board.find(s => s.id === propId);
    if (space) worth += space.mortgaged ? Math.floor(space.price / 2) : space.price;
  }
  return worth;
}

module.exports = { createGameState, doRoll, buyProperty, passProperty, mortgageProperty, getNetWorth };
