#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const { io } = require('../client/node_modules/socket.io-client');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_URL = process.env.CARD_GAMES_URL || 'http://127.0.0.1:4321';

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function once(sock, event, ms = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout ${event}`)), ms);
    const cleanup = () => { clearTimeout(timer); sock.off('connect_error', onErr); sock.off('error', onSockErr); };
    const onErr = (err) => { cleanup(); reject(err instanceof Error ? err : new Error(String(err))); };
    const onSockErr = (payload) => { cleanup(); reject(new Error(payload?.message || `${event} socket error`)); };
    sock.once(event, (payload) => { cleanup(); resolve(payload); });
    sock.once('connect_error', onErr);
    sock.once('error', onSockErr);
  });
}
function canUnoPlay(card, topCard, currentColor, drawStack, pendingDrawType) {
  if (!card) return false;
  if (drawStack > 0) {
    return (pendingDrawType === 'draw_two' && card.value === 'draw_two') ||
      (pendingDrawType === 'wild_draw_four' && card.value === 'wild_draw_four');
  }
  return card.color === 'wild' || card.color === currentColor || card.value === topCard?.value;
}
function chooseUnoColor(hand) {
  const scores = { red: 0, blue: 0, green: 0, yellow: 0 };
  for (const card of hand) if (scores[card.color] !== undefined) scores[card.color] += ['skip','reverse','draw_two'].includes(card.value) ? 2 : 1;
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
}
function chooseUnoIndex(hand, state, botId) {
  const nextPlayer = state.players[(state.currentPlayerIndex + state.direction + state.players.length) % state.players.length];
  const threat = nextPlayer?.id !== botId && nextPlayer?.cardCount <= 2;
  const playable = hand.map((card, index) => ({ card, index })).filter(({ card }) => canUnoPlay(card, state.topCard, state.currentColor, state.drawStack || 0, state.pendingDrawType));
  if (!playable.length) return -1;
  const priority = threat ? ['wild_draw_four', 'draw_two', 'skip', 'reverse', 'wild'] : ['draw_two', 'skip', 'reverse', 'wild_draw_four', 'wild'];
  playable.sort((a, b) => {
    const pa = priority.includes(a.card.value) ? priority.indexOf(a.card.value) : 50;
    const pb = priority.includes(b.card.value) ? priority.indexOf(b.card.value) : 50;
    const ca = a.card.color === state.currentColor ? -2 : 0;
    const cb = b.card.color === state.currentColor ? -2 : 0;
    return (pa + ca) - (pb + cb);
  });
  return playable[0].index;
}
function chooseCahCards(hand, pick, promptText = '') {
  const prompt = promptText.toLowerCase();
  const scored = hand.map((card, index) => {
    const text = String(card.text || card).toLowerCase();
    let score = 0;
    if (text.length > 8 && text.length < 80) score += 2;
    if (/why|because|reason|cause/.test(prompt) && /because|fear|money|power|secret|problem|mistake/.test(text)) score += 3;
    if (/my|your|the/.test(prompt) && /a |the |my |your /.test(text)) score += 1;
    if (/death|crime|fire|chaos|shame|grandma|lawyer|tax|money/.test(text)) score += 2;
    score += Math.min(3, Math.floor(text.length / 28));
    return { index, score };
  }).sort((a, b) => b.score - a.score);
  return scored.slice(0, pick).map(x => x.index).sort((a, b) => a - b);
}
class Bot {
  constructor(name, url, code = null) {
    this.name = name;
    this.url = url;
    this.code = code;
    this.pid = `${name.toLowerCase().replace(/\W+/g, '-')}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.id = this.pid;
    this.hand = [];
    this.state = null;
    this.role = null;
    this.actions = 0;
    this.lastActionKey = '';
    this.lastActionAt = 0;
    this.stopped = false;
    this.socket = io(url, { transports: ['websocket', 'polling'], timeout: 8000, forceNew: true, reconnection: true });
    this.socket.on('room_joined', (p) => { this.id = p.playerId || this.pid; this.code = p.code || this.code; });
    this.socket.on('room_created', (p) => { this.id = p.playerId || this.pid; this.code = p.code || this.code; });
    this.socket.on('hand_update', (p) => { this.hand = p.hand || []; this.act(); });
    this.socket.on('game_state', (s) => { this.state = s; this.act(); });
    this.socket.on('action_state', (s) => { this.state = { ...(this.state || {}), ...s, gameType: 'action', actionMode: s.mode }; this.act(); });
    this.socket.on('action_role', (p) => { this.role = p.role; });
    this.socket.on('error', () => { this.lastActionKey = ''; this.lastActionAt = 0; });
    this.socket.on('connect', () => { if (this.code && this.id) this.socket.emit('rejoin_room', { code: this.code, pid: this.id }); });
  }
  async connect() { await once(this.socket, 'connect'); }
  close() { this.stopped = true; this.socket.close(); }
  act() {
    if (this.stopped || !this.state || !this.code) return;
    if (this.state.phase === 'finished' || this.state.winner) return;
    if (this.state.gameType === 'uno') this.actUno();
    if (this.state.gameType === 'cah') this.actCah();
    if (this.state.gameType === 'monopoly') this.actMonopoly();
  }
  currentPlayer() { return Array.isArray(this.state.players) ? this.state.players[this.state.currentPlayerIndex] : null; }
  actUno() {
    const current = this.currentPlayer();
    if (!current || current.id !== this.id || !this.hand.length) {
      const target = this.state.players?.filter(p => p.id !== this.id && p.cardCount >= 15).sort((a,b)=>b.cardCount-a.cardCount)[0];
      if (this.state.unoMode === 'mercy' && target) this.socket.emit('uno_mercy_vote', { code: this.code, targetPlayerId: target.id });
      return;
    }
    const key = `uno:${this.hand.map(c=>c.id).join(',')}:${this.state.topCard?.id}:${this.state.drawStack}:${this.state.currentColor}`;
    if (key === this.lastActionKey && Date.now() - this.lastActionAt < 1500) return;
    this.lastActionKey = key;
    this.lastActionAt = Date.now();
    setTimeout(() => {
      const idx = chooseUnoIndex(this.hand, this.state, this.id);
      if (idx >= 0) {
        this.socket.emit('uno_play_card', { code: this.code, cardIndex: idx, chosenColor: this.hand[idx].color === 'wild' ? chooseUnoColor(this.hand) : undefined });
      } else {
        this.socket.emit('uno_draw_card', { code: this.code });
      }
      this.actions += 1;
    }, 60);
  }
  actCah() {
    const phase = this.state.phase;
    if (phase === 'playing' && this.hand.length && !this.state.submittedIds?.includes(this.id)) {
      const pick = this.state.currentBlackCard?.pick || 1;
      const key = `cah-submit:${this.state.currentBlackCard?.text}:${this.hand.map(c=>c.id || c.text).join('|')}`;
      if (key === this.lastActionKey) return;
      this.lastActionKey = key;
      this.socket.emit('cah_submit', { code: this.code, cardIndices: chooseCahCards(this.hand, pick, this.state.currentBlackCard?.text || '') });
      this.actions += 1;
    }
    if (phase === 'judging' && !this.state.votedIds?.includes(this.id) && this.state.submissions) {
      const candidate = Object.keys(this.state.submissions).filter(id => id !== this.id)[0];
      if (candidate) { this.socket.emit('cah_vote', { code: this.code, winnerId: candidate }); this.actions += 1; }
    }
    if (phase === 'results' && this.state.host === this.id) {
      const key = `cah-next:${JSON.stringify(this.state.scores)}:${this.state.roundWinner}`;
      if (key !== this.lastActionKey) { this.lastActionKey = key; setTimeout(() => this.socket.emit('cah_next_round', { code: this.code }), 100); }
    }
  }
  actMonopoly() {
    const current = this.currentPlayer();
    if (!current || current.id !== this.id) return;
    const key = `mono:${this.state.phase}:${this.state.lastRoll?.dice?.join('-')}:${this.state.elapsedTime}:${this.state.pendingDecision?.spaceId}`;
    if (key === this.lastActionKey && Date.now() - this.lastActionAt < 1500) return;
    this.lastActionKey = key;
    this.lastActionAt = Date.now();
    if (this.state.phase === 'rolling') { this.socket.emit('monopoly_roll', { code: this.code }); this.actions += 1; }
    if (this.state.phase === 'property_decision') { this.socket.emit('monopoly_buy', { code: this.code }); this.actions += 1; }
  }
  startActionInputLoop() {
    const loop = setInterval(() => {
      if (this.stopped) return clearInterval(loop);
      if (!this.state || this.state.gameType !== 'action' || this.state.phase === 'finished') return;
      const players = this.state.playerStates || this.state.players || {};
      const me = players[this.id];
      if (!me || !me.alive) return;
      let dx = 0, dy = 0, interact = false, fire = false, angle = me.angle || 0;
      if ((this.state.actionMode || this.state.mode) === 'impostor') {
        const task = (this.state.tasks || []).find(t => !t.done) || (this.state.tasks || [])[0];
        if (task) {
          const vx = task.x - me.x, vy = task.y - me.y;
          const d = Math.hypot(vx, vy);
          angle = Math.atan2(vy, vx);
          if (d > 18) { dx = vx / d; dy = vy / d; } else { interact = true; }
        }
      } else {
        angle = 0; dx = Math.sin(Date.now() / 900) * 0.6; dy = Math.cos(Date.now() / 1200) * 0.6; fire = false;
      }
      this.socket.emit('action_input', { code: this.code, dx, dy, angle, fire, interact });
    }, 50);
  }
}
async function createRoom(url, gameType, options = {}, playerCount = 3) {
  const bots = Array.from({ length: playerCount }, (_, i) => new Bot(`${gameType}-${options.mode || options.unoMode || 'bot'}-${i+1}`, url));
  await Promise.all(bots.map(b => b.connect()));
  const createdP = once(bots[0].socket, 'room_created');
  bots[0].socket.emit('create_room', { name: bots[0].name, gameType: gameType === 'wild' ? 'cah' : gameType, unoMode: options.unoMode, pid: bots[0].pid });
  const created = await createdP;
  bots[0].code = created.code; bots[0].id = created.playerId;
  for (let i = 1; i < bots.length; i++) {
    const joinedP = once(bots[i].socket, 'room_joined');
    bots[i].socket.emit('join_room', { name: bots[i].name, code: created.code, pid: bots[i].pid });
    const joined = await joinedP; bots[i].code = joined.code; bots[i].id = joined.playerId;
  }
  if (gameType === 'action' && options.mode) bots[0].socket.emit('change_action_mode', { code: created.code, actionMode: options.mode });
  if (gameType === 'uno' && options.unoMode) bots[0].socket.emit('change_uno_mode', { code: created.code, unoMode: options.unoMode });
  await wait(150);
  const done = new Promise((resolve) => {
    let resolved = false;
    for (const b of bots) {
      b.socket.on('game_over', (payload) => { if (!resolved) { resolved = true; resolve({ payload, state: b.state }); } });
      b.socket.on('game_state', (s) => { if (!resolved && (s.phase === 'finished' || s.winner)) { resolved = true; resolve({ payload: { winner: s.winner }, state: s }); } });
    }
  });
  bots[0].socket.emit('start_game', { code: created.code });
  if (gameType === 'action') bots.forEach(b => b.startActionInputLoop());
  return { code: created.code, bots, done };
}
async function playOne(url, gameType, options = {}, timeoutMs = 120000) {
  const room = await createRoom(url, gameType, options, options.players || 3);
  const timeout = wait(timeoutMs).then(() => { throw new Error(`timeout completing ${gameType} ${JSON.stringify(options)} room=${room.code}`); });
  const result = await Promise.race([room.done, timeout]);
  await wait(300);
  const actions = room.bots.reduce((sum, b) => sum + b.actions, 0);
  room.bots.forEach(b => b.close());
  return { gameType, options, code: room.code, actions, result: result.payload, finalPhase: result.state?.phase, winner: result.payload?.winner || result.state?.winner || result.payload?.winnerName || null };
}
async function startServer(port) {
  const env = { ...process.env, PORT: String(port), UNO_HAND_SIZE: '3', UNO_TURN_LIMIT: '40', MONOPOLY_TIME_LIMIT_SECONDS: '6', CAH_MAX_ROUNDS: '3', ACTION_FIREFIGHT_TICKS: '60', ACTION_TASK_COUNT: '1', ACTION_TASK_TICKS: '2', ACTION_START_NEAR_TASK: '1', ACTIVITY_DATA_DIR: `/tmp/card-games-bot-suite-${Date.now()}` };
  const proc = spawn(process.execPath, ['server/index.js'], { cwd: REPO, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  proc.stdout.on('data', d => { logs += d.toString(); });
  proc.stderr.on('data', d => { logs += d.toString(); });
  for (let i = 0; i < 80; i++) { if (logs.includes('Server running on port')) return proc; if (proc.exitCode !== null) throw new Error(logs); await wait(100); }
  throw new Error('server did not start: ' + logs);
}
async function runSuite() {
  const port = Number(process.env.BOT_SUITE_PORT || 4321);
  const server = await startServer(port);
  const url = `http://127.0.0.1:${port}`;
  const plan = [
    ['uno', { unoMode: 'classic' }, 3], ['uno', { unoMode: 'classic' }, 3],
    ['uno', { unoMode: 'mercy' }, 3], ['uno', { unoMode: 'mercy' }, 3],
    ['wild', {}, 3], ['wild', {}, 3],
    ['monopoly', {}, 3], ['monopoly', {}, 3],
    ['action', { mode: 'impostor' }, 3], ['action', { mode: 'impostor' }, 3],
    ['action', { mode: 'firefight' }, 3], ['action', { mode: 'firefight' }, 3],
  ];
  const results = [];
  try {
    for (const [game, opts, players] of plan) {
      const r = await playOne(url, game, { ...opts, players }, 90000);
      results.push(r);
      console.log('BOT_GAME_OK', JSON.stringify(r));
    }
    return results;
  } finally {
    server.kill('SIGTERM');
  }
}
async function joinUnoRoom() {
  const code = (process.env.CODE || process.argv[3] || '').toUpperCase();
  if (!code) throw new Error('CODE required');
  const name = process.env.NAME || 'ImperatorAI';
  const bot = new Bot(name, process.env.URL || 'http://127.0.0.1:3001', code);
  await bot.connect();
  bot.socket.emit('join_room', { name, code, pid: bot.pid });
  bot.socket.on('game_over', payload => console.log('GAME_OVER', JSON.stringify(payload)));
  console.log(`JOINED_BOT_READY code=${code} name=${name} pid=${bot.pid}`);
}
(async () => {
  const cmd = process.argv[2] || 'suite';
  if (cmd === 'suite') {
    const results = await runSuite();
    console.log('BOT_SUITE_OK', JSON.stringify({ count: results.length, results }, null, 2));
  } else if (cmd === 'join-uno') {
    await joinUnoRoom();
    setInterval(() => {}, 1000);
  } else {
    throw new Error(`unknown command ${cmd}`);
  }
})().catch(err => { console.error(err.stack || err.message); process.exit(1); });
