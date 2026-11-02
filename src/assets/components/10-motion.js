/* Third pack: motion graphics (25). */
function p3Motion(ctx, W, H, el, prog, id, p, GA, col, acc) {
  const a = ecXY(p, W, H, 0.5, 0.5);
  const x = a.x, y = a.y;
  const rad = ecN(p.radius, 120);
  const white = '#F4F8FF';
  const t = el * (ecN(p.speed, 1) || 1);

  if (id === 'orbitSparks') {
    for (let i = 0; i < 18; i++) {
      const ang = (i / 18) * Math.PI * 2 + t * 1.4;
      const rr = rad * (0.5 + 0.5 * ecHash(i + 2));
      ecDot(ctx, x + Math.cos(ang) * rr, y + Math.sin(ang) * rr, 3 + ecHash(i) * 5, i % 3 ? col : acc);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.stroke();

  } else if (id === 'pendulumWave') {
    const n = 9;
    for (let i = 0; i < n; i++) {
      const ang = Math.sin(t * 2 + i * 0.42) * 0.7;
      const px = x + (i - (n - 1) / 2) * rad * 0.22;
      const bx = px + Math.sin(ang) * rad * 0.7;
      const by = y - rad * 0.75 + Math.cos(ang) * rad * 0.7;
      ecLine(ctx, px, y - rad * 0.75, bx, by, 'rgba(255,255,255,0.3)', 1.5);
      ecDot(ctx, bx, by, rad * 0.08, i % 2 ? acc : col);
    }

  } else if (id === 'bouncingDots') {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const q = Math.abs(Math.sin(t * 2.4 + i * 0.55));
      ecDot(ctx, x + (i - (n - 1) / 2) * rad * 0.36, y - q * rad * 0.55, rad * 0.1, i % 2 ? acc : col);
      ecAlpha(ctx, GA, 0.18);
      ecLine(ctx, x + (i - (n - 1) / 2) * rad * 0.36, y + rad * 0.25, x + (i - (n - 1) / 2) * rad * 0.36, y + rad * 0.35, white, 1);
    }

  } else if (id === 'rotatingSquares') {
    for (let i = 0; i < 4; i++) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.6 + i * Math.PI / 4);
      const s = rad * (0.6 + i * 0.28);
      ctx.strokeStyle = i % 2 ? acc : col; ctx.lineWidth = 3;
      ctx.strokeRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    }

  } else if (id === 'ringPulse') {
    for (let i = 0; i < 4; i++) {
      const q = p3Loop(t * 0.5 - i * 0.22);
      ctx.strokeStyle = i % 2 ? acc : col; ctx.globalAlpha = ecClamp(GA * (1 - q), 0, 1);
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, rad * (0.2 + q * 0.9), 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;

  } else if (id === 'cometHead') {
    const ang = t * 1.1;
    const hx = x + Math.cos(ang) * rad * 0.7;
    const hy = y + Math.sin(ang) * rad * 0.45;
    for (let i = 1; i <= 12; i++) {
      const a2 = ang - i * 0.08;
      ecDot(ctx, x + Math.cos(a2) * rad * 0.7, y + Math.sin(a2) * rad * 0.45, rad * 0.09 * (1 - i / 14), i % 2 ? acc : col);
    }
    ecDot(ctx, hx, hy, rad * 0.14, white);

  } else if (id === 'spiralTrail') {
    for (let i = 0; i < 36; i++) {
      const q = i / 36;
      const ang = q * Math.PI * 6 + t;
      const rr = rad * (0.1 + q * 0.9);
      ecDot(ctx, x + Math.cos(ang) * rr, y + Math.sin(ang) * rr, 2 + q * 5, i % 3 ? col : acc);
    }

  } else if (id === 'waveformPulse') {
    const n = 32;
    for (let i = 0; i < n; i++) {
      const q = i / (n - 1);
      const hh = Math.abs(Math.sin(q * Math.PI * 4 + t * 3)) * rad * 0.6;
      ecPanel(ctx, x - rad + q * rad * 2, y - hh / 2, 3, hh, 1.5, i % 2 ? acc : col, null, 0);
    }

  } else if (id === 'particleFountain') {
    for (let i = 0; i < 40; i++) {
      const q = p3Loop(t * 0.5 + ecHash(i) * 0.5);
      const ang = -Math.PI / 2 + (ecHash(i + 4) - 0.5) * 1.6;
      const sp = rad * (0.4 + ecHash(i + 8) * 0.8);
      const px = x + Math.cos(ang) * sp * q;
      const py = y + Math.sin(ang) * sp * q + q * q * rad * 0.8;
      ecDot(ctx, px, py, 2 + (1 - q) * 4, i % 3 ? col : acc);
    }

  } else if (id === 'gearTrain') {
    const drawGear = (gx, gy, r, teeth, rot, color) => {
      ctx.save(); ctx.translate(gx, gy); ctx.rotate(rot);
      ctx.beginPath();
      for (let i = 0; i <= teeth * 2; i++) {
        const ang = (i / (teeth * 2)) * Math.PI * 2;
        const rr = i % 2 ? r * 0.82 : r;
        const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.28, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    };
    drawGear(x - rad * 0.3, y, rad * 0.4, 10, t, col);
    drawGear(x + rad * 0.35, y + rad * 0.2, rad * 0.28, 8, -t * 1.3, acc);

  } else if (id === 'springBounce') {
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.beginPath();
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const q = i / n;
      const px = x - rad * 0.6 + q * rad * 1.2;
      const py = y + Math.sin(q * Math.PI * 2 + t * 3) * rad * 0.25;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    const q2 = Math.abs(Math.sin(t * 3));
    ecDot(ctx, x + rad * 0.6, y - q2 * rad * 0.5, rad * 0.1, acc);

  } else if (id === 'radarPing') {
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const q = p3Loop(t * 0.4 - i * 0.3);
      ctx.globalAlpha = ecClamp(GA * (1 - q), 0, 1);
      ctx.beginPath(); ctx.arc(x, y, rad * q, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const ang = t * 1.6;
    ecLine(ctx, x, y, x + Math.cos(ang) * rad, y + Math.sin(ang) * rad, acc, 2);

  } else if (id === 'glitchBlocks') {
    for (let i = 0; i < 18; i++) {
      const bx = x + (ecHash(i + Math.floor(t * 8)) - 0.5) * rad * 1.6;
      const by = y + (ecHash(i + 17) - 0.5) * rad * 0.9;
      const bw = 8 + ecHash(i + 3) * 40, bh = 2 + ecHash(i + 6) * 8;
      ctx.fillStyle = i % 3 ? col : acc;
      ctx.globalAlpha = ecClamp(GA * (0.25 + ecHash(i + 2) * 0.6), 0, 1);
      ctx.fillRect(bx, by, bw, bh);
    }
    ctx.globalAlpha = 1;

  } else if (id === 'flowingDots') {
    for (let i = 0; i < 40; i++) {
      const q = p3Loop(t * 0.3 + ecHash(i) * 0.4);
      const px = x - rad + q * rad * 2;
      const py = y + Math.sin(q * Math.PI * 2 + i) * rad * 0.35;
      ecDot(ctx, px, py, 2 + ecHash(i + 5) * 3, i % 2 ? acc : col);
    }

  } else if (id === 'ripples') {
    for (let i = 0; i < 4; i++) {
      const q = p3Loop(t * 0.5 - i * 0.25);
      ctx.strokeStyle = i % 2 ? acc : col; ctx.globalAlpha = ecClamp(GA * (1 - q), 0, 1);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y, rad * q, rad * q * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;

  } else if (id === 'spinningTriangle') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * 1.4);
    ec2Gon(ctx, 0, 0, rad * 0.7, 3, -Math.PI / 2);
    ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.stroke();
    ctx.rotate(-t * 2.8);
    ec2Gon(ctx, 0, 0, rad * 0.4, 3, -Math.PI / 2);
    ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();

  } else if (id === 'heartbeatPulse') {
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const q = i / 80;
      const beat = Math.sin(q * Math.PI * 8 + t * 4);
      const spike = Math.exp(-Math.pow((q - 0.5) * 9, 2)) * 1.6;
      const v = (beat * 0.25 + spike) * rad * 0.5;
      const px = x - rad + q * rad * 2, py = y - v;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

  } else if (id === 'vortexDots') {
    for (let i = 0; i < 60; i++) {
      const q = p3Loop(ecHash(i) + t * 0.25 * (0.5 + ecHash(i + 2)));
      const ang = q * Math.PI * 6 + i;
      const rr = rad * (0.05 + q);
      ecDot(ctx, x + Math.cos(ang) * rr, y + Math.sin(ang) * rr, 1.5 + q * 3, i % 3 ? col : acc);
    }

  } else if (id === 'waveGrid') {
    const n = 9;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const px = x + (c - (n - 1) / 2) * rad * 0.22;
        const py = y + (r - (n - 1) / 2) * rad * 0.22;
        const q = Math.sin(t * 2 + r * 0.6 + c * 0.4) * 0.5 + 0.5;
        ecDot(ctx, px, py, 2 + q * 3, q > 0.5 ? acc : col);
      }
    }

  } else if (id === 'trailLines') {
    for (let i = 0; i < 12; i++) {
      const q = p3Loop(t * 0.4 + i / 12);
      const px = x - rad + q * rad * 2;
      const py = y + (i - 5.5) * rad * 0.08;
      ecLine(ctx, px, py, px + rad * 0.25, py, i % 2 ? acc : col, 2);
    }

  } else if (id === 'clockSweep') {
    ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, rad * 0.6, 0, Math.PI * 2); ctx.stroke();
    const ang = -Math.PI / 2 + (t * 0.8 % (Math.PI * 2));
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * rad * 0.55, y + Math.sin(ang) * rad * 0.55);
    ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.stroke();
    for (let i = 0; i < 12; i++) {
      const a2 = (i / 12) * Math.PI * 2;
      ecDot(ctx, x + Math.cos(a2) * rad * 0.6, y + Math.sin(a2) * rad * 0.6, 2, 'rgba(255,255,255,0.4)');
    }

  } else if (id === 'orbitingBalls') {
    for (let i = 0; i < 5; i++) {
      const ang = t * 1.2 + i * 0.55;
      const rr = rad * (0.35 + i * 0.12);
      ecDot(ctx, x + Math.cos(ang) * rr, y + Math.sin(ang) * rr * 0.7, rad * 0.07, i % 2 ? acc : col);
    }

  } else if (id === 'scanBeam') {
    const q = p3Loop(t * 0.35);
    const by = y - rad + q * rad * 2;
    const g = ctx.createLinearGradient(0, by - 30, 0, by + 30);
    g.addColorStop(0, 'transparent'); g.addColorStop(0.5, col); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g; ctx.globalAlpha = ecClamp(GA * 0.7, 0, 1);
    ctx.fillRect(x - rad, by - 30, rad * 2, 60); ctx.globalAlpha = 1;

  } else if (id === 'elasticBar') {
    const q = Math.sin(t * 3) * 0.5 + 0.5;
    const w0 = rad * (0.5 + q * 0.7);
    ecPanel(ctx, x - w0 / 2, y - rad * 0.1, w0, rad * 0.2, rad * 0.1, col, null, 0);
    ecPanel(ctx, x - rad * 0.5, y + rad * 0.22, rad, rad * 0.1, rad * 0.05, 'rgba(255,255,255,0.14)', null, 0);

  } else if (id === 'confettiTrail') {
    for (let i = 0; i < 36; i++) {
      const q = p3Loop(t * 0.4 + ecHash(i) * 0.6);
      const px = x + (ecHash(i + 4) - 0.5) * rad * 1.8;
      const py = y - rad * 0.8 + q * rad * 1.6;
      ctx.save(); ctx.translate(px, py); ctx.rotate(q * 6 + i);
      ctx.fillStyle = i % 3 ? col : acc; ctx.globalAlpha = ecClamp(GA * (1 - q * 0.5), 0, 1);
      ctx.fillRect(-4, -8, 8, 16);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
