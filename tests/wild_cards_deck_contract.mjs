import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire(import.meta.url);
const { blackCards, whiteCards, sourceNote } = require(path.join(root, 'server/cards/cahCards.js'));
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

assert(sourceNote && /Cards Against Humanity/i.test(sourceNote), 'Wild Cards deck must identify Cards Against Humanity as source');
assert(blackCards.length >= 75, `expected at least 75 actual CAH black cards, got ${blackCards.length}`);
assert(whiteCards.length >= 300, `expected at least 300 actual CAH white cards, got ${whiteCards.length}`);

const blackTexts = new Set(blackCards.map((card) => card.text));
const whiteTexts = new Set(whiteCards.map((card) => card.text));
for (const prompt of [
  "Why can't I sleep at night?",
  "What's that smell?",
  'What ended my last relationship?',
  'I drink to forget ___.',
  'Next from J.K. Rowling: Harry Potter and the Chamber of ___.',
]) assert(blackTexts.has(prompt), `missing actual CAH black card: ${prompt}`);

for (const answer of [
  'A tiny horse.',
  'Bees?',
  'Being on fire.',
  'The Big Bang.',
  'A balanced breakfast.',
  'The clitoris.',
]) assert(whiteTexts.has(answer), `missing actual CAH white card: ${answer}`);

assert(blackCards.every((card) => /^cah_black_/.test(card.id)), 'black card IDs should be namespaced as cah_black_*');
assert(whiteCards.every((card) => /^cah_white_/.test(card.id)), 'white card IDs should be namespaced as cah_white_*');
assert(blackCards.every((card) => Number.isInteger(card.pick) && card.pick >= 1), 'every black card must declare pick count');

const createCard = read('client/src/components/CreateCard.jsx');
const cahUi = read('client/src/components/CahGame.jsx');
const serverCah = read('server/games/cah.js');
assert(cahUi.includes('Create a Custom Card'), 'Wild Cards UI must show a create-card option');
assert(createCard.includes('textarea') && createCard.includes('Add to Deck'), 'custom card creator must provide text input and add action');
assert(serverCah.includes('addCustomCard'), 'server must keep addCustomCard flow');

console.log('wild cards deck contract OK');
