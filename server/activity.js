const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.ACTIVITY_DATA_DIR || path.join(__dirname, 'data');
const STATE_PATH = path.join(DATA_DIR, 'activity-state.json');
const LOG_PATH = path.join(DATA_DIR, 'activity-events.jsonl');
const DEFAULT_RECENT_WINDOW_MS = 30 * 60 * 1000;
const MAX_RECENT_EVENTS = 200;

const MEANINGFUL_PLAY_EVENTS = new Set([
  'socket_connection',
  'room_created',
  'room_joined',
  'game_started',
  'player_rejoined',
  'player_disconnected',
]);

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function emptyState() {
  return {
    version: 1,
    firstSeenAt: null,
    lastSeenAt: null,
    lastPageHitAt: null,
    lastMeaningfulPlayAt: null,
    counters: {},
    recentEvents: [],
  };
}

function readState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return { ...emptyState(), ...parsed, counters: parsed.counters || {}, recentEvents: parsed.recentEvents || [] };
  } catch (err) {
    return emptyState();
  }
}

function writeState(state) {
  ensureDataDir();
  const tmp = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE_PATH);
}

function safeEvent(event) {
  const allowed = {
    at: event.at,
    type: event.type,
    gameType: event.gameType || null,
    playerCount: Number.isFinite(event.playerCount) ? event.playerCount : null,
    roomCount: Number.isFinite(event.roomCount) ? event.roomCount : null,
    activeSockets: Number.isFinite(event.activeSockets) ? event.activeSockets : null,
    path: event.path || null,
  };
  return Object.fromEntries(Object.entries(allowed).filter(([, value]) => value !== null && value !== undefined));
}

function recordActivity(type, details = {}) {
  const now = new Date().toISOString();
  const event = safeEvent({ at: now, type, ...details });
  const state = readState();

  if (!state.firstSeenAt) state.firstSeenAt = now;
  state.lastSeenAt = now;
  if (type === 'page_hit') state.lastPageHitAt = now;
  if (MEANINGFUL_PLAY_EVENTS.has(type)) state.lastMeaningfulPlayAt = now;
  state.counters[type] = (state.counters[type] || 0) + 1;
  state.recentEvents = [event, ...state.recentEvents].slice(0, MAX_RECENT_EVENTS);

  ensureDataDir();
  fs.appendFileSync(LOG_PATH, `${JSON.stringify(event)}\n`);
  writeState(state);
  return event;
}

function redactRoom(room) {
  return {
    gameType: room.gameType,
    phase: room.gameState ? 'playing' : 'lobby',
    playerCount: Array.isArray(room.players) ? room.players.length : 0,
  };
}

function activityReport(rooms = {}, options = {}) {
  const nowMs = Date.now();
  const windowMs = options.windowMs || DEFAULT_RECENT_WINDOW_MS;
  const sinceMs = nowMs - windowMs;
  const state = readState();
  const activeRooms = Object.values(rooms || {});
  const recentEvents = (state.recentEvents || []).filter(event => Date.parse(event.at) >= sinceMs);
  const recentMeaningfulEvents = recentEvents.filter(event => MEANINGFUL_PLAY_EVENTS.has(event.type));
  const activePlayers = activeRooms.reduce((sum, room) => sum + (Array.isArray(room.players) ? room.players.length : 0), 0);
  const activeStartedGames = activeRooms.filter(room => room.gameState).length;

  return {
    ok: true,
    checked_at: new Date(nowMs).toISOString(),
    window_minutes: Math.round(windowMs / 60000),
    played_recently: Boolean(recentMeaningfulEvents.length || activePlayers > 0 || activeStartedGames > 0),
    last_meaningful_play_at: state.lastMeaningfulPlayAt,
    last_page_hit_at: state.lastPageHitAt,
    active: {
      rooms: activeRooms.length,
      players: activePlayers,
      started_games: activeStartedGames,
      lobbies: activeRooms.filter(room => !room.gameState).length,
      sockets: options.activeSockets || 0,
    },
    counters_total: state.counters || {},
    counters_recent: recentEvents.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {}),
    recent_events: recentEvents.slice(0, 25),
    active_room_summaries: activeRooms.map(redactRoom),
    state_file: STATE_PATH,
    log_file: LOG_PATH,
    privacy: 'No names, player ids, IPs, user agents, or message/card text are stored or returned.',
  };
}

function shouldTrackPageHit(req) {
  if (req.method !== 'GET') return false;
  if (req.path === '/activity' || req.path.startsWith('/socket.io')) return false;
  return req.path === '/' || req.path.endsWith('.html');
}

module.exports = {
  activityReport,
  recordActivity,
  shouldTrackPageHit,
  STATE_PATH,
  LOG_PATH,
};
