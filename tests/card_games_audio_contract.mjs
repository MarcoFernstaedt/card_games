import fs from 'fs';
import path from 'path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const announcer = read('client/src/hooks/useGameAnnouncer.js');
assert(announcer.includes('speechSynthesis'), 'shared announcer must use browser speechSynthesis');
assert(announcer.includes('rate'), 'shared announcer must support faster speech rate');
assert(announcer.includes('useAudioTurnAnnouncement'), 'shared announcer must export turn announcement hook');
assert(announcer.includes('useAudioTimeWarnings'), 'shared announcer must export time warning hook');
assert(announcer.includes('Audio narration unavailable'), 'announcer must fail gracefully when speech is unavailable');

const cah = read('client/src/components/CahGame.jsx');
assert(cah.includes('useGameAnnouncer'), 'Wild Cards must use shared announcer');
assert(cah.includes('Player pick'), 'Wild Cards must narrate each player pick one at a time');
assert(cah.includes('Voting phase'), 'Wild Cards must call the old judging phase voting phase');
assert(cah.includes('Everyone vote'), 'Wild Cards must announce everyone voting');
assert(!cah.includes('👑'), 'Wild Cards UI must not show a judge/czar crown');
assert(!cah.includes('czarId'), 'Wild Cards UI must not depend on czarId');

const serverCah = read('server/games/cah.js');
const serverIndex = read('server/index.js');
assert(serverCah.includes('voteForWinner'), 'server must keep all-player voteForWinner flow');
assert(serverCah.includes('You cannot vote for your own answer'), 'server must reject self-votes');
assert(serverCah.includes('allVoted'), 'server must finish only after all submitters vote');
assert(!serverCah.includes('czarIndex'), 'server game state must not keep a rotating judge/czar');
assert(!serverCah.includes('czarPick'), 'server must not expose judge/czar pick logic');
assert(!serverIndex.includes('cah_czar_pick'), 'socket server must not expose host force-pick judge event');
assert(!serverIndex.includes('czarId'), 'public Wild Cards state must not expose a czar/judge id');

for (const file of ['UnoGame.jsx', 'MonopolyGame.jsx', 'ActionGame.jsx']) {
  const src = read(`client/src/components/${file}`);
  assert(src.includes('useAudioTurnAnnouncement') || file === 'ActionGame.jsx', `${file} must announce current turn when turn-based`);
  assert(src.includes('useAudioTimeWarnings'), `${file} must warn when time is running out`);
}

console.log('card games audio contract OK');
