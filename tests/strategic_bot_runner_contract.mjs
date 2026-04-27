#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const scriptPath = resolve('scripts/strategic_game_bots.js');
const src = readFileSync(scriptPath, 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  }
}

assert(src.includes('async function joinUnoRoomBots'), 'runner exposes multi-bot supplied-room join function');
assert(src.includes('BOT_COUNT') || src.includes('COUNT'), 'runner accepts BOT_COUNT/COUNT for multiple supplied-room bots');
assert(src.includes('Promise.all(joinedBots.map'), 'runner waits for every supplied-room bot join confirmation');
assert(src.includes('JOINED_ROOM'), 'runner logs JOINED_ROOM only after room_joined confirmation');
assert(!src.includes('console.log(`JOINED_BOT_READY'), 'runner must not print ready before confirmed room_joined');
assert(src.includes('process.env.URL || DEFAULT_URL'), 'join command uses DEFAULT_URL/CARD_GAMES_URL fallback, not hardcoded local URL only');
assert(src.includes('NAME_PREFIX') || src.includes('baseName'), 'runner supports predictable multi-bot names from one base name');
assert(src.includes('BOT_NAME_POOL'), 'runner has a varied default bot name pool');
assert(src.includes('DEFAULT_BOT_NAMES'), 'runner exposes varied default bot names');
assert(!src.includes("'ImperatorAI'"), 'default bot names must not include AI suffix');
assert(!src.includes('ImperatorAI1'), 'multi-bot defaults must not produce ImperatorAI1 style names');
assert(src.includes('hasJoinedRoom'), 'runner tracks confirmed joins before attempting reconnect/rejoin');
assert(src.includes('if (this.hasJoinedRoom && this.code && this.id)'), 'runner does not emit rejoin_room before first confirmed join');

if (process.exitCode) process.exit(process.exitCode);
console.log('strategic bot runner contract OK');
