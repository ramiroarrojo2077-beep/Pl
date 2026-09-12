/* Utilidades comunes y constantes del tablero. */
(function (TD) {
  'use strict';

  TD.TILE = 48;
  TD.GRID_W = 20;
  TD.GRID_H = 13;
  TD.W = TD.GRID_W * TD.TILE;   // 960
  TD.H = TD.GRID_H * TD.TILE;   // 624

  TD.clamp = function (v, min, max) { return v < min ? min : (v > max ? max : v); };
  TD.lerp = function (a, b, t) { return a + (b - a) * t; };
  TD.dist = function (ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); };
  TD.dist2 = function (ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    return dx * dx + dy * dy;
  };

  /* Generador pseudoaleatorio determinista (mulberry32). */
  TD.rng = function (seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  TD.pick = function (arr, rnd) { return arr[Math.floor((rnd || Math.random)() * arr.length)]; };

  /* Gira `cur` hacia `target` como máximo `step` radianes, por el camino corto. */
  TD.turnTo = function (cur, target, step) {
    var d = ((target - cur + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    if (Math.abs(d) <= step) return target;
    return cur + Math.sign(d) * step;
  };

  TD.angleDiff = function (a, b) {
    return Math.abs(((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI);
  };

  TD.roundRect = function (ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  };

  TD.num = function (n) {
    return Math.round(n).toLocaleString('es-ES');
  };

  /* Polilínea recorrible: devuelve posición y ángulo a lo largo del trazado. */
  function Path(points) {
    this.points = points;
    this.cum = [0];
    for (var i = 1; i < points.length; i++) {
      this.cum[i] = this.cum[i - 1] + TD.dist(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
    }
    this.length = this.cum[this.cum.length - 1];
  }

  Path.prototype.at = function (d) {
    var pts = this.points;
    if (d <= 0) return { x: pts[0].x, y: pts[0].y, angle: Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x) };
    if (d >= this.length) {
      var n = pts.length - 1;
      return { x: pts[n].x, y: pts[n].y, angle: Math.atan2(pts[n].y - pts[n - 1].y, pts[n].x - pts[n - 1].x) };
    }
    var lo = 0, hi = this.cum.length - 1;
    while (lo < hi - 1) {
      var mid = (lo + hi) >> 1;
      if (this.cum[mid] <= d) lo = mid; else hi = mid;
    }
    var a = pts[lo], b = pts[lo + 1];
    var segLen = this.cum[lo + 1] - this.cum[lo] || 1;
    var t = (d - this.cum[lo]) / segLen;
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      angle: Math.atan2(b.y - a.y, b.x - a.x)
    };
  };

  TD.Path = Path;
})(window.TD = window.TD || {});
