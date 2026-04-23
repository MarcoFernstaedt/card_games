import { useEffect, useRef } from 'react';

const COLORS = ['#7c6bff', '#e94560', '#f39c12', '#27ae60', '#3498db', '#f1c40f', '#e67e22', '#ff6b9d'];

export default function Confetti({ active }) {
  const canvasRef = useRef(null);
  const stateRef = useRef({ animId: null, particles: [], running: false });

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const state = stateRef.current;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    state.particles = Array.from({ length: 130 }, () => ({
      x: Math.random() * canvas.width,
      y: -10 - Math.random() * 60,
      w: 6 + Math.random() * 8,
      h: 4 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 4,
      spin: (Math.random() - 0.5) * 0.2,
      angle: Math.random() * Math.PI * 2,
      alpha: 1,
    }));

    state.running = true;

    function draw() {
      if (!state.running) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;

      for (const p of state.particles) {
        if (p.alpha <= 0) continue;
        alive = true;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.08; // gravity
        p.angle += p.spin;
        if (p.y > canvas.height * 0.7) p.alpha -= 0.018;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }

      if (alive) {
        state.animId = requestAnimationFrame(draw);
      } else {
        state.running = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    cancelAnimationFrame(state.animId);
    draw();

    return () => {
      state.running = false;
      cancelAnimationFrame(state.animId);
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
        zIndex: 200,
      }}
    />
  );
}
