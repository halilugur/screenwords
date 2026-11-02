
/* Canvas state can only be restored by walking back to a known save depth.
   Branches save/restore themselves, but an exception between the two would
   otherwise leave a transform applied to every later component and frame
   (the imageOverlay caption bug did exactly that). */
function ecTrackContext(ctx) {
  if (ctx.__ecDepth) return ctx;
  const save = ctx.save.bind(ctx);
  const restore = ctx.restore.bind(ctx);
  let depth = 0;
  ctx.save = function () { depth++; return save(); };
  ctx.restore = function () { if (depth > 0) depth--; return restore(); };
  ctx.__ecDepth = function () { return depth; };
  return ctx;
}
function ecRestoreTo(ctx, depth) {
  let guard = 0;
  while (ctx.__ecDepth && ctx.__ecDepth() > depth && guard++ < 64) ctx.restore();
}

function drawSharedComponents(ctx, W, H, time, comps, opts) {
  opts = opts || {};
  const skip = opts.skip || [];
  const allActive = (comps || []).filter(c => time >= c.start && time <= c.end);
  const activeComps = allActive
    .filter(c => skip.indexOf(c.componentId) < 0)
    .slice()
    .sort((a, b) => ((a.zIndex ?? (a.params && a.params.zIndex) ?? 0) - (b.zIndex ?? (b.params && b.params.zIndex) ?? 0)));

  ecTrackContext(ctx);
  activeComps.forEach(c => {
    const baseDepth = ctx.__ecDepth ? ctx.__ecDepth() : 0;
    const baseTransform = ctx.getTransform ? ctx.getTransform() : null;
    const baseAlpha = ctx.globalAlpha;
    try {
    const rawP = c.params || {};
    /* Unify top-level c.position (from add_component / update_component) with
       c.params.position so every component renderer sees the true position. */
    const mergedPos = (rawP.position && typeof rawP.position === 'object')
      ? rawP.position
      : (c.position && typeof c.position === 'object' ? c.position : null);
    const p = mergedPos ? Object.assign({}, rawP, { position: mergedPos }) : Object.assign({}, rawP);

    /* Keyframe interpolation: if c.keyframes has timed {time, x, y, scale, opacity}
       stops, interpolate position/scale/opacity smoothly at current `time`. */
    let kfScale = 1, kfAlpha = 1;
    if (Array.isArray(c.keyframes) && c.keyframes.length > 0) {
      const kfs = c.keyframes.slice().sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
      let k0 = kfs[0], k1 = kfs[kfs.length - 1];
      for (let i = 0; i < kfs.length - 1; i++) {
        const t0 = kfs[i].time ?? c.start, t1 = kfs[i + 1].time ?? c.end;
        if (time >= t0 && time <= t1) { k0 = kfs[i]; k1 = kfs[i + 1]; break; }
      }
      const t0 = k0.time ?? c.start, t1 = k1.time ?? c.end;
      const kt = t1 > t0 ? SWDraw.easeInOut((time - t0) / (t1 - t0)) : 1;
      const curPos = p.position || { x: 0.5, y: 0.5 };
      p.position = {
        x: SWDraw.lerp(k0.x ?? curPos.x ?? 0.5, k1.x ?? curPos.x ?? 0.5, kt),
        y: SWDraw.lerp(k0.y ?? curPos.y ?? 0.5, k1.y ?? curPos.y ?? 0.5, kt)
      };
      if (k0.scale != null || k1.scale != null) kfScale = SWDraw.lerp(k0.scale ?? 1, k1.scale ?? 1, kt);
      if (k0.opacity != null || k1.opacity != null) kfAlpha = SWDraw.lerp(k0.opacity ?? 1, k1.opacity ?? 1, kt);
    }

    /* animation is COMPONENT DATA set through MCP: animate: {in, out, duration}
       — in/out one of fade | rise | drop | pop | zoom | slideLeft | slideRight |
       sink | shrink | slideOut. No animate param: no animation at all. */
    const AN = p.animate || null;
    let GA = kfAlpha, gdx = 0, gdy = 0, gsc = kfScale;
    if (AN) {
      const adur = AN.duration == null ? 0.4 : AN.duration;
      if (AN.in) {
        const q = Math.min(1, Math.max(0, (time - c.start) / adur));
        const k = 1 - q;
        GA *= q;
        if (AN.in === 'rise') gdy = k * 90;
        else if (AN.in === 'drop') gdy = -k * 90;
        else if (AN.in === 'pop') gsc *= 1 - 0.25 * k;
        else if (AN.in === 'zoom') gsc *= 1 + 0.5 * k;
        else if (AN.in === 'slideLeft') gdx = k * 420;
        else if (AN.in === 'slideRight') gdx = -k * 420;
      }
      if (AN.out) {
        const q = Math.min(1, Math.max(0, (c.end - time) / adur));
        const k = 1 - q;
        GA *= q;
        if (AN.out === 'sink') gdy = k * 90;
        else if (AN.out === 'rise') gdy = -k * 90;
        else if (AN.out === 'shrink') gsc *= 1 - 0.25 * k;
        else if (AN.out === 'slideOut') gdx = -k * 420;
      }
    }
    if (GA <= 0.002) return;
    if (AN || kfScale !== 1 || kfAlpha !== 1) {
      ctx.save();
      ctx.globalAlpha = GA;
      if (gdx || gdy || gsc !== 1) {
        const ccx = (p.position?.x ?? 0.5) * W, ccy = (p.position?.y ?? 0.5) * H;
        ctx.translate(ccx + gdx, ccy + gdy);
        ctx.scale(gsc, gsc);
        ctx.translate(-ccx, -ccy);
      }
    }
    const dur = Math.max(0.01, c.end - c.start);
    const prog = Math.min(1, Math.max(0, (time - c.start) / dur));
    const enterProg = Math.min(1, (time - c.start) / Math.min(0.4, dur * 0.4));
    const easeOut = enterProg * (2 - enterProg);

    // 0. Custom Code Overlays / Declarative Scene / SVG Vector Stage (codeOverlay_*, params.code, params.scene, params.svg)
    if ((c.componentId && c.componentId.startsWith('codeOverlay_')) || p.code || Array.isArray(p.scene) || p.svg || Array.isArray(p.svgLayers)) {
      ctx.save();
      const localTime = Math.max(0, time - c.start);
      const words = opts.words || [];
      /* Live stage boxes of the other visible components, so code can dock
         gestures, arrows and layouts to them (sw.boxOf('statBadge')). */
      const boxes = [];
      for (const o of allActive) {
        if (o === c) continue;
        const b = ecComponentBox(o, W, H);
        if (b) boxes.push(Object.assign(swPx(b.cx - b.w / 2, b.cy - b.h / 2, b.w, b.h), { id: o.id, componentId: o.componentId }));
      }
      const boxOf = id => boxes.find(b => b.id === id) || boxes.find(b => b.componentId === id) || null;
      const sw = Object.assign({}, SWDraw, {
        prog, enter: easeOut, dur, localTime, time, W, H, theme: T, words,
        boxes, boxOf, safe: SWDraw.layout.safe(W, H),
        character: (cx, o) => SWDraw.character(cx, Object.assign({ W, H, time, localTime, words, boxOf, boxes, castTable: opts.cast }, o)),
        cast: opts.cast || {},
        speakerAt: t => SWDraw.speakerAt(words, t == null ? time : t),
        svgLayers: (cx, layers, o) => SWDraw.svgLayers(cx, layers, Object.assign({ W, H, localTime }, o)),
        drawScene: (cx, nodes) => SWDraw.drawScene(cx, nodes, W, H, time, prog, words, { localTime, boxOf, boxes, cast: opts.cast })
      });
      if (Array.isArray(p.scene)) {
        SWDraw.drawScene(ctx, p.scene, W, H, time, prog, words, { localTime, boxOf, boxes, cast: opts.cast });
      }
      if (Array.isArray(p.svgLayers)) {
        SWDraw.svgLayers(ctx, p.svgLayers, {
          viewBox: p.viewBox, box: p.box, preserveAspectRatio: p.preserveAspectRatio, W, H, localTime
        });
      }
      if (p.svg) {
        SWDraw.svgPath(ctx, p.svg, Object.assign({ progress: p.trimProgress != null ? p.trimProgress : easeOut }, p));
      }
      if (p.code) {
        if (!c._compiled || c._compiledSrc !== p.code) {
          try {
            c._compiled = new Function('ctx', 'W', 'H', 'time', 'localTime', 'params', 'words', 'sw', p.code);
            c._compiledSrc = p.code;
          } catch (err) {
            console.warn('Failed to compile codeOverlay:', c.componentId, err);
            c._compiled = null;
          }
        }
        if (c._compiled) {
          /* A throwing overlay skips its own drawing for that frame; the
             other components and the frame still render. */
          ctx.save();
          try {
            c._compiled(ctx, W, H, time, localTime, p, opts.words || [], sw);
          } catch (err) {
            if (c._failedSrc !== p.code) {
              c._failedSrc = p.code;
              console.warn('codeOverlay threw:', c.componentId, err);
            }
          }
          ctx.restore();
        }
      }
      ctx.restore();
    }

    // 0b. conversation: a podcast / interview studio directed from the transcript's speakers
    else if (c.componentId === 'conversation') {
      SWDraw.conversation(ctx, Object.assign({}, p, {
        W, H, time, localTime: Math.max(0, time - c.start), words: opts.words || [],
        castTable: opts.cast || {}, theme: T
      }));
    }

    // 0c. story: the cast acting scenes on illustrated sets, directed from the transcript
    else if (c.componentId === 'story') {
      SWDraw.story(ctx, Object.assign({}, p, {
        W, H, time, words: opts.words || [], castTable: opts.cast || {}, theme: T, duration: c.end
      }));
    }

    // 1. circleShape (pulse, sonar, orbit, ring, halo)
    else if (c.componentId === 'circleShape') {
      const x = (p.position?.x ?? 0.5) * W, y = (p.position?.y ?? 0.5) * H;
      const rad = (p.radius || 120) * easeOut;
      const style = (p.style || 'pulse').toLowerCase();
      const col = p.color || T.accent;

      ctx.save();
      if (style === 'pulse') {
        for (let ring = 0; ring < 3; ring++) {
          const ringP = ((time * (p.speed || 1.0) + ring * 0.33) % 1.0);
          const r = rad * (0.6 + ringP * 0.9);
          const a = Math.max(0, 1 - ringP) * (p.opacity || 0.8);
          ctx.strokeStyle = col;
          ctx.globalAlpha = GA * a;
          ctx.lineWidth = p.strokeWidth || 3;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.fillStyle = col;
        ctx.globalAlpha = GA * 0.9;
        ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();

      } else if (style === 'sonar' || style === 'radar') {
        ctx.strokeStyle = col;
        ctx.globalAlpha = GA * 0.4;
        ctx.lineWidth = 1.5;
        [0.35, 0.7, 1.0].forEach(m => {
          ctx.beginPath(); ctx.arc(x, y, rad * m, 0, Math.PI * 2); ctx.stroke();
        });
        const sweepAngle = (time * (p.speed || 2.5)) % (Math.PI * 2);
        const beamGrad = ctx.createRadialGradient(x, y, 2, x, y, rad);
        beamGrad.addColorStop(0, col);
        beamGrad.addColorStop(1, 'transparent');
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, rad, sweepAngle - 0.45, sweepAngle);
        ctx.closePath();
        ctx.fillStyle = beamGrad;
        ctx.globalAlpha = GA * 0.35;
        ctx.fill();
        ctx.restore();

      } else if (style === 'orbit') {
        ctx.strokeStyle = col;
        ctx.globalAlpha = GA * 0.3;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.stroke();
        const cGlow = ctx.createRadialGradient(x, y, 2, x, y, rad * 0.35);
        cGlow.addColorStop(0, col);
        cGlow.addColorStop(1, 'transparent');
        ctx.fillStyle = cGlow;
        ctx.globalAlpha = GA * 0.7;
        ctx.beginPath(); ctx.arc(x, y, rad * 0.35, 0, Math.PI * 2); ctx.fill();
        const orbAngle = time * (p.speed || 1.8);
        const satX = x + Math.cos(orbAngle) * rad, satY = y + Math.sin(orbAngle) * rad;
        ctx.fillStyle = p.secondaryColor || T.ink;
        ctx.globalAlpha = GA * 1;
        ctx.shadowColor = col; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.arc(satX, satY, 7, 0, Math.PI * 2); ctx.fill();

      } else if (style === 'ring') {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(time * (p.speed || 0.8));
        ctx.strokeStyle = col;
        ctx.lineWidth = p.strokeWidth || 4;
        ctx.setLineDash([16, 12]);
        ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();

      } else { // 'halo'
        const hGrad = ctx.createRadialGradient(x, y, rad * 0.2, x, y, rad);
        hGrad.addColorStop(0, col);
        hGrad.addColorStop(0.6, col + '44');
        hGrad.addColorStop(1, 'transparent');
        ctx.fillStyle = hGrad;
        ctx.globalAlpha = GA * p.opacity || 0.65;
        ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      }
      const circleLabel = p.label || p.text || '';
      if (circleLabel) {
        ctx.globalAlpha = GA * easeOut;
        ctx.font = '800 ' + Math.round(28 * (p.textScale || 1)) + 'px ' + (p.fontFamily || '"Space Grotesk", sans-serif');
        ctx.fillStyle = p.textColor || T.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.85)';
        ctx.shadowBlur = 12;
        ctx.fillText(String(circleLabel), x, y + rad + 36);
      }
      ctx.restore();

    // 2. imageOverlay
    } else if (c.componentId === 'imageOverlay') {
      const x = (p.position?.x ?? 0.5) * W, y = (p.position?.y ?? 0.5) * H;
      const w = p.width || 440, h = p.height || 300;
      const r = p.borderRadius || 18;
      const zoom = 1 + 0.05 * prog;
      const TS = p.textScale || 1;

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(easeOut, easeOut);
      ctx.shadowColor = p.glowColor || 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 32;

      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, r);
      ctx.fillStyle = p.backgroundColor || 'rgba(15, 23, 42, 0.9)';
      ctx.fill();

      const img = getImage(p.url || p.src);
      if (img) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2, w, h, r);
        ctx.clip();
        ctx.scale(zoom, zoom);
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();
      }

      ctx.strokeStyle = p.borderColor || 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, r);
      ctx.stroke();

      if (p.caption) {
        ctx.font = '600 ' + Math.round(36 * TS) + 'px "Space Grotesk", sans-serif';
        ctx.fillStyle = p.captionColor || T.ink;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(p.caption, 0, h / 2 + 24);
      }
      ctx.restore();

    // 3. quoteBox
    } else if (c.componentId === 'quoteBox') {
      const x = (p.position?.x ?? 0.5) * W, y = (p.position?.y ?? 0.5) * H;
      const w = p.width || 680;
      const r = 20;
      const TS = p.textScale || 1;
      const quote = p.quote || p.text || '';
      const authorLine = p.author ? p.author + (p.role ? ' • ' + p.role : '') : '';
      const pad = 34, markH = 54, authorH = authorLine ? 40 : 0;
      const innerW = w - pad * 2;

      /* Wrap first: an explicit height shrinks the type until the quote fits;
         without one the card grows to the text (capped to the frame). The old
         single-line fillText ran straight off the card for any long quote. */
      let size = Math.round(44 * TS);
      let lines = ecWrap(ctx, quote, innerW, size, 600);
      let lh = size * 1.28;
      const maxH = H * 0.72;
      let h = p.height || Math.max(260, pad * 2 + markH + authorH + lines.length * lh);
      h = Math.min(h, maxH);
      while (pad * 2 + markH + authorH + lines.length * lh > h && size > 14) {
        size = Math.round(size * 0.9);
        lines = ecWrap(ctx, quote, innerW, size, 600);
        lh = size * 1.28;
      }

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(easeOut, easeOut);
      ctx.fillStyle = p.cardColor || T.paper;
      ctx.strokeStyle = p.borderColor || 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 28;
      ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, r); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;

      /* Text stays inside the plate even if an explicit height is too tight. */
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, Math.max(0, r - 2));
      ctx.clip();

      ctx.font = '900 64px "Cinzel", serif';
      ctx.fillStyle = p.accentColor || T.accent;
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('“', -w / 2 + 32, -h / 2 + 65);

      const top = -h / 2 + pad + markH;
      const bottom = h / 2 - pad - authorH;
      const blockH = lines.length * lh;
      const startY = top + Math.max(0, (bottom - top - blockH) / 2);
      ctx.font = '600 ' + size + 'px "Space Grotesk", sans-serif';
      ctx.fillStyle = p.textColor || T.ink;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], 0, startY + lh * (i + 0.5));
      }

      if (authorLine) {
        ctx.font = '700 ' + Math.round(20 * TS) + 'px "Space Grotesk", sans-serif';
        ctx.fillStyle = p.accentColor || T.accent;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(authorLine, 0, h / 2 - pad - authorH / 2 + 4);
      }
      ctx.restore();
      ctx.restore();

    // 4. statBadge / calloutBox
    } else if (c.componentId === 'statBadge' || c.componentId === 'calloutBox') {
      const x = (p.position?.x ?? 0.5) * W, y = (p.position?.y ?? 0.5) * H;
      const TS = p.textScale || 1;
      const fontFam = p.fontFamily || '"Space Grotesk", "Outfit", sans-serif';
      const accCol = p.accentColor || p.color || T.accent;
      const mainText = p.value != null ? String(p.value) : (p.title != null ? String(p.title) : (p.text || ''));
      const subText = p.label || p.sublabel || '';
      const thirdText = p.subtitle || '';
      let mainSize = Math.round(74 * TS);
      let labelSize = Math.round(34 * TS);
      const subSize = Math.round(24 * TS);
      ctx.font = '800 ' + mainSize + 'px ' + fontFam;
      let tw1 = ctx.measureText(mainText).width;
      ctx.font = '600 ' + labelSize + 'px ' + fontFam;
      let tw2 = ctx.measureText(subText).width;
      while ((tw1 > W * 0.76 || tw2 > W * 0.76) && labelSize > 18) {
        mainSize = Math.round(mainSize * 0.92);
        labelSize = Math.round(labelSize * 0.92);
        ctx.font = '800 ' + mainSize + 'px ' + fontFam;
        tw1 = ctx.measureText(mainText).width;
        ctx.font = '600 ' + labelSize + 'px ' + fontFam;
        tw2 = ctx.measureText(subText).width;
      }
      ctx.font = '500 ' + subSize + 'px ' + fontFam;
      const tw3 = thirdText ? ctx.measureText(thirdText).width : 0;
      const gap = subText ? 16 : 0;
      const gap2 = thirdText ? 12 : 0;
      const hasDelta = !!p.delta;
      const dSize = Math.round(28 * TS);
      const deltaBand = hasDelta ? dSize + 30 : 0;
      const mainH = mainText ? mainSize : 0;
      const contentH = mainH + (subText ? gap + labelSize : 0) + (thirdText ? gap2 + subSize : 0);
      const w = Math.min(W * 0.88, Math.max(p.width || 520, tw1 + 110, tw2 + 110, tw3 + 110));
      const h = Math.max(p.height || 180, deltaBand + contentH + 64);
      const r = 20;

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(easeOut, easeOut);
      ctx.fillStyle = p.backgroundColor || 'rgba(9, 14, 28, 0.92)';
      ctx.strokeStyle = p.borderColor || accCol;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = accCol + '55';
      ctx.shadowBlur = 28;
      ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, r); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;

      /* The delta chip owns the top band; the value/label block is centred in
         the space below it, so a wide main line can never run through it. */
      const areaTop = -h / 2 + deltaBand;
      const areaH = h - deltaBand;
      const blockTop = areaTop + Math.max(0, (areaH - contentH) / 2);
      const mainY = blockTop + mainH / 2;
      const labelY = blockTop + mainH + gap + labelSize / 2;
      const subY = blockTop + mainH + (subText ? gap + labelSize : 0) + gap2 + subSize / 2;

      if (mainText) {
        ctx.font = '800 ' + mainSize + 'px ' + fontFam;
        ctx.fillStyle = p.valueColor || accCol;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(mainText, 0, mainY);
      }

      if (subText) {
        ctx.font = '600 ' + labelSize + 'px ' + fontFam;
        ctx.fillStyle = p.labelColor || T.ink;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(subText, 0, labelY);
      }

      if (thirdText) {
        ctx.font = '500 ' + subSize + 'px ' + fontFam;
        ctx.fillStyle = p.subtitleColor || 'rgba(244, 248, 255, 0.72)';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(thirdText, 0, subY);
      }

      if (hasDelta) {
        ctx.font = '800 ' + dSize + 'px ' + fontFam;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const dw = ctx.measureText(p.delta).width;
        const ph = dSize + 20, pw = dw + 34;
        const px = w / 2 - pw / 2 - 24, py = -h / 2 + 20 + ph / 2;
        const dCol = p.deltaColor || accCol;
        ctx.fillStyle = dCol + '2E';
        ctx.beginPath(); ctx.roundRect(px - pw / 2, py - ph / 2, pw, ph, ph / 2); ctx.fill();
        ctx.strokeStyle = dCol + '80'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.roundRect(px - pw / 2, py - ph / 2, pw, ph, ph / 2); ctx.stroke();
        ctx.fillStyle = dCol;
        ctx.font = '800 ' + dSize + 'px ' + fontFam;
        ctx.fillText(p.delta, px, py);
      }
      ctx.restore();

    // 5. chapterCard
    } else if (c.componentId === 'chapterCard') {
      const x = (p.position?.x ?? 0.5) * W, y = (p.position?.y ?? 0.3) * H;
      const TS = p.textScale || 1;
      const accCol = p.accentColor || p.color || T.accent;
      const fontFam = p.fontFamily || '"Cinzel", "Space Grotesk", serif';
      const kicker = p.chapter || p.label || '';
      const titleStr = p.title || p.text || '';
      const subStr = p.subtitle || '';
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(easeOut, easeOut);

      if (kicker) {
        ctx.font = '800 ' + Math.round(30 * TS) + 'px "Space Grotesk", sans-serif';
        ctx.fillStyle = accCol;
        ctx.letterSpacing = '3px';
        ctx.textAlign = 'center';
        ctx.fillText(String(kicker).toUpperCase(), 0, -44);
      }

      let tSize = Math.round(58 * TS);
      ctx.font = '900 ' + tSize + 'px ' + fontFam;
      while (ctx.measureText(titleStr).width > W * 0.84 && tSize > 26) {
        tSize = Math.round(tSize * 0.92);
        ctx.font = '900 ' + tSize + 'px ' + fontFam;
      }
      ctx.fillStyle = p.titleColor || T.ink;
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0,0,0,0.75)';
      ctx.shadowBlur = 16;
      ctx.fillText(titleStr, 0, 12);
      ctx.shadowBlur = 0;

      const lineLen = Math.min(340, 340 * (enterProg * 1.2));
      ctx.strokeStyle = accCol;
      ctx.lineWidth = 3.5;
      ctx.shadowColor = accCol; ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(-lineLen / 2, 38);
      ctx.lineTo(lineLen / 2, 38);
      ctx.stroke();
      ctx.shadowBlur = 0;

      if (subStr) {
        ctx.font = '600 ' + Math.round(28 * TS) + 'px "Space Grotesk", sans-serif';
        ctx.fillStyle = p.subtitleColor || 'rgba(244, 248, 255, 0.82)';
        ctx.textAlign = 'center';
        ctx.fillText(subStr, 0, 78);
      }
      ctx.restore();

    // 6. gaugeMeter
    } else if (c.componentId === 'gaugeMeter') {
      const x = (p.position?.x ?? 0.5) * W, y = (p.position?.y ?? 0.5) * H;
      const rad = p.radius || 115;
      const fromVal = ecN(Number(p.from ?? p.min ?? 0), 0);
      const toVal = ecN(Number(p.to ?? p.value ?? 100), 100);
      const maxVal = ecN(Number(p.max ?? Math.max(toVal, 100)), Math.max(toVal, 100));
      const animP = 1 - Math.pow(1 - Math.min(1, prog * 1.35), 3);
      const curVal = fromVal + (toVal - fromVal) * animP;
      const fillFrac = ecClamp((curVal - fromVal) / Math.max(1e-6, maxVal - fromVal), 0, 1);
      const col = p.color || T.accent;

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(easeOut, easeOut);
      const startAngle = Math.PI * 0.75, endAngle = Math.PI * 2.25;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
      ctx.lineWidth = 16;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(0, 0, rad, startAngle, endAngle); ctx.stroke();

      const curAngle = startAngle + (endAngle - startAngle) * fillFrac;
      ctx.strokeStyle = col;
      ctx.shadowColor = col; ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.arc(0, 0, rad, startAngle, curAngle); ctx.stroke();
      ctx.shadowBlur = 0;

      const TS = p.textScale || 1;
      const unitStr = p.unit != null ? (' ' + p.unit) : '%';
      ctx.font = '800 ' + Math.round(52 * TS) + 'px ' + (p.fontFamily || '"Space Grotesk", sans-serif');
      ctx.fillStyle = T.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(curVal) + unitStr.trim(), 0, 0);

      if (p.label) {
        ctx.font = '600 ' + Math.round(30 * TS) + 'px ' + (p.fontFamily || '"Space Grotesk", sans-serif');
        ctx.fillStyle = p.labelColor || T.ink;
        ctx.fillText(p.label, 0, rad + 36);
      }
      ctx.restore();

    // 7. dividerLine
    } else if (c.componentId === 'dividerLine') {
      const y = (p.position?.y ?? 0.5) * H;
      const maxW = (p.width || 0.8) * W;
      const curW = maxW * easeOut;
      const col = p.color || T.accent;

      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = p.strokeWidth || 7;
      ctx.shadowColor = col; ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo((W - curW) / 2, y);
      ctx.lineTo((W + curW) / 2, y);
      ctx.stroke();
      ctx.restore();

    // 8. iconPop
    } else if (c.componentId === 'iconPop') {
      const x = (p.position?.x ?? 0.5) * W, y = (p.position?.y ?? 0.5) * H;
      const size = ecN(Number(p.size), 0) || 64;
      const col = p.color || T.accent;
      const bounce = Math.sin(time * 3) * 6;

      ctx.save();
      ctx.translate(x, y + bounce);
      ctx.scale(easeOut, easeOut);
      ctx.fillStyle = col;
      ctx.shadowColor = col; ctx.shadowBlur = 24;

      const icon = (p.icon || 'star').toLowerCase();
      if (icon === 'star') {
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          ctx.lineTo(Math.cos((18 + i * 72) * Math.PI / 180) * size, -Math.sin((18 + i * 72) * Math.PI / 180) * size);
          ctx.lineTo(Math.cos((54 + i * 72) * Math.PI / 180) * (size * 0.45), -Math.sin((54 + i * 72) * Math.PI / 180) * (size * 0.45));
        }
        ctx.closePath(); ctx.fill();
      } else if (icon === 'fire') {
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.bezierCurveTo(size * 0.6, -size * 0.4, size * 0.8, size * 0.3, 0, size);
        ctx.bezierCurveTo(-size * 0.8, size * 0.3, -size * 0.6, -size * 0.4, 0, -size);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(0, -size); ctx.lineTo(size * 0.65, 0); ctx.lineTo(0, size); ctx.lineTo(-size * 0.65, 0);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();

    // 9. badgePill
    } else if (c.componentId === 'badgePill' || c.componentId === 'shapeBadge') {
      const x = (p.position?.x ?? 0.5) * W, y = (p.position?.y ?? 0.5) * H;
      const text = String(p.text || p.label || p.title || '');
      ctx.save();
      const TS = p.textScale || 1;
      const fontFam = p.fontFamily || '"Space Grotesk", sans-serif';
      let fSize = Math.round(28 * TS);
      ctx.font = '800 ' + fSize + 'px ' + fontFam;
      while (ctx.measureText(text).width > W * 0.82 && fSize > 16) {
        fSize = Math.round(fSize * 0.92);
        ctx.font = '800 ' + fSize + 'px ' + fontFam;
      }
      const tw = ctx.measureText(text).width;
      const pw = Math.min(W * 0.9, tw + 68), ph = Math.round(62 * TS);
      const bgCol = p.backgroundColor || p.color || T.accent;

      ctx.translate(x, y);
      ctx.scale(easeOut, easeOut);
      ctx.fillStyle = bgCol;
      ctx.shadowColor = bgCol + '66';
      ctx.shadowBlur = 20;
      ctx.beginPath(); ctx.roundRect(-pw / 2, -ph / 2, pw, ph, 9999); ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = p.textColor || ec2InkOn(bgCol);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 0, 1);
      ctx.restore();

    // 9b. splitScreen: two panes with a divider and optional per-pane captions
    } else if (c.componentId === 'splitScreen') {
      const dir = (p.direction || 'vertical').toLowerCase();
      const gap = Math.max(0, p.gap == null ? 12 : p.gap);
      const leftCol = p.leftColor || p.color || T.accent;
      const rightCol = p.rightColor || p.secondaryColor || T.accent2;
      const vertical = dir !== 'horizontal';
      const paneW = vertical ? (W - gap) / 2 : W;
      const paneH = vertical ? H : (H - gap) / 2;
      const tint = p.opacity == null ? 0.22 : p.opacity;
      ctx.save();
      ctx.globalAlpha = GA * tint;
      ctx.fillStyle = leftCol;
      ctx.fillRect(0, 0, paneW, paneH);
      ctx.fillStyle = rightCol;
      if (vertical) ctx.fillRect(paneW + gap, 0, paneW, paneH);
      else ctx.fillRect(0, paneH + gap, paneW, paneH);
      ctx.globalAlpha = GA;
      ctx.strokeStyle = p.borderColor || leftCol;
      ctx.lineWidth = p.strokeWidth || 4;
      ctx.shadowColor = leftCol; ctx.shadowBlur = 16;
      ctx.beginPath();
      if (vertical) {
        ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H);
      } else {
        ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = GA * (p.labelOpacity == null ? 0.92 : p.labelOpacity);
      if (p.labelColor) ctx.fillStyle = p.labelColor;
      const labels = vertical ? [p.leftLabel, p.rightLabel] : [p.topLabel, p.bottomLabel];
      const spots = vertical ? [[paneW / 2, H / 2], [paneW + gap + paneW / 2, H / 2]]
                             : [[W / 2, paneH / 2], [W / 2, paneH + gap + paneH / 2]];
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '800 ' + Math.round((p.size || 64) * 0.6) + 'px "Space Grotesk", sans-serif';
      labels.forEach((label, i) => {
        if (label) ctx.fillText(String(label), spots[i][0], spots[i][1]);
      });
      ctx.restore();

    // 9c. pictureInPicture: a framed inset window
    } else if (c.componentId === 'pictureInPicture') {
      const pos = pointOf(p.position, 0.72, 0.24);
      const x = pos.x * W, y = pos.y * H;
      const w = p.width || 400, h = p.height || 250;
      const r = p.borderRadius || 18;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(easeOut, easeOut);
      ctx.shadowColor = p.glowColor || 'rgba(0, 0, 0, 0.75)';
      ctx.shadowBlur = 34;
      ctx.fillStyle = p.backgroundColor || T.paper;
      ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, r); ctx.fill();
      const img = getImage(p.src || p.url);
      if (img) {
        ctx.save();
        ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, r); ctx.clip();
        ctx.drawImage(img, -w / 2, -h / 2, w, h);
        ctx.restore();
      }
      ctx.shadowBlur = 0;
      ctx.strokeStyle = p.borderColor || T.accent;
      ctx.lineWidth = p.strokeWidth || 4;
      ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, r); ctx.stroke();
      if (p.label) {
        ctx.fillStyle = p.labelColor || T.ink;
        ctx.font = '700 ' + Math.round((p.textScale || 1) * 42) + 'px "Space Grotesk", sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(String(p.label), 0, h / 2 - 18);
      }
      ctx.restore();

    // 9d. textBehindSubject: a headline partly hidden by a foreground subject
    } else if (c.componentId === 'textBehindSubject') {
      const pos = pointOf(p.position, 0.5, 0.5);
      const x = pos.x * W, y = pos.y * H;
      const text = p.text || p.title || '';
      const ts = p.textScale || 1;
      const textCol = p.textColor || T.ink;
      const subjCol = p.subjectColor || T.accent;
      const subjW = Math.max(0.1, Number(p.subjectWidth) || 0.46) * W;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(easeOut, easeOut);
      ctx.font = '900 ' + Math.round(132 * ts) + 'px "Cinzel", "Space Grotesk", serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(2, 5, 12, 0.85)'; ctx.shadowBlur = 18;
      ctx.fillStyle = textCol;
      ctx.fillText(text, 0, 0);
      ctx.shadowBlur = 0;
      // the subject in front: head + shoulders silhouette
      const headR = subjW * 0.20, headY = H * 0.05;
      ctx.fillStyle = subjCol;
      ctx.beginPath(); ctx.arc(0, headY, headR, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0, headY + headR * 1.5, subjW * 0.44, headR * 1.8, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      if (p.subtitle) {
        ctx.fillStyle = p.subtitleColor || textCol;
        ctx.font = '600 ' + Math.round(34 * (p.textScale || 1)) + 'px "Space Grotesk", sans-serif';
        ctx.textBaseline = 'top';
        ctx.fillText(p.subtitle, 0, headR * 2.4);
      }
      ctx.restore();

    // 10. arrowPointer — Target-Aware, Auto-Docking, Animated Curved/Straight Vector Pointer
    } else if (c.componentId === 'arrowPointer') {
      const fp = pointOf(p.from, 0.25, 0.68), tp = pointOf(p.to, p.position?.x ?? 0.5, p.position?.y ?? 0.5);
      let fromX = fp.x * W, fromY = fp.y * H;
      let toX = tp.x * W, toY = tp.y * H;

      /* Target / source component resolution & automatic bounding-box docking:
         if `targetId` / `toId` is given, or if (toX, toY) lands inside another
         active component on stage, dock the arrowhead cleanly to its outer edge! */
      let targetBox = null, fromBox = null;
      for (let k = 0; k < allActive.length; k++) {
        const other = allActive[k];
        if (!other || other.id === c.id) continue;
        const box = ecComponentBox(other, W, H);
        if (!box) continue;
        if (p.targetId && (other.id === p.targetId || other.componentId === p.targetId)) {
          targetBox = box;
          toX = box.cx; toY = box.cy;
        } else if (!targetBox && p.dock !== false &&
                   Math.abs(toX - box.cx) <= box.w * 0.52 &&
                   Math.abs(toY - box.cy) <= box.h * 0.52) {
          targetBox = box;
        }
        if (p.fromId && (other.id === p.fromId || other.componentId === p.fromId)) {
          fromBox = box;
          fromX = box.cx; fromY = box.cy;
        }
      }
      if (fromBox && p.dock !== false) {
        const d0 = ecDockRayToBox(toX, toY, fromX, fromY, fromBox, p.fromGap ?? 14);
        fromX = d0.x; fromY = d0.y;
      }
      if (targetBox && p.dock !== false) {
        const d1 = ecDockRayToBox(fromX, fromY, toX, toY, targetBox, p.targetGap ?? 18);
        toX = d1.x; toY = d1.y;
      }

      const col = p.color || T.accent;
      const drawProg = SWDraw.easeOut(Math.min(1, Math.max(0.05, (time - c.start) / Math.min(0.55, dur * 0.55))));
      const cur = p.straight ? 0 : (p.curve != null ? Number(p.curve) : (p.curvature != null ? Number(p.curvature) : 0.14));
      const dx = toX - fromX, dy = toY - fromY, dist = Math.hypot(dx, dy) || 1;
      const ctrlX = (fromX + toX) / 2 - (dy / dist) * cur * dist;
      const ctrlY = (fromY + toY) / 2 + (dx / dist) * cur * dist;

      /* De Casteljau split of quadratic Bezier [0..drawProg] so the shaft grows
         smoothly and the arrowhead always rides the exact animated tip! */
      const u = drawProg;
      const q1x = fromX + (ctrlX - fromX) * u, q1y = fromY + (ctrlY - fromY) * u;
      const q2x = ctrlX + (toX - ctrlX) * u, q2y = ctrlY + (toY - ctrlY) * u;
      const tipX = q1x + (q2x - q1x) * u, tipY = q1y + (q2y - q1y) * u;
      const angle = Math.atan2(tipY - q1y, tipX - q1x);

      const lw = p.strokeWidth || p.width || 6.5;
      const headLen = p.headLength || 28, headHalf = p.headWidth || 13;
      const shaftEndX = tipX - Math.cos(angle) * (headLen * 0.72);
      const shaftEndY = tipY - Math.sin(angle) * (headLen * 0.72);

      ctx.save();
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.shadowColor = col;
      ctx.shadowBlur = 16;

      // Tail origin dot
      ctx.beginPath();
      ctx.arc(fromX, fromY, lw * 0.95, 0, Math.PI * 2);
      ctx.fill();

      // Animated curved/straight shaft
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.quadraticCurveTo(q1x, q1y, shaftEndX, shaftEndY);
      ctx.stroke();

      // Sleek notched vector arrowhead at (tipX, tipY)
      const baseX = tipX - Math.cos(angle) * headLen;
      const baseY = tipY - Math.sin(angle) * headLen;
      const notchX = tipX - Math.cos(angle) * (headLen * 0.76);
      const notchY = tipY - Math.sin(angle) * (headLen * 0.76);
      const px = Math.cos(angle + Math.PI / 2) * headHalf;
      const py = Math.sin(angle + Math.PI / 2) * headHalf;
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(baseX + px, baseY + py);
      ctx.lineTo(notchX, notchY);
      ctx.lineTo(baseX - px, baseY - py);
      ctx.closePath();
      ctx.fill();

      // Subtle target lock ring once the arrow reaches the destination
      if (drawProg > 0.85) {
        const ringPulse = (time * 2.2) % 1;
        ctx.shadowBlur = 0;
        ctx.globalAlpha = GA * (1 - ringPulse) * 0.65;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(toX, toY, 8 + ringPulse * 22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = GA;
      }

      // Optional tail pill label (`p.label || p.text`)
      const arrowLabel = p.label || p.text || '';
      if (arrowLabel) {
        ctx.shadowBlur = 0;
        const fSize = Math.round(24 * (p.textScale || 1));
        ctx.font = '700 ' + fSize + 'px ' + (p.fontFamily || '"Space Grotesk", sans-serif');
        const tw = ctx.measureText(arrowLabel).width;
        const pw = tw + 36, ph = fSize + 22;
        const lx = ecClamp(fromX, pw / 2 + 24, W - pw / 2 - 24);
        const ly = dy < 0 ? fromY + ph / 2 + 16 : fromY - ph / 2 - 16;
        ctx.fillStyle = 'rgba(9, 14, 28, 0.92)';
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(lx - pw / 2, ly - ph / 2, pw, ph, ph / 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = p.textColor || T.ink;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(arrowLabel, lx, ly + 1);
      }
      ctx.restore();

    // 11. spotlight
    } else if (c.componentId === 'spotlight') {
      const x = (p.position?.x ?? 0.5) * W, y = (p.position?.y ?? 0.5) * H;
      const rad = p.radius || 240;
      ctx.save();
      const spot = ctx.createRadialGradient(x, y, rad * 0.7, x, y, rad * 1.4);
      spot.addColorStop(0, 'transparent');
      spot.addColorStop(1, 'rgba(0, 0, 0, ' + (p.dimness || 0.75) + ')');
      ctx.fillStyle = spot;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

    // 12b. clickHighlight
    } else if (c.componentId === 'clickHighlight') {
      const x = (p.position?.x ?? 0.5) * W, y = (p.position?.y ?? 0.5) * H;
      const bw = p.width || 420, bh = p.height || 260;
      const pop = 1 + Math.sin(time * 4) * 0.03;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(easeOut * pop, easeOut * pop);
      ctx.strokeStyle = p.color || T.accent;
      ctx.lineWidth = 4;
      ctx.setLineDash([18, 10]);
      ctx.lineDashOffset = -time * 40;
      ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
      ctx.setLineDash([]);
      ctx.lineWidth = 7;
      const tick = 28;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(pair => {
        const sx = pair[0], sy = pair[1];
        ctx.beginPath();
        ctx.moveTo(sx * (bw / 2 - tick), sy * (bh / 2));
        ctx.lineTo(sx * (bw / 2), sy * (bh / 2));
        ctx.lineTo(sx * (bw / 2), sy * (bh / 2 - tick));
        ctx.stroke();
      });
      ctx.restore();

    // 12c. highlightMarker
    } else if (c.componentId === 'highlightMarker') {
      const x = (p.position?.x ?? 0.5) * W, y = (p.position?.y ?? 0.5) * H;
      const col = p.color || T.accent;
      const rad = p.radius || 90;
      ctx.save();
      const ringP = (time * 1.2) % 1;
      ctx.strokeStyle = col;
      ctx.globalAlpha = GA * Math.max(0, 1 - ringP) * 0.9;
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(x, y, rad * (0.5 + ringP * 0.9), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = GA * 1;
      ctx.fillStyle = col;
      ctx.shadowColor = col; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(x, y, 16, 0, Math.PI * 2); ctx.fill();
      if (p.label) {
        ctx.font = '800 44px "Space Grotesk", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.label, x, y - rad - 28);
      }
      ctx.restore();

    // 12d. brandLogo
    } else if (c.componentId === 'brandLogo') {
      const x = (p.position?.x ?? 0.12) * W, y = (p.position?.y ?? 0.06) * H;
      const size = ecN(Number(p.size), 0) || 120;
      const img = getImage(p.url || p.src);
      ctx.save();
      ctx.globalAlpha = GA * (p.opacity ?? 0.9) * easeOut;
      if (img) {
        ctx.drawImage(img, x - size / 2, y - size / 2, size, size * (img.naturalHeight / img.naturalWidth));
      } else {
        const mono = initialsOf(p.text || opts.docName || '');
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.strokeStyle = p.color || T.accent;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(x - size / 2, y - size * 0.31, size, size * 0.62, 12); ctx.fill(); ctx.stroke();
        ctx.font = '900 ' + Math.round(size * 0.34) + 'px "Space Grotesk", sans-serif';
        ctx.fillStyle = p.color || T.accent;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(mono, x, y);
      }
      ctx.restore();


    // 12e. flowConnector / linkNodes: curved, flowing, meaningful links
    } else if (c.componentId === 'flowConnector' || c.componentId === 'linkNodes') {
      const from = pointOf(p.from, 0.3, 0.3), to = pointOf(p.to, 0.7, 0.5);
      const x1 = from.x * W, y1 = from.y * H, x2 = to.x * W, y2 = to.y * H;
      const cur = p.curvature == null ? 0.18 : p.curvature;
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const dx = x2 - x1, dy = y2 - y1, dist = Math.hypot(dx, dy) || 1;
      const cx = mx - dy / dist * cur * dist, cy = my + dx / dist * cur * dist;
      const col = p.color || T.accent;
      const lw = p.width || 12;
      const isLink = c.componentId === 'linkNodes';
      const nodeR = isLink ? (p.nodeRadius || 46) : 0;

      /* Quadratic tangents: trim the curve to the node rims (links) or to the
         arrowhead base (connectors) so no shaft pokes through the target. */
      const ang = Math.atan2(y2 - cy, x2 - cx);
      const ang0 = Math.atan2(cy - y1, cx - x1);
      const hl = p.headLength || 62;
      const hb = hl * 0.9;
      const sx = isLink ? x1 + Math.cos(ang0) * nodeR : x1;
      const sy = isLink ? y1 + Math.sin(ang0) * nodeR : y1;
      const ex = isLink ? x2 - Math.cos(ang) * nodeR : x2 - Math.cos(ang) * hb;
      const ey = isLink ? y2 - Math.sin(ang) * nodeR : y2 - Math.sin(ang) * hb;

      ctx.save();
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      const style = p.lineStyle || 'flow';
      if (style === 'dashed') {
        ctx.setLineDash([lw * 2.4, lw * 1.6]);
        ctx.lineDashOffset = -time * (p.flowSpeed || 120);
      } else if (style === 'dotted') {
        ctx.setLineDash([2, lw * 1.9]);
        ctx.lineDashOffset = -time * (p.flowSpeed || 160);
        ctx.lineWidth = lw * 1.05;
      } else {
        ctx.setLineDash([]);
      }
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(cx, cy, ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);

      if (p.pulse !== false) {
        const k = (time * (p.pulseSpeed || 0.55)) % 1;
        const qx = t => (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * cx + t * t * x2;
        const qy = t => (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * cy + t * t * y2;
        ecAlpha(ctx, GA, 0.95);
        ctx.fillStyle = p.pulseColor || T.ink;
        ctx.shadowColor = col; ctx.shadowBlur = 22;
        ctx.beginPath(); ctx.arc(qx(k), qy(k), lw * 1.15, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = GA;

      if (isLink) {
        /* Nodes go on top of the connector; their labels are measured down
           until they fit inside the disc instead of running over its rim. */
        const nodeCol = p.nodeColor || col;
        const ink = ec2InkOn(nodeCol);
        for (const node of [[x1, y1, p.fromLabel], [x2, y2, p.toLabel]]) {
          const nx = node[0], ny = node[1], label = node[2];
          ctx.fillStyle = nodeCol;
          ctx.beginPath(); ctx.arc(nx, ny, nodeR, 0, Math.PI * 2); ctx.fill();
          if (!label) continue;
          let ls = Math.round(nodeR * 0.74);
          ctx.font = '700 ' + ls + 'px "Space Grotesk", sans-serif';
          while (ls > 12 && ctx.measureText(label).width > nodeR * 1.7) {
            ls -= 1;
            ctx.font = '700 ' + ls + 'px "Space Grotesk", sans-serif';
          }
          ctx.fillStyle = ink;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(label, nx, ny);
        }
      } else {
        ctx.fillStyle = col;
        const hx = Math.cos(ang + Math.PI / 2) * hl * 0.42;
        const hy = Math.sin(ang + Math.PI / 2) * hl * 0.42;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(ex + hx, ey + hy);
        ctx.lineTo(ex - hx, ey - hy);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

    // 14. typewriter: types its text out, with a blinking caret
    } else if (c.componentId === 'typewriter') {
      const pos = pointOf(p.position, 0.5, 0.45);
      const text = String(p.text || '');
      const shown = text.slice(0, Math.floor(text.length * Math.min(1, prog * 1.5)));
      ctx.save();
      ctx.font = '800 ' + Math.round((p.size || 72) * (p.textScale || 1)) + 'px "Space Grotesk", monospace';
      ctx.fillStyle = p.textColor || T.ink;
      ctx.textAlign = p.align || 'center';
      ctx.textBaseline = 'middle';
      const caret = (time * 2) % 1 < 0.5 ? '▌' : '';
      ctx.fillText(shown + caret, pos.x * W, pos.y * H);
      ctx.restore();

    // 15. neonPulse: expanding neon rings around a core
    } else if (c.componentId === 'neonPulse') {
      const pos = pointOf(p.position, 0.5, 0.45);
      const x = pos.x * W, y = pos.y * H, col = p.color || T.accent;
      const base = p.radius || 160;
      ctx.save();
      for (let i = 0; i < 3; i++) {
        const k = ((time * (p.speed || 0.7)) + i / 3) % 1;
        ctx.globalAlpha = GA * (1 - k) * (p.opacity || 0.9);
        ctx.strokeStyle = col;
        ctx.lineWidth = (p.strokeWidth || 6) * (1 - k * 0.6);
        ctx.shadowColor = col; ctx.shadowBlur = 26;
        ctx.beginPath(); ctx.arc(x, y, base * (0.55 + k * 0.9), 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = GA; ctx.shadowBlur = 0;
      ctx.fillStyle = p.secondaryColor || T.ink;
      ctx.beginPath(); ctx.arc(x, y, base * 0.16 * easeOut, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

    // 16. dataBars: bars grow from the baseline to their values
    } else if (c.componentId === 'dataBars') {
      const pos = pointOf(p.position, 0.5, 0.55);
      const vals = Array.isArray(p.values) ? p.values : [];
      if (vals.length) {
        const bw = p.barWidth || Math.min(90, (W * 0.72) / vals.length);
        const gap = p.gap == null ? bw * 0.35 : p.gap;
        const total = vals.length * bw + (vals.length - 1) * gap;
        const baseY = pos.y * H;
        const maxH = p.height || 320;
        ctx.save();
        vals.forEach((v, i) => {
          const frac = Math.max(0, Math.min(1, Number(v) || 0));
          const h = maxH * frac * easeOut;
          const bx = pos.x * W - total / 2 + i * (bw + gap);
          ctx.fillStyle = Array.isArray(p.colors) ? p.colors[i % p.colors.length] : (p.color || T.accent);
          ctx.globalAlpha = GA;
          ctx.beginPath(); ctx.roundRect(bx, baseY - h, bw, h, Math.min(12, bw * 0.2)); ctx.fill();
        });
        ctx.restore();
      }

    // 17. waveform: symmetric audio-style bars
    } else if (c.componentId === 'waveform') {
      const pos = pointOf(p.position, 0.5, 0.5);
      const bars = p.bars || 28, bw = p.width || 12, gap = p.gap == null ? bw * 0.6 : p.gap;
      const total = bars * bw + (bars - 1) * gap;
      const maxH = p.height || 220;
      ctx.save();
      ctx.fillStyle = p.color || T.accent;
      ctx.globalAlpha = GA;
      for (let i = 0; i < bars; i++) {
        const a = Math.abs(Math.sin(time * (p.speed || 2) + i * 0.55));
        const b = Math.abs(Math.sin(time * (p.speed || 2) * 0.6 + i * 0.31));
        const h = maxH * (0.12 + 0.88 * (0.5 * a + 0.5 * b)) * easeOut;
        const bx = pos.x * W - total / 2 + i * (bw + gap);
        ctx.beginPath(); ctx.roundRect(bx, pos.y * H - h / 2, bw, h, bw / 2); ctx.fill();
      }
      ctx.restore();

    // 18. countdownRing: a ring and number that drain with time
    } else if (c.componentId === 'countdownRing') {
      const pos = pointOf(p.position, 0.5, 0.45);
      const x = pos.x * W, y = pos.y * H, col = p.color || T.accent;
      const secs = Math.max(0.001, p.seconds == null ? 5 : Number(p.seconds));
      const remain = Math.max(0, secs * (1 - prog));
      const rad = p.radius || 110;
      ctx.save();
      ctx.strokeStyle = p.trackColor || T.ink;
      ctx.globalAlpha = GA * 0.25; ctx.lineWidth = p.strokeWidth || 14;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = GA; ctx.strokeStyle = col;
      ctx.shadowColor = col; ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(x, y, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (remain / secs));
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = p.textColor || T.ink;
      ctx.font = '900 ' + Math.round((p.size || 64) * (p.textScale || 1)) + 'px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.ceil(remain)), x, y);
      ctx.restore();

    // 19. terminalPanel: a window whose lines type in
    } else if (c.componentId === 'terminalPanel') {
      const pos = pointOf(p.position, 0.5, 0.5);
      const lines = Array.isArray(p.lines) ? p.lines.map(String) : [];
      if (lines.length) {
        const w = p.width || 660, h = p.height || 380, r = p.borderRadius || 16;
        ctx.save();
        ctx.translate(pos.x * W, pos.y * H);
        ctx.scale(easeOut, easeOut);
        ctx.fillStyle = p.backgroundColor || T.paper;
        ctx.strokeStyle = p.borderColor || T.accent;
        ctx.lineWidth = 3;
        ctx.shadowColor = p.glowColor || T.accent; ctx.shadowBlur = 24;
        ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, r); ctx.fill(); ctx.stroke();
        ctx.shadowBlur = 0;
        [T.accent, T.accent2, T.ink].forEach((col, i) => {
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(-w / 2 + 28 + i * 26, -h / 2 + 26, 7, 0, Math.PI * 2); ctx.fill();
        });
        ctx.font = '600 ' + Math.round((p.size || 26) * (p.textScale || 1)) + 'px "Space Grotesk", monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillStyle = p.textColor || T.ink;
        const reveal = Math.min(1, prog * 1.6);
        lines.forEach((ln, i) => {
          const chars = Math.floor(ln.length * Math.max(0, Math.min(1, reveal * lines.length - i)));
          if (chars > 0) ctx.fillText(ln.slice(0, chars), -w / 2 + 30, -h / 2 + 62 + i * (p.lineHeight || 40));
        });
        ctx.restore();
      }

    // 20. progressRing: circular progress with a percentage
    } else if (c.componentId === 'progressRing') {
      const pos = pointOf(p.position, 0.5, 0.45);
      const x = pos.x * W, y = pos.y * H, col = p.color || T.accent;
      const val = p.value == null ? prog : ecClamp(ecN(Number(p.value), prog), 0, 1);
      const rad = p.radius || 110;
      ctx.save();
      ctx.strokeStyle = p.trackColor || T.ink;
      ctx.globalAlpha = GA * 0.22; ctx.lineWidth = p.strokeWidth || 14;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = GA; ctx.strokeStyle = col;
      ctx.shadowColor = col; ctx.shadowBlur = 16;
      ctx.beginPath(); ctx.arc(x, y, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * val * easeOut); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = p.textColor || T.ink;
      ctx.font = '900 ' + Math.round((p.size || 54) * (p.textScale || 1)) + 'px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(val * 100) + '%', x, y);
      ctx.restore();

    // 21. cornerFrame: four corner brackets that open out
    } else if (c.componentId === 'cornerFrame') {
      const pos = pointOf(p.position, 0.5, 0.5);
      const w = p.width || 640, h = p.height || 420, len = (p.length || 80) * easeOut;
      const x0 = pos.x * W - w / 2, y0 = pos.y * H - h / 2;
      const col = p.color || T.accent;
      ctx.save();
      ctx.strokeStyle = col; ctx.lineWidth = p.strokeWidth || 6; ctx.lineCap = 'round';
      ctx.shadowColor = col; ctx.shadowBlur = 16;
      [[x0, y0, 1, 1], [x0 + w, y0, -1, 1], [x0, y0 + h, 1, -1], [x0 + w, y0 + h, -1, -1]].forEach(pt => {
        const px = pt[0], py = pt[1], dx = pt[2], dy = pt[3];
        ctx.beginPath();
        ctx.moveTo(px, py + dy * len);
        ctx.lineTo(px, py);
        ctx.lineTo(px + dx * len, py);
        ctx.stroke();
      });
      ctx.restore();

    // 22. marqueeTicker: a scrolling band
    } else if (c.componentId === 'marqueeTicker') {
      const text = String(p.text || '');
      if (text) {
        const y = (p.position?.y ?? 0.9) * H, h = p.height || 70;
        ctx.save();
        ctx.fillStyle = p.backgroundColor || T.accent;
        ctx.globalAlpha = GA * (p.opacity ?? 0.9);
        ctx.fillRect(0, y - h / 2, W, h);
        ctx.globalAlpha = GA;
        ctx.font = '800 ' + Math.round((p.size || 30) * (p.textScale || 1)) + 'px "Space Grotesk", sans-serif';
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        ctx.fillStyle = p.textColor || T.accentInk;
        const tw = ctx.measureText(text).width + 80;
        const shift = (time * (p.speed || 120)) % tw;
        for (let x = -shift; x < W; x += tw) ctx.fillText(text, x, y);
        ctx.restore();
      }

    // 23. gridWarp: perspective grid receding to a horizon
    } else if (c.componentId === 'gridWarp') {
      const horizon = (p.position?.y ?? 0.42) * H;
      const col = p.color || T.accent;
      ctx.save();
      ctx.strokeStyle = col; ctx.lineWidth = p.strokeWidth || 2;
      for (let i = -6; i <= 6; i++) {
        ctx.globalAlpha = GA * (p.opacity ?? 0.5);
        ctx.beginPath();
        ctx.moveTo(W / 2 + i * 18, horizon);
        ctx.lineTo(W / 2 + i * (W / 12), H);
        ctx.stroke();
      }
      for (let i = 0; i < 14; i++) {
        const k = ((i + (time * (p.speed || 0.4)) % 1) / 14) % 1;
        const y = horizon + (H - horizon) * k * k;
        ctx.globalAlpha = GA * (p.opacity ?? 0.5) * (0.2 + 0.8 * k);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
      }
      ctx.restore();

    // 24. starfieldWarp: stars streaming outward from the centre
    } else if (c.componentId === 'starfieldWarp') {
      const col = p.color || T.ink;
      ctx.save(); ctx.fillStyle = col;
      for (let i = 0; i < 120; i++) {
        const a = hash01(i) * Math.PI * 2;
        const z = (hash01(i + 99) + time * (p.speed || 0.35) * (0.4 + hash01(i + 7))) % 1;
        const r = z * z * Math.min(W, H) * 0.78;
        const sz = 1 + z * 3;
        ctx.globalAlpha = GA * (p.opacity ?? 0.9) * (0.2 + 0.8 * z);
        ctx.beginPath();
        ctx.arc(W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r, sz, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

    // 25. bokehDrift: soft drifting light circles
    } else if (c.componentId === 'bokehDrift') {
      const col = p.color || T.accent;
      ctx.save();
      for (let i = 0; i < 18; i++) {
        const rr = (0.2 + hash01(i + 3) * 0.6) * Math.min(W, H) * 0.16;
        const bx = ((hash01(i) + time * (p.speed || 0.03) * (0.5 + hash01(i + 5))) % 1) * W;
        const by = ((hash01(i + 11) + time * (p.speed || 0.03) * (0.3 + hash01(i + 7))) % 1) * H;
        const grad = ctx.createRadialGradient(bx, by, 0, bx, by, rr);
        grad.addColorStop(0, col + '55');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.globalAlpha = GA * (p.opacity ?? 0.6);
        ctx.beginPath(); ctx.arc(bx, by, rr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

    // 26. confettiBurst: deterministic confetti thrown from a point
    } else if (c.componentId === 'confettiBurst') {
      const pos = pointOf(p.position, 0.5, 0.4);
      const n = p.count || 70;
      const cols = Array.isArray(p.colors) ? p.colors : [T.accent, T.accent2, T.ink];
      const reach = p.reach || 420;
      ctx.save();
      for (let i = 0; i < n; i++) {
        const a = hash01(i) * Math.PI * 2;
        const sp = 0.4 + hash01(i + 31) * 0.6;
        const dist = reach * easeOut * sp;
        const x = pos.x * W + Math.cos(a) * dist;
        const y = pos.y * H + Math.sin(a) * dist + 300 * prog * prog;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a + time * 3);
        ctx.fillStyle = cols[i % cols.length];
        ctx.globalAlpha = GA * Math.max(0, 1 - prog * 0.6);
        ctx.fillRect(-6, -10, 12, 20);
        ctx.restore();
      }
      ctx.restore();

    // 27. spotlightFollow: a roaming spotlight
    } else if (c.componentId === 'spotlightFollow') {
      const amp = p.amplitude == null ? 0.22 : p.amplitude;
      const sp = p.speed || 0.8;
      const x = W * (0.5 + Math.sin(time * sp) * amp);
      const y = H * (0.5 + Math.cos(time * sp * 0.7) * amp * 0.6);
      const rad = p.radius || 300;
      const col = p.color || T.ink;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, rad);
      grad.addColorStop(0, col + '55');
      grad.addColorStop(1, 'transparent');
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = grad;
      ctx.globalAlpha = GA * (p.opacity ?? 0.8);
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

    // 28. scanLines: CRT lines and a travelling band
    } else if (c.componentId === 'scanLines') {
      const gap = p.gap || 6, col = p.color || T.ink;
      ctx.save();
      ctx.globalAlpha = GA * (p.opacity ?? 0.12);
      ctx.fillStyle = col;
      for (let y = 0; y < H; y += gap) ctx.fillRect(0, y, W, 2);
      const band = ((time * (p.speed || 0.35)) % 1) * H;
      const grad = ctx.createLinearGradient(0, band - 140, 0, band + 140);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(0.5, col + '55');
      grad.addColorStop(1, 'transparent');
      ctx.globalAlpha = GA * 0.6;
      ctx.fillStyle = grad;
      ctx.fillRect(0, band - 140, W, 280);
      ctx.restore();

    // 12. progressBar
    } else if (c.componentId === 'progressBar') {
      const y = (p.position?.y ?? 0.95) * H;
      ctx.save();
      ctx.fillStyle = 'rgba(128, 128, 128, 0.35)';
      ctx.fillRect(120, y, W - 240, 18);
      ctx.fillStyle = p.color || T.accent;
      ctx.shadowColor = p.color || T.accent; ctx.shadowBlur = 10;
      ctx.fillRect(120, y, (W - 240) * prog, 18);
      ctx.restore();
    }
    // 13. Lottie-style vector animations (drawn procedurally, no lottie files)
    else if (c.componentId.startsWith('lottie') && !EXTRA_COMPONENT_SET.has(c.componentId)) {
      const lx = (p.position?.x ?? 0.5) * W, ly = (p.position?.y ?? 0.5) * H;
      const col = p.color || T.accent;
      const inP = easeOut;
      ctx.save();
      if (c.componentId === 'lottieCountdown') {
        const from = ecN(Number(p.from), 0) > 0 ? Number(p.from) : 3;
        const remain = Math.max(0.2, from * (1 - prog));
        ctx.strokeStyle = col; ctx.lineWidth = 12; ctx.lineCap = 'round';
        ctx.shadowColor = col; ctx.shadowBlur = 18;
        ctx.beginPath(); ctx.arc(lx, ly, 90, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (remain / from)); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.font = '900 64px "Space Grotesk", sans-serif';
        ctx.fillStyle = T.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(Math.ceil(remain)), lx, ly);
      } else if (c.componentId === 'lottieEmphasisBurst') {
        const rays = p.rays || 12;
        const burst = (prog * rays * 0.5) % 1;
        ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.shadowColor = col; ctx.shadowBlur = 16;
        for (let i = 0; i < rays; i++) {
          const a = (i / rays) * Math.PI * 2 + time * 0.6;
          const r0 = 60 + burst * 130, r1 = r0 + 46 * (1 - burst);
          ctx.globalAlpha = GA * (1 - burst) * 0.9;
          ctx.beginPath(); ctx.moveTo(lx + Math.cos(a) * r0, ly + Math.sin(a) * r0); ctx.lineTo(lx + Math.cos(a) * r1, ly + Math.sin(a) * r1); ctx.stroke();
        }
        ctx.globalAlpha = GA * 1; ctx.shadowBlur = 0; ctx.fillStyle = T.ink;
        ctx.beginPath(); ctx.arc(lx, ly, 7, 0, Math.PI * 2); ctx.fill();
      } else if (c.componentId === 'lottieSubscribe') {
        const pulse = 1 + Math.sin(time * 5) * 0.04;
        ctx.translate(lx, ly); ctx.scale(inP * pulse, inP * pulse);
        ctx.fillStyle = p.background || T.accent2; ctx.shadowColor = p.background || T.accent2; ctx.shadowBlur = 30;
        ctx.beginPath(); ctx.roundRect(-220, -44, 440, 88, 44); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = T.accentInk;
        ctx.beginPath(); ctx.moveTo(-150, -16); ctx.lineTo(-118, 0); ctx.lineTo(-150, 16); ctx.closePath(); ctx.fill();
        if (p.text) {
          ctx.font = '900 34px "Space Grotesk", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(p.text, 40, 1);
        }
      } else if (c.componentId === 'lottieSocialHandle') {
        const slide = (1 - inP) * 260;
        ctx.translate(lx - slide, ly); ctx.globalAlpha = GA * inP;
        ctx.fillStyle = p.background || T.paper; ctx.strokeStyle = col; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(-210, -36, 420, 72, 9999); ctx.fill(); ctx.stroke();
        if (p.handle) {
          ctx.font = '800 30px "Space Grotesk", sans-serif'; ctx.fillStyle = T.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('@' + String(p.handle).replace(/^@/, ''), 0, 1);
        }
      } else if (c.componentId === 'lottieLogoReveal') {
        const spin = (1 - inP) * Math.PI;
        ctx.translate(lx, ly); ctx.rotate(spin); ctx.scale(inP, inP);
        ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.shadowColor = col; ctx.shadowBlur = 26;
        ctx.beginPath(); ctx.arc(0, 0, 74, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.font = '900 56px "Space Grotesk", sans-serif';
        ctx.fillStyle = T.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(initialsOf(p.text || opts.docName || ''), 0, 1);
      } else if (c.componentId === 'lottieSectionTitle') {
        const bar = inP * 190;
        ctx.font = '900 52px "Cinzel", "Space Grotesk", serif';
        ctx.fillStyle = p.textColor || T.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(2, 5, 12, 0.82)'; ctx.shadowBlur = 12;
        ctx.fillText(p.title || '', lx, ly);
        ctx.shadowBlur = 0; ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(lx - 200, ly + 44); ctx.lineTo(lx - 200 + bar, ly + 44); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(lx + 200, ly + 44); ctx.lineTo(lx + 200 - bar, ly + 44); ctx.stroke();
      } else if (c.componentId === 'lottieChapterCard') {
        const wall = prog < 0.15 ? prog / 0.15 : prog > 0.85 ? (1 - prog) / 0.15 : 1;
        const barH = 130 * Math.min(1, wall);
        ctx.fillStyle = 'rgba(2, 5, 12, 0.82)';
        ctx.fillRect(0, 0, W, barH); ctx.fillRect(0, H - barH, W, barH);
        ctx.globalAlpha = GA * inP;
        ctx.font = '800 20px "Space Grotesk", sans-serif'; ctx.fillStyle = col; ctx.textAlign = 'center';
        if (p.chapter) ctx.fillText(String(p.chapter).toUpperCase(), lx, ly - 26);
        ctx.font = '900 46px "Cinzel", "Space Grotesk", serif'; ctx.fillStyle = T.ink;
        ctx.fillText(p.title || '', lx, ly + 20);
      } else if (c.componentId === 'lottieLowerThird') {
        const slide = prog < 0.12 ? inP : prog > 0.88 ? 1 - (prog - 0.88) / 0.12 : 1;
        ctx.translate((1 - slide) * -520, 0);
        ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 20;
        ctx.fillRect(80, ly - 34, 10, 68);
        ctx.shadowBlur = 0;
        ctx.fillStyle = p.background || T.paper;
        ctx.fillRect(90, ly - 34, 470, 68);
        ctx.font = '800 30px "Space Grotesk", sans-serif'; ctx.fillStyle = T.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(p.title || '', 112, ly - 12);
        ctx.font = '600 ' + Math.round(58 * (p.textScale || 1)) + 'px "Space Grotesk", sans-serif'; ctx.fillStyle = T.ink;
        ctx.fillText(p.subtitle || '', 112, ly + 16);
      }
      ctx.restore();
    }
    else if (DRAW_FALLBACK_SET.has(c.componentId)) {
      drawFallbackComponent(ctx, W, H, time, prog, c, p, GA, opts);
    }
    else if (EXTRA_COMPONENT_SET.has(c.componentId)) {
      drawExtraComponent(ctx, W, H, time, prog, c, p, GA);
    }
    if (AN || kfScale !== 1 || kfAlpha !== 1) ctx.restore();
    } catch (err) {
      console.warn('component draw failed:', c.componentId, err);
    } finally {
      ecRestoreTo(ctx, baseDepth);
      if (baseTransform && ctx.setTransform) ctx.setTransform(baseTransform);
      ctx.globalAlpha = baseAlpha;
      ctx.setLineDash([]);
    }
  });}

function sharedPostFX(ctx, W, H, time, comps, canvas) {
  (comps || []).forEach(c => {
    if (!(time >= c.start && time <= c.end)) return;
    const p = c.params || {};
    const dur = Math.max(0.01, c.end - c.start);
    const prog = Math.min(1, (time - c.start) / dur);
    const id = c.componentId;

    if (id === 'vignetteDim') {
      const amt = p.dimness ?? 0.55;
      const g = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.45, H * 0.78);
      g.addColorStop(0, 'transparent');
      g.addColorStop(1, 'rgba(0, 0, 0, ' + amt + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

    } else if (id === 'glowPulse') {
      const x = (p.position?.x ?? 0.5) * W, y = (p.position?.y ?? 0.4) * H;
      const pulse = 0.5 + 0.5 * Math.sin(time * (p.speed || 2.2));
      const r = (p.radius || 420) * (0.8 + pulse * 0.35);
      const col = p.color || T.accent;
      const g = ctx.createRadialGradient(x, y, 10, x, y, r);
      g.addColorStop(0, col + '59');
      g.addColorStop(1, 'transparent');
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

    } else if (id === 'maskBlur') {
      const y = (p.position?.y ?? 0.12) * H, bh = p.height || 220;
      const g = ctx.createLinearGradient(0, y, 0, y + bh);
      g.addColorStop(0, 'rgba(10, 14, 26, 0.55)');
      g.addColorStop(1, 'rgba(10, 14, 26, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, y, W, bh);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();

    } else if (id === 'transitionDipToColor' || id === 'transitionCrossfade') {
      const amt = Math.sin(prog * Math.PI);
      const strength = p.strength ?? (id === 'transitionCrossfade' ? 0.85 : 1);
      ctx.save();
      ctx.globalAlpha = amt * strength;
      ctx.fillStyle = p.color || T.paper;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();

    } else if (id === 'transitionWipe') {
      const cx = prog * (W + 400) - 200;
      const bw = p.width || 260;
      const col = p.color || T.accent;
      const g = ctx.createLinearGradient(cx - bw, 0, cx + bw, 0);
      g.addColorStop(0, 'transparent');
      g.addColorStop(0.5, col + '66');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(cx - bw, 0, bw * 2, H);
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = col;
      ctx.lineWidth = 3;
      ctx.shadowColor = col; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.moveTo(cx, 0); ctx.lineTo(cx, H); ctx.stroke();
      ctx.restore();

    } else if (id === 'transitionWhipPan') {
      const k = Math.sin(prog * Math.PI);
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 255, ' + (0.16 * k).toFixed(3) + ')';
      ctx.lineWidth = 2;
      for (let i = 0; i < 16; i++) {
        const ly = (i * 137.5) % H;
        ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(W, ly); ctx.stroke();
      }
      ctx.restore();

    } else if (id === 'transitionZoomBlur') {
      const k = Math.sin(prog * Math.PI);
      ctx.save();
      ctx.globalAlpha = 0.35 * k;
      ctx.fillStyle = '#020408';
      ctx.fillRect(0, 0, W, H * 0.12);
      ctx.fillRect(0, H * 0.88, W, H * 0.12);
      ctx.restore();

    } else if (id === 'transitionGlitch') {
      const amt = Math.sin(prog * Math.PI);
      if (amt > 0.03) {
        ctx.save();
        for (let i = 0; i < 7; i++) {
          const gy = Math.random() * H, gh = 20 + Math.random() * 70;
          const off = (Math.random() * 2 - 1) * 110 * amt;
          ctx.drawImage(canvas,
            0, gy / H * canvas.height, canvas.width, gh / H * canvas.height,
            off, gy, W, gh);
        }
        ctx.restore();
      }
    }
  });
}
