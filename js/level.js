/* Construcción del mapa: camino, casillas bloqueadas y pintado del terreno. */
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
    var cv = document.createElement('canvas');
    cv.width = TD.W;
    cv.height = TD.H;
    var ctx = cv.getContext('2d');
    var rnd = TD.rng(777);

    drawGrass(ctx, rnd);
    drawPath(ctx, level.path);
    drawSpawnGate(ctx, level.spawn);
    drawCastle(ctx, level.castle);
    level.props.forEach(function (p) { drawProp(ctx, p); });
    drawVignette(ctx);

    return cv;
  }

  function drawGrass(ctx, rnd) {
    var g = ctx.createLinearGradient(0, 0, 0, TD.H);
    g.addColorStop(0, '#4d6b35');
    g.addColorStop(0.55, '#456230');
    g.addColorStop(1, '#3b5629');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, TD.W, TD.H);

    /* Parches de hierba de distinto tono. */
    for (var i = 0; i < 220; i++) {
      var x = rnd() * TD.W, y = rnd() * TD.H;
      var rx = 18 + rnd() * 60, ry = 12 + rnd() * 34;
      ctx.globalAlpha = 0.05 + rnd() * 0.06;
      ctx.fillStyle = rnd() < 0.5 ? '#6c8b45' : '#31491f';
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rnd() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    /* Matas y florecillas. */
    for (var j = 0; j < 900; j++) {
      var tx = rnd() * TD.W, ty = rnd() * TD.H;
      var h = 3 + rnd() * 4;
      ctx.strokeStyle = rnd() < 0.5 ? 'rgba(120,150,80,.5)' : 'rgba(50,75,35,.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx + (rnd() - 0.5) * 3, ty - h);
      ctx.stroke();
    }
    for (var k = 0; k < 90; k++) {
      var fx = rnd() * TD.W, fy = rnd() * TD.H;
      ctx.fillStyle = ['#d8d06a', '#c9d6e2', '#cf8fb0'][Math.floor(rnd() * 3)];
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(fx, fy, 1.6, 0, Math.PI * 2);
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

    tracePath(ctx, path);
    ctx.strokeStyle = 'rgba(24,32,16,.45)';
    ctx.lineWidth = 46;
    ctx.stroke();

    tracePath(ctx, path);
    ctx.strokeStyle = '#6d5537';
    ctx.lineWidth = 42;
    ctx.stroke();

    tracePath(ctx, path);
    ctx.strokeStyle = '#8a6d47';
    ctx.lineWidth = 34;
    ctx.stroke();

    tracePath(ctx, path);
    ctx.strokeStyle = '#9a7c53';
    ctx.lineWidth = 22;
    ctx.stroke();

    /* Rodadas, piedrecillas y hierba invadiendo el borde. */
    var rnd = TD.rng(4242);
    for (var d = 0; d < path.length; d += 5) {
      var p = path.at(d);
      var nx = -Math.sin(p.angle), ny = Math.cos(p.angle);
      if (rnd() < 0.25) {
        var off = (rnd() - 0.5) * 26;
        ctx.fillStyle = rnd() < 0.5 ? 'rgba(90,72,48,.6)' : 'rgba(170,148,110,.35)';
        ctx.beginPath();
        ctx.ellipse(p.x + nx * off, p.y + ny * off, 1 + rnd() * 2.6, 1 + rnd() * 2, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (rnd() < 0.14) {
        var side = rnd() < 0.5 ? -1 : 1;
        var ex = p.x + nx * side * (17 + rnd() * 4);
        var ey = p.y + ny * side * (17 + rnd() * 4);
        ctx.strokeStyle = 'rgba(96,128,58,.6)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + (rnd() - 0.5) * 4, ey - 3 - rnd() * 4);
        ctx.stroke();
      }
    }
  }

  function drawSpawnGate(ctx, spawn) {
    var x = 30, y = spawn.y;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 40, 40, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    /* Bloque de sillería agrietado. */
    var g = ctx.createLinearGradient(x - 34, 0, x + 34, 0);
    g.addColorStop(0, '#5a534b');
    g.addColorStop(0.5, '#4a443d');
    g.addColorStop(1, '#332e29');
    ctx.fillStyle = g;
    TD.roundRect(ctx, x - 34, y - 46, 68, 92, 5);
    ctx.fill();
    ctx.strokeStyle = '#221f1b';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0,0,0,.3)';
    ctx.lineWidth = 1;
    for (var ry = y - 34; ry < y + 44; ry += 13) {
      ctx.beginPath();
      ctx.moveTo(x - 34, ry); ctx.lineTo(x + 34, ry);
      ctx.stroke();
    }

    /* Vano en arco por el que brota la horda. */
    ctx.beginPath();
    ctx.moveTo(x - 40, y + 26);
    ctx.lineTo(x - 40, y - 6);
    ctx.arc(x - 4, y - 6, 36, Math.PI, Math.PI * 1.5);
    ctx.lineTo(x + 32, y - 42);
    ctx.lineTo(x + 32, y + 26);
    ctx.closePath();
    ctx.fillStyle = '#0a0c0d';
    ctx.fill();

    var tunnel = ctx.createLinearGradient(x - 26, 0, x + 34, 0);
    tunnel.addColorStop(0, 'rgba(10,12,13,1)');
    tunnel.addColorStop(1, 'rgba(30,36,34,0)');
    ctx.fillStyle = tunnel;
    ctx.fillRect(x - 34, y - 26, 68, 52);

    /* Dovelas del arco. */
    ctx.strokeStyle = '#6b645b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x - 4, y, 26, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    /* Antorchas a ambos lados del vano. */
    [[-24, -30], [-24, 30]].forEach(function (o) {
      ctx.fillStyle = '#3b2a18';
      ctx.fillRect(x + o[0] - 1.5, y + o[1], 3, 11);
      var fg = ctx.createRadialGradient(x + o[0], y + o[1] - 2, 0, x + o[0], y + o[1] - 2, 11);
      fg.addColorStop(0, 'rgba(255,224,150,.95)');
      fg.addColorStop(0.45, 'rgba(240,150,50,.6)');
      fg.addColorStop(1, 'rgba(240,120,30,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(x + o[0], y + o[1] - 2, 11, 0, Math.PI * 2); ctx.fill();
    });

    /* Musgo en la base. */
    ctx.fillStyle = 'rgba(96,128,58,.45)';
    ctx.beginPath();
    ctx.ellipse(x - 18, y + 42, 16, 5, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 20, y + 41, 12, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCastle(ctx, castle) {
    var x0 = castle.c0 * T - 16;
    var y0 = castle.r0 * T + 4;
    var y1 = (castle.r1 + 1) * T - 6;
    var h = y1 - y0;

    ctx.save();
    /* Sombra proyectada. */
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath();
    ctx.ellipse(x0 + 60, y1 - 4, 86, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    /* Muralla principal. */
    var wall = ctx.createLinearGradient(x0, 0, TD.W, 0);
    wall.addColorStop(0, '#8d8b83');
    wall.addColorStop(0.45, '#76746d');
    wall.addColorStop(1, '#5b5952');
    ctx.fillStyle = wall;
    ctx.fillRect(x0 + 18, y0, TD.W - x0 - 18, h);

    /* Sillares. */
    ctx.strokeStyle = 'rgba(0,0,0,.2)';
    ctx.lineWidth = 1;
    for (var ry = y0; ry < y1; ry += 13) {
      ctx.beginPath(); ctx.moveTo(x0 + 18, ry); ctx.lineTo(TD.W, ry); ctx.stroke();
      var offset = ((ry - y0) / 13) % 2 === 0 ? 0 : 13;
      for (var rx = x0 + 18 + offset; rx < TD.W; rx += 26) {
        ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx, ry + 13); ctx.stroke();
      }
    }

    /* Almenas superiores e inferiores. */
    ctx.fillStyle = '#6e6c65';
    for (var bx = x0 + 18; bx < TD.W; bx += 22) {
      ctx.fillRect(bx, y0 - 12, 13, 14);
      ctx.fillRect(bx, y1 - 2, 13, 12);
    }

    /* Torreones. */
    [y0 + 6, y1 - 62].forEach(function (ty) { drawTurret(ctx, x0 + 22, ty, 56); });

    /* Portón con arco. */
    var gx = x0 + 18, gy = 312;
    ctx.fillStyle = '#2b2119';
    ctx.beginPath();
    ctx.moveTo(gx - 6, gy + 34);
    ctx.lineTo(gx - 6, gy - 12);
    ctx.arc(gx + 14, gy - 12, 20, Math.PI, 0);
    ctx.lineTo(gx + 34, gy + 34);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#4a3421';
    ctx.beginPath();
    ctx.moveTo(gx + 2, gy + 32);
    ctx.lineTo(gx + 2, gy - 10);
    ctx.arc(gx + 16, gy - 10, 14, Math.PI, 0);
    ctx.lineTo(gx + 30, gy + 32);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.45)';
    ctx.lineWidth = 1.4;
    for (var i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(gx + 2 + i * 7, gy - 22); ctx.lineTo(gx + 2 + i * 7, gy + 32);
      ctx.stroke();
    }
    /* Rastrillo levantado. */
    ctx.strokeStyle = '#6a6258';
    ctx.lineWidth = 2;
    for (var j = 0; j < 4; j++) {
      ctx.beginPath();
      ctx.moveTo(gx + 3 + j * 8, gy - 34); ctx.lineTo(gx + 3 + j * 8, gy - 20);
      ctx.stroke();
    }

    /* Estandarte del señor de Rocanegra. */
    ctx.fillStyle = '#3a3129';
    ctx.fillRect(x0 + 46, y0 - 58, 3, 50);
    ctx.fillStyle = '#8e2b26';
    ctx.beginPath();
    ctx.moveTo(x0 + 49, y0 - 56);
    ctx.lineTo(x0 + 88, y0 - 50);
    ctx.lineTo(x0 + 78, y0 - 38);
    ctx.lineTo(x0 + 88, y0 - 26);
    ctx.lineTo(x0 + 49, y0 - 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#d9a441';
    ctx.beginPath();
    ctx.arc(x0 + 64, y0 - 39, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawTurret(ctx, x, y, size) {
    ctx.save();
    var g = ctx.createLinearGradient(x - size / 2, 0, x + size / 2, 0);
    g.addColorStop(0, '#9a978e');
    g.addColorStop(0.5, '#807d75');
    g.addColorStop(1, '#605d56');
    ctx.fillStyle = g;
    ctx.fillRect(x - size / 2, y, size, size);
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.lineWidth = 1;
    for (var ry = y; ry < y + size; ry += 12) {
      ctx.beginPath(); ctx.moveTo(x - size / 2, ry); ctx.lineTo(x + size / 2, ry); ctx.stroke();
    }
    ctx.fillStyle = '#75726a';
    for (var bx = x - size / 2; bx < x + size / 2; bx += 16) ctx.fillRect(bx, y - 10, 10, 12);
    /* Tejado cónico. */
    ctx.fillStyle = '#5d3b34';
    ctx.beginPath();
    ctx.moveTo(x - size / 2 - 4, y - 8);
    ctx.lineTo(x, y - 40);
    ctx.lineTo(x + size / 2 + 4, y - 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawProp(ctx, p) {
    var x = (p.c + 0.5) * T;
    var y = (p.r + 0.5) * T;
    var s = 0.85 + p.seed * 0.3;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.26)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 14, 15 * s, 6 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    if (p.kind === 'rock') {
      var g = ctx.createLinearGradient(x - 14, y - 12, x + 14, y + 12);
      g.addColorStop(0, '#9a978f');
      g.addColorStop(1, '#5d5a54');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - 15 * s, y + 11);
      ctx.lineTo(x - 9 * s, y - 8 * s);
      ctx.lineTo(x + 2 * s, y - 12 * s);
      ctx.lineTo(x + 13 * s, y - 3 * s);
      ctx.lineTo(x + 15 * s, y + 11);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.3)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = 'rgba(110,140,70,.55)';
      ctx.beginPath();
      ctx.ellipse(x - 4, y + 9, 9 * s, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.kind === 'pine') {
      ctx.fillStyle = '#4a3521';
      ctx.fillRect(x - 2.5, y + 2, 5, 12);
      for (var i = 0; i < 3; i++) {
        var w = (20 - i * 4) * s;
        var yy = y + 6 - i * 10;
        var grd = ctx.createLinearGradient(x - w, 0, x + w, 0);
        grd.addColorStop(0, '#3f6330');
        grd.addColorStop(0.5, '#345226');
        grd.addColorStop(1, '#25401b');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(x - w, yy);
        ctx.lineTo(x, yy - 18 * s);
        ctx.lineTo(x + w, yy);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#4a3521';
      ctx.fillRect(x - 3, y - 2, 6, 16);
      var og = ctx.createRadialGradient(x - 5, y - 12, 2, x, y - 8, 20 * s);
      og.addColorStop(0, '#6a9445');
      og.addColorStop(1, '#2f4a1f');
      ctx.fillStyle = og;
      ctx.beginPath();
      ctx.arc(x - 7 * s, y - 6, 10 * s, 0, Math.PI * 2);
      ctx.arc(x + 7 * s, y - 7, 9 * s, 0, Math.PI * 2);
      ctx.arc(x, y - 16 * s, 11 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawVignette(ctx) {
    var g = ctx.createRadialGradient(TD.W / 2, TD.H / 2, TD.H * 0.42, TD.W / 2, TD.H / 2, TD.H * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.4)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, TD.W, TD.H);
  }

  TD.buildLevel = buildLevel;
})(window.TD = window.TD || {});
