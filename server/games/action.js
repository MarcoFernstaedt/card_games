// Action game server logic — 20 Hz server-authoritative game loop
// Top-down 2D shooter: Impostor Showdown + Firefight modes

const MAP_W = 1280;
const MAP_H = 960;
const PLAYER_RADIUS = 14;
const BULLET_SPEED = 18;
const BULLET_RADIUS = 4;
const BULLET_DAMAGE = { pistol: 25, shotgun: 50, machinegun: 15 };
const WEAPON_AMMO = { pistol: 12, shotgun: 6, machinegun: 24 };
const PLAYER_SPEED = 3.5;
const TASK_RADIUS = 24;
const PICKUP_RADIUS = 20;
const RESPAWN_TICKS = 100; // 5s at 20 Hz

// Simple rectangular wall map (x, y, w, h)
const WALLS = [
  // Border walls
  { x: 0,    y: 0,    w: MAP_W, h: 20   },
  { x: 0,    y: MAP_H - 20, w: MAP_W, h: 20 },
  { x: 0,    y: 0,    w: 20,   h: MAP_H },
  { x: MAP_W - 20, y: 0, w: 20, h: MAP_H },
  // Interior dividers (cafeteria-style)
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

// Safe spawn positions (well inside rooms, away from walls)
const SPAWNS = [
  { x: 100,  y: 500  },
  { x: 1180, y: 500  },
  { x: 600,  y: 100  },
  { x: 600,  y: 880  },
  { x: 350,  y: 300  },
  { x: 850,  y: 300  },
];

const TASK_POSITIONS = [
  { x: 120,  y: 300  },
  { x: 600,  y: 480  },
  { x: 1150, y: 300  },
  { x: 350,  y: 800  },
  { x: 850,  y: 800  },
];

const PICKUP_POSITIONS = [
  { x: 320,  y: 480, type: 'shotgun'     },
  { x: 880,  y: 480, type: 'shotgun'     },
  { x: 600,  y: 200, type: 'machinegun'  },
  { x: 600,  y: 760, type: 'machinegun'  },
];

function aabbOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function circleRect(cx, cy, cr, rx, ry, rw, rh) {
  const nearX = Math.max(rx, Math.min(cx, rx + rw));
  const nearY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nearX;
  const dy = cy - nearY;
  return dx * dx + dy * dy < cr * cr;
}

function dist(ax, ay, bx, by) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

let bulletIdCounter = 0;

function createGameState(players, mode, options = {}) {
  const firefightTicks = Number(options.firefightTicks);
  const taskCount = Number(options.taskCount);
  const taskTicks = Number(options.taskTicks);
  const startNearTask = options.startNearTask === true || options.startNearTask === '1' || options.startNearTask === 'true';
  const playerStates = {};
  const shuffledSpawns = [...SPAWNS].sort(() => Math.random() - 0.5);
  if (mode === 'impostor' && startNearTask) shuffledSpawns[0] = { x: 120, y: 300 };

  // Assign impostor randomly in impostor mode
  const impostorIndex = mode === 'impostor' ? Math.floor(Math.random() * players.length) : -1;

  players.forEach((p, i) => {
    const spawn = shuffledSpawns[i % shuffledSpawns.length];
    playerStates[p.id] = {
      x: spawn.x,
      y: spawn.y,
      angle: 0,
      hp: 100,
      alive: true,
      role: mode === 'impostor' ? (i === impostorIndex ? 'impostor' : 'crewmate') : 'fighter',
      weapon: 'pistol',
      ammo: WEAPON_AMMO.pistol,
      kills: 0,
      deaths: 0,
      tasksDone: 0,
      respawnIn: 0,
    };
  });

  const selectedTaskPositions = Number.isFinite(taskCount) && taskCount > 0
    ? TASK_POSITIONS.slice(0, Math.min(taskCount, TASK_POSITIONS.length))
    : TASK_POSITIONS;
  const tasks = mode === 'impostor'
    ? selectedTaskPositions.map((pos, i) => ({ id: i, x: pos.x, y: pos.y, done: false, workerId: null, progress: 0 }))
    : [];

  const pickups = mode === 'firefight'
    ? PICKUP_POSITIONS.map((pos, i) => ({ id: i, x: pos.x, y: pos.y, type: pos.type, active: true }))
    : [];

  return {
    mode,
    phase: 'playing',
    players: playerStates,
    bullets: [],
    tasks,
    pickups,
    completedTasks: 0,
    totalTasks: tasks.length,
    timeRemaining: mode === 'firefight' ? (Number.isFinite(firefightTicks) && firefightTicks > 0 ? firefightTicks : 900) : null,
    winner: null,
    inputQueue: {},
    taskProgress: {},
    taskTicks: Number.isFinite(taskTicks) && taskTicks > 0 ? taskTicks : 60,
  };
}

function applyInputs(gameState, inputs) {
  for (const [playerId, input] of Object.entries(inputs)) {
    const ps = gameState.players[playerId];
    if (!ps || !ps.alive) continue;

    const { dx, dy, angle, fire, interact } = input;

    // Normalize movement vector
    const len = Math.sqrt((dx || 0) ** 2 + (dy || 0) ** 2);
    if (len > 0) {
      const nx = (dx / len) * PLAYER_SPEED;
      const ny = (dy / len) * PLAYER_SPEED;

      let newX = ps.x + nx;
      let newY = ps.y + ny;

      // Wall collision
      const collidesX = WALLS.some(w => circleRect(newX, ps.y, PLAYER_RADIUS, w.x, w.y, w.w, w.h));
      const collidesY = WALLS.some(w => circleRect(ps.x, newY, PLAYER_RADIUS, w.x, w.y, w.w, w.h));

      ps.x = collidesX ? ps.x : Math.max(PLAYER_RADIUS + 20, Math.min(MAP_W - PLAYER_RADIUS - 20, newX));
      ps.y = collidesY ? ps.y : Math.max(PLAYER_RADIUS + 20, Math.min(MAP_H - PLAYER_RADIUS - 20, newY));
    }

    if (angle !== undefined) ps.angle = angle;

    // Fire
    if (fire && ps.ammo > 0) {
      ps.ammo -= 1;
      const bulletCount = ps.weapon === 'shotgun' ? 3 : 1;
      for (let b = 0; b < bulletCount; b++) {
        const spread = ps.weapon === 'shotgun' ? (b - 1) * 0.15 : 0;
        const bAngle = ps.angle + spread;
        gameState.bullets.push({
          id: bulletIdCounter++,
          x: ps.x + Math.cos(bAngle) * (PLAYER_RADIUS + 5),
          y: ps.y + Math.sin(bAngle) * (PLAYER_RADIUS + 5),
          vx: Math.cos(bAngle) * BULLET_SPEED,
          vy: Math.sin(bAngle) * BULLET_SPEED,
          ownerId: playerId,
          damage: BULLET_DAMAGE[ps.weapon] || 25,
          weapon: ps.weapon,
          ttl: 40,
        });
      }
    }

    // Interact with tasks
    if (interact && gameState.mode === 'impostor') {
      for (const task of gameState.tasks) {
        if (!task.done && dist(ps.x, ps.y, task.x, task.y) < TASK_RADIUS + PLAYER_RADIUS) {
          if (!gameState.taskProgress[task.id]) gameState.taskProgress[task.id] = { playerId, ticks: 0 };
          const tp = gameState.taskProgress[task.id];
          if (tp.playerId === playerId) {
            tp.ticks += 1;
            task.progress = tp.ticks / gameState.taskTicks; // default 3s at 20 Hz
            if (tp.ticks >= gameState.taskTicks) {
              task.done = true;
              task.progress = 1;
              gameState.completedTasks += 1;
              gameState.players[playerId].tasksDone += 1;
              delete gameState.taskProgress[task.id];
            }
          }
        } else if (gameState.taskProgress[task.id]?.playerId === playerId) {
          // Reset if player walked away
          delete gameState.taskProgress[task.id];
          task.progress = 0;
        }
      }
    } else if (!interact) {
      // Cancel any in-progress task for this player
      for (const task of gameState.tasks) {
        if (gameState.taskProgress[task.id]?.playerId === playerId) {
          delete gameState.taskProgress[task.id];
          task.progress = 0;
        }
      }
    }

    // Pickup weapons (firefight)
    if (gameState.mode === 'firefight') {
      for (const pickup of gameState.pickups) {
        if (pickup.active && dist(ps.x, ps.y, pickup.x, pickup.y) < PICKUP_RADIUS + PLAYER_RADIUS) {
          pickup.active = false;
          ps.weapon = pickup.type;
          ps.ammo = WEAPON_AMMO[pickup.type];
          // Respawn pickup after 15 seconds (300 ticks)
          pickup.respawnIn = 300;
        }
      }
    }
  }
}

function resolveBullets(gameState, players) {
  const hits = [];
  const remaining = [];

  for (const bullet of gameState.bullets) {
    bullet.x += bullet.vx;
    bullet.y += bullet.vy;
    bullet.ttl -= 1;

    if (bullet.ttl <= 0) continue;

    // Wall collision
    if (WALLS.some(w => circleRect(bullet.x, bullet.y, BULLET_RADIUS, w.x, w.y, w.w, w.h))) continue;

    // Out of bounds
    if (bullet.x < 0 || bullet.x > MAP_W || bullet.y < 0 || bullet.y > MAP_H) continue;

    let hit = false;
    for (const [pid, ps] of Object.entries(gameState.players)) {
      if (pid === bullet.ownerId || !ps.alive) continue;
      if (dist(bullet.x, bullet.y, ps.x, ps.y) < PLAYER_RADIUS + BULLET_RADIUS) {
        ps.hp -= bullet.damage;
        hit = true;
        hits.push({ targetId: pid, damage: bullet.damage, hp: ps.hp, killerId: bullet.ownerId });

        if (ps.hp <= 0) {
          ps.hp = 0;
          ps.alive = false;
          ps.deaths += 1;
          const killer = gameState.players[bullet.ownerId];
          if (killer) killer.kills += 1;

          if (gameState.mode === 'firefight') {
            ps.respawnIn = RESPAWN_TICKS;
            // Respawn weapon
            ps.weapon = 'pistol';
            ps.ammo = WEAPON_AMMO.pistol;
          }
        }
        break;
      }
    }

    if (!hit) remaining.push(bullet);
  }

  gameState.bullets = remaining;
  return hits;
}

function resolveRespawns(gameState) {
  const shuffledSpawns = [...SPAWNS].sort(() => Math.random() - 0.5);
  let si = 0;
  for (const [, ps] of Object.entries(gameState.players)) {
    if (!ps.alive && ps.respawnIn > 0) {
      ps.respawnIn -= 1;
      if (ps.respawnIn === 0) {
        const spawn = shuffledSpawns[si++ % shuffledSpawns.length];
        ps.x = spawn.x;
        ps.y = spawn.y;
        ps.hp = 100;
        ps.alive = true;
      }
    }
  }
}

function resolvePickups(gameState) {
  for (const pickup of gameState.pickups) {
    if (!pickup.active && pickup.respawnIn > 0) {
      pickup.respawnIn -= 1;
      if (pickup.respawnIn === 0) pickup.active = true;
    }
  }
}

function checkWinCondition(gameState, players) {
  if (gameState.mode === 'impostor') {
    const aliveCrewmates = players.filter(p => {
      const ps = gameState.players[p.id];
      return ps && ps.alive && ps.role === 'crewmate';
    });
    const aliveImpostors = players.filter(p => {
      const ps = gameState.players[p.id];
      return ps && ps.alive && ps.role === 'impostor';
    });

    if (aliveImpostors.length === 0) {
      return { side: 'crewmates', reason: 'Impostor eliminated' };
    }
    if (aliveCrewmates.length === 0) {
      return { side: 'impostor', reason: 'All crewmates eliminated' };
    }
    if (gameState.totalTasks > 0 && gameState.completedTasks >= gameState.totalTasks) {
      return { side: 'crewmates', reason: 'All tasks completed' };
    }
  }

  if (gameState.mode === 'firefight') {
    if (gameState.timeRemaining <= 0) {
      let topId = null, topKills = -1;
      for (const [pid, ps] of Object.entries(gameState.players)) {
        if (ps.kills > topKills) { topKills = ps.kills; topId = pid; }
      }
      const winner = players.find(p => p.id === topId);
      return { playerId: topId, playerName: winner?.name, kills: topKills };
    }
  }

  return null;
}

function getPublicSnapshot(gameState) {
  return {
    mode: gameState.mode,
    phase: gameState.phase,
    players: gameState.players,
    bullets: gameState.bullets.map(b => ({ id: b.id, x: b.x, y: b.y })),
    tasks: gameState.tasks,
    pickups: gameState.pickups,
    completedTasks: gameState.completedTasks,
    totalTasks: gameState.totalTasks,
    timeRemaining: gameState.timeRemaining,
    winner: gameState.winner,
  };
}

module.exports = {
  createGameState,
  applyInputs,
  resolveBullets,
  resolveRespawns,
  resolvePickups,
  checkWinCondition,
  getPublicSnapshot,
};
