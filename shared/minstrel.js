/* Minstrel — procedural music in WebAudio. No samples, no assets, seeded.
 *
 * Musical rules (this is what stops it sounding random):
 *   - PULSE: kick/snare/hat on a 16th grid, snare on 2 and 4, swung hats.
 *   - MOTIF: a melody is 5-7 notes whose INTERVALS are fixed for the phrase.
 *     An 8-bar period restates it: A (bars 1-2), A up a third (3-4),
 *     A down a step (5-6), cadence (7-8, half as busy, ending on the root).
 *     Players latch onto the repeated shape, not the individual notes.
 *   - KEY, not chord, for melody: the line stays in the key while the chords
 *     move underneath; strong beats snap to the chord's triad tones.
 *   - SPACE: stereo voices, long attack pads, two-tap reverb, roomy release.
 *   - VARIETY: the seed picks progression, palette, groove, register, period
 *     and octave, so two seeds are two different pieces of music.
 *
 * API: new Minstrel({seed,tempo,scale,root,prog,volume,groove,swing,space});
 *      start(); stop(); setVolume(v); Minstrel.describe(seed) -> what a seed picked
 */
(function (global) {
  'use strict';

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var SCALES = {
    major:      [0, 2, 4, 5, 7, 9, 11],
    minor:      [0, 2, 3, 5, 7, 8, 10],
    dorian:     [0, 2, 3, 5, 7, 9, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    penta:      [0, 2, 4, 7, 9]
  };

  var PROGS = [
    [0, 5, 3, 4], [0, 3, 4, 4], [5, 3, 0, 4], [0, 4, 5, 3],
    [0, 5, 6, 4], [3, 4, 0, 0], [0, 2, 5, 4]
  ];

  var GROOVES = {
    none:     { kick: [],            snare: [],      hat: 0, bass: [[0, 0], [8, 0]] },
    straight: { kick: [0, 8],        snare: [4, 12], hat: 2, bass: [[0, 0], [6, 0], [8, 0], [14, 4]] },
    four:     { kick: [0, 4, 8, 12], snare: [4, 12], hat: 2, bass: [[0, 0], [2, 0], [4, 4], [8, 0], [10, 0], [14, 4]] },
    half:     { kick: [0, 10],       snare: [8],     hat: 2, bass: [[0, 0], [6, 0], [8, 4], [10, 0]] },
    broken:   { kick: [0, 3, 8, 11], snare: [4, 12], hat: 1, bass: [[0, 0], [3, 0], [6, 4], [8, 0], [11, 0], [14, 4]] },
    shuffle:  { kick: [0, 6, 10],    snare: [4, 12], hat: 2, bass: [[0, 0], [6, 4], [10, 0]] }
  };

  var PALETTES = {
    deep:  { pad: 'sawtooth', padG: 0.040, padC: 700,  mel: 'triangle', melG: 0.075, melC: 3200, bass: 'triangle', bassC: 360, hat: 0.26, kick: 0.95, detune: 7 },
    glass: { pad: 'triangle', padG: 0.055, padC: 1500, mel: 'sine',     melG: 0.100, melC: 6000, bass: 'sine',     bassC: 300, hat: 0.20, kick: 0.85, detune: 13 },
    chip:  { pad: 'square',   padG: 0.028, padC: 900,  mel: 'square',   melG: 0.052, melC: 4500, bass: 'square',   bassC: 420, hat: 0.22, kick: 0.90, detune: 4 },
    warm:  { pad: 'sawtooth', padG: 0.045, padC: 600,  mel: 'triangle', melG: 0.080, melC: 2400, bass: 'triangle', bassC: 340, hat: 0.18, kick: 1.00, detune: 10 }
  };

  /* 2-bar rhythmic motifs, in beats (0-8): long values, real rests, no twitch */
  var RHYTHMS = [
    [0, 1, 2, 3.5, 4, 6],
    [0, 1.5, 2, 4, 5, 6.5],
    [0, 2, 3, 4, 6],
    [0, 1, 2.5, 4, 5.5, 7],
    [0, 1.5, 3, 4.5, 6, 7.5]
  ];
  var SHIFTS = [0, 2, -1, -3];      // A, A up a third, A down a step, cadence

  var mtof = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };

  var LOOKAHEAD = 2.2;      // seconds of music kept scheduled in advance
  var PAD_OVERLAP = 0.6;    // pad runs this far past the bar line, then crossfades

  function Minstrel(opts) {
    opts = opts || {};
    this.ctx = null;
    this.seed = opts.seed || 1;
    var sr = rng(this.seed * 2246822519 + 7);      // seed decides the character

    this.tempo = opts.tempo || 96;
    this.scaleName = SCALES[opts.scale] ? opts.scale : 'dorian';
    this.scale = SCALES[this.scaleName];
    this.root = opts.root || 57;
    this.progIndex = (opts.prog == null || opts.prog === 'auto')
      ? Math.floor(sr() * PROGS.length) : (opts.prog % PROGS.length);
    this.prog = PROGS[this.progIndex];
    this.grooveName = (opts.groove == null || opts.groove === 'auto')
      ? ['broken', 'straight', 'four', 'half', 'shuffle'][Math.floor(sr() * 5)]
      : (GROOVES[opts.groove] ? opts.groove : 'broken');
    this.groove = GROOVES[this.grooveName];
    this.paletteName = PALETTES[opts.palette] ? opts.palette
      : ['deep', 'glass', 'warm', 'chip'][Math.floor(sr() * 4)];
    this.pal = PALETTES[this.paletteName];
    this.octave = sr() < 0.5 ? 0 : 12;              // melody register
    this.swing = opts.swing == null ? 0.35 : opts.swing;
    this.space = opts.space == null ? 0.45 : opts.space;
    this.volume = opts.volume == null ? 1.0 : opts.volume;
    this.playing = false;
    this.bar = 0;
    this.notes = 0;
    this.nextTime = 0;
    this.bars = [];
    this._timer = null;
    this._voices = [];
    this._phrase = null;
    this._padUntil = 0;
    this.onnote = null;
  }

  /* ---------- output chain: stereo, two-tap reverb, sidechain bus ---------- */
  Minstrel.prototype._build = function () {
    var ctx = this.ctx, sp = this.space;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 8; comp.ratio.value = 5;
    comp.attack.value = 0.006; comp.release.value = 0.3;
    this.master.connect(comp); comp.connect(ctx.destination);

    this.padBus = ctx.createGain();
    this.padBus.gain.value = 1;
    this.padBus.connect(this.master);

    this.drumBus = ctx.createGain();
    this.drumBus.gain.value = 0.85;
    this.drumBus.connect(this.master);

    // reverb: two delay taps through one lowpass, feedback rising with space
    var wet = ctx.createGain();
    wet.gain.value = 0.16 + 0.34 * sp;
    wet.connect(ctx.destination);
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 220;
    hp.connect(wet);
    [[0.19 + 0.11 * sp, 0.22 + 0.16 * sp], [0.37 + 0.23 * sp, 0.18 + 0.12 * sp]]
      .forEach(function (t) {
        var d = ctx.createDelay(2.0), fb = ctx.createGain(), lp = ctx.createBiquadFilter();
        d.delayTime.value = t[0];
        fb.gain.value = t[1];
        lp.type = 'lowpass'; lp.frequency.value = 1600 + 1200 * sp;
        d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(hp);
        this.master.connect(d);
      }, this);
    return ctx;
  };

  Minstrel.prototype.init = function () {
    if (this.ctx) return this.ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    this.ctx = new AC();
    return this._build();
  };

  /* ---------- one pitched voice: attack, sustain, then release ---------- */
  Minstrel.prototype._note = function (t, midi, dur, type, gain, cutoff, attack, voice, pan) {
    var ctx = this.ctx, pal = this.pal;
    var o = ctx.createOscillator();
    var o2 = voice === 'pad' ? ctx.createOscillator() : null;   // detuned pair = width
    var g = ctx.createGain();
    var f = ctx.createBiquadFilter();
    var a = attack || 0.012;
    var rel = 0.3 + 0.8 * this.space;
    f.type = 'lowpass'; f.frequency.value = cutoff || 1800; f.Q.value = 0.5;
    o.type = type; o.frequency.value = mtof(midi);
    if (o2) {
      o2.type = type;
      o2.frequency.value = mtof(midi) * (1 + pal.detune / 10000);
      o2.connect(f);
      o2.start(t); o2.stop(t + dur + rel + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + a);
    g.gain.setValueAtTime(gain, t + Math.max(a + 0.01, dur));
    g.gain.exponentialRampToValueAtTime(0.0004, t + dur + rel);
    o.connect(f); f.connect(g);
    if (ctx.createStereoPanner && pan) {
      var p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p); p.connect(voice === 'pad' ? this.padBus : this.master);
    } else {
      g.connect(voice === 'pad' ? this.padBus : this.master);
    }
    o.start(t); o.stop(t + dur + rel + 0.05);

    var self = this, rec = { o: o, o2: o2, t: t, end: t + dur + rel, midi: midi };
    this._voices.push(rec);
    o.onended = function () {
      var i = self._voices.indexOf(rec);
      if (i >= 0) self._voices.splice(i, 1);
    };
    this.notes++;
    if (this.onnote) this.onnote(rec, midi, dur, voice || type);
  };

  /* ---------- drums, synthesised ---------- */
  Minstrel.prototype._noiseBuf = function () {
    if (this._nb) return this._nb;
    var len = Math.floor(this.ctx.sampleRate * 0.5);
    var b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    var d = b.getChannelData(0), r = rng((this.seed ^ 0x9e3779b9) >>> 0);
    for (var i = 0; i < len; i++) d[i] = r() * 2 - 1;
    this._nb = b;
    return b;
  };

  Minstrel.prototype._drum = function (t, kind, gain) {
    var ctx = this.ctx, o, g, f, n, ng, nf, len, panner;
    var self = this;
    function out(node, pan) {
      if (ctx.createStereoPanner && pan) { panner = ctx.createStereoPanner(); panner.pan.value = pan; node.connect(panner); panner.connect(self.drumBus); }
      else node.connect(self.drumBus);
    }
    if (kind === 'kick') {
      o = ctx.createOscillator(); g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(155, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain * this.pal.kick, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.33);
      o.connect(g); out(g, 0);
      o.start(t); o.stop(t + 0.36);
      if (this.padBus) {                       // duck the pad: the pump you feel
        var pg = this.padBus.gain;
        pg.linearRampToValueAtTime(0.55, t + 0.02);
        pg.linearRampToValueAtTime(1, t + 0.22);
      }
      return;
    }
    n = ctx.createBufferSource(); n.buffer = this._noiseBuf();
    ng = ctx.createGain(); nf = ctx.createBiquadFilter();
    if (kind === 'snare') {
      nf.type = 'bandpass'; nf.frequency.value = 1900; nf.Q.value = 0.8;
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.linearRampToValueAtTime(gain, t + 0.002);
      ng.gain.exponentialRampToValueAtTime(0.0005, t + 0.16);
      n.connect(nf); nf.connect(ng); out(ng, -0.3);
      n.start(t); n.stop(t + 0.2);
      o = ctx.createOscillator(); g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = 185;
      g.gain.setValueAtTime(gain * 0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0005, t + 0.09);
      o.connect(g); out(g, 0);
      o.start(t); o.stop(t + 0.12);
      return;
    }
    nf.type = 'highpass'; nf.frequency.value = 7200;
    len = kind === 'ohat' ? 0.22 : 0.05;
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.linearRampToValueAtTime(gain, t + 0.001);
    ng.gain.exponentialRampToValueAtTime(0.0005, t + len);
    n.connect(nf); nf.connect(ng); out(ng, 0.45);
    n.start(t); n.stop(t + len + 0.02);
  };

  /* ---------- harmony ---------- */
  Minstrel.prototype._midiAt = function (deg) {
    var n = this.scale.length;
    var o = Math.floor(deg / n);
    var i = deg - o * n;
    return this.root + this.scale[i] + 12 * o;
  };

  Minstrel.prototype._swingAt = function (i, beat) {   // delay off-beat eighths
    if (i % 4 === 2) return this.swing * beat / 6;
    if (i % 2 === 1) return this.swing * beat / 12;
    return 0;
  };

  /* One motif, developed over 8 bars. Events are in the KEY (degree indices),
   * so the shape survives the chord changes; strong beats snap to the triad. */
  Minstrel.prototype._makePhrase = function () {
    var r = rng(this.seed * 2654435761 + Math.floor(this.bar / 8) * 7919);
    var rhythm = RHYTHMS[Math.floor(r() * RHYTHMS.length)];
    var start = [0, 2, 4][Math.floor(r() * 3)];
    var chain = [], cur = start, rising = r() < 0.5, i, x, step;

    for (i = 0; i < rhythm.length; i++) {
      x = r();
      step = x < 0.2 ? 0 : x < 0.5 ? 1 : x < 0.82 ? 2 : 3;
      if (!rising) step = -step;
      cur += step;
      if (cur > start + 6) { rising = false; cur = start + 4; }   // arch: up, then down
      if (cur < start - 4) { rising = true; cur = start - 2; }
      chain.push(cur);
    }

    var bars = [], pb, k, shift, ev, onsets;
    for (pb = 0; pb < 8; pb++) {
      shift = SHIFTS[Math.floor(pb / 2)];
      onsets = [];
      for (k = 0; k < rhythm.length; k++) {
        if (Math.floor(rhythm[k] / 4) !== pb % 2) continue;       // this bar of the 2-bar figure
        if (pb >= 6 && k % 2 === 1) continue;                     // cadence: half as busy
        onsets.push({ beat: rhythm[k] % 4, deg: chain[k] + shift, idx: k });
      }
      bars.push(onsets);
    }
    bars[7].push({ beat: 2, deg: this.prog[1] === 0 ? 0 : 0, idx: 0, final: true });
    return bars;
  };

  /* the triad tones of a bar's chord, as absolute key degrees */
  Minstrel.prototype._triad = function (d) {
    var n = this.scale.length;
    return [d, d + 2, d + 4].map(function (x) { return ((x % n) + n) % n; });
  };

  Minstrel.prototype._snap = function (deg, d) {
    var n = this.scale.length, triad = this._triad(d), best = deg, bd = 99;
    triad.concat(triad.map(function (t) { return t - n; }), triad.map(function (t) { return t + n; }))
      .forEach(function (t) {
        var i = deg - t;
        if (Math.abs(i) < bd) { bd = Math.abs(i); best = t; }
      });
    return best;
  };

  /* schedule one bar starting at t0; barLen in seconds */
  Minstrel.prototype._bar = function (t0, barLen) {
    var beat = barLen / 4;
    var s16 = beat / 4;
    var bar = this.bar;
    var d = this.prog[bar % 4];
    var dNext = this.prog[(bar + 1) % 4];
    var rootM = this._midiAt(d);
    var nextRootM = this._midiAt(dNext);
    var g = this.groove, pal = this.pal, sp = this.space;
    var r = rng(this.seed + bar * 7919);
    var self = this;

    if (!this._phrase || bar % 8 === 0) this._phrase = this._makePhrase();

    /* pad: triad, very long attack, held past the bar line and crossfading */
    var hold = (rootM === nextRootM) ? barLen * 2 + PAD_OVERLAP : barLen + PAD_OVERLAP;
    if (!this._padUntil || t0 >= this._padUntil - (PAD_OVERLAP + 0.08)) {
      var atk = 0.3 + 0.9 * sp;
      this._note(t0, rootM - 12, hold, pal.pad, pal.padG, pal.padC, atk, 'pad', -0.52);
      this._note(t0, this._midiAt(d + 2) - 12, hold * 0.98, pal.pad, pal.padG * 0.7, pal.padC, atk, 'pad', 0.48);
      if (r() < 0.7) {
        this._note(t0, this._midiAt(d + 4) - 12, hold * 0.98, pal.pad, pal.padG * 0.7,
                   pal.padC * 1.15, atk, 'pad', 0.2);
      }
      this._padUntil = t0 + hold;
    }
    if (bar % 8 === 0) {   // one drone per period: the bed never stops
      this._note(t0, this._midiAt(0) - 12, barLen * 8 + PAD_OVERLAP, pal.pad,
                 pal.padG * 0.45, pal.padC * 0.7, 1.6, 'pad', 0);
    }

    /* drums */
    if (g.kick.length || g.snare.length) {
      g.kick.forEach(function (k) { self._drum(t0 + k * s16 + self._swingAt(k, beat), 'kick', 0.95); });
      g.snare.forEach(function (k) { self._drum(t0 + k * s16 + self._swingAt(k, beat), 'snare', 0.5); });
      if (g.hat) {
        for (var h = 0; h < 16; h += g.hat) {
          var open = (h === 14 && r() < 0.5);
          self._drum(t0 + h * s16 + self._swingAt(h, beat),
                     open ? 'ohat' : 'hat', (h % 4 === 0 ? 1.1 : 0.62) * pal.hat);
        }
      }
    }

    /* bass: on the kick, root/fifth of the chord */
    g.bass.forEach(function (p) {
      self._note(t0 + p[0] * s16 + self._swingAt(p[0], beat),
                 self._midiAt(d + p[1]) - 24, s16 * 2.4, pal.bass, 0.19, pal.bassC, 0.014, 'bass', 0);
    });

    /* melody: the phrase's notes for this bar, in the key, swung, accented,
       with strong beats snapped to the chord triad */
    var evs = this._phrase[bar % 8];
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i], deg = e.deg;
      var strong = (e.beat % 1 === 0);
      if (strong || e.final) deg = this._snap(deg, d);
      var next = evs[i + 1];
      var span = (next ? next.beat : 4) - e.beat;
      if (span <= 0) span = 1;
      var dur = e.final ? beat * 2.2 : Math.max(s16 * 3, span * beat * 0.92);
      var vel = e.final ? 1 : (strong ? 0.95 : 0.72) * (0.85 + r() * 0.3);
      this._note(t0 + e.beat * beat + this._swingAt(Math.round(e.beat * 4), beat),
                 this._midiAt(deg) + this.octave, dur, pal.mel, pal.melG * vel,
                 pal.melC, 0.03, 'mel', r() < 0.5 ? -0.35 : 0.35);
    }

    /* off-beat chord stabs on the busier grooves */
    if (this.grooveName === 'four' || this.grooveName === 'broken') {
      [6, 14].forEach(function (k) {
        self._note(t0 + k * s16 + self._swingAt(k, beat), rootM - 12, s16 * 0.7,
                   pal.pad, pal.padG * 0.6, 1400, 0.01, 'pad', -0.34);
        self._note(t0 + k * s16 + self._swingAt(k, beat), self._midiAt(d + 4) - 12, s16 * 0.7,
                   pal.pad, pal.padG * 0.45, 1600, 0.01, 'pad', 0.34);
      });
    }
  };

  /* ---------- transport: a musical clock, not a wall-clock timer ---------- */
  Minstrel.prototype._pump = function () {
    var self = this;
    if (!this.playing) return;
    if (this.ctx.state !== 'running') {          // frozen clock: never stack bars
      this._timer = global.setTimeout(function () { self._pump(); }, 120);
      return;
    }
    var now = this.ctx.currentTime;
    var barLen = (60 / this.tempo) * 4;
    if (this.nextTime < now) this.nextTime = now + 0.06;
    while (this.nextTime < now + LOOKAHEAD) {
      this.bars.push({ t: this.nextTime, len: barLen });
      this._bar(this.nextTime, barLen);
      this.nextTime += barLen;
      this.bar++;
    }
    this._timer = global.setTimeout(function () { self._pump(); }, 200);
  };

  Minstrel.prototype.start = function () {
    if (this.playing) return;
    this.init();
    if (this.master) this.master.gain.value = this.volume;
    if (this.ctx.state === 'suspended' && this.ctx.resume) {
      var pr = this.ctx.resume();
      if (pr && pr.catch) pr.catch(function () {});
    }
    this.playing = true;
    this.bar = 0;
    this._phrase = null;
    this._padUntil = 0;
    this.bars.length = 0;
    this.nextTime = this.ctx.currentTime + 0.08;
    this._pump();
  };

  Minstrel.prototype.stop = function () {
    this.playing = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    var now = this.ctx ? this.ctx.currentTime : 0;
    for (var i = 0; i < this._voices.length; i++) {
      var v = this._voices[i];
      try { v.o.stop(now + 0.03); if (v.o2) v.o2.stop(now + 0.03); } catch (e) {}
    }
    this._voices.length = 0;
    if (this.master) this.master.gain.value = 0;
  };

  Minstrel.prototype.setVolume = function (v) {
    this.volume = v;
    if (this.master && this.playing) this.master.gain.value = v;
  };

  /* what a given seed chose — same numbers the constructor would pick */
  Minstrel.describe = function (seed) {
    var m = new Minstrel({ seed: seed });
    return {
      seed: seed, prog: m.progIndex, groove: m.grooveName,
      palette: m.paletteName, octave: m.octave
    };
  };

  Minstrel.SCALES = SCALES;
  Minstrel.PROGS = PROGS;
  Minstrel.GROOVES = GROOVES;
  Minstrel.PALETTES = PALETTES;
  global.Minstrel = Minstrel;
})(typeof window !== 'undefined' ? window : this);
