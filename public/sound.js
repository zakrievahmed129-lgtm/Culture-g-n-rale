// ═══════════════════════════════════════════════════════════
//  Bruitages & Musique 8-bit synthétisés (Web Audio pur)
// ═══════════════════════════════════════════════════════════
(function () {
  let ctx = null;
  let muted = localStorage.getItem('qb_muted') === '1';
  let musicMuted = localStorage.getItem('qb_music_muted') === '1';
  let musicTimer = null;
  let musicStep = 0;

  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur = 0.15, type = 'square', vol = 0.12, slideTo = null, delay = 0) {
    if (muted) return;
    try {
      const c = ac();
      const t = c.currentTime + delay;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    } catch (e) { /* ignore */ }
  }

  function noise(dur = 0.25, vol = 0.15) {
    if (muted) return;
    try {
      const c = ac();
      const bufferSize = c.sampleRate * dur;
      const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = c.createBufferSource();
      whiteNoise.buffer = buffer;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, c.currentTime);
      filter.frequency.exponentialRampToValueAtTime(60, c.currentTime + dur);
      const gain = c.createGain();
      gain.gain.setValueAtTime(vol, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
      whiteNoise.connect(filter).connect(gain).connect(c.destination);
      whiteNoise.start();
    } catch (e) { /* ignore */ }
  }

  // ─────────── Musique Chiptune Goofy ───────────
  // Petite mélodie enjouée style jeu rétro
  const BASS_LINE = [130.81, 130.81, 164.81, 174.61, 196.00, 196.00, 174.61, 164.81];
  const LEAD_NOTES = [
    261.63, 0, 329.63, 392.00, 523.25, 392.00, 329.63, 0,
    349.23, 0, 440.00, 523.25, 587.33, 523.25, 440.00, 392.00,
    261.63, 329.63, 392.00, 523.25, 659.25, 523.25, 392.00, 329.63,
    392.00, 349.23, 329.63, 293.66, 261.63, 0, 0, 0
  ];

  function tickMusic() {
    if (!musicMuted && !muted) {
      try {
        const c = ac();
        const t = c.currentTime;
        const note = LEAD_NOTES[musicStep % LEAD_NOTES.length];
        const bass = BASS_LINE[Math.floor(musicStep / 2) % BASS_LINE.length];

        if (note > 0) {
          const o = c.createOscillator();
          const g = c.createGain();
          o.type = 'triangle';
          o.frequency.setValueAtTime(note, t);
          g.gain.setValueAtTime(0.04, t);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
          o.connect(g).connect(c.destination);
          o.start(t);
          o.stop(t + 0.18);
        }

        if (musicStep % 2 === 0) {
          const bo = c.createOscillator();
          const bg = c.createGain();
          bo.type = 'sine';
          bo.frequency.setValueAtTime(bass, t);
          bg.gain.setValueAtTime(0.06, t);
          bg.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
          bo.connect(bg).connect(c.destination);
          bo.start(t);
          bo.stop(t + 0.3);
        }
      } catch (e) { /* ignore */ }
    }
    musicStep++;
  }

  function startMusic() {
    if (!musicTimer) {
      musicTimer = setInterval(tickMusic, 160);
    }
  }

  const Sound = {
    get muted() { return muted; },
    get musicMuted() { return musicMuted; },
    toggle() {
      muted = !muted;
      localStorage.setItem('qb_muted', muted ? '1' : '0');
      return muted;
    },
    toggleMusic() {
      musicMuted = !musicMuted;
      localStorage.setItem('qb_music_muted', musicMuted ? '1' : '0');
      if (!musicMuted) startMusic();
      return musicMuted;
    },
    unlock() {
      try {
        ac();
        if (!musicMuted) startMusic();
      } catch (e) { /* noop */ }
    },
    click() { tone(520, 0.06, 'square', 0.06, 760); },
    pop() { tone(300, 0.08, 'sine', 0.15, 900); },
    tick() { tone(1100, 0.04, 'square', 0.04); },
    beep() { tone(660, 0.18, 'square', 0.1); },
    go() { tone(880, 0.12, 'square', 0.12); tone(1320, 0.3, 'square', 0.12, null, 0.1); },
    correct() {
      tone(660, 0.1, 'square', 0.1);
      tone(880, 0.1, 'square', 0.1, null, 0.09);
      tone(1320, 0.25, 'square', 0.12, null, 0.18);
    },
    // le légendaire OOF
    oof() {
      tone(440, 0.22, 'sawtooth', 0.16, 130);
      tone(220, 0.22, 'square', 0.08, 80);
    },
    boing() { tone(180, 0.35, 'sine', 0.2, 650); },
    timeout() {
      tone(400, 0.2, 'triangle', 0.15, 300);
      tone(300, 0.35, 'triangle', 0.15, 180, 0.2);
    },
    win() {
      [523, 659, 784, 1047, 784, 1047, 1318].forEach((f, i) => tone(f, 0.18, 'square', 0.12, null, i * 0.12));
    },
    lose() {
      [392, 370, 349, 294].forEach((f, i) => tone(f, i === 3 ? 0.7 : 0.3, 'sawtooth', 0.1, i === 3 ? 220 : null, i * 0.32));
    },
    // Nouveaux sons de power-ups & combos
    bomb() {
      noise(0.4, 0.25);
      tone(150, 0.3, 'sawtooth', 0.2, 30);
    },
    slip() {
      tone(300, 0.25, 'sine', 0.18, 900);
      tone(800, 0.3, 'sine', 0.18, 120, 0.2);
    },
    powerup() {
      [440, 554, 659, 880].forEach((f, i) => tone(f, 0.1, 'triangle', 0.15, null, i * 0.07));
    },
    streak() {
      tone(523, 0.15, 'sawtooth', 0.14, 1046);
      tone(1046, 0.25, 'square', 0.12, null, 0.12);
    },
    coin() {
      tone(987, 0.08, 'square', 0.12);
      tone(1318, 0.25, 'square', 0.12, null, 0.07);
    },
    // Nouveaux sons : CPS Fight & Combats de clics
    punch(variant = 0) {
      if (muted) return;
      try {
        const base = 150 + (variant % 5) * 28 + Math.random() * 20;
        tone(base, 0.045, 'triangle', 0.13, 40);
        noise(0.03, 0.06);
      } catch (e) {}
    },
    critPunch() {
      if (muted) return;
      try {
        tone(340, 0.07, 'sawtooth', 0.16, 90);
        tone(680, 0.05, 'square', 0.12, null, 0.02);
        noise(0.06, 0.14);
      } catch (e) {}
    },
    ko() {
      if (muted) return;
      try {
        noise(0.45, 0.3);
        tone(140, 0.38, 'sawtooth', 0.26, 30);
        tone(280, 0.22, 'square', 0.2, 50, 0.06);
        setTimeout(() => { if (typeof Sound.oof === 'function') Sound.oof(); }, 220);
      } catch (e) {}
    },
    frenzy() {
      if (muted) return;
      try {
        [440, 587, 740, 988, 1175].forEach((f, i) => tone(f, 0.07, 'sawtooth', 0.13, null, i * 0.035));
      } catch (e) {}
    },
    fightBell() {
      if (muted) return;
      try {
        tone(987, 0.5, 'sine', 0.25, 600);
        tone(494, 0.7, 'triangle', 0.2, 250);
      } catch (e) {}
    },
    stamp() {
      if (muted) return;
      try {
        noise(0.2, 0.35);
        tone(120, 0.25, 'triangle', 0.3, 35);
        tone(240, 0.12, 'sawtooth', 0.18, 50, 0.04);
      } catch (e) {}
    },
    rankFanfare() {
      if (muted) return;
      try {
        [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.18, 'square', 0.14, null, i * 0.08));
        tone(1567, 0.45, 'triangle', 0.2, null, 0.45);
      } catch (e) {}
    },
    electricZap() {
      if (muted) return;
      try {
        tone(880 + Math.random() * 400, 0.04, 'sawtooth', 0.07, 200);
      } catch (e) {}
    },
  };

  window.Sound = Sound;
})();
