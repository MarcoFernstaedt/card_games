const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');
const { io } = require('../client/node_modules/socket.io-client');

const PORT = Number(process.env.TEST_PORT || 4333);
const URL = `http://127.0.0.1:${PORT}`;

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function once(socket, event, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off('connect_error', onError);
      socket.off('error', onSocketError);
    };
    const onError = (err) => { cleanup(); reject(err instanceof Error ? err : new Error(String(err))); };
    const onSocketError = (payload) => { cleanup(); reject(new Error(payload?.message || `${event} socket error`)); };
    socket.once(event, (payload) => { cleanup(); resolve(payload); });
    socket.once('connect_error', onError);
    socket.once('error', onSocketError);
  });
}

async function waitFor(predicate, label, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await predicate();
    if (value) return value;
    await wait(100);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function getActivity() {
  const response = await fetch(`${URL}/activity`);
  assert.equal(response.status, 200);
  return response.json();
}

async function run() {
  const server = spawn(process.execPath, ['server/index.js'], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      RECONNECT_GRACE_MS: '150',
      ACTIVE_GAME_RECONNECT_GRACE_MS: '150',
      FINISHED_ROOM_TTL_MS: '150',
      EMPTY_ROOM_TTL_MS: '50',
      STALE_ROOM_TTL_MS: '1000',
      UNO_HAND_SIZE: '2',
      UNO_TURN_LIMIT: '6',
      ACTIVITY_DATA_DIR: `/tmp/card_games_lifecycle_test_${PORT}_${Date.now()}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  server.stdout.on('data', (d) => { logs += d.toString(); });
  server.stderr.on('data', (d) => { logs += d.toString(); });

  const host = io(URL, { transports: ['websocket', 'polling'], timeout: 8000, forceNew: true });
  const guest = io(URL, { transports: ['websocket', 'polling'], timeout: 8000, forceNew: true });
  let latestState = null;
  let sawGameOver = null;
  host.on('game_state', (state) => { latestState = state; });
  guest.on('game_state', (state) => { latestState = state; });
  host.on('game_over', (payload) => { sawGameOver = payload; });

  try {
    await waitFor(() => logs.includes('Server running on port'), 'server readiness');
    await Promise.all([once(host, 'connect'), once(guest, 'connect')]);

    const createdP = once(host, 'room_created');
    host.emit('create_room', { name: 'Host', gameType: 'uno', pid: 'host-pid' });
    const created = await createdP;
    const joinedP = once(guest, 'room_joined');
    guest.emit('join_room', { name: 'Guest', code: created.code, pid: 'guest-pid' });
    await joinedP;

    host.emit('start_game', { code: created.code });
    await waitFor(() => latestState?.phase === 'playing', 'game started');

    guest.close();
    await waitFor(() => sawGameOver?.reason === 'not_enough_players' || sawGameOver?.message === 'Not enough players', 'not-enough-players game_over', 5000);
    await waitFor(async () => (await getActivity()).active.rooms === 0, 'finished room cleanup', 5000);

    assert.ok(!/TypeError|Unhandled|Cannot read properties/i.test(logs), logs);
    console.log('socket lifecycle cleanup test OK');
  } finally {
    host.close();
    guest.close();
    server.kill('SIGTERM');
    await wait(250);
  }
}

run().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
