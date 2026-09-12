/* Construcción del mapa: camino, casillas bloqueadas y textura del suelo.
 *
 * El relieve (castillo, portón, árboles y rocas) lo pone la escena 3D con los
 * modelos de Blender; aquí solo se pinta la hierba y el camino que se usan como
 * textura del terreno. */
(function (TD) {
  'use strict';

  var T = TD.TILE;

  /* Vértices del camino en coordenadas de casilla (el centro de la casilla n es (n+0.5)*T). */
  var WAYPOINTS = [
    [-1.4, 1], [6, 1], [6, 5], [2, 5], [2, 9], [10, 9],
    [10, 3], [14, 3], [14, 11], [17, 11], [17, 6], [17.67, 6]
  ];

  var CASTLE = { c0: 18, c1: 19, r0: 4, r1: 8 };

  TD.BLOCK = { FREE: 0, PATH: 1, PROP: 2, CASTLE: 3 };

  function toPx(p) { return { x: (p[0] + 0.5) * T, y: (p[1] + 0.5) * T }; }

  function buildLevel() {
    var pts = WAYPOINTS.map(toPx);
    var path = new TD.Path(pts);

    var spawn = pts[0];
    var gate = pts[pts.length - 1];

    /* Las bestias voladoras cortan por el aire, pero sobrevuelan todo el campo:
       ignoran el camino sin volverse intocables. */
    var airPath = new TD.Path(
      [[-1.4, 1], [7, 3], [3, 8], [11, 10], [13, 4], [17, 8], [17.67, 6]].map(toPx)
    );

    var blocked = new Uint8Array(TD.GRID_W * TD.GRID_H);
    var idx = function (c, r) { return r * TD.GRID_W + c; };

    /* Casillas ocupadas por el camino (y sus vecinas diagonales en las curvas). */
    for (var i = 0; i < WAYPOINTS.length - 1; i++) {
      var a = WAYPOINTS[i], b = WAYPOINTS[i + 1];
      var steps = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 4);
      for (var s = 0; s <= steps; s++) {
        var t = steps ? s / steps : 0;
        var c = Math.round(a[0] + (b[0] - a[0]) * t);
        var r = Math.round(a[1] + (b[1] - a[1]) * t);
        if (c >= 0 && c < TD.GRID_W && r >= 0 && r < TD.GRID_H) blocked[idx(c, r)] = TD.BLOCK.PATH;
      }
    }

    for (var cc = CASTLE.c0; cc <= CASTLE.c1; cc++) {
      for (var rr = CASTLE.r0; rr <= CASTLE.r1; rr++) blocked[idx(cc, rr)] = TD.BLOCK.CASTLE;
    }

    /* Árboles y rocas: sólo lejos del camino, para no robar posiciones de torre útiles. */
    var rnd = TD.rng(20240917);
    var props = [];
    for (var r2 = 0; r2 < TD.GRID_H; r2++) {
      for (var c2 = 0; c2 < TD.GRID_W; c2++) {
        if (blocked[idx(c2, r2)] !== TD.BLOCK.FREE) continue;
        var nearPath = false;
        for (var dc = -1; dc <= 1 && !nearPath; dc++) {
          for (var dr = -1; dr <= 1; dr++) {
            var nc = c2 + dc, nr = r2 + dr;
            if (nc < 0 || nc >= TD.GRID_W || nr < 0 || nr >= TD.GRID_H) continue;
            if (blocked[idx(nc, nr)] === TD.BLOCK.PATH) { nearPath = true; break; }
          }
        }
        if (nearPath) continue;
        var roll = rnd();
        if (roll < 0.14) {
          blocked[idx(c2, r2)] = TD.BLOCK.PROP;
          props.push({ c: c2, r: r2, kind: rnd() < 0.62 ? 'pine' : 'oak', seed: rnd() });
        } else if (roll < 0.19) {
          blocked[idx(c2, r2)] = TD.BLOCK.PROP;
          props.push({ c: c2, r: r2, kind: 'rock', seed: rnd() });
        }
      }
    }

    var level = {
      path: path,
      airPath: airPath,
      blocked: blocked,
      props: props,
      spawn: spawn,
      gate: gate,
      castle: CASTLE,
      idx: idx,
      isFree: function (c, r) {
        if (c < 0 || c >= TD.GRID_W || r < 0 || r >= TD.GRID_H) return false;
        return blocked[idx(c, r)] === TD.BLOCK.FREE;
      }
    };

    level.bg = renderTerrain(level);
    return level;
  }

  /* ------------------------------------------------------------------ */
  /* Pintado del terreno (se cachea en un canvas fuera de pantalla).     */
  /* ------------------------------------------------------------------ */

  function renderTerrain(level) {
    /* En escritorio se pinta al triple: el suelo se ve de cerca al ampliar. */
    var k = (window.devicePixelRatio > 1 && window.innerWidth < 900) ? 2 : 3;
    var cv = document.createElement('canvas');
    cv.width = TD.W * k;
    cv.height = TD.H * k;
    var ctx = cv.getContext('2d');
    ctx.scale(k, k);
    var rnd = TD.rng(777);

    drawGrass(ctx, rnd);
    drawPath(ctx, level.path);

    return cv;
  }

  function drawGrass(ctx, rnd) {
    var g = ctx.createLinearGradient(0, 0, 0, TD.H);
    g.addColorStop(0, '#54743b');
    g.addColorStop(0.55, '#4e6d36');
    g.addColorStop(1, '#476431');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, TD.W, TD.H);

    for (var i = 0; i < 260; i++) {
      var x = rnd() * TD.W, y = rnd() * TD.H;
      ctx.globalAlpha = 0.05 + rnd() * 0.07;
      ctx.fillStyle = rnd() < 0.5 ? '#78964f' : '#385123';
      ctx.beginPath();
      ctx.ellipse(x, y, 18 + rnd() * 62, 12 + rnd() * 36, rnd() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (var j = 0; j < 1400; j++) {
      var tx = rnd() * TD.W, ty = rnd() * TD.H;
      ctx.strokeStyle = rnd() < 0.5 ? 'rgba(130,160,88,.45)' : 'rgba(56,82,38,.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + (rnd() - 0.5) * 3, ty - 3 - rnd() * 4);
      ctx.stroke();
    }
    for (var k = 0; k < 120; k++) {
      ctx.fillStyle = ['#d8d06a', '#c9d6e2', '#cf8fb0'][Math.floor(rnd() * 3)];
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(rnd() * TD.W, rnd() * TD.H, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function tracePath(ctx, path) {
    ctx.beginPath();
    ctx.moveTo(path.points[0].x, path.points[0].y);
    for (var i = 1; i < path.points.length; i++) ctx.lineTo(path.points[i].x, path.points[i].y);
  }

  function drawPath(ctx, path) {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    var layers = [
      ['rgba(30,40,20,.5)', 48],
      ['#6b5334', 42],
      ['#8a6d47', 34],
      ['#9c7f56', 22]
    ];
    layers.forEach(function (l) {
      tracePath(ctx, path);
      ctx.strokeStyle = l[0];
      ctx.lineWidth = l[1];
      ctx.stroke();
    });

    /* Guijarros y hierba invadiendo los bordes. */
    var rnd = TD.rng(4242);
    for (var d = 0; d < path.length; d += 4) {
      var p = path.at(d);
      var nx = -Math.sin(p.angle), ny = Math.cos(p.angle);
      if (rnd() < 0.3) {
        var off = (rnd() - 0.5) * 26;
        ctx.fillStyle = rnd() < 0.5 ? 'rgba(88,70,46,.6)' : 'rgba(178,156,118,.4)';
        ctx.beginPath();
        ctx.ellipse(p.x + nx * off, p.y + ny * off, 1 + rnd() * 2.8, 1 + rnd() * 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (rnd() < 0.1) {
        var side = rnd() < 0.5 ? -1 : 1;
        var ex = p.x + nx * side * (17 + rnd() * 4);
        var ey = p.y + ny * side * (17 + rnd() * 4);
        ctx.strokeStyle = 'rgba(104,138,62,.6)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + (rnd() - 0.5) * 4, ey - 3 - rnd() * 4);
        ctx.stroke();
      }
    }
  }

  TD.buildLevel = buildLevel;
})(window.TD = window.TD || {});
