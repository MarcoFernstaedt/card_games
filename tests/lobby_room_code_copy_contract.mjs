#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const lobbyPath = resolve('client/src/components/Lobby.jsx');
const src = readFileSync(lobbyPath, 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  }
}

assert(src.includes('navigator.clipboard.writeText(roomCode)'), 'room lobby copies roomCode to clipboard with one click');
assert(src.includes('Copy Code'), 'room lobby exposes an obvious Copy Code button');
assert(src.includes('Copied'), 'room lobby gives copied confirmation feedback');
assert(src.includes('aria-label={`Copy room code ${roomCode}`'), 'copy room code button is accessible and announces the code');
assert(src.includes('copy-room-code'), 'copy button has a stable class for styling/browser QA');

if (process.exitCode) process.exit(process.exitCode);
console.log('lobby room code copy contract OK');
