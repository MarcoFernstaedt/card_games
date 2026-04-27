#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve('client/src/components/UnoGame.jsx'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  }
}

assert(src.includes('aria-label={drawPileLabel}'), 'draw pile exposes an accessible dynamic draw label');
assert(src.includes('data-testid="uno-draw-pile"'), 'draw pile has a stable test id for browser/component QA');
assert(src.includes('onClick={isMyTurn ? handleDraw : undefined}'), 'draw pile click handles both normal draws and Mercy stacked draws when it is your turn');
assert(!src.includes('!(isMercyMode && drawStack > 0) ? handleDraw'), 'draw pile must not be disabled during Mercy draw stack turns');
assert(!src.includes('>\n              Draw {drawStack}\n            </button>'), 'standalone top Draw stack button should be removed; draw by clicking deck');
assert(src.includes('Tap deck to draw') || src.includes('Tap to draw'), 'Mercy draw-stack prompt tells users to click/tap the deck');

if (process.exitCode) process.exit(process.exitCode);
console.log('uno draw pile UX contract OK');
