const assert = require('assert');
const { createGameState, submitResponse, voteForWinner } = require('../server/games/cah');

const players = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
  { id: 'p3', name: 'Cara' },
];

const gs = createGameState(players);
assert.strictEqual(gs.phase, 'playing');

for (const player of players) {
  const result = submitResponse(gs, player.id, [0], players);
  assert.ifError(result.error);
}

assert.strictEqual(gs.phase, 'judging', 'all players submitting should move to voting/judging');
assert.deepStrictEqual(Object.keys(gs.submissions).sort(), ['p1', 'p2', 'p3']);

const selfVote = voteForWinner(gs, 'p1', 'p1', players);
assert.strictEqual(selfVote.error, 'You cannot vote for your own answer');
assert.deepStrictEqual(gs.votes, {}, 'self vote must not be recorded');

let r = voteForWinner(gs, 'p1', 'p2', players);
assert.ifError(r.error);
assert.strictEqual(r.allVoted, false);
assert.strictEqual(gs.phase, 'judging');

r = voteForWinner(gs, 'p2', 'p3', players);
assert.ifError(r.error);
assert.strictEqual(r.allVoted, false);
assert.strictEqual(gs.phase, 'judging');

r = voteForWinner(gs, 'p3', 'p2', players);
assert.ifError(r.error);
assert.strictEqual(r.allVoted, true);
assert.strictEqual(gs.phase, 'results');
assert.strictEqual(gs.roundWinner, 'p2');
assert.strictEqual(gs.scores.p2, 1);
assert.deepStrictEqual(gs.votes, { p1: 'p2', p2: 'p3', p3: 'p2' });

console.log('wild cards no-judge voting test OK');
