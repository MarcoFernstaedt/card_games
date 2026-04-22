const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { createGameState: createUnoState, playCard, drawCard } = require('./games/uno');
const { createGameState: createCahState, submitResponse, czarPick, nextRound, addCustomCard } = require('./games/cah');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const rooms = {};

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
    })),
  };
}

function publicCahState(room) {
  const gs = room.gameState;
  const czarId = room.players[gs.czarIndex]?.id;
  return {
    id: room.id,
    gameType: 'cah',
    host: room.host,
    phase: gs.phase,
    currentBlackCard: gs.currentBlackCard,
    czarIndex: gs.czarIndex,
    czarId,
    submittedIds: Object.keys(gs.submissions),
    submissions: gs.phase === 'judging' || gs.phase === 'results' ? gs.submissions : null,
    roundWinner: gs.roundWinner,
    scores: gs.scores,
    customCardCounts: gs.customCardCounts,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      score: gs.scores[p.id] || 0,
      cardCount: gs.hands[p.id]?.length ?? 0,
    })),
  };
}

function lobbyState(room) {
  return {
    id: room.id,
    gameType: room.gameType,
    host: room.host,
    phase: 'lobby',
    players: room.players.map(p => ({ id: p.id, name: p.name })),
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

io.on('connection', socket => {
  socket.on('create_room', ({ name, gameType }) => {
    const code = generateCode();
    rooms[code] = {
      id: code,
      gameType: gameType || 'uno',
      host: socket.id,
      players: [{ id: socket.id, name, socketId: socket.id }],
      gameState: null,
    };
    socket.join(code);
    socket.emit('room_created', { code, playerId: socket.id });
    io.to(code).emit('game_state', getPublicState(rooms[code]));
  });

  socket.on('join_room', ({ name, code }) => {
    const room = rooms[code?.toUpperCase()];
    if (!room) { socket.emit('error', { message: 'Room not found' }); return; }
    if (room.gameState) { socket.emit('error', { message: 'Game already started' }); return; }
    if (room.players.length >= 6) { socket.emit('error', { message: 'Room is full (max 6)' }); return; }
    if (room.players.find(p => p.name === name)) { socket.emit('error', { message: 'Name already taken in this room' }); return; }

    room.players.push({ id: socket.id, name, socketId: socket.id });
    socket.join(code.toUpperCase());
    socket.emit('room_joined', { code: code.toUpperCase(), playerId: socket.id });
    io.to(code.toUpperCase()).emit('game_state', getPublicState(room));
  });

  socket.on('change_game_type', ({ code, gameType }) => {
    const room = rooms[code];
    if (!room || room.host !== socket.id || room.gameState) return;
    room.gameType = gameType;
    io.to(code).emit('game_state', getPublicState(room));
  });

  socket.on('start_game', ({ code }) => {
    const room = rooms[code];
    if (!room || room.host !== socket.id) return;
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

    const playerIndex = room.players.findIndex(p => p.id === socket.id);
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

    const playerIndex = room.players.findIndex(p => p.id === socket.id);
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

    const result = submitResponse(room.gameState, socket.id, cardIndices, room.players);
    if (result.error) { socket.emit('error', { message: result.error }); return; }

    sendHands(room);
    io.to(code).emit('game_state', getPublicState(room));
  });

  socket.on('cah_czar_pick', ({ code, winnerId }) => {
    const room = rooms[code];
    if (!room || !room.gameState || room.gameType !== 'cah') return;

    const czarId = room.players[room.gameState.czarIndex]?.id;
    if (socket.id !== czarId) { socket.emit('error', { message: 'Only the Czar can pick' }); return; }

    const result = czarPick(room.gameState, winnerId);
    if (result.error) { socket.emit('error', { message: result.error }); return; }

    io.to(code).emit('game_state', getPublicState(room));
  });

  socket.on('cah_next_round', ({ code }) => {
    const room = rooms[code];
    if (!room || !room.gameState || room.gameType !== 'cah') return;
    if (room.host !== socket.id) return;

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

    const result = addCustomCard(room.gameState, socket.id, cardText);
    if (result.error) { socket.emit('error', { message: result.error }); return; }

    socket.emit('card_created', { card: result.card });
    io.to(code).emit('custom_card_added', { creatorName: room.players.find(p => p.id === socket.id)?.name });
  });

  socket.on('disconnect', () => {
    for (const code of Object.keys(rooms)) {
      const room = rooms[code];
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx === -1) continue;

      const playerName = room.players[idx].name;
      const leavingId = socket.id;
      room.players.splice(idx, 1);

      if (room.players.length === 0) { delete rooms[code]; continue; }
      if (room.host === leavingId) room.host = room.players[0].id;

      // Repair active game state after player leaves
      if (room.gameState) {
        const gs = room.gameState;
        delete gs.hands[leavingId];

        if (room.gameType === 'uno') {
          // Adjust currentPlayerIndex so the correct player still has the turn
          if (idx < gs.currentPlayerIndex) {
            gs.currentPlayerIndex = gs.currentPlayerIndex - 1;
          } else if (idx === gs.currentPlayerIndex) {
            gs.currentPlayerIndex = gs.currentPlayerIndex % room.players.length;
          }
        }

        if (room.gameType === 'cah') {
          delete gs.submissions[leavingId];

          // Adjust czarIndex to track the same person (or pick next if czar left)
          if (idx < gs.czarIndex) {
            gs.czarIndex = gs.czarIndex - 1;
          } else if (idx === gs.czarIndex) {
            gs.czarIndex = gs.czarIndex % room.players.length;
          }

          // After removing player, check if remaining non-czar players have all submitted
          if (gs.phase === 'playing' && room.players.length > 1) {
            const czarId = room.players[gs.czarIndex]?.id;
            const nonCzar = room.players.filter(p => p.id !== czarId);
            if (nonCzar.length > 0 && nonCzar.every(p => gs.submissions[p.id])) {
              gs.phase = 'judging';
            }
          }
        }

        // If fewer than 2 players remain, the game cannot continue
        if (room.players.length < 2) {
          io.to(code).emit('player_left', { playerId: leavingId, playerName });
          io.to(code).emit('game_over', {
            message: 'Not enough players',
            scores: gs.scores || {},
            winnerName: null,
          });
          room.gameState = null;
          continue;
        }
      }

      io.to(code).emit('player_left', { playerId: leavingId, playerName });
      io.to(code).emit('game_state', getPublicState(room));
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
