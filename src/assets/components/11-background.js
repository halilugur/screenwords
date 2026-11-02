/* Third pack: full-frame background plates (25). */
function p3Background(ctx, W, H, el, prog, id, p, GA, col, acc) {
  const base = p3Base(p);
  const t = el;
  ctx.save();
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = ecClamp(GA, 0, 1);

  if (id === 'auroraVeilBackground') {
    for (let i = 0; i < 5; i++) {
      const g = ctx.createLinearGradient(0, H * (0.15 + i * 0.13), W, H * (0.05 + i * 0.17));
      g.addColorStop(0, 'transparent');
      g.addColorStop(0.5, i % 2 ? acc : col);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.globalAlpha = ecClamp(GA * 0.16, 0, 1);
      ctx.fillRect(0, 0, W, H);
    }

  } else if (id === 'blueprintGridBackground') {
    ctx.strokeStyle = col; ctx.lineWidth = 1;
    const step = W / 18;
    for (let gx = 0; gx <= W; gx += step) {
      ctx.globalAlpha = ecClamp(GA * 0.18, 0, 1);
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (let gy = 0; gy <= H; gy += step) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }
    ctx.strokeStyle = acc; ctx.globalAlpha = ecClamp(GA * 0.45, 0, 1);
    ctx.lineWidth = 2;
    ctx.strokeRect(step * 2, step * 4, step * 7, step * 5);
    ctx.strokeRect(step * 11, step * 2, step * 5, step * 9);

  } else if (id === 'bokehNightBackground') {
    for (let i = 0; i < 26; i++) {
      const rr = (0.03 + ecHash(i) * 0.1) * W;
      const bx = p3Loop(ecHash(i + 2) + t * 0.02) * W;
      const by = p3Loop(ecHash(i + 7) + t * 0.012) * H;
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, rr);
      g.addColorStop(0, i % 3 ? col : acc);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.globalAlpha = ecClamp(GA * 0.25, 0, 1);
      ctx.beginPath(); ctx.arc(bx, by, rr, 0, Math.PI * 2); ctx.fill();
    }

  } else if (id === 'canyonDuskBackground') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, col); g.addColorStop(0.55, base); g.addColorStop(1, '#1A0B12');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, H * (0.55 + i * 0.08));
      for (let k = 0; k <= 10; k++) {
        ctx.lineTo((k / 10) * W, H * (0.52 + i * 0.09 + Math.sin(k * 1.7 + i) * 0.04));
      }
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    }

  } else if (id === 'circuitPulseBackground') {
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    for (let i = 0; i < 14; i++) {
      const yy = (i / 14) * H;
      ctx.globalAlpha = ecClamp(GA * 0.22, 0, 1);
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke();
      const q = p3Loop(t * 0.25 + i * 0.1);
      ecDot(ctx, q * W, yy, 3, i % 3 ? acc : col);
    }
    for (let i = 0; i < 8; i++) {
      const xx = (i / 8) * W;
      ctx.globalAlpha = ecClamp(GA * 0.12, 0, 1);
      ctx.beginPath(); ctx.moveTo(xx, 0); ctx.lineTo(xx, H); ctx.stroke();
    }

  } else if (id === 'cloudDriftBackground') {
    for (let i = 0; i < 12; i++) {
      const rr = (0.12 + ecHash(i) * 0.18) * W;
      const bx = p3Loop(ecHash(i + 3) + t * 0.01) * W;
      const by = p3Loop(ecHash(i + 9)) * H;
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, rr);
      g.addColorStop(0, 'rgba(255,255,255,0.22)');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.globalAlpha = ecClamp(GA * 0.5, 0, 1);
      ctx.beginPath(); ctx.arc(bx, by, rr, 0, Math.PI * 2); ctx.fill();
    }

  } else if (id === 'deepSpaceBackground') {
    for (let i = 0; i < 160; i++) {
      const sx = ecHash(i) * W, sy = ecHash(i + 3) * H;
      const sz = 1 + ecHash(i + 7) * 2.4;
      ctx.fillStyle = i % 9 === 0 ? acc : 'rgba(255,255,255,0.75)';
      ctx.globalAlpha = ecClamp(GA * (0.35 + ecHash(i + 11) * 0.65), 0, 1);
      ctx.fillRect(sx, sy, sz, sz);
    }
    const g = ctx.createRadialGradient(W * 0.7, H * 0.3, 0, W * 0.7, H * 0.3, W * 0.5);
    g.addColorStop(0, col); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.globalAlpha = ecClamp(GA * 0.12, 0, 1);
    ctx.fillRect(0, 0, W, H);

  } else if (id === 'desertDunesBackground') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2A160C'); g.addColorStop(0.6, col); g.addColorStop(1, '#0F0805');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(20,10,5,0.55)' : 'rgba(70,35,15,0.35)';
      ctx.beginPath();
      ctx.moveTo(0, H * (0.5 + i * 0.12));
      for (let k = 0; k <= 12; k++) ctx.lineTo((k / 12) * W, H * (0.48 + i * 0.12 + Math.sin(k * 0.9 + i) * 0.05));
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    }

  } else if (id === 'fogMountainBackground') {
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(120,140,160,0.16)' : 'rgba(60,80,100,0.24)';
      ctx.beginPath();
      ctx.moveTo(0, H * (0.55 + i * 0.08));
      for (let k = 0; k <= 10; k++) {
        ctx.lineTo((k / 10) * W, H * (0.44 + i * 0.09 + Math.sin(k * 1.4 + i * 2) * 0.08));
      }
      ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
    }
    const g = ctx.createLinearGradient(0, H * 0.4, 0, H);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(220,230,240,0.2)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  } else if (id === 'forestMistBackground') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#07130C'); g.addColorStop(0.5, col); g.addColorStop(1, '#030805');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 18; i++) {
      const px = ecHash(i) * W;
      const hh = H * (0.3 + ecHash(i + 4) * 0.5);
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.fillRect(px, H - hh, 4 + ecHash(i + 2) * 8, hh);
    }

  } else if (id === 'galaxySpiralBackground') {
    for (let i = 0; i < 260; i++) {
      const q = i / 260;
      const ang = q * Math.PI * 8 + t * 0.1;
      const rr = q * W * 0.55;
      const px = W * 0.5 + Math.cos(ang) * rr;
      const py = H * 0.5 + Math.sin(ang) * rr * 0.6;
      ctx.fillStyle = i % 7 === 0 ? acc : 'rgba(255,255,255,0.72)';
      ctx.globalAlpha = ecClamp(GA * (0.25 + q * 0.6), 0, 1);
      ctx.fillRect(px, py, 1.6, 1.6);
    }

  } else if (id === 'glassRefractionBackground') {
    for (let i = 0; i < 7; i++) {
      const g = ctx.createLinearGradient(0, H * (i / 7), W, H * ((i + 1) / 7));
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, i % 2 ? col : acc);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.globalAlpha = ecClamp(GA * 0.13, 0, 1);
      ctx.fillRect(0, 0, W, H);
    }

  } else if (id === 'halftoneSunBackground') {
    const cx = W * 0.5, cy = H * 0.42, r = Math.min(W, H) * 0.22;
    ctx.fillStyle = acc; ctx.globalAlpha = ecClamp(GA * 0.75, 0, 1);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = base;
    for (let i = 0; i < 9; i++) {
      const yy = cy + r * 0.2 + i * (r * 0.1);
      ctx.globalAlpha = ecClamp(GA * 0.9, 0, 1);
      ctx.fillRect(cx - r, yy, r * 2, r * 0.05);
    }
    ctx.globalAlpha = ecClamp(GA * 0.25, 0, 1);
    for (let i = 0; i < 90; i++) {
      ecDot(ctx, ecHash(i) * W, H * 0.55 + ecHash(i + 3) * H * 0.45, 2 + ecHash(i + 7) * 4, col);
    }

  } else if (id === 'lavaFlowBackground') {
    for (let i = 0; i < 18; i++) {
      const q = p3Loop(t * 0.06 + ecHash(i) * 0.8);
      const bx = ecHash(i + 4) * W;
      const by = q * H;
      const rr = W * (0.04 + ecHash(i + 8) * 0.08);
      const g = ctx.createRadialGradient(bx, by, 0, bx, by, rr);
      g.addColorStop(0, i % 3 ? col : acc); g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.globalAlpha = ecClamp(GA * 0.5, 0, 1);
      ctx.beginPath(); ctx.arc(bx, by, rr, 0, Math.PI * 2); ctx.fill();
    }

  } else if (id === 'lightRaysBackground') {
    const cx = W * (ecN(p.position && p.position.x, 0.5));
    const cy = -H * 0.1;
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI + Math.PI * 0.1;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
      const g = ctx.createLinearGradient(0, 0, 0, H * 1.2);
      g.addColorStop(0, i % 2 ? acc : col); g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.globalAlpha = ecClamp(GA * 0.12, 0, 1);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-W * 0.04, H * 1.2); ctx.lineTo(W * 0.04, H * 1.2); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

  } else if (id === 'neonCityBackground') {
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 16; i++) {
      const bw = W / 16;
      const bh = H * (0.2 + ecHash(i) * 0.35);
      const px = i * bw;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(px, H - bh, bw - 2, bh);
      for (let w = 0; w < 4; w++) {
        if (ecHash(i * 7 + w * 3) < 0.5) continue;
        ctx.fillStyle = w % 2 ? col : acc;
        ctx.globalAlpha = ecClamp(GA * 0.5, 0, 1);
        ctx.fillRect(px + 4 + w * (bw - 8) / 4, H - bh + 10 + (w % 3) * 14, 3, 6);
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, H * 0.8, W, H * 0.2);

  } else if (id === 'oceanWavesBackground') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#04121F'); g.addColorStop(0.6, col); g.addColorStop(1, '#020A12');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = i % 2 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k <= 24; k++) {
        const px = (k / 24) * W;
        const py = H * (0.5 + i * 0.07) + Math.sin(k * 0.6 + t * 1.2 + i) * H * 0.02;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

  } else if (id === 'paperGrainBackground') {
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = ecHash(i) > 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)';
      ctx.fillRect(ecHash(i + 3) * W, ecHash(i + 7) * H, 1.5, 1.5);
    }
    const g = ctx.createRadialGradient(W / 2, H / 2, W * 0.1, W / 2, H / 2, W * 0.8);
    g.addColorStop(0, 'transparent'); g.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  } else if (id === 'prismLightBackground') {
    for (let i = 0; i < 6; i++) {
      const g = ctx.createLinearGradient(0, H * (i / 6), W, H * ((i + 1) / 6));
      g.addColorStop(0, 'transparent');
      g.addColorStop(0.5, i % 2 ? acc : col);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.globalAlpha = ecClamp(GA * 0.18, 0, 1);
      ctx.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = ecClamp(GA * 0.18, 0, 1);
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(W * 0.2, 0); ctx.lineTo(W * 0.7, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W * 0.55, 0); ctx.lineTo(W * 0.35, H); ctx.stroke();

  } else if (id === 'rainGlassBackground') {
    ctx.fillStyle = 'rgba(10,20,35,0.35)'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) {
      const q = p3Loop(t * (0.08 + ecHash(i) * 0.1) + ecHash(i + 2));
      const px = ecHash(i + 4) * W;
      const py = q * H;
      const rr = 4 + ecHash(i + 6) * 9;
      const g = ctx.createRadialGradient(px, py, 0, px, py, rr);
      g.addColorStop(0, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'transparent');
      ctx.fillStyle = g; ctx.globalAlpha = ecClamp(GA * 0.5, 0, 1);
      ctx.beginPath(); ctx.arc(px, py, rr, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + 22); ctx.stroke();
    }

  } else if (id === 'sandRippleBackground') {
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 12; i++) {
      ctx.strokeStyle = i % 2 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.14)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k <= 20; k++) {
        const px = (k / 20) * W;
        const py = H * (0.1 + i * 0.075) + Math.sin(k * 0.5 + i) * 8;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

  } else if (id === 'starfieldSlowBackground') {
    for (let i = 0; i < 120; i++) {
      const px = ecHash(i) * W;
      const py = p3Loop(ecHash(i + 4) + t * 0.005 * (0.4 + ecHash(i + 8))) * H;
      const sz = 1 + ecHash(i + 2) * 2.2;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.globalAlpha = ecClamp(GA * (0.3 + ecHash(i + 6) * 0.7), 0, 1);
      ctx.fillRect(px, py, sz, sz);
    }

  } else if (id === 'topoLinesBackground') {
    for (let i = 0; i < 14; i++) {
      ctx.strokeStyle = i % 3 ? 'rgba(255,255,255,0.14)' : col;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = 0; k <= 30; k++) {
        const q = k / 30;
        const px = q * W;
        const py = H * (0.1 + i * 0.06) + Math.sin(q * 7 + i * 0.6) * H * 0.035;
        if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

  } else if (id === 'underwaterGlowBackground') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#031824'); g.addColorStop(0.6, '#052A3A'); g.addColorStop(1, '#010A10');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 5; i++) {
      const bx = W * (0.1 + i * 0.2);
      const g2 = ctx.createRadialGradient(bx, H * 0.35, 0, bx, H * 0.35, W * 0.25);
      g2.addColorStop(0, i % 2 ? acc : col); g2.addColorStop(1, 'transparent');
      ctx.fillStyle = g2; ctx.globalAlpha = ecClamp(GA * 0.12, 0, 1);
      ctx.fillRect(0, 0, W, H);
    }

  } else if (id === 'vaporwaveBackground') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2A0A4A'); g.addColorStop(0.5, '#4A0E5C'); g.addColorStop(1, '#12051F');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    const horizon = H * 0.55;
    for (let i = -8; i <= 8; i++) {
      ctx.globalAlpha = ecClamp(GA * 0.22, 0, 1);
      ctx.beginPath(); ctx.moveTo(W / 2 + i * 8, horizon); ctx.lineTo(W / 2 + i * W * 0.08, H); ctx.stroke();
    }
    for (let i = 0; i < 10; i++) {
      const k = Math.pow(i / 10, 2);
      const yy = horizon + (H - horizon) * k;
      ctx.globalAlpha = ecClamp(GA * 0.2, 0, 1);
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(W, yy); ctx.stroke();
    }
    ctx.fillStyle = acc; ctx.globalAlpha = ecClamp(GA * 0.5, 0, 1);
    ctx.beginPath(); ctx.arc(W / 2, horizon - H * 0.1, W * 0.16, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}
