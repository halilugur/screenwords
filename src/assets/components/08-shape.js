/* Third pack: abstract shapes (25). */
function p3Shape(ctx, W, H, el, prog, id, p, GA, col, acc) {
  const a = ecXY(p, W, H, 0.5, 0.5);
  const x = a.x, y = a.y;
  const rad = ecN(p.radius, 100);
  const e = icEase(prog);
  const rot = el * 0.7 + prog * 2.2;
  const white = '#F4F8FF';

  if (id === 'hexRing') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ecHex(ctx, 0, 0, rad);
    ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.stroke();
    ecHex(ctx, 0, 0, rad * 0.62);
    ctx.strokeStyle = acc; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();

  } else if (id === 'orbitRing') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot * 0.5);
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, rad * 1.2, rad * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.rotate(Math.PI / 2);
    ctx.strokeStyle = acc;
    ctx.beginPath(); ctx.ellipse(0, 0, rad * 1.2, rad * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
    ecDot(ctx, x + Math.cos(rot) * rad * 1.2, y + Math.sin(rot) * rad * 0.45, rad * 0.1, white);

  } else if (id === 'dashedSquare') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot * 0.4);
    ctx.setLineDash([rad * 0.28, rad * 0.18]);
    ctx.strokeStyle = col; ctx.lineWidth = 5;
    ctx.strokeRect(-rad, -rad, rad * 2, rad * 2);
    ctx.setLineDash([]); ctx.strokeStyle = acc; ctx.lineWidth = 2;
    ctx.strokeRect(-rad * 0.7, -rad * 0.7, rad * 1.4, rad * 1.4);
    ctx.restore();

  } else if (id === 'cornerBrackets') {
    const s = rad * 1.4, L = rad * 0.45;
    ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.lineCap = 'round';
    const corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [sx, sy] of corners) {
      const px = x + sx * s, py = y + sy * s;
      ctx.beginPath(); ctx.moveTo(px, py + sy * L); ctx.lineTo(px, py); ctx.lineTo(px + sx * L, py); ctx.stroke();
    }
    ecAlpha(ctx, GA, 0.55 * e);
    ecPanel(ctx, x - s * 0.5, y - s * 0.5, s, s, 8, 'rgba(255,255,255,0.05)', null, 0);

  } else if (id === 'triangleStack') {
    for (let i = 0; i < 3; i++) {
      const r = rad * (1 - i * 0.26);
      ctx.save(); ctx.translate(x, y + (i - 1) * rad * 0.55); ctx.rotate(i % 2 ? Math.PI : 0);
      ec2Gon(ctx, 0, 0, r, 3, -Math.PI / 2);
      ctx.strokeStyle = i === 1 ? acc : col; ctx.lineWidth = 4; ctx.stroke();
      ctx.restore();
    }

  } else if (id === 'diamondGrid') {
    const n = 4, cell = rad * 0.62;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const px = x + (c - (n - 1) / 2) * cell, py = y + (r - (n - 1) / 2) * cell;
        ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI / 4);
        const s = cell * 0.42;
        ctx.strokeStyle = (r + c) % 3 === 0 ? acc : col; ctx.lineWidth = 2;
        ctx.strokeRect(-s / 2, -s / 2, s, s);
        ctx.restore();
      }
    }

  } else if (id === 'starburstOutline') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot * 0.3);
    ecStar(ctx, 0, 0, rad, rad * 0.52, 12, 0);
    ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.stroke();
    ecStar(ctx, 0, 0, rad * 0.6, rad * 0.28, 12, Math.PI / 12);
    ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();

  } else if (id === 'dotMatrixShape') {
    const n = 7, step = rad * 0.34;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const dx = (c - (n - 1) / 2) * step, dy = (r - (n - 1) / 2) * step;
        if (Math.hypot(dx, dy) > rad) continue;
        ecDot(ctx, x + dx, y + dy, step * (0.1 + 0.09 * Math.sin(el * 2 + r + c)), (r + c) % 4 === 0 ? acc : col);
      }
    }

  } else if (id === 'arcSweep') {
    ctx.save(); ctx.translate(x, y);
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = i % 2 ? acc : col; ctx.lineWidth = 5 - i * 0.6;
      ctx.beginPath();
      ctx.arc(0, 0, rad - i * rad * 0.15, rot + i * 0.3, rot + i * 0.3 + Math.PI * 1.2 * e);
      ctx.stroke();
    }
    ctx.restore();

  } else if (id === 'spiralCoil') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot * 0.2);
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 90; i++) {
      const q = i / 90, r = rad * q, ang = q * Math.PI * 5;
      const px = Math.cos(ang) * r, py = Math.sin(ang) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();

  } else if (id === 'waveBars') {
    const n = 12, bw = rad * 0.12, gap = rad * 0.06;
    for (let i = 0; i < n; i++) {
      const q = Math.sin(el * 2.4 + i * 0.6) * 0.5 + 0.5;
      const hh = rad * (0.25 + q * 1.1) * e;
      ecPanel(ctx, x - (n * (bw + gap) - gap) / 2 + i * (bw + gap), y - hh / 2, bw, hh, bw / 2, i % 2 ? acc : col, null, 0);
    }

  } else if (id === 'blobMorph') {
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath();
    const pts = 28;
    for (let i = 0; i <= pts; i++) {
      const ang = (i / pts) * Math.PI * 2;
      const rr = rad * (0.82 + 0.18 * Math.sin(ang * 3 + el * 1.7) + 0.08 * Math.sin(ang * 5 - el));
      const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.stroke();
    ctx.restore();

  } else if (id === 'capsuleOutline') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(-0.5);
    ecRound(ctx, -rad, -rad * 0.42, rad * 2, rad * 0.84, rad * 0.42);
    ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.stroke();
    ecRound(ctx, -rad * 0.64, -rad * 0.26, rad * 1.28, rad * 0.52, rad * 0.26);
    ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();

  } else if (id === 'crosshairShape') {
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    ecLine(ctx, x - rad, y, x + rad, y, col, 3);
    ecLine(ctx, x, y - rad, x, y + rad, col, 3);
    ctx.beginPath(); ctx.arc(x, y, rad * 0.55, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, rad * 0.18, 0, Math.PI * 2); ctx.strokeStyle = acc; ctx.stroke();

  } else if (id === 'polygonBurst') {
    const n = 8;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rot * 0.2;
      const r0 = rad * 0.5, r1 = rad * (0.9 + 0.1 * Math.sin(i));
      ctx.strokeStyle = i % 2 ? acc : col; ctx.lineWidth = 3;
      ecLine(ctx, x + Math.cos(ang) * r0, y + Math.sin(ang) * r0, x + Math.cos(ang) * r1, y + Math.sin(ang) * r1, i % 2 ? acc : col, 3);
    }
    ec2Gon(ctx, x, y, rad * 0.4, 6, rot);
    ctx.strokeStyle = white; ctx.lineWidth = 2; ctx.stroke();

  } else if (id === 'gearShape') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot * 0.4);
    const teeth = 10;
    ctx.beginPath();
    for (let i = 0; i <= teeth * 2; i++) {
      const ang = (i / (teeth * 2)) * Math.PI * 2;
      const rr = i % 2 ? rad * 0.82 : rad;
      const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, rad * 0.34, 0, Math.PI * 2); ctx.strokeStyle = acc; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();

  } else if (id === 'rippleCircle') {
    for (let i = 0; i < 5; i++) {
      const q = p3Loop(prog * 0.9 - i * 0.18);
      ecAlpha(ctx, GA, 1 - q);
      ctx.strokeStyle = i % 2 ? acc : col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, rad * (0.15 + q * 1.1), 0, Math.PI * 2); ctx.stroke();
    }
    ecDot(ctx, x, y, rad * 0.12, white);

  } else if (id === 'chevronBadge') {
    const w0 = rad * 1.6, h0 = rad * 0.9;
    ctx.beginPath();
    ctx.moveTo(x - w0 / 2, y - h0 / 2);
    ctx.lineTo(x + w0 / 2 - h0 * 0.5, y - h0 / 2);
    ctx.lineTo(x + w0 / 2, y);
    ctx.lineTo(x + w0 / 2 - h0 * 0.5, y + h0 / 2);
    ctx.lineTo(x - w0 / 2, y + h0 / 2);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.stroke();
    ecText(ctx, ecS(p.text, '→'), x, y, rad * 0.42, acc, 'center', 900);

  } else if (id === 'frameCorners') {
    const s = rad * 1.3, L = rad * 0.5, t = 4;
    ctx.strokeStyle = col; ctx.lineWidth = t;
    const c = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [sx, sy] of c) {
      ctx.beginPath();
      ctx.moveTo(x + sx * s, y + sy * (s - L));
      ctx.lineTo(x + sx * s, y + sy * s);
      ctx.lineTo(x + sx * (s - L), y + sy * s);
      ctx.stroke();
    }
    ecAlpha(ctx, GA, 0.6 * e);
    ecRound(ctx, x - s * 0.72, y - s * 0.72, s * 1.44, s * 1.44, 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1; ctx.stroke();

  } else if (id === 'lineBurst') {
    const n = 18;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rot * 0.15;
      const r0 = rad * (0.28 + 0.08 * Math.sin(i * 3));
      const r1 = rad * (0.75 + 0.25 * ecHash(i + 2));
      ctx.strokeStyle = i % 3 === 0 ? acc : col; ctx.lineWidth = 2;
      ecLine(ctx, x + Math.cos(ang) * r0, y + Math.sin(ang) * r0, x + Math.cos(ang) * r1, y + Math.sin(ang) * r1, i % 3 === 0 ? acc : col, 2);
    }
    ecDot(ctx, x, y, rad * 0.1, white);

  } else if (id === 'semicircleFan') {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const ang0 = Math.PI + (i / n) * Math.PI, ang1 = Math.PI + ((i + 1) / n) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, rad, ang0, ang1);
      ctx.closePath();
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)';
      ctx.fill();
      ctx.strokeStyle = i % 2 ? acc : col; ctx.lineWidth = 2; ctx.stroke();
    }

  } else if (id === 'roundedTriangle') {
    const r = rad;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot * 0.15);
    ctx.beginPath();
    const pts = [];
    for (let i = 0; i < 3; i++) {
      const ang = -Math.PI / 2 + (i / 3) * Math.PI * 2;
      pts.push([Math.cos(ang) * r, Math.sin(ang) * r]);
    }
    ctx.moveTo((pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
    for (let i = 0; i < 3; i++) {
      const a1 = pts[(i + 1) % 3], a2 = pts[(i + 2) % 3];
      ctx.quadraticCurveTo(a1[0], a1[1], (a1[0] + a2[0]) / 2, (a1[1] + a2[1]) / 2);
    }
    ctx.closePath();
    ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.stroke();
    ctx.restore();

  } else if (id === 'concentricSquares') {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot * 0.2);
    for (let i = 0; i < 4; i++) {
      const s = rad * 1.7 * (1 - i * 0.22);
      ctx.strokeStyle = i % 2 ? acc : col; ctx.lineWidth = 3;
      ctx.strokeRect(-s / 2, -s / 2, s, s);
    }
    ctx.restore();

  } else if (id === 'zigzagRibbon') {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = col; ctx.lineWidth = rad * 0.16; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const px = -rad + (i / 8) * rad * 2;
      const py = (i % 2 ? -1 : 1) * rad * 0.35;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();

  } else if (id === 'pixelCluster') {
    const n = 6, cell = rad * 0.3;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (ecHash(r * 9 + c * 5) < 0.42) continue;
        const px = x + (c - (n - 1) / 2) * cell;
        const py = y + (r - (n - 1) / 2) * cell;
        ctx.fillStyle = (r + c) % 3 === 0 ? acc : col;
        ctx.globalAlpha = ecClamp(GA * e, 0, 1);
        ctx.fillRect(px - cell * 0.42, py - cell * 0.42, cell * 0.84, cell * 0.84);
      }
    }
    ctx.globalAlpha = 1;
  }
}
