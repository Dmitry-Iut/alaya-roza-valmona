/* =========================================================
   Музыка и звуки — генерируются прямо в браузере (Web Audio API).
   Файлы музыки не нужны. Каждое настроение — своя мелодия:
   title, tender, castle, tension, romance, melancholy,
   mystery, waltz, battle, storm, wedding, dark
   ========================================================= */

const SoundEngine = (() => {
  let ctx = null, master, musicBus, sfxBus, musicSend, sfxSend, noiseBuf;
  let musicVol = 0.7, sfxVol = 0.8;
  let current = null;
  let wantedMood = null;

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  const QUAL = {
    '': [0, 4, 7], m: [0, 3, 7], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], '7': [0, 4, 7, 10],
    sus: [0, 5, 7], dim: [0, 3, 6], add9: [0, 4, 7, 14], madd9: [0, 3, 7, 14]
  };
  function chord(name) {
    const mm = name.match(/^([A-G](?:#|b)?)(.*)$/);
    let root = 48 + NOTE[mm[1]];
    if (root < 50) root += 12;
    return (QUAL[mm[2]] || QUAL['']).map((i) => root + i);
  }
  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    harm: [0, 2, 3, 5, 7, 8, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10]
  };

  /* ---------- настроения ---------- */
  const MOODS = {
    title: {
      bpm: 58, meter: 4, key: 50, scale: 'harm', prog: ['Dm', 'Bb', 'Gm', 'A'],
      pad: 0.035, bass: { steps: [0], vol: 0.09 },
      arp: { inst: 'harp', pat: [0, -1, 2, -1, 3, -1, 4, -1], oct: 12, vol: 0.07 },
      mel: { inst: 'flute', prob: 0.35, lo: 69, hi: 84, vol: 0.04 },
      bell: { prob: 0.1, vol: 0.03 }
    },
    tender: {
      bpm: 74, meter: 4, key: 53, scale: 'major', prog: ['F', 'C', 'Dm', 'Bb'],
      pad: 0.03, bass: { steps: [0, 4], vol: 0.08 },
      arp: { inst: 'pluck', pat: [0, 2, 3, 4, 5, 4, 3, 2], oct: 0, vol: 0.06 },
      mel: { inst: 'flute', prob: 0.5, lo: 65, hi: 81, vol: 0.045 }
    },
    castle: {
      bpm: 88, meter: 4, key: 57, scale: 'minor', prog: ['Am', 'G', 'F', 'E'],
      pad: 0.022, bass: { steps: [0, 4], vol: 0.08 },
      arp: { inst: 'pluck', pat: [0, -1, 2, 3, -1, 2, 4, -1], oct: 0, vol: 0.06 },
      mel: { inst: 'flute', prob: 0.55, lo: 64, hi: 81, vol: 0.04 },
      drum: { inst: 'tabor', pat: 'x..x.x..', vol: 0.05 }
    },
    tension: {
      bpm: 56, meter: 4, key: 50, scale: 'harm', prog: ['Dm', 'Dm', 'Bb', 'A'],
      pad: 0.025, drone: { notes: [38, 45], vol: 0.04 },
      arp: { inst: 'harp', pat: [0, -1, -1, 1, -1, -1, 2, -1], oct: -12, vol: 0.07 },
      bell: { prob: 0.12, vol: 0.03 },
      drum: { inst: 'heart', pat: 'x.x.....', vol: 0.09 }
    },
    romance: {
      bpm: 62, meter: 4, key: 53, scale: 'major', prog: ['Fmaj7', 'Am7', 'Bbmaj7', 'Csus'],
      pad: 0.04, bass: { steps: [0], vol: 0.08 },
      arp: { inst: 'harp', pat: [0, 1, 2, 3, 4, 3, 2, 1], oct: 0, vol: 0.055 },
      mel: { inst: 'flute', prob: 0.42, lo: 67, hi: 84, vol: 0.04 }
    },
    melancholy: {
      bpm: 64, meter: 4, key: 57, scale: 'minor', prog: ['Am', 'F', 'C', 'G'],
      pad: 0.03, bass: { steps: [0], vol: 0.08 },
      arp: { inst: 'pluck', pat: [0, 2, 3, 2, 4, 2, 3, 2], oct: 0, vol: 0.055 },
      mel: { inst: 'flute', prob: 0.4, lo: 64, hi: 81, vol: 0.04 }
    },
    mystery: {
      bpm: 54, meter: 4, key: 52, scale: 'harm', prog: ['Em', 'C', 'Am', 'B'],
      organ: 0.022, drone: { notes: [40], vol: 0.03 },
      arp: { inst: 'harp', pat: [0, -1, -1, 2, -1, -1, 4, -1], oct: 0, vol: 0.06 },
      bell: { prob: 0.22, vol: 0.035 }
    },
    waltz: {
      bpm: 138, meter: 3, key: 55, scale: 'harm', prog: ['Gm', 'D', 'Gm', 'Cm', 'Eb', 'Cm', 'D', 'D'],
      pad: 0.015, bass: { steps: [0], vol: 0.1 },
      stab: { inst: 'harpsi', steps: [2, 4], vol: 0.03 },
      mel: { inst: 'flute', prob: 0.75, lo: 67, hi: 84, vol: 0.04, every: 2 }
    },
    battle: {
      bpm: 104, meter: 4, key: 50, scale: 'harm', prog: ['Dm', 'Bb', 'C', 'A'],
      pad: 0.025, pulse: 0.04,
      drum: { inst: 'drum', pat: 'x.xxx.x.', vol: 0.11 },
      bell: { prob: 0.05, vol: 0.03 }
    },
    storm: {
      bpm: 56, meter: 4, key: 48, scale: 'harm', prog: ['Cm', 'Ab', 'Fm', 'G'],
      pad: 0.035, noise: { kind: 'rain', vol: 0.06 },
      arp: { inst: 'harp', pat: [0, -1, 2, -1, 3, -1, 2, -1], oct: 0, vol: 0.055 },
      mel: { inst: 'flute', prob: 0.28, lo: 63, hi: 79, vol: 0.035 }
    },
    wedding: {
      bpm: 66, meter: 4, key: 50, scale: 'major', prog: ['D', 'Bm', 'G', 'A'],
      organ: 0.03, bass: { steps: [0], vol: 0.07 },
      bell: { prob: 0.25, vol: 0.04 },
      arp: { inst: 'harp', pat: [0, -1, 2, -1, 4, -1, 2, -1], oct: 12, vol: 0.04 }
    },
    dark: {
      bpm: 48, meter: 4, key: 48, scale: 'harm', prog: ['Cm', 'Cm', 'Ab', 'G'],
      pad: 0.02, drone: { notes: [36, 43], vol: 0.05 }, noise: { kind: 'wind', vol: 0.035 },
      bell: { prob: 0.16, vol: 0.03, hi: true }
    }
  };

  /* ---------- инициализация ---------- */
  function makeIR(dur, decay) {
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }
  function makeNoise(sec) {
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.3;
    master.connect(comp); comp.connect(ctx.destination);

    const ir = makeIR(3.4, 2.4);
    musicBus = ctx.createGain(); musicBus.gain.value = musicVol; musicBus.connect(master);
    const musicRev = ctx.createConvolver(); musicRev.buffer = ir; musicRev.connect(musicBus);
    musicSend = ctx.createGain(); musicSend.gain.value = 0.55; musicSend.connect(musicRev);

    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxVol; sfxBus.connect(master);
    const sfxRev = ctx.createConvolver(); sfxRev.buffer = ir; sfxRev.connect(sfxBus);
    sfxSend = ctx.createGain(); sfxSend.gain.value = 0.35; sfxSend.connect(sfxRev);

    noiseBuf = makeNoise(3);

    // разблокировка звука на iOS
    const b = ctx.createBuffer(1, 1, 22050);
    const s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0);

    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend(); else ctx.resume();
    });

    if (wantedMood) { const m = wantedMood; wantedMood = null; setMood(m); }
  }

  /* ---------- инструменты ---------- */
  function env(g, t, a, peak, end) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
  }
  function osc(type, f, t, end, dest, detune) {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = f;
    if (detune) o.detune.value = detune;
    o.connect(dest); o.start(t); o.stop(end + 0.05);
    return o;
  }

  function pluck(dest, t, m, vol, dur) {
    dur = dur || 1.6;
    const f = mtof(m);
    const g = ctx.createGain(); env(g, t, 0.004, vol, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(f * 8, 7000), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(f * 1.5, 200), t + dur * 0.6);
    lp.connect(g); g.connect(dest);
    osc('triangle', f, t, t + dur, lp);
    const g2 = ctx.createGain(); g2.gain.value = 0.25; g2.connect(lp);
    osc('sawtooth', f, t, t + dur, g2, 4);
  }
  function harp(dest, t, m, vol, dur) {
    dur = dur || 2.6;
    const f = mtof(m);
    const g = ctx.createGain(); env(g, t, 0.006, vol, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(f * 6, 6000), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(f * 2, 300), t + dur * 0.5);
    lp.connect(g); g.connect(dest);
    osc('sine', f, t, t + dur, lp);
    const g2 = ctx.createGain(); g2.gain.value = 0.45; g2.connect(lp);
    osc('triangle', f * 2, t, t + dur, g2);
  }
  function harpsi(dest, t, m, vol, dur) {
    dur = dur || 0.9;
    const f = mtof(m);
    const g = ctx.createGain(); env(g, t, 0.003, vol, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
    lp.connect(hp); hp.connect(g); g.connect(dest);
    osc('sawtooth', f, t, t + dur, lp);
    const g2 = ctx.createGain(); g2.gain.value = 0.3; g2.connect(lp);
    osc('square', f * 2, t, t + dur, g2);
  }
  function flute(dest, t, m, vol, dur) {
    const f = mtof(m);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.12);
    g.gain.setValueAtTime(vol * 0.85, t + Math.max(0.15, dur - 0.1));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.4);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f * 4;
    lp.connect(g); g.connect(dest);
    const o = osc('sine', f, t, t + dur + 0.4, lp);
    const o2g = ctx.createGain(); o2g.gain.value = 0.12; o2g.connect(lp);
    const o2 = osc('triangle', f, t, t + dur + 0.4, o2g);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 5.2;
    const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.006, t + 0.4);
    lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
    lfo.start(t); lfo.stop(t + dur + 0.5);
  }
  function bell(dest, t, m, vol, dur) {
    dur = dur || 3.5;
    const f = mtof(m);
    [[1, 1, 1], [2, 0.5, 0.7], [2.76, 0.35, 0.5], [4.07, 0.2, 0.35], [5.4, 0.12, 0.25]].forEach(([r, a, d]) => {
      const g = ctx.createGain(); env(g, t, 0.003, vol * a, t + dur * d);
      g.connect(dest);
      osc('sine', f * r, t, t + dur * d, g);
    });
  }
  function pad(dest, t, notes, vol, dur) {
    const g = ctx.createGain();
    const a = Math.min(1.4, dur * 0.35);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.setValueAtTime(vol, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 1.6);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 950; lp.Q.value = 0.5;
    lp.connect(g); g.connect(dest);
    notes.forEach((m) => {
      osc('sawtooth', mtof(m), t, t + dur + 1.6, lp, -7);
      osc('sawtooth', mtof(m), t, t + dur + 1.6, lp, 7);
    });
  }
  function organ(dest, t, notes, vol, dur) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.15);
    g.gain.setValueAtTime(vol, t + dur);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.8);
    g.connect(dest);
    notes.forEach((m) => {
      [[1, 1], [2, 0.55], [3, 0.3], [4, 0.18], [6, 0.08]].forEach(([r, a]) => {
        const gg = ctx.createGain(); gg.gain.value = a; gg.connect(g);
        osc('sine', mtof(m) * r, t, t + dur + 0.8, gg);
      });
    });
  }
  function bass(dest, t, m, vol, dur) {
    const f = mtof(m);
    const g = ctx.createGain(); env(g, t, 0.01, vol, t + dur);
    g.connect(dest);
    osc('sine', f, t, t + dur, g);
    const g2 = ctx.createGain(); g2.gain.value = 0.3; g2.connect(g);
    osc('triangle', f, t, t + dur, g2);
  }
  function pulse(dest, t, notes, vol, dur) {
    const g = ctx.createGain(); env(g, t, 0.01, vol, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800;
    lp.connect(g); g.connect(dest);
    notes.forEach((m) => osc('sawtooth', mtof(m), t, t + dur, lp));
  }
  function drum(dest, t, vol, kind) {
    if (kind === 'tabor') {
      const n = ctx.createBufferSource(); n.buffer = noiseBuf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.2;
      const g = ctx.createGain(); env(g, t, 0.002, vol, t + 0.14);
      n.connect(bp); bp.connect(g); g.connect(dest);
      n.start(t, Math.random() * 2); n.stop(t + 0.2);
      const o = ctx.createOscillator(); o.frequency.setValueAtTime(240, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.1);
      const g2 = ctx.createGain(); env(g2, t, 0.002, vol * 0.8, t + 0.15);
      o.connect(g2); g2.connect(dest); o.start(t); o.stop(t + 0.2);
      return;
    }
    const lo = kind === 'heart' ? 38 : 45;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(kind === 'heart' ? 90 : 140, t);
    o.frequency.exponentialRampToValueAtTime(lo, t + 0.25);
    const g = ctx.createGain(); env(g, t, 0.004, vol, t + (kind === 'heart' ? 0.35 : 0.45));
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.5);
  }

  /* ---------- секвенсор ---------- */
  function rnd(seed) { // предсказуемый рандом для мелодий
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function startMood(name) {
    const cfg = MOODS[name];
    if (!cfg) return null;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 2.5);
    out.connect(musicBus); out.connect(musicSend);

    const st = { name, cfg, out, step: 0, bar: 0, next: ctx.currentTime + 0.15, prevMel: null, nodes: [], timer: null, rand: rnd(name.length * 7919 + 13) };
    const scale = SCALES[cfg.scale].map((i) => (cfg.key + i) % 12);
    st.scalePcs = scale;

    if (cfg.drone) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320;
      const g = ctx.createGain(); g.gain.value = cfg.drone.vol;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08;
      const lg = ctx.createGain(); lg.gain.value = cfg.drone.vol * 0.4;
      lfo.connect(lg); lg.connect(g.gain); lfo.start();
      lp.connect(g); g.connect(out);
      cfg.drone.notes.forEach((m) => {
        [-5, 5].forEach((d) => {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = d;
          o.connect(lp); o.start(); st.nodes.push(o);
        });
      });
      st.nodes.push(lfo);
    }
    if (cfg.noise) {
      const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
      const g = ctx.createGain(); g.gain.value = cfg.noise.vol;
      if (cfg.noise.kind === 'rain') {
        const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 700;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 6000;
        n.connect(hp); hp.connect(lp); lp.connect(g);
      } else {
        const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.9;
        const lfo = ctx.createOscillator(); lfo.frequency.value = 0.09;
        const lg = ctx.createGain(); lg.gain.value = 260;
        lfo.connect(lg); lg.connect(bp.frequency); lfo.start(); st.nodes.push(lfo);
        n.connect(bp); bp.connect(g);
      }
      g.connect(out); n.start(); st.nodes.push(n);
    }

    st.timer = setInterval(() => schedule(st), 30);
    schedule(st);
    return st;
  }

  function nearestScale(st, m, dir) {
    let x = m;
    for (let i = 0; i < 12; i++) {
      if (st.scalePcs.includes(((x % 12) + 12) % 12)) return x;
      x += dir || 1;
    }
    return m;
  }

  function schedule(st) {
    const cfg = st.cfg;
    const stepDur = 60 / cfg.bpm / 2;
    const spb = cfg.meter * 2;
    while (st.next < ctx.currentTime + 0.25) {
      const t = st.next, s = st.step, out = st.out;
      const ch = chord(cfg.prog[st.bar % cfg.prog.length]);
      const ext = [ch[0], ch[1], ch[2], ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24, ch[1] + 24];
      const barDur = stepDur * spb;

      if (s === 0) {
        if (cfg.pad) pad(out, t, ch, cfg.pad, barDur);
        if (cfg.organ) organ(out, t, ch.slice(0, 3), cfg.organ, barDur * 0.95);
      }
      if (cfg.bass && cfg.bass.steps.includes(s)) bass(out, t, ch[0] - 12, cfg.bass.vol, stepDur * 3.5);
      if (cfg.pulse) pulse(out, t, [ch[0] - 12, ch[2] - 12], cfg.pulse, stepDur * 0.8);
      if (cfg.arp) {
        const idx = cfg.arp.pat[s % cfg.arp.pat.length];
        if (idx >= 0) {
          const m = ext[idx] + (cfg.arp.oct || 0);
          (cfg.arp.inst === 'harp' ? harp : pluck)(out, t, m, cfg.arp.vol);
        }
      }
      if (cfg.stab && cfg.stab.steps.includes(s)) ch.forEach((m) => harpsi(out, t, m + 12, cfg.stab.vol));
      if (cfg.drum && cfg.drum.pat[s % cfg.drum.pat.length] === 'x') drum(out, t, cfg.drum.vol, cfg.drum.inst);
      if (cfg.bell && s % 2 === 0 && st.rand() < cfg.bell.prob) {
        const m = ext[Math.floor(st.rand() * 3) + 3] + (cfg.bell.hi ? 24 : 12);
        bell(out, t, m, cfg.bell.vol, 3);
      }
      if (cfg.mel) {
        const every = cfg.mel.every || 2;
        if (s % every === 0 && st.rand() < cfg.mel.prob) {
          let m;
          const strong = s === 0 || s === spb / 2;
          if (st.prevMel == null || strong) {
            const tones = [];
            for (let o = -24; o <= 36; o += 12) ch.forEach((c) => { const x = c + o; if (x >= cfg.mel.lo && x <= cfg.mel.hi) tones.push(x); });
            const ref = st.prevMel == null ? (cfg.mel.lo + cfg.mel.hi) / 2 : st.prevMel;
            tones.sort((a, b) => Math.abs(a - ref) - Math.abs(b - ref));
            m = tones[Math.floor(st.rand() * Math.min(2, tones.length))];
          } else {
            const jump = [-4, -2, -2, -1, 1, 2, 2, 3][Math.floor(st.rand() * 8)];
            m = nearestScale(st, st.prevMel + jump, jump > 0 ? 1 : -1);
            if (m > cfg.mel.hi) m -= 12;
            if (m < cfg.mel.lo) m += 12;
          }
          st.prevMel = m;
          const len = stepDur * (st.rand() < 0.3 ? 4 : 2) * 0.95;
          flute(out, t, m, cfg.mel.vol, len);
        }
      }

      st.next += stepDur;
      st.step = (s + 1) % spb;
      if (st.step === 0) st.bar++;
    }
  }

  function stopMood(st, fade) {
    if (!st) return;
    clearInterval(st.timer);
    const t = ctx.currentTime;
    st.out.gain.cancelScheduledValues(t);
    st.out.gain.setValueAtTime(Math.max(st.out.gain.value, 0.0001), t);
    st.out.gain.exponentialRampToValueAtTime(0.0001, t + fade);
    setTimeout(() => {
      st.nodes.forEach((n) => { try { n.stop(); } catch (e) {} });
      try { st.out.disconnect(); } catch (e) {}
    }, fade * 1000 + 400);
  }

  function setMood(name) {
    if (!ctx) { wantedMood = name; return; }
    if (current && current.name === name) return;
    stopMood(current, name ? 2.2 : 3);
    current = name ? startMood(name) : null;
  }

  /* ---------- звуковые эффекты ---------- */
  function noise(t, dur, filterType, freq, q, vol, dest) {
    const n = ctx.createBufferSource(); n.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q || 1;
    const g = ctx.createGain(); env(g, t, 0.003, vol, t + dur);
    n.connect(f); f.connect(g); g.connect(dest || sfxBus); g.connect(sfxSend);
    n.start(t, Math.random() * 2); n.stop(t + dur + 0.05);
    return { n, f, g };
  }
  function tone(t, f, dur, vol, type, dest) {
    const g = ctx.createGain(); env(g, t, 0.003, vol, t + dur);
    g.connect(dest || sfxBus); g.connect(sfxSend);
    osc(type || 'sine', f, t, t + dur, g);
  }

  const SFX = {
    bell() {
      const t = ctx.currentTime + 0.02;
      const f = mtof(43);
      [[0.5, 0.5, 1], [1, 1, 0.9], [1.19, 0.5, 0.7], [1.5, 0.4, 0.6], [2, 0.45, 0.5], [2.52, 0.25, 0.4], [3.01, 0.2, 0.3], [4.1, 0.12, 0.2]].forEach(([r, a, d]) => {
        tone(t, f * r, 7 * d, 0.16 * a);
      });
    },
    steps() {
      const t = ctx.currentTime + 0.05;
      for (let i = 0; i < 5; i++) {
        const tt = t + i * 0.55;
        noise(tt, 0.12, 'lowpass', 500, 0.8, 0.22);
        tone(tt, 70, 0.15, 0.18);
      }
    },
    swords() {
      const t = ctx.currentTime + 0.02;
      [0, 0.32, 0.55].forEach((d, i) => {
        const tt = t + d;
        noise(tt, 0.08, 'highpass', 3000, 0.7, 0.16);
        [2130, 3410, 4720, 6250].forEach((f, k) => tone(tt, f * (1 + i * 0.03), 0.9 - k * 0.15, 0.05 / (k + 1) * 2, 'sine'));
      });
    },
    thunder() {
      const t = ctx.currentTime + 0.02;
      noise(t, 0.25, 'highpass', 1500, 0.5, 0.18);
      const r = noise(t + 0.1, 4.5, 'lowpass', 260, 0.6, 0.5);
      r.f.frequency.setValueAtTime(700, t + 0.1);
      r.f.frequency.exponentialRampToValueAtTime(120, t + 4.5);
    },
    bolt() {
      const t = ctx.currentTime + 0.02;
      noise(t, 0.05, 'bandpass', 2500, 2, 0.25);
      tone(t, 180, 0.12, 0.2, 'triangle');
      noise(t + 0.08, 0.25, 'bandpass', 1400, 4, 0.12);
      tone(t + 0.1, 1850, 0.4, 0.04);
    },
    glass() {
      const t = ctx.currentTime + 0.02;
      [2637, 3520, 4186, 5274].forEach((f, i) => tone(t + i * 0.012, f, 1.2 - i * 0.2, 0.05));
      noise(t, 0.15, 'highpass', 4000, 0.7, 0.07);
    },
    slap() {
      const t = ctx.currentTime + 0.02;
      noise(t, 0.09, 'highpass', 1200, 0.6, 0.45);
      tone(t, 260, 0.06, 0.15, 'triangle');
    },
    knock() {
      const t = ctx.currentTime + 0.1;
      [0, 0.45, 0.9].forEach((d) => {
        noise(t + d, 0.07, 'bandpass', 700, 2, 0.4);
        tone(t + d, 160, 0.12, 0.3, 'sine');
      });
    },
    key() {
      const t = ctx.currentTime + 0.02;
      [0, 0.18, 0.4].forEach((d) => {
        const r = noise(t + d, 0.22, 'bandpass', 2600, 6, 0.22);
        r.f.frequency.setValueAtTime(1800, t + d);
        r.f.frequency.linearRampToValueAtTime(3600, t + d + 0.2);
      });
      tone(t + 0.6, 320, 0.25, 0.2, 'triangle');
      noise(t + 0.6, 0.1, 'lowpass', 800, 1, 0.25);
    },
    page() {
      const t = ctx.currentTime + 0.02;
      noise(t, 0.35, 'highpass', 2500, 0.5, 0.08);
      noise(t + 0.15, 0.25, 'bandpass', 4000, 0.8, 0.06);
    },
    click() {
      const t = ctx.currentTime + 0.005;
      tone(t, 1320, 0.08, 0.03, 'sine');
    },
    choose() {
      const t = ctx.currentTime + 0.01;
      [72, 76, 79].forEach((m, i) => harp(sfxBus, t + i * 0.06, m, 0.06, 1.8));
    }
  };

  function sfx(name) {
    if (!ctx || !SFX[name]) return;
    try { SFX[name](); } catch (e) { console.warn(e); }
  }

  function setMusicVolume(v) { musicVol = v; if (musicBus) musicBus.gain.setTargetAtTime(v, ctx.currentTime, 0.1); }
  function setSfxVolume(v) { sfxVol = v; if (sfxBus) sfxBus.gain.setTargetAtTime(v, ctx.currentTime, 0.1); }

  return { init, setMood, sfx, setMusicVolume, setSfxVolume, get mood() { return current ? current.name : wantedMood; } };
})();
