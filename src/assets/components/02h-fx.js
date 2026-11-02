/* ==========================================================================
   Effects: the small cinematic touches a story leans on — light falling
   through a window, a glow, dust in the light, sparkles, and ink that
   grows into branches. Every effect is a pure function of time (safe for
   parallel frame rendering) and takes stage pixels.

     SWDraw.fx.rays(ctx, { x, y, angle, spread, count, length, color, time, intensity })
     SWDraw.fx.glow(ctx, { x, y, r, color, time, pulse })
     SWDraw.fx.dust(ctx, { x, y, w, h, count, color, time, seed })
     SWDraw.fx.sparkle(ctx, { x, y, r, count, color, time, seed })
     SWDraw.fx.ink(ctx, { x, y, size, progress, color, width, seed, depth })
   ========================================================================== */

/* A deterministic pseudo-random sequence from a seed. */
function swFxRand(seed) {
  let h = (Math.floor(ecN(seed, 1)) * 2654435761) >>> 0;
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489917) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
}

const SWFx = {
  /* Soft shafts of light from (x, y), fanning around `angle` (degrees, 90
     points down); they breathe slowly. */
  rays(ctx, o) {
    const x = ecN(o.x, 0), y = ecN(o.y, 0), t = ecN(o.time, 0);
    const n = Math.max(1, Math.min(12, Math.round(ecN(o.count, 4))));
    const len = ecN(o.length, 800), spread = ecN(o.spread, 30) * Math.PI / 180, base = ecN(o.angle, 90) * Math.PI / 180;
    const col = o.color || '#FFF4D6', k = ecClamp(ecN(o.intensity, 1), 0, 2);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const a = base + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread);
      const w = len * (0.05 + 0.03 * Math.sin(i * 1.7 + 1));
      const breath = 0.55 + 0.45 * Math.sin(t * 0.7 + i * 1.3);
      const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      const g = ctx.createLinearGradient(x, y, ex, ey);
      g.addColorStop(0, swMixAlpha(col, 0.32 * breath * k));
      g.addColorStop(1, swMixAlpha(col, 0));
      ctx.fillStyle = g;
      const nx = -Math.sin(a), ny = Math.cos(a);
      ctx.beginPath();
      ctx.moveTo(x + nx * w * 0.15, y + ny * w * 0.15);
      ctx.lineTo(ex + nx * w, ey + ny * w);
      ctx.lineTo(ex - nx * w, ey - ny * w);
      ctx.lineTo(x - nx * w * 0.15, y - ny * w * 0.15);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  },
  /* A pulsing halo. */
  glow(ctx, o) {
    const x = ecN(o.x, 0), y = ecN(o.y, 0), r = Math.max(1, ecN(o.r, 120)), t = ecN(o.time, 0);
    const pulse = 1 + ecN(o.pulse, 0.08) * Math.sin(t * 2.2);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r * pulse);
    const col = o.color || '#FFE6A8';
    g.addColorStop(0, swMixAlpha(col, 0.75));
    g.addColorStop(0.35, swMixAlpha(col, 0.3));
    g.addColorStop(1, swMixAlpha(col, 0));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(x - r * pulse, y - r * pulse, r * 2 * pulse, r * 2 * pulse);
    ctx.restore();
  },
  /* Motes drifting in a box, twinkling as they turn in the light. */
  dust(ctx, o) {
    const x = ecN(o.x, 0), y = ecN(o.y, 0), w = Math.max(1, ecN(o.w, 400)), h = Math.max(1, ecN(o.h, 400)), t = ecN(o.time, 0);
    const n = Math.max(0, Math.min(200, Math.round(ecN(o.count, 40))));
    const rnd = swFxRand(ecN(o.seed, 7));
    ctx.save();
    ctx.fillStyle = o.color || '#FFF7E0';
    for (let i = 0; i < n; i++) {
      const px = rnd(), py = rnd(), sp = 0.02 + rnd() * 0.04, ph = rnd() * 6.28, sz = 0.8 + rnd() * 2.2;
      const yy = ((py - t * sp) % 1 + 1) % 1, xx = px + Math.sin(t * 0.6 + ph) * 0.02;
      ctx.globalAlpha = 0.25 + 0.6 * Math.abs(Math.sin(t * 1.3 + ph));
      ctx.beginPath(); ctx.arc(x + xx * w, y + yy * h, sz, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  },
  /* Four-point stars blinking around a point. */
  sparkle(ctx, o) {
    const x = ecN(o.x, 0), y = ecN(o.y, 0), r = Math.max(1, ecN(o.r, 80)), t = ecN(o.time, 0);
    const n = Math.max(0, Math.min(60, Math.round(ecN(o.count, 10))));
    const rnd = swFxRand(ecN(o.seed, 3));
    ctx.save();
    ctx.fillStyle = o.color || '#FFFFFF';
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.28, d = rnd() * r, ph = rnd() * 6.28, sz = 3 + rnd() * 6;
      const k = Math.max(0, Math.sin(t * 3 + ph));
      if (k < 0.05) continue;
      const sx = x + Math.cos(a + t * 0.2) * d, sy = y + Math.sin(a + t * 0.2) * d, s = sz * k;
      ctx.globalAlpha = k;
      ctx.beginPath();
      ctx.moveTo(sx, sy - s); ctx.quadraticCurveTo(sx, sy, sx + s, sy); ctx.quadraticCurveTo(sx, sy, sx, sy + s);
      ctx.quadraticCurveTo(sx, sy, sx - s, sy); ctx.quadraticCurveTo(sx, sy, sx, sy - s);
      ctx.fill();
    }
    ctx.restore();
  },
  /* Ink that grows from (x, y) upward into branches as progress goes from
     0 to 1 — a trunk first, then forks, then twigs with a drop at each tip. */
  ink(ctx, o) {
    const x = ecN(o.x, 0), y = ecN(o.y, 0), size = Math.max(1, ecN(o.size, 200));
    const prog = ecClamp(ecN(o.progress, 1), 0, 1), depthMax = Math.max(1, Math.min(7, Math.round(ecN(o.depth, 5))));
    const col = o.color || '#1F2433', w0 = ecN(o.width, size * 0.045);
    const rnd = swFxRand(ecN(o.seed, 11));
    const segs = [];
    const grow = (px, py, a, len, w, d, t0) => {
      const ex = px + Math.cos(a) * len, ey = py + Math.sin(a) * len;
      const span = 1 / (depthMax + 1);
      segs.push({ px, py, ex, ey, w, t0, t1: t0 + span, d });
      if (d >= depthMax) return;
      const forks = d === 0 ? 2 : 2 + (rnd() < 0.35 ? 1 : 0);
      for (let i = 0; i < forks; i++) {
        const turn = (i / Math.max(1, forks - 1) - 0.5) * (0.9 + rnd() * 0.5) + (rnd() - 0.5) * 0.25;
        grow(ex, ey, a + turn, len * (0.62 + rnd() * 0.18), w * 0.66, d + 1, t0 + span);
      }
    };
    grow(x, y, -Math.PI / 2 + (rnd() - 0.5) * 0.15, size * 0.32, w0, 0, 0);
    ctx.save();
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = 'round';
    for (const g of segs) {
      if (prog <= g.t0) continue;
      const q = ecClamp((prog - g.t0) / (g.t1 - g.t0), 0, 1);
      const mx = (g.px + g.ex) / 2 + (g.ey - g.py) * 0.12, my = (g.py + g.ey) / 2 - (g.ex - g.px) * 0.12;
      ctx.lineWidth = Math.max(0.8, g.w);
      ctx.beginPath();
      ctx.moveTo(g.px, g.py);
      /* the curve drawn only as far as it has grown */
      const steps = 12;
      for (let k = 1; k <= Math.ceil(steps * q); k++) {
        const u = Math.min(1, k / steps), v = 1 - u;
        ctx.lineTo(v * v * g.px + 2 * v * u * mx + u * u * g.ex, v * v * g.py + 2 * v * u * my + u * u * g.ey);
      }
      ctx.stroke();
      if (g.d === depthMax && q >= 1) { ctx.beginPath(); ctx.arc(g.ex, g.ey, Math.max(1.5, g.w * 1.6), 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.restore();
  }
};

/* A colour at an alpha, from #hex or rgb(). */
function swMixAlpha(c, a) {
  const m = swRgb(c);
  return 'rgba(' + m[0] + ',' + m[1] + ',' + m[2] + ',' + ecClamp(a, 0, 1).toFixed(3) + ')';
}
SWDraw.fx = SWFx;
