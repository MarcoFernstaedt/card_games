import { useEffect, useRef } from 'react';
import { music } from '../services/music';

const PALETTE_DEFAULT = ['#7c6bff', '#e94560', '#3498db', '#9b59b6', '#27ae60'];
const PALETTE_VICTORY = ['#f39c12', '#e74c3c', '#f1c40f', '#e67e22', '#ff6b9d'];

export default function Particles({ mode = 'lobby', energy = 0 }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({ particles: [], beatScale: 1, animId: null, unsubBeat: null });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const state = stateRef.current;

    const speedMult = mode === 'lobby' ? 0.3 : mode === 'victory' ? 1.5 : 0.7;
    const palette = mode === 'victory' ? PALETTE_VICTORY : PALETTE_DEFAULT;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    // Init particles
    state.particles = Array.from({ length: 55 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      r: 2 + Math.random() * 5,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      color: palette[Math.floor(Math.random() * palette.length)],
      alpha: 0.1 + Math.random() * 0.25,
      pulse: 0,
    }));

    state.unsubBeat = music.onBeat(() => {
      state.beatScale = 1.18;
      for (const p of state.particles) p.pulse = 1;
    });

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const energyBoost = 1 + energy * 1.5;
      state.beatScale = state.beatScale > 1 ? state.beatScale - 0.015 : 1;

      for (const p of state.particles) {
        p.pulse = p.pulse > 0 ? p.pulse - 0.04 : 0;
        const effectiveR = p.r * (1 + p.pulse * 0.6) * state.beatScale;

        p.x += p.vx * speedMult * energyBoost;
        p.y += p.vy * speedMult * energyBoost;

        if (p.x < -20) p.x = canvas.width + 20;
        if (p.x > canvas.width + 20) p.x = -20;
        if (p.y < -20) p.y = canvas.height + 20;
        if (p.y > canvas.height + 20) p.y = -20;

        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, effectiveR * 3);
        grad.addColorStop(0, p.color + Math.round((p.alpha + p.pulse * 0.3) * 255).toString(16).padStart(2, '0'));
        grad.addColorStop(1, p.color + '00');

        ctx.beginPath();
        ctx.arc(p.x, p.y, effectiveR * 3, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      state.animId = requestAnimationFrame(draw);
    }

    draw();

    return () => {
      cancelAnimationFrame(state.animId);
      window.removeEventListener('resize', resize);
      if (state.unsubBeat) state.unsubBeat();
    };
  }, [mode, energy]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />
  );
}
