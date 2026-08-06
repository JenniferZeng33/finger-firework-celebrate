// Long-lived bursts are intentionally allowed to overlap. The cap still keeps
// repeated gestures bounded on typical laptop GPUs.
const MAX_PARTICLES = 900;
const TAU = Math.PI * 2;

const PALETTES = [
  ['#fff4cf', '#f6c85f', '#fffaf0'],
  ['#d9e5ff', '#82a8ff', '#c8a7ff'],
  ['#ffe0e2', '#ff8e9d', '#ffb093'],
  ['#d5fff3', '#74e8e1', '#a5ffd1'],
  ['#f4d8ff', '#ae89ff', '#ffb5e5'],
];

const random = (min, max) => min + Math.random() * (max - min);
const choice = (items) => items[(Math.random() * items.length) | 0];

function choosePattern() {
  const value = Math.random();
  if (value < .35) return 'RADIAL';
  if (value < .60) return 'WILLOW';
  if (value < .85) return 'SPARKLE';
  if (value < .97) return 'DOUBLE_BURST';
  return 'HEART';
}

function chooseBurstScale() {
  const value = Math.random();
  if (value < .24) return random(.68, .9);   // intimate, compact burst
  if (value < .76) return random(.96, 1.28); // most bursts
  return random(1.38, 1.78);                 // occasional cinematic burst
}

export class FireworksSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.particles = [];
    this.shockwaves = [];
    this.flashes = [];
    this.pendingBursts = [];
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  resize(width, height, dpr = Math.min(devicePixelRatio || 1, 1.5)) {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear() {
    this.particles.length = this.shockwaves.length = this.flashes.length = this.pendingBursts.length = 0;
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  sequence(x, y) {
    this.burst(x, y);
    const radiusBase = Math.max(24, Math.min(this.width, this.height) * .045);
    for (const delay of [110, 230, 360]) {
      const angle = random(0, TAU);
      const distance = random(radiusBase, radiusBase * 2.25);
      const margin = 24;
      this.pendingBursts.push({
        delay,
        x: Math.min(this.width - margin, Math.max(margin, x + Math.cos(angle) * distance)),
        y: Math.min(this.height - margin, Math.max(margin, y + Math.sin(angle) * distance)),
        countMultiplier: random(.5, .66),
      });
    }
  }

  burst(x, y, { countMultiplier = 1 } = {}) {
    const pattern = choosePattern();
    const palette = choice(PALETTES);
    const burstScale = this.reducedMotion ? random(.72, 1.08) : chooseBurstScale();
    let count = this.reducedMotion ? 38 : pattern === 'SPARKLE' ? 125 : pattern === 'WILLOW' ? 82 : 96;
    count = Math.round(count * Math.min(1.22, .84 + burstScale * .2) * countMultiplier);
    this.trim(count);
    this.flashes.push({ x, y, age: 0, life: this.reducedMotion ? 140 : 300, color: palette[0], scale: burstScale });
    this.shockwaves.push({ x, y, age: 0, life: 850, color: palette[1], scale: burstScale });

    for (let i = 0; i < count; i += 1) {
      let angle = (i / count) * TAU + random(-.035, .035);
      let speed = random(105, 245) * burstScale;
      let gravity = random(22, 40);
      let drag = random(.972, .986);
      let life = random(2800, 4200);

      if (pattern === 'WILLOW') { speed = random(72, 170) * burstScale; gravity = random(38, 62); drag = .987; life = random(3900, 5400); }
      if (pattern === 'SPARKLE') { speed = random(140, 315) * burstScale; life = random(2400, 3600); }
      if (pattern === 'DOUBLE_BURST') { speed = (i % 2 ? random(78, 138) : random(180, 260)) * burstScale; life = random(3000, 4500); }
      if (pattern === 'HEART') {
        const t = (i / count) * TAU;
        const hx = 16 * Math.sin(t) ** 3;
        const hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        const length = Math.hypot(hx, hy) || 1;
        angle = Math.atan2(hy / length, hx / length);
        speed = random(102, 138) * burstScale * Math.hypot(hx / 16, hy / 16);
        gravity = 20;
        life = random(3200, 4400);
      }

      const startDelay = pattern === 'DOUBLE_BURST' && i % 2 ? 260 : random(0, 45);
      this.particles.push(this.makeParticle(x, y, angle, speed, gravity, drag, life, choice(palette), pattern, startDelay, burstScale));
    }
    return { pattern, scale: burstScale };
  }

  makeParticle(x, y, angle, speed, gravity, drag, life, color, pattern, delay = 0, burstScale = 1) {
    return {
      x, y, px: x, py: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      gravity, drag, life, age: -delay, color, size: random(.8, 2.25) * Math.sqrt(burstScale), pattern,
      twinkle: Math.random() * TAU,
    };
  }

  trim(incomingCount = 0) {
    const overflow = this.particles.length + incomingCount - MAX_PARTICLES;
    if (overflow > 0) this.particles.splice(0, overflow);
  }

  update(dt) {
    for (let i = this.pendingBursts.length - 1; i >= 0; i -= 1) {
      const pending = this.pendingBursts[i];
      pending.delay -= dt;
      if (pending.delay > 0) continue;
      this.pendingBursts.splice(i, 1);
      this.burst(pending.x, pending.y, { countMultiplier: pending.countMultiplier });
    }
    const seconds = Math.min(dt, 34) / 1000;
    let writeIndex = 0;
    for (let i = 0; i < this.particles.length; i += 1) {
      const p = this.particles[i];
      p.age += dt;
      if (p.age < 0) {
        this.particles[writeIndex++] = p;
        continue;
      }
      if (p.age >= p.life || p.x < -100 || p.x > this.width + 100 || p.y > this.height + 120) {
        continue;
      }
      p.px = p.x; p.py = p.y;
      p.vx *= Math.pow(p.drag, dt / 16.67);
      p.vy = p.vy * Math.pow(p.drag, dt / 16.67) + p.gravity * seconds;
      p.x += p.vx * seconds; p.y += p.vy * seconds;
      this.particles[writeIndex++] = p;
    }
    this.particles.length = writeIndex;
    for (const effect of [...this.shockwaves, ...this.flashes]) effect.age += dt;
    this.shockwaves = this.shockwaves.filter((e) => e.age < e.life);
    this.flashes = this.flashes.filter((e) => e.age < e.life);
  }

  render(palmFeedback = null) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';

    for (const flash of this.flashes) {
      const progress = flash.age / flash.life;
      const flashRadius = (48 + progress * 62) * flash.scale;
      const gradient = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, flashRadius);
      gradient.addColorStop(0, `${flash.color}${Math.round((1 - progress) * 210).toString(16).padStart(2, '0')}`);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(flash.x, flash.y, flashRadius, 0, TAU); ctx.fill();
    }
    for (const wave of this.shockwaves) {
      const progress = wave.age / wave.life;
      ctx.strokeStyle = `${wave.color}${Math.round((1 - progress) * 120).toString(16).padStart(2, '0')}`;
      ctx.lineWidth = 2 * (1 - progress); ctx.shadowBlur = 12; ctx.shadowColor = wave.color;
      ctx.beginPath(); ctx.arc(wave.x, wave.y, (12 + progress * 125) * wave.scale, 0, TAU); ctx.stroke();
    }
    // Additive compositing already produces a bright glow. Per-particle
    // shadowBlur is extremely expensive and competes with synchronous hand
    // inference on the main thread, so glow is concentrated in the burst flash
    // and shockwave instead of recalculated hundreds of times per frame.
    ctx.shadowBlur = 0;
    for (const p of this.particles) {
      if (p.age < 0) continue;
      const progress = p.age / p.life;
      const sustainedFade = progress < .42 ? 1 : 1 - (progress - .42) / .58;
      const alpha = Math.max(0, sustainedFade * (p.pattern === 'SPARKLE' ? .55 + .45 * Math.abs(Math.sin(p.twinkle + p.age * .02)) : 1));
      ctx.strokeStyle = p.color; ctx.globalAlpha = alpha * .55; ctx.lineWidth = p.size * .7;
      ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
      ctx.globalAlpha = alpha; ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - progress * .55), 0, TAU); ctx.fill();
    }
    const palms = Array.isArray(palmFeedback) ? palmFeedback : palmFeedback ? [palmFeedback] : [];
    for (const palm of palms) this.drawPalmFeedback(palm);
    ctx.restore(); ctx.globalAlpha = 1;
  }

  drawPalmFeedback({ x, y, state, now }) {
    const ctx = this.ctx;
    const ready = state === 'READY_TO_RELEASE';
    const confirming = state === 'CONFIRMING_FIST';
    const pulse = this.reducedMotion ? 0 : Math.sin(now * .004) * 3;
    const radius = ready ? 17 + pulse : confirming ? 11 : 7;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius * 3.2);
    glow.addColorStop(0, ready ? 'rgba(255,250,230,.95)' : 'rgba(190,220,255,.42)');
    glow.addColorStop(.22, ready ? 'rgba(194,170,255,.55)' : 'rgba(150,210,255,.2)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, radius * 3.2, 0, TAU); ctx.fill();
    if (confirming || ready) {
      ctx.strokeStyle = ready ? 'rgba(245,235,255,.8)' : 'rgba(200,225,255,.4)';
      ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, radius + 8, 0, TAU); ctx.stroke();
    }
  }
}
