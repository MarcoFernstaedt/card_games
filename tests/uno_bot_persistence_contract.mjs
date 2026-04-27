#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const server = readFileSync(resolve('server/index.js'), 'utf8');
const bots = readFileSync(resolve('scripts/strategic_game_bots.js'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  }
}

assert(server.includes('ACTIVE_GAME_RECONNECT_GRACE_MS'), 'server should give active games a longer reconnect grace so agents do not vanish during temporary host drops');
assert(server.includes('RECONNECT_GRACE_MS'), 'server should keep reconnect grace configurable for tests and live tuning');
assert(server.includes('const graceMs = room.gameState ? ACTIVE_GAME_RECONNECT_GRACE_MS : RECONNECT_GRACE_MS'), 'active game disconnects should use active-game grace');
assert(bots.includes("socket.on('player_disconnected'"), 'supplied-room bots should log player disconnects for live debugging');
assert(bots.includes("socket.on('player_rejoined'"), 'supplied-room bots should log player rejoins for live debugging');
assert(bots.includes('BOT_STILL_CONNECTED'), 'supplied-room bots should emit heartbeat proof while staying in room');

if (process.exitCode) process.exit(process.exitCode);
console.log('uno bot persistence contract OK');
