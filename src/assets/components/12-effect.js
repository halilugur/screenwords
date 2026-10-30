/* Third pack: full-frame effects and overlays (25). */
function p3Effect(ctx, W, H, el, prog, id, p, GA, col, acc) {
  const e = icEase(prog);
  const t = el;
  const cx = (ecN(p.position && p.position.x, 0.5)) * W;
  const cy = (ecN(p.position && p.position.y, 0.5)) * H;
  ctx.save();

  if (id === 'anamorphicFlare') {
    const g = ctx.createLinearGradient(0, cy, W, cy);
    g.addColorStop(0, 'transparent'); g.addColorStop(0.5, col); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.globalAlpha = ecClamp(GA * 0.55 * e, 0, 1);
    ctx.fillRect(0, cy - H * 0.012, W, H * 0.024);
    const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.2);
    g2.addColorStop(0, acc); g2.addColorStop(1, 'transparent');
    ctx.fillStyle = g2; ctx.globalAlpha = ecClamp(GA * 0.4 * e, 0, 1);
    ctx.fillRect(0, 0, W, H);

  } else if (id === 'bloomBurst') {
    const rad = W * 0.5 * e;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, col); g.addColorStop(0.4, 'transparent'); g.addColorStop(1, 'transparent');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g; ctx.globalAlpha = ecClamp(GA * 0.5, 0, 1);
    ctx.fillRect(0, 0, W, H);

  } else if (id === 'chromaticEdge') {
    const amt = 6 + 8 * Math.sin(t * 2);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = ecClamp(GA * 0.16 * e, 0, 1);
    ctx.fillStyle = '#FF3355'; ctx.fillRect(-amt, 0, W, H);
    ctx.fillStyle = '#33E0FF'; ctx.fillRect(amt, 0, W, H);

  } else if (id === 'colorSplit') {
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = ecClamp(GA * 0.2 * e, 0, 1);
    ctx.fillStyle = col; ctx.fillRect(0, 0, W * 0.52, H);
    ctx.fillStyle = acc; ctx.fillRect(W * 0.48, 0, W * 0.52, H);

  } else if (id === 'digitalNoise') {
    for (let i = 0; i < 500; i++) {
      const px = ecHash(i + Math.floor(t * 30)) * W;
      const py = ecHash(i + 7) * H;
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.28)';
      ctx.fillRect(px, py, 2, 2);
    }

  } else if (id === 'duotoneWash') {
    ctx.globalCompositeOperation = 'color';
    ctx.globalAlpha = ecClamp(GA * 0.55 * e, 0, 1);
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, col); g.addColorStop(1, acc);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  } else if (id === 'filmBurn') {
    const q = p3Loop(t * 0.2);
    const rad = W * (0.1 + q * 0.35);
    const g = ctx.createRadialGradient(W - rad, H - rad, 0, W - rad, H - rad, rad);
    g.addColorStop(0, 'rgba(255,180,80,0.8)'); g.addColorStop(0.5, 'rgba(200,60,20,0.4)'); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.globalAlpha = ecClamp(GA * (1 - q) * e, 0, 1);
    ctx.fillRect(0, 0, W, H);

  } else if (id === 'glitchScan') {
    for (let i = 0; i < 10; i++) {
      const yy = Math.floor(ecHash(i + Math.floor(t * 8)) * H);
      const hh = 4 + ecHash(i + 3) * 26;
      ctx.fillStyle = i % 2 ? col : acc;
      ctx.globalAlpha = ecClamp(GA * 0.35 * e, 0, 1);
      ctx.fillRect(0, yy, W, hh);
    }

  } else if (id === 'grainyVignette') {
    for (let i = 0; i < 600; i++) {
      ctx.fillStyle = ecHash(i) > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
      ctx.fillRect(ecHash(i + 3) * W, ecHash(i + 7) * H, 1.5, 1.5);
    }
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.8);
    g.addColorStop(0, 'transparent'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g; ctx.globalAlpha = ecClamp(GA * e, 0, 1); ctx.fillRect(0, 0, W, H);

  } else if (id === 'haloGlow') {
    const rad = W * (0.2 + 0.05 * Math.sin(t * 2));
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    g.addColorStop(0, 'transparent'); g.addColorStop(0.7, col); g.addColorStop(1, 'transparent');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g; ctx.globalAlpha = ecClamp(GA * 0.5 * e, 0, 1);
    ctx.fillRect(0, 0, W, H);

  } else if (id === 'lensDistort') {
    ctx.globalCompositeOperation = 'overlay';
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = i % 2 ? col : acc;
      ctx.globalAlpha = ecClamp(GA * 0.2 * e, 0, 1);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, W * (0.15 + i * 0.08), H * (0.08 + i * 0.05), 0.2, 0, Math.PI * 2); ctx.stroke();
    }

  } else if (id === 'lightSweep') {
    const q = p3Loop(t * 0.22);
    const gx = -W * 0.5 + q * W * 2;
    const g = ctx.createLinearGradient(gx - W * 0.15, 0, gx + W * 0.15, H);
    g.addColorStop(0, 'transparent'); g.addColorStop(0.5, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.globalAlpha = ecClamp(GA * 0.4, 0, 1);
    ctx.fillRect(0, 0, W, H);

  } else if (id === 'neonGlow') {
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = i % 2 ? col : acc;
      ctx.globalAlpha = ecClamp(GA * (0.35 - i * 0.06), 0, 1);
      ctx.lineWidth = 8 - i;
      ctx.strokeRect(i * 6, i * 6, W - i * 12, H - i * 12);
    }

  } else if (id === 'pixelGlitch') {
    for (let i = 0; i < 40; i++) {
      const bw = 10 + ecHash(i) * 70, bh = 4 + ecHash(i + 3) * 18;
      const px = ecHash(i + Math.floor(t * 10)) * W;
      const py = ecHash(i + 5) * H;
      ctx.fillStyle = i % 3 ? col : acc;
      ctx.globalAlpha = ecClamp(GA * 0.4, 0, 1);
      ctx.fillRect(px, py, bw, bh);
    }

  } else if (id === 'prismFringe') {
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = [ '#FF3355', '#33E0FF', '#FFD54A' ][i];
      ctx.globalAlpha = ecClamp(GA * 0.14 * e, 0, 1);
      ctx.fillRect((i - 1) * 10, 0, W, H);
    }

  } else if (id === 'scanlineOverlay') {
    ctx.fillStyle = '#000';
    for (let yy = 0; yy < H; yy += 6) {
      ctx.globalAlpha = ecClamp(GA * 0.18, 0, 1);
      ctx.fillRect(0, yy, W, 2);
    }
    const band = p3Loop(t * 0.3) * H;
    const g = ctx.createLinearGradient(0, band - 80, 0, band + 80);
    g.addColorStop(0, 'transparent'); g.addColorStop(0.5, col); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.globalAlpha = ecClamp(GA * 0.25, 0, 1);
    ctx.fillRect(0, band - 80, W, 160);

  } else if (id === 'shadowPulse') {
    const q = 0.35 + 0.25 * Math.sin(t * 2);
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.75);
    g.addColorStop(0, 'transparent'); g.addColorStop(1, 'rgba(0,0,0,' + q.toFixed(3) + ')');
    ctx.fillStyle = g; ctx.globalAlpha = ecClamp(GA * e, 0, 1); ctx.fillRect(0, 0, W, H);

  } else if (id === 'softFocus') {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = '#FFFFFF'; ctx.globalAlpha = ecClamp(GA * 0.12 * e, 0, 1);
    ctx.fillRect(0, 0, W, H);

  } else if (id === 'sparkleDust') {
    for (let i = 0; i < 90; i++) {
      const q = p3Loop(t * 0.15 + ecHash(i));
      const px = ecHash(i + 4) * W;
      const py = q * H;
      const sz = 1 + ecHash(i + 7) * 2.6;
      ctx.fillStyle = i % 5 === 0 ? acc : 'rgba(255,255,255,0.8)';
      ctx.globalAlpha = ecClamp(GA * (0.2 + ecHash(i + 2) * 0.7), 0, 1);
      ctx.fillRect(px, py, sz, sz);
    }

  } else if (id === 'strobeFlash') {
    const q = Math.pow(Math.max(0, Math.sin(t * 6)), 12);
    ctx.fillStyle = '#FFFFFF'; ctx.globalAlpha = ecClamp(GA * q * 0.35, 0, 1);
    ctx.fillRect(0, 0, W, H);

  } else if (id === 'thermalMap') {
    ctx.globalCompositeOperation = 'color';
    const g = ctx.createLinearGradient(0, H, W, 0);
    g.addColorStop(0, '#1D4ED8'); g.addColorStop(0.4, '#22D3EE'); g.addColorStop(0.7, '#FBBF24'); g.addColorStop(1, '#EF4444');
    ctx.fillStyle = g; ctx.globalAlpha = ecClamp(GA * 0.4 * e, 0, 1);
    ctx.fillRect(0, 0, W, H);

  } else if (id === 'vignetteBreath') {
    const q = 0.45 + 0.15 * Math.sin(t * 1.6);
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.8);
    g.addColorStop(0, 'transparent'); g.addColorStop(1, 'rgba(0,0,0,' + q.toFixed(3) + ')');
    ctx.fillStyle = g; ctx.globalAlpha = ecClamp(GA * e, 0, 1); ctx.fillRect(0, 0, W, H);

  } else if (id === 'waveDistort') {
    ctx.globalCompositeOperation = 'overlay';
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = i % 2 ? col : acc;
      ctx.globalAlpha = ecClamp(GA * 0.14 * e, 0, 1);
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let k = 0; k <= 30; k++) {
        const px = (k / 30) * W;
        const py = H * (0.2 + i * 0.12) + Math.sin(k * 0.5 + t * 2 + i) * H * 0.03;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

  } else if (id === 'xrayEdge') {
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = '#DFF6FF'; ctx.lineWidth = 1.5;
    ctx.globalAlpha = ecClamp(GA * 0.35 * e, 0, 1);
    for (let i = 0; i < 8; i++) {
      ctx.strokeRect(W * (0.1 + i * 0.02), H * (0.12 + i * 0.02), W * (0.8 - i * 0.04), H * (0.76 - i * 0.04));
    }

  } else if (id === 'zoomBlurBurst') {
    const q = Math.sin(prog * Math.PI);
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 24; i++) {
      const ang = (i / 24) * Math.PI * 2;
      const g = ctx.createLinearGradient(cx + Math.cos(ang) * W * 0.1, cy + Math.sin(ang) * H * 0.1,
        cx + Math.cos(ang) * W * 0.6, cy + Math.sin(ang) * H * 0.6);
      g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.globalAlpha = ecClamp(GA * 0.25 * q, 0, 1);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(ang - 0.03) * W * 0.6, cy + Math.sin(ang - 0.03) * H * 0.6);
      ctx.lineTo(cx + Math.cos(ang + 0.03) * W * 0.6, cy + Math.sin(ang + 0.03) * H * 0.6);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
}
