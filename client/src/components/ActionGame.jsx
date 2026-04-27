import { useEffect, useRef, useState, useCallback } from 'react';
import socket from '../socket';
import Confetti from './Confetti';

const MAP_W = 1280;
const MAP_H = 960;
const PLAYER_RADIUS = 14;
const BULLET_RADIUS = 4;

const WALLS = [
  { x: 0,    y: 0,    w: MAP_W, h: 20   },
  { x: 0,    y: MAP_H - 20, w: MAP_W, h: 20 },
  { x: 0,    y: 0,    w: 20,   h: MAP_H },
  { x: MAP_W - 20, y: 0, w: 20, h: MAP_H },
  { x: 200,  y: 100,  w: 20,   h: 260  },
  { x: 200,  y: 500,  w: 20,   h: 200  },
  { x: 450,  y: 200,  w: 300,  h: 20   },
  { x: 450,  y: 200,  w: 20,   h: 200  },
  { x: 730,  y: 200,  w: 20,   h: 200  },
  { x: 450,  y: 600,  w: 300,  h: 20   },
  { x: 450,  y: 600,  w: 20,   h: 200  },
  { x: 730,  y: 600,  w: 20,   h: 200  },
  { x: 1000, y: 100,  w: 20,   h: 260  },
  { x: 1000, y: 500,  w: 20,   h: 200  },
  { x: 200,  y: 380,  w: 160,  h: 20   },
  { x: 900,  y: 380,  w: 160,  h: 20   },
];

const PLAYER_COLORS = ['#7c6bff','#e94560','#00c896','#ffab00','#00b4ff','#ff6b6b'];

function drawScene(ctx, state, myId, myRole, canvasW, canvasH) {
  if (!state) return;

  const me = state.players?.[myId];
  if (!me) return;

  // Camera follows local player
  const camX = me.x - canvasW / 2;
  const camY = me.y - canvasH / 2;

  ctx.clearRect(0, 0, canvasW, canvasH);

  ctx.save();
  ctx.translate(-camX, -camY);

  // Floor
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(20, 20, MAP_W - 40, MAP_H - 40);

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  for (let x = 20; x < MAP_W; x += 80) {
    ctx.beginPath(); ctx.moveTo(x, 20); ctx.lineTo(x, MAP_H - 20); ctx.stroke();
  }
  for (let y = 20; y < MAP_H; y += 80) {
    ctx.beginPath(); ctx.moveTo(20, y); ctx.lineTo(MAP_W - 20, y); ctx.stroke();
  }

  // Walls
  ctx.fillStyle = '#2a2a4a';
  for (const w of WALLS) {
    ctx.fillRect(w.x, w.y, w.w, w.h);
    ctx.strokeStyle = '#3a3a6a';
    ctx.lineWidth = 1;
    ctx.strokeRect(w.x, w.y, w.w, w.h);
  }

  // Tasks (impostor mode)
  if (state.tasks) {
    for (const task of state.tasks) {
      ctx.save();
      ctx.globalAlpha = task.done ? 0.3 : 1;
      ctx.strokeStyle = task.done ? '#00c896' : '#ffab00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(task.x, task.y, 18, 0, Math.PI * 2);
      ctx.stroke();
      if (!task.done && task.progress > 0) {
        ctx.strokeStyle = '#00c896';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(task.x, task.y, 18, -Math.PI / 2, -Math.PI / 2 + task.progress * Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = task.done ? '#00c896' : '#ffab00';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(task.done ? '✓' : '!', task.x, task.y);
      ctx.restore();
    }
  }

  // Pickups (firefight mode)
  if (state.pickups) {
    for (const pickup of state.pickups) {
      if (!pickup.active) continue;
      ctx.save();
      ctx.fillStyle = pickup.type === 'shotgun' ? '#ff6b6b' : '#ffab00';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pickup.type === 'shotgun' ? '🔫' : '🗡', pickup.x, pickup.y);
      ctx.restore();
    }
  }

  // Bullets
  if (state.bullets) {
    ctx.fillStyle = '#ffff88';
    for (const b of state.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, BULLET_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Players
  const playerList = Object.entries(state.players || {});
  playerList.forEach(([pid, ps], i) => {
    if (!ps.alive) return;

    const isMe = pid === myId;
    const color = PLAYER_COLORS[i % PLAYER_COLORS.length];

    // Shadow / glow for self
    if (isMe) {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
    }

    // Player body
    ctx.beginPath();
    ctx.arc(ps.x, ps.y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = isMe ? '#fff' : 'rgba(255,255,255,0.4)';
    ctx.lineWidth = isMe ? 2.5 : 1.5;
    ctx.stroke();

    if (isMe) ctx.restore();

    // Direction indicator (gun barrel)
    ctx.save();
    ctx.translate(ps.x, ps.y);
    ctx.rotate(ps.angle);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(PLAYER_RADIUS - 2, -3, 10, 6);
    ctx.restore();

    // HP bar above player
    const hpW = 28;
    const hpH = 4;
    const hpX = ps.x - hpW / 2;
    const hpY = ps.y - PLAYER_RADIUS - 10;
    ctx.fillStyle = '#111';
    ctx.fillRect(hpX, hpY, hpW, hpH);
    ctx.fillStyle = ps.hp > 50 ? '#00c896' : ps.hp > 25 ? '#ffab00' : '#e94560';
    ctx.fillRect(hpX, hpY, (ps.hp / 100) * hpW, hpH);

    // Name label
    const pName = state.playerNames?.[pid] || pid.slice(0, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `bold ${isMe ? 11 : 10}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(pName, ps.x, ps.y - PLAYER_RADIUS - 17);

    // Role badge (impostor sees their own role)
    if (isMe && myRole === 'impostor') {
      ctx.fillStyle = '#e94560';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText('IMPOSTOR', ps.x, ps.y + PLAYER_RADIUS + 10);
    }
  });

  ctx.restore();
}

export default function ActionGame({ gameState, playerId, roomCode, isHost }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const keysRef = useRef({});
  const mouseRef = useRef({ x: 0, y: 0, fire: false });
  const touchRef = useRef({ dx: 0, dy: 0, firing: false });
  const animRef = useRef(null);
  const inputIntervalRef = useRef(null);
  const [myRole, setMyRole] = useState(null);
  const [roleModal, setRoleModal] = useState(null);
  const [hitFlash, setHitFlash] = useState(0);
  const [killFeed, setKillFeed] = useState([]);
  const [respawnCountdown, setRespawnCountdown] = useState(0);
  const respawnRef = useRef(null);

  // Receive role reveal
  useEffect(() => {
    function onRole({ role }) {
      setMyRole(role);
      setRoleModal(role);
      setTimeout(() => setRoleModal(null), 3000);
    }
    function onHit({ targetId, damage, hp }) {
      if (targetId === playerId) {
        setHitFlash(1);
        setTimeout(() => setHitFlash(0), 150);
      }
    }
    function onKilled({ killerName, victimId }) {
      setKillFeed(f => [...f.slice(-4), { killerName, victimId, ts: Date.now() }]);
    }
    function onActionState(snap) {
      // Preserve player names across streaming updates
      snap.playerNames = stateRef.current?.playerNames || {};
      stateRef.current = snap;
    }
    socket.on('action_role', onRole);
    socket.on('action_hit', onHit);
    socket.on('action_killed', onKilled);
    socket.on('action_state', onActionState);
    return () => {
      socket.off('action_role', onRole);
      socket.off('action_hit', onHit);
      socket.off('action_killed', onKilled);
      socket.off('action_state', onActionState);
    };
  }, [playerId]);

  // Sync gameState into stateRef when it arrives via game_state (initial state)
  useEffect(() => {
    if (gameState && gameState.gameType === 'action') {
      const nameMap = {};
      for (const p of (gameState.players || [])) nameMap[p.id] = p.name;
      const snap = {
        players: gameState.playerStates || {},
        bullets: gameState.bullets || [],
        tasks: gameState.tasks || [],
        pickups: gameState.pickups || [],
        completedTasks: gameState.completedTasks || 0,
        totalTasks: gameState.totalTasks || 0,
        timeRemaining: gameState.timeRemaining,
        mode: gameState.mode || gameState.actionMode,
        playerNames: nameMap,
      };
      stateRef.current = snap;
    }
  }, [gameState]);

  // Respawn countdown
  useEffect(() => {
    if (respawnRef.current) clearInterval(respawnRef.current);
    respawnRef.current = setInterval(() => {
      const ps = stateRef.current?.players?.[playerId];
      if (ps && !ps.alive && ps.respawnIn > 0) {
        setRespawnCountdown(Math.ceil(ps.respawnIn / 20));
      } else {
        setRespawnCountdown(0);
      }
    }, 100);
    return () => clearInterval(respawnRef.current);
  }, [playerId]);

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    function renderLoop() {
      drawScene(ctx, stateRef.current, playerId, myRole, canvas.width, canvas.height);
      animRef.current = requestAnimationFrame(renderLoop);
    }
    animRef.current = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [playerId, myRole]);

  // Input sending at 20 Hz
  useEffect(() => {
    const canvas = canvasRef.current;

    function getAimAngle() {
      const snap = stateRef.current;
      const me = snap?.players?.[playerId];
      if (!me) return 0;
      const rect = canvas?.getBoundingClientRect();
      if (!rect) return 0;
      const scaleX = MAP_W / rect.width;
      const scaleY = MAP_H / rect.height;
      const camX = me.x - (rect.width / 2);
      const camY = me.y - (rect.height / 2);
      const mx = (mouseRef.current.x - rect.left) * scaleX + camX;
      const my = (mouseRef.current.y - rect.top) * scaleY + camY;
      return Math.atan2(my - me.y, mx - me.x);
    }

    inputIntervalRef.current = setInterval(() => {
      const keys = keysRef.current;
      const touch = touchRef.current;
      let dx = 0, dy = 0;
      // Keyboard
      if (keys['w'] || keys['arrowup'])    dy -= 1;
      if (keys['s'] || keys['arrowdown'])  dy += 1;
      if (keys['a'] || keys['arrowleft'])  dx -= 1;
      if (keys['d'] || keys['arrowright']) dx += 1;
      // Touch joystick overrides keyboard
      if (Math.abs(touch.dx) > 0.05 || Math.abs(touch.dy) > 0.05) {
        dx = touch.dx;
        dy = touch.dy;
      }
      const interact = keys['e'] || keys['f'] || touch.interact || false;
      const fire = keys[' '] || mouseRef.current.fire || touch.firing;
      const angle = getAimAngle();
      socket.emit('action_input', { code: roomCode, dx, dy, angle, fire, interact });
    }, 50);

    // Keyboard
    function onKeyDown(e) {
      keysRef.current[e.key.toLowerCase()] = true;
      if (e.key === ' ') e.preventDefault();
    }
    function onKeyUp(e) {
      keysRef.current[e.key.toLowerCase()] = false;
    }
    // Mouse aim
    function onMouseMove(e) {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
    }
    function onMouseDown(e) {
      if (e.button === 0) mouseRef.current.fire = true;
    }
    function onMouseUp(e) {
      if (e.button === 0) mouseRef.current.fire = false;
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      clearInterval(inputIntervalRef.current);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [roomCode, playerId]);

  // Touch joystick tracking
  const joystickOriginRef = useRef(null);

  function onJoystickStart(e) {
    e.preventDefault();
    const t = e.touches[0];
    joystickOriginRef.current = { x: t.clientX, y: t.clientY };
  }
  function onJoystickMove(e) {
    e.preventDefault();
    if (!joystickOriginRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - joystickOriginRef.current.x;
    const dy = t.clientY - joystickOriginRef.current.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const maxLen = 50;
    touchRef.current.dx = len > maxLen ? dx / len : dx / maxLen;
    touchRef.current.dy = len > maxLen ? dy / len : dy / maxLen;
  }
  function onJoystickEnd(e) {
    touchRef.current.dx = 0;
    touchRef.current.dy = 0;
    joystickOriginRef.current = null;
  }

  const snap = stateRef.current;
  const myPs = snap?.players?.[playerId];
  const modeLabel = gameState?.actionMode === 'firefight' ? 'Firefight' : 'Impostor Showdown';

  // Kill feed cleanup
  useEffect(() => {
    const t = setInterval(() => {
      setKillFeed(f => f.filter(k => Date.now() - k.ts < 5000));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0d0d1a', overflow: 'hidden', userSelect: 'none' }}>
      {/* Hit flash overlay */}
      {hitFlash > 0 && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(233,69,96,0.35)',
          pointerEvents: 'none', zIndex: 10,
        }} />
      )}

      {/* Role reveal modal */}
      {roleModal && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 50, background: 'rgba(0,0,0,0.7)',
        }}>
          <div style={{
            background: roleModal === 'impostor' ? '#e94560' : '#7c6bff',
            borderRadius: 16, padding: '32px 48px', textAlign: 'center',
            animation: 'fadeIn 0.4s ease',
          }}>
            <div style={{ fontSize: '3rem', marginBottom: 8 }}>
              {roleModal === 'impostor' ? '🔪' : '🛸'}
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fff' }}>
              {roleModal === 'impostor' ? 'You are the IMPOSTOR!' : 'You are a CREWMATE!'}
            </div>
            <div style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>
              {roleModal === 'impostor' ? 'Eliminate all crewmates!' : 'Complete tasks or eliminate the impostor!'}
            </div>
          </div>
        </div>
      )}

      {/* Death screen */}
      {myPs && !myPs.alive && respawnCountdown > 0 && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 20, pointerEvents: 'none',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', color: 'var(--accent2)', fontWeight: 900 }}>YOU DIED</div>
            <div style={{ fontSize: '1.2rem', color: 'var(--muted)', marginTop: 8 }}>
              Respawning in {respawnCountdown}s...
            </div>
          </div>
        </div>
      )}

      {/* Canvas */}
      <canvas ref={canvasRef} style={{ display: 'block', touchAction: 'none' }} />

      {/* HUD overlay */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}>
        {/* Top bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          background: 'rgba(13,13,26,0.85)', backdropFilter: 'blur(4px)',
          padding: '6px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>{modeLabel}</span>
          {gameState?.actionMode === 'firefight' && snap?.timeRemaining != null && (
            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: snap.timeRemaining < 60 ? '#e94560' : '#fff' }}>
              {Math.floor(snap.timeRemaining / 60)}:{String(snap.timeRemaining % 60).padStart(2, '0')}
            </span>
          )}
          {gameState?.actionMode === 'impostor' && (
            <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
              Tasks: {snap?.completedTasks || 0}/{snap?.totalTasks || 5}
            </span>
          )}
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{roomCode}</span>
        </div>

        {/* HP & ammo bar */}
        <div style={{
          position: 'absolute', bottom: 100, left: 14,
          background: 'rgba(13,13,26,0.85)', borderRadius: 10,
          padding: '8px 14px', minWidth: 120,
        }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 4 }}>HP</div>
          <div style={{ background: '#111', borderRadius: 4, height: 8, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{
              height: '100%', borderRadius: 4,
              width: `${myPs?.hp || 0}%`,
              background: (myPs?.hp || 0) > 50 ? '#00c896' : (myPs?.hp || 0) > 25 ? '#ffab00' : '#e94560',
              transition: 'width 0.1s',
            }} />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
            {myPs?.weapon || 'pistol'} — {myPs?.ammo ?? 0} ammo
          </div>
          {myPs?.kills != null && (
            <div style={{ fontSize: '0.75rem', color: '#ffab00', marginTop: 2 }}>
              Kills: {myPs.kills} | Deaths: {myPs.deaths}
            </div>
          )}
        </div>

        {/* Kill feed */}
        {killFeed.length > 0 && (
          <div style={{
            position: 'absolute', top: 50, right: 14,
            display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 200,
          }}>
            {killFeed.map((k, i) => (
              <div key={i} style={{
                background: 'rgba(13,13,26,0.85)', borderRadius: 6,
                padding: '4px 10px', fontSize: '0.75rem',
              }}>
                <span style={{ color: '#e94560' }}>{k.killerName}</span>
                <span style={{ color: 'var(--muted)' }}> eliminated </span>
                <span style={{ color: '#fff' }}>{k.victimId === playerId ? 'YOU' : k.victimId?.slice(0, 6)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Firefight scoreboard */}
        {gameState?.actionMode === 'firefight' && snap?.players && (
          <div style={{
            position: 'absolute', top: 50, left: 14,
            background: 'rgba(13,13,26,0.85)', borderRadius: 10, padding: '8px 12px',
          }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginBottom: 4, fontWeight: 700 }}>SCOREBOARD</div>
            {Object.entries(snap.players)
              .sort(([, a], [, b]) => b.kills - a.kills)
              .map(([pid, ps], i) => {
                const pName = snap.playerNames?.[pid] || pid.slice(0, 6);
                return (
                  <div key={pid} style={{
                    display: 'flex', gap: 8, alignItems: 'center',
                    fontSize: '0.75rem', padding: '2px 0',
                    color: pid === playerId ? '#ffab00' : 'var(--text)',
                    fontWeight: pid === playerId ? 700 : 400,
                  }}>
                    <span style={{ color: 'var(--muted)', width: 14 }}>#{i + 1}</span>
                    <span style={{ flex: 1 }}>{pName}</span>
                    <span style={{ color: '#00c896' }}>{ps.kills}K</span>
                    <span style={{ color: 'var(--muted)', fontSize: '0.7rem' }}>{ps.deaths}D</span>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Mobile controls */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        height: 100, display: 'flex', pointerEvents: 'auto', zIndex: 10,
      }}>
        {/* Left: Joystick */}
        <div
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(13,13,26,0.7)',
            touchAction: 'none',
          }}
          onTouchStart={onJoystickStart}
          onTouchMove={onJoystickMove}
          onTouchEnd={onJoystickEnd}
        >
          <div style={{
            width: 60, height: 60, borderRadius: '50%',
            border: '2px solid rgba(124,107,255,0.5)',
            background: 'rgba(124,107,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(124,107,255,0.6)', fontSize: '0.7rem',
          }}>
            MOVE
          </div>
        </div>

        {/* Right: Fire + Interact */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 16, background: 'rgba(13,13,26,0.7)',
        }}>
          <button
            style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'rgba(233,69,96,0.8)', border: 'none',
              fontSize: '1.4rem', color: '#fff', cursor: 'pointer',
              touchAction: 'none',
            }}
            onTouchStart={e => { e.preventDefault(); touchRef.current.firing = true; }}
            onTouchEnd={e => { e.preventDefault(); touchRef.current.firing = false; }}
          >
            🔫
          </button>
          <button
            style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'rgba(124,107,255,0.8)', border: 'none',
              fontSize: '1.2rem', color: '#fff', cursor: 'pointer',
              touchAction: 'none',
            }}
            onTouchStart={e => { e.preventDefault(); touchRef.current.interact = true; }}
            onTouchEnd={e => { e.preventDefault(); touchRef.current.interact = false; }}
          >
            E
          </button>
        </div>
      </div>
    </div>
  );
}
