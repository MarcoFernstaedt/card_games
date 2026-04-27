const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const { createGameState: createUnoState, playCard, drawCard, mercyVote } = require('./games/uno');
const { createGameState: createCahState, submitResponse, voteForWinner, nextRound, addCustomCard } = require('./games/cah');
const { createGameState: createMonopolyState, doRoll, buyProperty, passProperty, mortgageProperty, getNetWorth } = require('./games/monopoly');
const { createGameState: createActionState, applyInputs, resolveBullets, resolveRespawns, resolvePickups, checkWinCondition, getPublicSnapshot } = require('./games/action');
const { activityReport, recordActivity, shouldTrackPageHit } = require('./activity');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['polling', 'websocket'],
});

const rooms = {};
const reconnectTimers = {};
const RECONNECT_GRACE_MS = Number(process.env.RECONNECT_GRACE_MS || 30000);
const ACTIVE_GAME_RECONNECT_GRACE_MS = Number(process.env.ACTIVE_GAME_RECONNECT_GRACE_MS || 300000);

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return rooms[code] ? generateCode() : code;
}

function publicUnoState(room) {
  const gs = room.gameState;
  return {
    id: room.id,
    gameType: 'uno',
    unoMode: gs.unoMode,
    host: room.host,
    phase: gs.winner ? 'finished' : 'playing',
    currentPlayerIndex: gs.currentPlayerIndex,
    direction: gs.direction,
    currentColor: gs.currentColor,
    topCard: gs.discardPile[gs.discardPile.length - 1],
    deckCount: gs.deck.length,
    winner: gs.winner,
    drawStack: gs.drawStack,
    pendingDrawType: gs.pendingDrawType,
    mercyVotes: gs.mercyVotes,
    mercyVoteTarget: gs.mercyVoteTarget,
    players: room.players.map((p, i) => ({
      id: p.id,
      name: p.name,
      cardCount: gs.hands[p.id]?.length ?? 0,
      isCurrentPlayer: i === gs.currentPlayerIndex,
      disconnected: p.disconnected || false,
    })),
  };
}

function publicCahState(room) {
  const gs = room.gameState;
  return {
    id: room.id,
    gameType: 'cah',
    host: room.host,
    phase: gs.phase,
    currentBlackCard: gs.currentBlackCard,
    submittedIds: Object.keys(gs.submissions),
    votedIds: Object.keys(gs.votes || {}),
    votes: gs.phase === 'results' ? gs.votes : null,
    submissions: gs.phase === 'judging' || gs.phase === 'results' ? gs.submissions : null,
    roundWinner: gs.roundWinner,
    scores: gs.scores,
    customCardCounts: gs.customCardCounts,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      score: gs.scores[p.id] || 0,
      cardCount: gs.hands[p.id]?.length ?? 0,
      disconnected: p.disconnected || false,
    })),
  };
}

function lobbyState(room) {
  return {
    id: room.id,
    gameType: room.gameType,
    unoMode: room.unoMode,
    actionMode: room.actionMode,
    host: room.host,
    phase: 'lobby',
    players: room.players.map(p => ({ id: p.id, name: p.name, disconnected: p.disconnected || false })),
  };
}

function publicMonopolyState(room) {
  const gs = room.gameState;
  return {
    id: room.id,
    gameType: 'monopoly',
    host: room.host,
    phase: gs.phase,
    currentPlayerIndex: gs.currentPlayerIndex,
    board: gs.board,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      disconnected: p.disconnected || false,
      ...gs.players[p.id],
    })),
    dice: gs.dice,
    lastRoll: gs.lastRoll,
    winner: gs.winner,
    bankruptedOrder: gs.bankruptedOrder,
    pendingDecision: gs.pendingDecision,
    timeLimit: gs.timeLimit,
    elapsedTime: gs.elapsedTime,
  };
}

function getPublicState(room) {
  if (!room.gameState) return lobbyState(room);
  if (room.gameType === 'uno') return publicUnoState(room);
  if (room.gameType === 'monopoly') return publicMonopolyState(room);
  if (room.gameType === 'action') {
    const snap = getPublicSnapshot(room.gameState);
    return {
      gameType: 'action',
      actionMode: room.actionMode,
      host: room.host,
      phase: room.gameState.phase,
      id: room.id,
      // players = roster array (for routing/display); playerStates = in-game positions
      players: room.players.map(p => ({ id: p.id, name: p.name, disconnected: p.disconnected || false })),
      playerStates: snap.players,
      bullets: snap.bullets,
      tasks: snap.tasks,
      pickups: snap.pickups,
      completedTasks: snap.completedTasks,
      totalTasks: snap.totalTasks,
      timeRemaining: snap.timeRemaining,
      winner: snap.winner,
      mode: snap.mode,
    };
  }
  return publicCahState(room);
}

function roomActivityDetails(room) {
  return {
    gameType: room?.gameType,
    playerCount: room?.players?.length || 0,
    roomCount: Object.keys(rooms).length,
    activeSockets: io.engine.clientsCount || 0,
  };
}

function sendHands(room) {
  if (!room.gameState?.hands) return;
  for (const player of room.players) {
    const sock = io.sockets.sockets.get(player.socketId);
    if (sock) {
      const hand = room.gameState.hands[player.id];
      if (hand) sock.emit('hand_update', { hand });
    }
  }
}

function removePlayer(room, code, player) {
  const idx = room.players.indexOf(player);
  if (idx === -1) return;

  const playerName = player.name;
  const leavingId = player.id;
  room.players.splice(idx, 1);

  if (room.players.length === 0) {
    delete rooms[code];
    if (monopolyTimers[code]) { clearInterval(monopolyTimers[code]); delete monopolyTimers[code]; }
    if (actionLoops[code]) { clearInterval(actionLoops[code]); delete actionLoops[code]; }
    return;
  }
  if (room.host === leavingId) room.host = room.players[0].id;

  if (room.gameState) {
    const gs = room.gameState;
    if (gs.hands) delete gs.hands[leavingId];

    if (room.gameType === 'uno') {
      if (idx < gs.currentPlayerIndex) {
        gs.currentPlayerIndex = gs.currentPlayerIndex - 1;
      } else if (idx === gs.currentPlayerIndex) {
        gs.currentPlayerIndex = gs.currentPlayerIndex % room.players.length;
      }
    }

    if (room.gameType === 'cah') {
      delete gs.submissions[leavingId];


      if (gs.phase === 'playing' && room.players.length > 1) {
        if (room.players.length > 0 && room.players.every(p => gs.submissions[p.id])) {
          gs.phase = 'judging';
        }
      }
    }

    if (room.players.length < 2) {
      io.to(code).emit('player_left', { playerId: leavingId, playerName });
      io.to(code).emit('game_over', {
        message: 'Not enough players',
        scores: gs.scores || {},
        winnerName: null,
      });
      room.gameState = null;
      return;
    }
  }

  io.to(code).emit('player_left', { playerId: leavingId, playerName });
  io.to(code).emit('game_state', getPublicState(room));
}

const monopolyTimers = {};
const actionLoops = {};

function startMonopolyTimer(code, room) {
  if (monopolyTimers[code]) clearInterval(monopolyTimers[code]);
  monopolyTimers[code] = setInterval(() => {
    const r = rooms[code];
    if (!r || !r.gameState || r.gameType !== 'monopoly') {
      clearInterval(monopolyTimers[code]);
      delete monopolyTimers[code];
      return;
    }
    r.gameState.elapsedTime += 1;
    if (r.gameState.elapsedTime >= r.gameState.timeLimit) {
      clearInterval(monopolyTimers[code]);
      delete monopolyTimers[code];
      // Richest player wins at time limit
      let bestId = null, bestWorth = -1;
      for (const p of r.players) {
        const worth = getNetWorth(r.gameState, p.id);
        if (worth > bestWorth) { bestWorth = worth; bestId = p.id; }
      }
      r.gameState.winner = bestId;
      r.gameState.phase = 'finished';
      const winnerName = r.players.find(p => p.id === bestId)?.name;
      io.to(code).emit('game_state', getPublicState(r));
      io.to(code).emit('game_over', { winner: bestId, winnerName, reason: 'time_limit' });
    }
  }, 1000);
}

function startActionLoop(code) {
  if (actionLoops[code]) clearInterval(actionLoops[code]);
  actionLoops[code] = setInterval(() => {
    const room = rooms[code];
    if (!room || !room.gameState || room.gameType !== 'action') {
      clearInterval(actionLoops[code]);
      delete actionLoops[code];
      return;
    }
    const gs = room.gameState;

    applyInputs(gs, gs.inputQueue);
    gs.inputQueue = {};

    const hits = resolveBullets(gs, room.players);
    resolveRespawns(gs);

    if (gs.mode === 'firefight') {
      resolvePickups(gs);
      if (gs.timeRemaining > 0) gs.timeRemaining -= 1;
    }

    if (hits.length > 0) {
      for (const hit of hits) {
        io.to(code).emit('action_hit', hit);
      }
    }

    const win = checkWinCondition(gs, room.players);
    if (win) {
      gs.winner = win;
      gs.phase = 'finished';
      clearInterval(actionLoops[code]);
      delete actionLoops[code];
      const winnerName = win.playerName || (win.side === 'crewmates' ? 'The Crewmates' : 'The Impostor');
      io.to(code).emit('game_state', { gameType: 'action', actionMode: room.actionMode, ...getPublicSnapshot(gs) });
      io.to(code).emit('game_over', { winner: win.playerId || null, winnerName });
      return;
    }

    io.to(code).emit('action_state', getPublicSnapshot(gs));
  }, 50); // 20 Hz
}

io.on('connection', socket => {
  recordActivity('socket_connection', { activeSockets: io.engine.clientsCount || 0, roomCount: Object.keys(rooms).length });

  socket.on('create_room', ({ name, gameType, unoMode, pid }) => {
    const code = generateCode();
    const playerId = pid || socket.id;
    rooms[code] = {
      id: code,
      gameType: gameType || 'uno',
      unoMode: unoMode || 'classic',
      host: playerId,
      players: [{ id: playerId, name, socketId: socket.id, disconnected: false }],
      gameState: null,
      musicState: { playing: false, track: 'hype', startedAt: null },
    };
    socket.join(code);
    recordActivity('room_created', roomActivityDetails(rooms[code]));
    socket.emit('room_created', { code, playerId });
    io.to(code).emit('game_state', getPublicState(rooms[code]));
  });

  socket.on('join_room', ({ name, code, pid }) => {
    const room = rooms[code?.toUpperCase()];
    if (!room) { socket.emit('error', { message: 'Room not found' }); return; }
    if (room.gameState) { socket.emit('error', { message: 'Game already started' }); return; }
    if (room.players.length >= 6) { socket.emit('error', { message: 'Room is full (max 6)' }); return; }
    if (room.players.find(p => p.name === name)) { socket.emit('error', { message: 'Name already taken in this room' }); return; }

    const playerId = pid || socket.id;
    room.players.push({ id: playerId, name, socketId: socket.id, disconnected: false });
    socket.join(code.toUpperCase());
    recordActivity('room_joined', roomActivityDetails(room));
    socket.emit('room_joined', { code: code.toUpperCase(), playerId });
    io.to(code.toUpperCase()).emit('game_state', getPublicState(room));
  });

  socket.on('rejoin_room', ({ code, pid }) => {
    const room = rooms[code?.toUpperCase()];
    if (!room) { socket.emit('error', { message: 'Room not found' }); return; }

    const player = room.players.find(p => p.id === pid);
    if (!player) { socket.emit('error', { message: 'Player not found in room' }); return; }

    const timerKey = `${code.toUpperCase()}-${pid}`;
    if (reconnectTimers[timerKey]) {
      clearTimeout(reconnectTimers[timerKey]);
      delete reconnectTimers[timerKey];
    }

    player.socketId = socket.id;
    player.disconnected = false;
    socket.join(code.toUpperCase());
    recordActivity('player_rejoined', roomActivityDetails(room));

    socket.emit('room_joined', { code: code.toUpperCase(), playerId: pid });
    if (room.gameState) {
      const hand = room.gameState.hands?.[pid];
      if (hand) socket.emit('hand_update', { hand });
    }
    if (room.musicState) {
      socket.emit('music_state', room.musicState);
    }
    io.to(code.toUpperCase()).emit('player_rejoined', { playerName: player.name });
    io.to(code.toUpperCase()).emit('game_state', getPublicState(room));
  });

  socket.on('change_game_type', ({ code, gameType }) => {
    const room = rooms[code];
    if (!room || room.gameState) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || player.id !== room.host) return;
    room.gameType = gameType;
    io.to(code).emit('game_state', getPublicState(room));
  });

  socket.on('change_uno_mode', ({ code, unoMode }) => {
    const room = rooms[code];
    if (!room || room.gameState) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || player.id !== room.host) return;
    if (!['classic', 'mercy'].includes(unoMode)) return;
    room.unoMode = unoMode;
    io.to(code).emit('game_state', getPublicState(room));
  });

  socket.on('change_action_mode', ({ code, actionMode }) => {
    const room = rooms[code];
    if (!room || room.gameState) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || player.id !== room.host) return;
    if (!['impostor', 'firefight'].includes(actionMode)) return;
    room.actionMode = actionMode;
    io.to(code).emit('game_state', getPublicState(room));
  });

  socket.on('uno_mercy_vote', ({ code, targetPlayerId }) => {
    const room = rooms[code];
    if (!room || !room.gameState || room.gameType !== 'uno') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    const result = mercyVote(room.gameState, player.id, targetPlayerId, room.players);
    if (result.error) { socket.emit('error', { message: result.error }); return; }

    if (result.passed) sendHands(room);
    io.to(code).emit('game_state', getPublicState(room));
    io.to(code).emit('mercy_vote_update', {
      passed: result.passed,
      votes: result.votes,
      threshold: result.threshold,
      targetPlayerId,
      removed: result.removed,
    });
  });

  socket.on('start_game', ({ code }) => {
    const room = rooms[code];
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || player.id !== room.host) return;
    if (room.players.length < 2) { socket.emit('error', { message: 'Need at least 2 players' }); return; }

    if (room.gameType === 'uno') {
      room.gameState = createUnoState(room.players, room.unoMode || 'classic', {
        handSize: process.env.UNO_HAND_SIZE,
        turnLimit: process.env.UNO_TURN_LIMIT,
      });
    } else if (room.gameType === 'monopoly') {
      room.gameState = createMonopolyState(room.players, { timeLimitSeconds: process.env.MONOPOLY_TIME_LIMIT_SECONDS });
      startMonopolyTimer(code, room);
    } else if (room.gameType === 'action') {
      const mode = room.actionMode || 'impostor';
      room.gameState = createActionState(room.players, mode, {
        firefightTicks: process.env.ACTION_FIREFIGHT_TICKS,
        taskCount: process.env.ACTION_TASK_COUNT,
        taskTicks: process.env.ACTION_TASK_TICKS,
        startNearTask: process.env.ACTION_START_NEAR_TASK,
      });
      room.gameState.inputQueue = {};
      // Send private roles in impostor mode
      if (mode === 'impostor') {
        for (const p of room.players) {
          const sock = io.sockets.sockets.get(p.socketId);
          const ps = room.gameState.players[p.id];
          if (sock && ps) sock.emit('action_role', { role: ps.role });
        }
      }
      startActionLoop(code);
    } else {
      room.gameState = createCahState(room.players, { maxRounds: process.env.CAH_MAX_ROUNDS });
    }

    recordActivity('game_started', roomActivityDetails(room));

    sendHands(room);
    io.to(code).emit('game_state', getPublicState(room));
  });

  socket.on('uno_play_card', ({ code, cardIndex, chosenColor }) => {
    const room = rooms[code];
    if (!room || !room.gameState || room.gameType !== 'uno') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    const playerIndex = room.players.indexOf(player);
    if (playerIndex !== room.gameState.currentPlayerIndex) {
      socket.emit('error', { message: 'Not your turn' }); return;
    }

    const result = playCard(room.gameState, playerIndex, cardIndex, chosenColor, room.players);
    if (result.error) { socket.emit('error', { message: result.error }); return; }

    sendHands(room);
    io.to(code).emit('game_state', getPublicState(room));

    if (result.winner) {
      const winnerName = room.players.find(p => p.id === result.winner)?.name;
      io.to(code).emit('game_over', { winner: result.winner, winnerName });
    }
  });

  socket.on('uno_draw_card', ({ code }) => {
    const room = rooms[code];
    if (!room || !room.gameState || room.gameType !== 'uno') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    const playerIndex = room.players.indexOf(player);
    if (playerIndex !== room.gameState.currentPlayerIndex) {
      socket.emit('error', { message: 'Not your turn' }); return;
    }

    const result = drawCard(room.gameState, playerIndex, room.players);
    if (result.error) { socket.emit('error', { message: result.error }); return; }

    sendHands(room);
    io.to(code).emit('game_state', getPublicState(room));
    if (result.winner) {
      const winnerName = room.players.find(p => p.id === result.winner)?.name;
      io.to(code).emit('game_over', { winner: result.winner, winnerName });
    }
  });

  socket.on('cah_submit', ({ code, cardIndices }) => {
    const room = rooms[code];
    if (!room || !room.gameState || room.gameType !== 'cah') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    const result = submitResponse(room.gameState, player.id, cardIndices, room.players);
    if (result.error) { socket.emit('error', { message: result.error }); return; }

    sendHands(room);
    io.to(code).emit('game_state', getPublicState(room));
  });

  socket.on('cah_vote', ({ code, winnerId }) => {
    const room = rooms[code];
    if (!room || !room.gameState || room.gameType !== 'cah') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    const result = voteForWinner(room.gameState, player.id, winnerId, room.players);
    if (result.error) { socket.emit('error', { message: result.error }); return; }

    io.to(code).emit('game_state', getPublicState(room));
  });

  socket.on('cah_next_round', ({ code }) => {
    const room = rooms[code];
    if (!room || !room.gameState || room.gameType !== 'cah') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || player.id !== room.host) return;

    const result = nextRound(room.gameState, room.players);
    if (result.gameOver) {
      io.to(code).emit('game_over', { scores: room.gameState.scores });
      return;
    }

    sendHands(room);
    io.to(code).emit('game_state', getPublicState(room));
  });

  socket.on('cah_create_card', ({ code, cardText }) => {
    const room = rooms[code];
    if (!room || !room.gameState || room.gameType !== 'cah') return;
    if (!cardText?.trim()) { socket.emit('error', { message: 'Card text cannot be empty' }); return; }

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;

    const result = addCustomCard(room.gameState, player.id, cardText);
    if (result.error) { socket.emit('error', { message: result.error }); return; }

    socket.emit('card_created', { card: result.card });
    io.to(code).emit('custom_card_added', { creatorName: player.name });
    io.to(code).emit('game_state', getPublicState(room));
  });

  socket.on('music_control', ({ code, action, track, startedAt }) => {
    const room = rooms[code];
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || player.id !== room.host) return;

    if (action === 'play') {
      room.musicState = { playing: true, track: track || room.musicState?.track || 'hype', startedAt };
    } else if (action === 'stop') {
      room.musicState = { playing: false, track: room.musicState?.track || 'hype', startedAt: null };
    } else if (action === 'track') {
      room.musicState = { playing: room.musicState?.playing || false, track, startedAt };
    }

    io.to(code).emit('music_state', room.musicState);
  });

  socket.on('action_input', ({ code, dx, dy, angle, fire, interact }) => {
    const room = rooms[code];
    if (!room || !room.gameState || room.gameType !== 'action') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    // Queue the input for the next game loop tick
    room.gameState.inputQueue[player.id] = { dx, dy, angle, fire, interact };
  });

  socket.on('monopoly_roll', ({ code }) => {
    const room = rooms[code];
    if (!room || !room.gameState || room.gameType !== 'monopoly') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    const playerIndex = room.players.indexOf(player);

    const result = doRoll(room.gameState, playerIndex, room.players);
    if (result.error) { socket.emit('error', { message: result.error }); return; }

    io.to(code).emit('monopoly_dice_rolled', { dice: result.dice, playerId: player.id });
    setTimeout(() => {
      const r = rooms[code];
      if (r) io.to(code).emit('game_state', getPublicState(r));
    }, 800);

    if (room.gameState.winner) {
      const winnerName = room.players.find(p => p.id === room.gameState.winner)?.name;
      io.to(code).emit('game_over', { winner: room.gameState.winner, winnerName });
    }
  });

  socket.on('monopoly_buy', ({ code }) => {
    const room = rooms[code];
    if (!room || !room.gameState || room.gameType !== 'monopoly') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    const playerIndex = room.players.indexOf(player);

    const result = buyProperty(room.gameState, playerIndex, room.players);
    if (result.error) { socket.emit('error', { message: result.error }); return; }

    io.to(code).emit('game_state', getPublicState(room));
  });

  socket.on('monopoly_pass', ({ code }) => {
    const room = rooms[code];
    if (!room || !room.gameState || room.gameType !== 'monopoly') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    const playerIndex = room.players.indexOf(player);

    const result = passProperty(room.gameState, playerIndex, room.players);
    if (result.error) { socket.emit('error', { message: result.error }); return; }

    io.to(code).emit('game_state', getPublicState(room));
  });

  socket.on('monopoly_mortgage', ({ code, spaceId }) => {
    const room = rooms[code];
    if (!room || !room.gameState || room.gameType !== 'monopoly') return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player) return;
    const playerIndex = room.players.indexOf(player);

    const result = mortgageProperty(room.gameState, playerIndex, spaceId, room.players);
    if (result.error) { socket.emit('error', { message: result.error }); return; }

    io.to(code).emit('game_state', getPublicState(room));
  });

  socket.on('disconnect', () => {
    for (const code of Object.keys(rooms)) {
      const room = rooms[code];
      const player = room.players.find(p => p.socketId === socket.id);
      if (!player) continue;

      player.disconnected = true;
      recordActivity('player_disconnected', roomActivityDetails(room));
      io.to(code).emit('player_disconnected', { playerName: player.name });
      io.to(code).emit('game_state', getPublicState(room));

      const timerKey = `${code}-${player.id}`;
      const graceMs = room.gameState ? ACTIVE_GAME_RECONNECT_GRACE_MS : RECONNECT_GRACE_MS;
      reconnectTimers[timerKey] = setTimeout(() => {
        delete reconnectTimers[timerKey];
        const currentRoom = rooms[code];
        if (!currentRoom) return;
        const stillInRoom = currentRoom.players.find(p => p.id === player.id);
        if (stillInRoom && stillInRoom.disconnected) {
          removePlayer(currentRoom, code, stillInRoom);
        }
      }, graceMs);
    }
  });
});

const clientDist = path.join(__dirname, '../client/dist');
app.get('/activity', (req, res) => {
  res.json(activityReport(rooms, { activeSockets: io.engine.clientsCount || 0 }));
});

app.use((req, res, next) => {
  if (shouldTrackPageHit(req)) {
    recordActivity('page_hit', { path: req.path, roomCount: Object.keys(rooms).length, activeSockets: io.engine.clientsCount || 0 });
  }
  next();
});

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  if (fs.existsSync(clientDist)) {
    console.log('Serving built client from', clientDist);
  } else {
    console.log('No client build found — API/socket only mode');
  }
});
