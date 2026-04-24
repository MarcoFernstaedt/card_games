const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const { createGameState: createUnoState, playCard, drawCard } = require('./games/uno');
const { createGameState: createCahState, submitResponse, czarPick, voteForWinner, nextRound, addCustomCard } = require('./games/cah');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['polling', 'websocket'],
});

const rooms = {};
const reconnectTimers = {};

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
    host: room.host,
    phase: gs.winner ? 'finished' : 'playing',
    currentPlayerIndex: gs.currentPlayerIndex,
    direction: gs.direction,
    currentColor: gs.currentColor,
    topCard: gs.discardPile[gs.discardPile.length - 1],
    deckCount: gs.deck.length,
    winner: gs.winner,
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
  const czarId = null;
  return {
    id: room.id,
    gameType: 'cah',
    host: room.host,
    phase: gs.phase,
    currentBlackCard: gs.currentBlackCard,
    czarIndex: gs.czarIndex,
    czarId,
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
    host: room.host,
    phase: 'lobby',
    players: room.players.map(p => ({ id: p.id, name: p.name, disconnected: p.disconnected || false })),
  };
}

function getPublicState(room) {
  if (!room.gameState) return lobbyState(room);
  return room.gameType === 'uno' ? publicUnoState(room) : publicCahState(room);
}

function sendHands(room) {
  if (!room.gameState) return;
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

  if (room.players.length === 0) { delete rooms[code]; return; }
  if (room.host === leavingId) room.host = room.players[0].id;

  if (room.gameState) {
    const gs = room.gameState;
    delete gs.hands[leavingId];

    if (room.gameType === 'uno') {
      if (idx < gs.currentPlayerIndex) {
        gs.currentPlayerIndex = gs.currentPlayerIndex - 1;
      } else if (idx === gs.currentPlayerIndex) {
        gs.currentPlayerIndex = gs.currentPlayerIndex % room.players.length;
      }
    }

    if (room.gameType === 'cah') {
      delete gs.submissions[leavingId];

      if (idx < gs.czarIndex) {
        gs.czarIndex = gs.czarIndex - 1;
      } else if (idx === gs.czarIndex) {
        gs.czarIndex = gs.czarIndex % room.players.length;
      }

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

io.on('connection', socket => {
  socket.on('create_room', ({ name, gameType, pid }) => {
    const code = generateCode();
    const playerId = pid || socket.id;
    rooms[code] = {
      id: code,
      gameType: gameType || 'uno',
      host: playerId,
      players: [{ id: playerId, name, socketId: socket.id, disconnected: false }],
      gameState: null,
      musicState: { playing: false, track: 'hype', startedAt: null },
    };
    socket.join(code);
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

    socket.emit('room_joined', { code: code.toUpperCase(), playerId: pid });
    if (room.gameState) {
      const hand = room.gameState.hands[pid];
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

  socket.on('start_game', ({ code }) => {
    const room = rooms[code];
    if (!room) return;
    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || player.id !== room.host) return;
    if (room.players.length < 2) { socket.emit('error', { message: 'Need at least 2 players' }); return; }

    room.gameState = room.gameType === 'uno'
      ? createUnoState(room.players)
      : createCahState(room.players);

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

  socket.on('cah_czar_pick', ({ code, winnerId }) => {
    const room = rooms[code];
    if (!room || !room.gameState || room.gameType !== 'cah') return;

    const player = room.players.find(p => p.socketId === socket.id);
    if (!player || player.id !== room.host) { socket.emit('error', { message: 'Only the host can force-pick a winner' }); return; }

    const result = czarPick(room.gameState, winnerId);
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

  socket.on('disconnect', () => {
    for (const code of Object.keys(rooms)) {
      const room = rooms[code];
      const player = room.players.find(p => p.socketId === socket.id);
      if (!player) continue;

      player.disconnected = true;
      io.to(code).emit('player_disconnected', { playerName: player.name });
      io.to(code).emit('game_state', getPublicState(room));

      const timerKey = `${code}-${player.id}`;
      reconnectTimers[timerKey] = setTimeout(() => {
        delete reconnectTimers[timerKey];
        const currentRoom = rooms[code];
        if (!currentRoom) return;
        const stillInRoom = currentRoom.players.find(p => p.id === player.id);
        if (stillInRoom && stillInRoom.disconnected) {
          removePlayer(currentRoom, code, stillInRoom);
        }
      }, 30000);
    }
  });
});

const clientDist = path.join(__dirname, '../client/dist');
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
