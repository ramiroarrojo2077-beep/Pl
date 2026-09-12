/* Efectos de sonido sintetizados con WebAudio (sin ficheros externos). */
(function (TD) {
  'use strict';

  var ctx = null;
  var master = null;
  var muted = false;

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    return ctx;
  }

  function noiseBuffer(dur) {
    var len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function tone(opts) {
    if (muted || !ensure()) return;
    var t0 = ctx.currentTime + (opts.delay || 0);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + opts.dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(opts.vol || 0.2, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + opts.dur + 0.02);
  }

  function noise(opts) {
    if (muted || !ensure()) return;
    var t0 = ctx.currentTime + (opts.delay || 0);
    var src = ctx.createBufferSource();
    src.buffer = noiseBuffer(opts.dur);
    var filter = ctx.createBiquadFilter();
    filter.type = opts.filter || 'lowpass';
    filter.frequency.setValueAtTime(opts.freq || 900, t0);
    if (opts.to) filter.frequency.exponentialRampToValueAtTime(Math.max(60, opts.to), t0 + opts.dur);
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(opts.vol || 0.2, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t0);
  }

  var last = {};
  /* Evita saturación cuando muchas torres disparan a la vez. */
  function throttled(key, ms, fn) {
    var now = performance.now();
    if (last[key] && now - last[key] < ms) return;
    last[key] = now;
    fn();
  }

  TD.Audio = {
    resume: function () {
      var c = ensure();
      if (c && c.state === 'suspended') c.resume();
    },
    toggle: function () { muted = !muted; return muted; },
    isMuted: function () { return muted; },

    arrow: function () { throttled('arrow', 55, function () { noise({ dur: 0.12, freq: 2600, to: 700, vol: 0.1 }); }); },
    bolt: function () { throttled('bolt', 70, function () {
      noise({ dur: 0.16, freq: 1800, to: 400, vol: 0.16 });
      tone({ type: 'square', freq: 180, to: 90, dur: 0.1, vol: 0.07 });
    }); },
    zap: function () { throttled('zap', 70, function () {
      noise({ dur: 0.18, freq: 5200, to: 900, vol: 0.12, filter: 'bandpass' });
      tone({ type: 'square', freq: 900, to: 220, dur: 0.12, vol: 0.06 });
    }); },
    frost: function () { throttled('frost', 90, function () { tone({ type: 'sine', freq: 1500, to: 520, dur: 0.22, vol: 0.09 }); }); },
    fire: function () { throttled('fire', 260, function () { noise({ dur: 0.3, freq: 700, to: 250, vol: 0.05 }); }); },
    launch: function () { throttled('launch', 90, function () { tone({ type: 'triangle', freq: 130, to: 300, dur: 0.18, vol: 0.12 }); }); },
    boom: function () { throttled('boom', 60, function () {
      noise({ dur: 0.45, freq: 900, to: 80, vol: 0.34 });
      tone({ type: 'sine', freq: 90, to: 35, dur: 0.35, vol: 0.2 });
    }); },
    hit: function () { throttled('hit', 45, function () { noise({ dur: 0.06, freq: 1400, to: 500, vol: 0.07 }); }); },
    die: function () { throttled('die', 60, function () {
      noise({ dur: 0.2, freq: 1100, to: 200, vol: 0.14 });
      tone({ type: 'sawtooth', freq: 260, to: 90, dur: 0.18, vol: 0.08 });
    }); },
    build: function () {
      tone({ type: 'triangle', freq: 520, dur: 0.1, vol: 0.16 });
      tone({ type: 'triangle', freq: 780, dur: 0.14, vol: 0.14, delay: 0.07 });
    },
    upgrade: function () {
      tone({ type: 'triangle', freq: 620, dur: 0.09, vol: 0.16 });
      tone({ type: 'triangle', freq: 830, dur: 0.09, vol: 0.15, delay: 0.07 });
      tone({ type: 'triangle', freq: 1100, dur: 0.16, vol: 0.14, delay: 0.14 });
    },
    sell: function () { tone({ type: 'sine', freq: 900, to: 300, dur: 0.16, vol: 0.14 }); },
    denied: function () { tone({ type: 'square', freq: 150, to: 90, dur: 0.14, vol: 0.1 }); },
    leak: function () {
      tone({ type: 'sawtooth', freq: 220, to: 70, dur: 0.5, vol: 0.2 });
      noise({ dur: 0.4, freq: 500, to: 120, vol: 0.14 });
    },
    horn: function () {
      tone({ type: 'sawtooth', freq: 175, dur: 0.55, vol: 0.15 });
      tone({ type: 'sawtooth', freq: 262, dur: 0.55, vol: 0.12, delay: 0.02 });
      tone({ type: 'sawtooth', freq: 350, dur: 0.7, vol: 0.1, delay: 0.28 });
    },
    victory: function () {
      [523, 659, 784, 1046].forEach(function (f, i) {
        tone({ type: 'triangle', freq: f, dur: 0.5, vol: 0.16, delay: i * 0.16 });
      });
    },
    defeat: function () {
      [330, 262, 196, 147].forEach(function (f, i) {
        tone({ type: 'sawtooth', freq: f, dur: 0.6, vol: 0.16, delay: i * 0.22 });
      });
    }
  };
})(window.TD = window.TD || {});
