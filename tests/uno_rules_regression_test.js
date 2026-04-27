const assert = require('assert');
const { playCard, drawCard } = require('../server/games/uno');

function card(id, color, value) { return { id, color, value }; }
function players() { return [{ id: 'p1', name: 'Marco' }, { id: 'p2', name: 'Imperator' }]; }
function baseState(unoMode = 'mercy') {
  return {
    deck: [card('d1', 'red', '1'), card('d2', 'blue', '2'), card('d3', 'green', '3'), card('d4', 'yellow', '4'), card('d5', 'red', '5'), card('d6', 'blue', '6')],
    discardPile: [card('top', 'red', '7')],
    hands: {
      p1: [card('p1-plus2', 'red', 'draw_two'), card('p1-extra', 'green', '5')],
      p2: [card('p2-plain', 'blue', '9')],
    },
    currentPlayerIndex: 0,
    direction: 1,
    currentColor: 'red',
    winner: null,
    unoMode,
    drawStack: 0,
    pendingDrawType: null,
    mercyVotes: {},
    mercyVoteTarget: null,
    turns: 0,
    turnLimit: null,
  };
}

(function mercyDrawTwoTargetsNextPlayer() {
  const ps = players();
  const gs = baseState('mercy');
  const result = playCard(gs, 0, 0, undefined, ps);
  assert.strictEqual(result.error, undefined);
  assert.strictEqual(gs.drawStack, 2, 'Mercy +2 should create a stack');
  assert.strictEqual(gs.pendingDrawType, 'draw_two');
  assert.strictEqual(gs.currentPlayerIndex, 1, 'Mercy +2 must make the next player decide to stack or draw');
  assert.strictEqual(gs.hands.p1.length, 1, 'the +2 player should not immediately receive cards');
  assert.strictEqual(gs.hands.p2.length, 1, 'next player should not receive cards until they draw the stack');

  const drawResult = drawCard(gs, 1, ps);
  assert.strictEqual(drawResult.error, undefined);
  assert.strictEqual(drawResult.absorbed, 2);
  assert.strictEqual(gs.hands.p1.length, 1, 'the +2 player must not receive their own penalty');
  assert.strictEqual(gs.hands.p2.length, 3, 'the next player should absorb the +2 stack');
  assert.strictEqual(gs.currentPlayerIndex, 0, 'after absorbing stack, turn advances once');
})();

(function classicDrawTwoStillHitsNextPlayerAndSkips() {
  const ps = players();
  const gs = baseState('classic');
  const result = playCard(gs, 0, 0, undefined, ps);
  assert.strictEqual(result.error, undefined);
  assert.strictEqual(gs.hands.p1.length, 1, 'classic +2 player should not draw their own cards');
  assert.strictEqual(gs.hands.p2.length, 3, 'classic +2 immediately gives next player two cards');
  assert.strictEqual(gs.currentPlayerIndex, 0, 'classic +2 skips next player in a two-player game');
})();

(function mercyWildDrawFourTargetsNextPlayer() {
  const ps = players();
  const gs = baseState('mercy');
  gs.hands.p1 = [card('p1-plus4', 'wild', 'wild_draw_four'), card('p1-extra', 'green', '5')];
  const result = playCard(gs, 0, 0, 'blue', ps);
  assert.strictEqual(result.error, undefined);
  assert.strictEqual(gs.drawStack, 4);
  assert.strictEqual(gs.pendingDrawType, 'wild_draw_four');
  assert.strictEqual(gs.currentPlayerIndex, 1, 'Mercy +4 must make next player draw/stack');
  drawCard(gs, 1, ps);
  assert.strictEqual(gs.hands.p1.length, 1, 'the +4 player must not receive their own penalty');
  assert.strictEqual(gs.hands.p2.length, 5, 'next player should absorb +4 stack');
})();

console.log('uno rules regression OK');
