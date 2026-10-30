/* Third pack: vector animation set (25). */
function p3Lottie(ctx, W, H, el, prog, id, p, GA, col, acc) {
  const a = ecXY(p, W, H, 0.5, 0.5);
  const x = a.x, y = a.y;
  const e = icEase(prog);
  const white = '#F4F8FF';
  const rad = ecN(p.radius, 70);

  if (id === 'lottieArrowBurst') {
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const q = icEase(ecClamp((prog - i * 0.03) / 0.6, 0, 1));
      ec2Arrow(ctx, x + Math.cos(ang) * rad * 1.5 * q, y + Math.sin(ang) * rad * 1.5 * q, ang, rad * 0.25, i % 2 ? acc : col);
    }

  } else if (id === 'lottieBadgePop') {
    const s = 0.6 + 0.4 * e;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ecStar(ctx, 0, 0, rad, rad * 0.7, 10, el * 0.2);
    ctx.fillStyle = col; ctx.fill();
    ecText(ctx, ecS(p.text, '★'), 0, 0, rad * 0.6, p3Ink(col), 'center', 900);
    ctx.restore();

  } else if (id === 'lottieBellRing') {
    const sway = Math.sin(el * 8) * 0.22 * (1 - prog * 0.5);
    ctx.save(); ctx.translate(x, y - rad * 0.4); ctx.rotate(sway);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, 0, rad * 0.62, Math.PI, 0); ctx.lineTo(rad * 0.62, rad * 0.5); ctx.lineTo(-rad * 0.62, rad * 0.5); ctx.closePath(); ctx.fill();
    ecDot(ctx, 0, rad * 0.66, rad * 0.12, acc);
    ctx.restore();

  } else if (id === 'lottieBoltStrike') {
    ecAlpha(ctx, GA, e);
    ctx.strokeStyle = acc; ctx.lineWidth = 6; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x + rad * 0.2, y - rad);
    for (let i = 0; i < 5; i++) {
      ctx.lineTo(x + (ecHash(i) - 0.5) * rad * 0.8, y - rad + (i + 1) * rad * 0.4);
    }
    ctx.stroke();
    ctx.globalAlpha = ecClamp(GA * 0.25, 0, 1);
    ctx.strokeStyle = white; ctx.lineWidth = 2; ctx.stroke();

  } else if (id === 'lottieBubbleRise') {
    for (let i = 0; i < 10; i++) {
      const q = p3Loop(prog * 0.8 + ecHash(i));
      const bx = x + (ecHash(i + 3) - 0.5) * rad * 2.2;
      const by = y + rad - q * rad * 2;
      ecAlpha(ctx, GA, 1 - q);
      ctx.strokeStyle = i % 2 ? acc : col; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bx, by, rad * (0.06 + ecHash(i + 7) * 0.12), 0, Math.PI * 2); ctx.stroke();
    }

  } else if (id === 'lottieCheckDraw') {
    const r = rad * 1.1;
    ctx.strokeStyle = col; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    const q = ecClamp((prog - 0.2) / 0.6, 0, 1);
    ctx.strokeStyle = acc; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x - r * 0.4, y);
    ctx.lineTo(x - r * 0.08, y + r * 0.3);
    ctx.lineTo(x - r * 0.4 + r * 0.9 * q, y + r * 0.3 - r * 0.65 * q);
    ctx.stroke();

  } else if (id === 'lottieCircleGrow') {
    const q = e;
    ctx.fillStyle = col; ctx.globalAlpha = ecClamp(GA * q, 0, 1);
    ctx.beginPath(); ctx.arc(x, y, rad * q, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = acc; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, rad * (1 + (1 - q) * 0.6), 0, Math.PI * 2); ctx.stroke();

  } else if (id === 'lottieConfettiRain') {
    for (let i = 0; i < 40; i++) {
      const q = p3Loop(prog * 0.6 + ecHash(i));
      const px = x + (ecHash(i + 3) - 0.5) * W * 0.9;
      const py = y - H * 0.3 + q * H * 0.7;
      ctx.save(); ctx.translate(px, py); ctx.rotate(q * 8 + i);
      ctx.fillStyle = i % 3 ? col : acc; ctx.globalAlpha = ecClamp(GA * (1 - q * 0.4), 0, 1);
      ctx.fillRect(-3, -7, 6, 14);
      ctx.restore();
    }

  } else if (id === 'lottieCursorMove') {
    const q = icEase(ecClamp(prog, 0, 1));
    const px = x - rad * 1.6 + q * rad * 3.2;
    const py = y + Math.sin(q * Math.PI * 2) * rad * 0.7;
    ctx.save(); ctx.translate(px, py); ctx.rotate(-0.3);
    ctx.fillStyle = white;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, rad * 0.7); ctx.lineTo(rad * 0.18, rad * 0.56); ctx.lineTo(rad * 0.36, rad * 0.68); ctx.lineTo(rad * 0.44, rad * 0.55); ctx.lineTo(rad * 0.26, rad * 0.44); ctx.lineTo(rad * 0.44, rad * 0.34); ctx.closePath(); ctx.fill();
    ctx.restore();

  } else if (id === 'lottieDotWave') {
    for (let i = 0; i < 7; i++) {
      const q = Math.sin(el * 3 + i * 0.6) * 0.5 + 0.5;
      ecDot(ctx, x + (i - 3) * rad * 0.45, y - q * rad * 0.5, rad * 0.1, i % 2 ? acc : col);
    }

  } else if (id === 'lottieEnvelopeOpen') {
    const s = e;
    ctx.fillStyle = col;
    ctx.fillRect(x - rad, y - rad * 0.6, rad * 2, rad * 1.2);
    ctx.strokeStyle = acc; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - rad, y - rad * 0.6); ctx.lineTo(x, y + rad * 0.1 * s); ctx.lineTo(x + rad, y - rad * 0.6); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(x - rad * 0.5, y - rad * 0.4, rad * 1.0 * s, rad * 0.6);

  } else if (id === 'lottieGearSpin') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(el * 2);
    const teeth = 9;
    ctx.beginPath();
    for (let i = 0; i <= teeth * 2; i++) {
      const ang = (i / (teeth * 2)) * Math.PI * 2;
      const rr = i % 2 ? rad * 0.8 : rad;
      const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, rad * 0.3, 0, Math.PI * 2); ctx.strokeStyle = acc; ctx.stroke();
    ctx.restore();

  } else if (id === 'lottieHeartBeat') {
    const q = Math.abs(Math.sin(el * 3));
    ctx.save(); ctx.translate(x, y); ctx.scale(1 + q * 0.12, 1 + q * 0.12);
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, rad * 0.5);
    ctx.bezierCurveTo(-rad * 1.1, -rad * 0.2, -rad * 0.5, -rad * 0.9, 0, -rad * 0.3);
    ctx.bezierCurveTo(rad * 0.5, -rad * 0.9, rad * 1.1, -rad * 0.2, 0, rad * 0.5);
    ctx.fill(); ctx.restore();

  } else if (id === 'lottieLineDraw') {
    const q = e;
    ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - rad * 1.6, y); ctx.lineTo(x + rad * 1.6 * q, y); ctx.stroke();
    ecDot(ctx, x + rad * 1.6 * q, y, rad * 0.1, acc);

  } else if (id === 'lottieLoadingDots') {
    for (let i = 0; i < 3; i++) {
      const q = Math.max(0, Math.sin(el * 4 + i * 1.2)) * 0.5 + 0.5;
      ecDot(ctx, x + (i - 1) * rad * 0.5, y, rad * (0.08 + q * 0.05), i % 2 ? acc : col);
    }

  } else if (id === 'lottieLockOpen') {
    ctx.strokeStyle = col; ctx.lineWidth = 5;
    ctx.strokeRect(x - rad * 0.6, y - rad * 0.1, rad * 1.2, rad * 1.0);
    const q = e;
    ctx.beginPath();
    ctx.arc(x + rad * 0.1, y - rad * 0.1, rad * 0.45, Math.PI, Math.PI + Math.PI * (0.6 + q * 0.4));
    ctx.stroke();
    ecDot(ctx, x, y + rad * 0.4, rad * 0.08, acc);

  } else if (id === 'lottieMailSend') {
    ctx.fillStyle = col; ctx.fillRect(x - rad, y - rad * 0.6, rad * 2, rad * 1.2);
    ctx.fillStyle = '#FFFFFF'; ctx.globalAlpha = ecClamp(GA * 0.7, 0, 1);
    ctx.beginPath(); ctx.moveTo(x - rad, y - rad * 0.6); ctx.lineTo(x, y + rad * 0.1); ctx.lineTo(x + rad, y - rad * 0.6); ctx.fill();
    ctx.globalAlpha = ecClamp(GA * e, 0, 1);
    ctx.strokeStyle = acc; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + rad * 0.6, y + rad * 1.1); ctx.lineTo(x + rad * 1.5, y + rad * 0.5); ctx.stroke();

  } else if (id === 'lottiePinDrop') {
    const q = e;
    const py = y - rad * 0.9 + q * rad * 0.6;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, py, rad * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - rad * 0.22, py + rad * 0.25); ctx.lineTo(x, py + rad * 0.85); ctx.lineTo(x + rad * 0.22, py + rad * 0.25); ctx.fill();
    ctx.beginPath(); ctx.arc(x, py, rad * 0.16, 0, Math.PI * 2); ctx.fillStyle = p3Ink(col); ctx.fill();

  } else if (id === 'lottieProgressRing') {
    const r = rad;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 10;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * prog); ctx.stroke();
    ecText(ctx, Math.round(prog * 100) + '%', x, y, rad * 0.42, white, 'center', 800);

  } else if (id === 'lottieRocketLaunch') {
    const q = e;
    const ry = y + rad * 1.2 - q * rad * 2.2;
    ctx.save(); ctx.translate(x, ry); ctx.rotate(-0.15);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(0, -rad * 0.6); ctx.quadraticCurveTo(rad * 0.4, 0, rad * 0.2, rad * 0.55); ctx.lineTo(-rad * 0.2, rad * 0.55); ctx.quadraticCurveTo(-rad * 0.4, 0, 0, -rad * 0.6); ctx.fill();
    ctx.fillStyle = acc;
    ctx.beginPath(); ctx.moveTo(-rad * 0.18, rad * 0.55); ctx.lineTo(0, rad * 0.95); ctx.lineTo(rad * 0.18, rad * 0.55); ctx.fill();
    ctx.restore();

  } else if (id === 'lottieSearchScan') {
    ctx.strokeStyle = col; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(x - rad * 0.15, y - rad * 0.15, rad * 0.5, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + rad * 0.22, y + rad * 0.22); ctx.lineTo(x + rad * 0.7, y + rad * 0.7); ctx.stroke();
    const q = p3Loop(el * 0.8);
    ecLine(ctx, x - rad * 0.65, y - rad * 0.65 + q * rad * 1.3, x + rad * 0.65, y - rad * 0.65 + q * rad * 1.3, acc, 2);

  } else if (id === 'lottieStarTwinkle') {
    const q = 0.6 + 0.4 * Math.sin(el * 4);
    ctx.save(); ctx.translate(x, y); ctx.scale(q, q); ctx.rotate(el * 0.4);
    ecStar(ctx, 0, 0, rad, rad * 0.45, 5, 0);
    ctx.fillStyle = acc; ctx.fill();
    ctx.restore();

  } else if (id === 'lottieThumbsUp') {
    const q = e;
    ctx.save(); ctx.translate(x, y); ctx.scale(q, q);
    ctx.fillStyle = col;
    ctx.fillRect(-rad * 0.2, -rad * 0.1, rad * 0.9, rad * 0.7);
    ctx.beginPath(); ctx.arc(-rad * 0.2, rad * 0.45, rad * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = acc;
    ctx.fillRect(-rad * 0.55, -rad * 0.45, rad * 0.5, rad * 0.9);
    ctx.restore();

  } else if (id === 'lottieToggleSwitch') {
    const on = prog > 0.5;
    const tw = rad * 1.8, th = rad * 0.8;
    ecPanel(ctx, x - tw / 2, y - th / 2, tw, th, th / 2, on ? col : 'rgba(255,255,255,0.16)', null, 0);
    const q = on ? e : 1 - e;
    ecDot(ctx, x - tw / 2 + th / 2 + (tw - th) * q, y, th * 0.38, on ? p3Ink(col) : 'rgba(255,255,255,0.7)');

  } else if (id === 'lottieWaveHand') {
    const sway = Math.sin(el * 6) * 0.25;
    ctx.save(); ctx.translate(x, y + rad * 0.4); ctx.rotate(-0.2 + sway);
    ctx.strokeStyle = col; ctx.lineWidth = 10; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -rad * 0.9); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const off = (i - 1.5) * rad * 0.18;
      ctx.beginPath();
      ctx.moveTo(off, -rad * 0.85);
      ctx.lineTo(off, -rad * (1.35 + (i % 2 ? 0.06 : 0)));
      ctx.stroke();
    }
    ctx.restore();
  }
}
