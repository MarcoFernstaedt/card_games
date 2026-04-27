const assert = require('assert');
const { spawn } = require('child_process');
const { io } = require('../client/node_modules/socket.io-client');
const { createGameState, doRoll } = require('../server/games/monopoly');

const PORT = Number(process.env.TEST_PORT || 4319);
const URL = `http://127.0.0.1:${PORT}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function once(socket, event, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('connect_error', onError);
      socket.off('error', onErrorEvent);
    };
    const onError = (err) => {
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const onErrorEvent = (payload) => {
      cleanup();
      reject(new Error(payload?.message || `${event} socket error`));
    };
    socket.once(event, (payload) => {
      cleanup();
      resolve(payload);
    });
    socket.once('connect_error', onError);
    socket.once('error', onErrorEvent);
  });
}

async function waitFor(predicate, label, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = predicate();
    if (value) return value;
    await wait(100);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function runSocketRoomSmoke() {
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: require('path').join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT), MONOPOLY_TIME_LIMIT_SECONDS: '30', ACTIVITY_DATA_DIR: `/tmp/card_games_monopoly_test_${PORT}_${Date.now()}` },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  server.stdout.on('data', (d) => { logs += d.toString(); });
  server.stderr.on('data', (d) => { logs += d.toString(); });

  const host = io(URL, { transports: ['websocket', 'polling'], timeout: 8000 });
  const guest = io(URL, { transports: ['websocket', 'polling'], timeout: 8000 });
  let latestState = null;
  let diceRolled = null;
  host.on('game_state', (s) => { latestState = s; });
  guest.on('game_state', (s) => { latestState = s; });
  host.on('monopoly_dice_rolled', (payload) => { diceRolled = payload; });
  guest.on('monopoly_dice_rolled', (payload) => { diceRolled = payload; });

  try {
    await waitFor(() => logs.includes('Server running on port'), 'test server readiness', 8000);
    await Promise.all([once(host, 'connect'), once(guest, 'connect')]);

    const createdP = once(host, 'room_created');
    host.emit('create_room', { name: 'Imperator Host', gameType: 'monopoly', pid: `mono-host-${Date.now()}` });
    const created = await createdP;

    const joinedP = once(guest, 'room_joined');
    guest.emit('join_room', { name: 'Mercy Guest', code: created.code, pid: `mono-guest-${Date.now()}` });
    await joinedP;

    host.emit('start_game', { code: created.code });
    await waitFor(() => latestState?.gameType === 'monopoly' && latestState?.phase === 'rolling', 'started Monopoly state');
    assert.equal(latestState.players.length, 2);
    assert.equal(latestState.timeLimit, 30);

    host.emit('monopoly_roll', { code: created.code });
    await waitFor(() => diceRolled || latestState?.phase !== 'rolling', 'Monopoly dice roll or phase transition');
    assert.equal(latestState.gameType, 'monopoly');
    assert.ok(['rolling', 'property_decision', 'finished'].includes(latestState.phase));
    assert.ok(!/TypeError|Cannot read properties|Unhandled/i.test(logs), logs);

    host.close();
    guest.close();
    server.kill('SIGTERM');
    await wait(250);
    return created.code;
  } catch (err) {
    host.close();
    guest.close();
    server.kill('SIGTERM');
    err.message += `\nServer logs:\n${logs}`;
    throw err;
  }
}

function runDeterministicCompletion() {
  const players = [
    { id: 'p1', name: 'Alice' },
    { id: 'p2', name: 'Bob' },
  ];
  const gs = createGameState(players);
  const boardwalk = gs.board.find((space) => space.name === 'Boardwalk');
  assert.ok(boardwalk, 'Boardwalk space exists');
  boardwalk.ownerId = 'p2';
  gs.players.p2.properties.push(boardwalk.id);
  gs.players.p1.money = 10;
  gs.players.p1.position = 20;

  const oldRandom = Math.random;
  const sequence = [2 / 6, 2 / 6];
  let index = 0;
  Math.random = () => sequence[index++] ?? 0;
  try {
    const result = doRoll(gs, 0, players);
    assert.ifError(result.error);
  } finally {
    Math.random = oldRandom;
  }

  assert.equal(gs.phase, 'finished');
  assert.equal(gs.winner, 'p2');
  assert.deepEqual(gs.bankruptedOrder, ['p1']);
}

(async () => {
  runDeterministicCompletion();
  const roomCode = await runSocketRoomSmoke();
  console.log(`monopoly public flow test OK room=${roomCode}`);
})().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
