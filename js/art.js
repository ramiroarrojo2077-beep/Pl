/* Primitivas de dibujo compartidas por criaturas y torres. */
(function (TD) {
  'use strict';

  var Art = {};

  Art.shadow = function (ctx, x, y, rx, ry, alpha) {
    ctx.fillStyle = 'rgba(0,0,0,' + (alpha === undefined ? 0.28 : alpha) + ')';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  Art.healthBar = function (ctx, x, y, w, ratio, boss) {
    var h = boss ? 5 : 3.5;
    ctx.fillStyle = 'rgba(0,0,0,.65)';
    TD.roundRect(ctx, x - w / 2 - 1, y - 1, w + 2, h + 2, 2);
    ctx.fill();
    var col = ratio > 0.55 ? '#69b43f' : ratio > 0.28 ? '#d9a441' : '#c2422f';
    ctx.fillStyle = col;
    TD.roundRect(ctx, x - w / 2, y, Math.max(0, w * ratio), h, 1.5);
    ctx.fill();
  };

  /* Llama animada, usada por braseros, flechas incendiarias y el dragón. */
  Art.flame = function (ctx, x, y, scale, t, hue) {
    var h = hue || 0;
    var layers = [
      { r: 11, c: 'rgba(255,' + (90 + h) + ',20,.32)', o: 0 },
      { r: 7.5, c: 'rgba(255,' + (150 + h) + ',40,.75)', o: 1.7 },
      { r: 4, c: 'rgba(255,' + (225 + h) + ',150,.95)', o: 3.1 }
    ];
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    layers.forEach(function (l, i) {
      var wob = Math.sin(t * 9 + i * 2.1) * 1.2;
      var stretch = 1 + Math.sin(t * 11 + i) * 0.16;
      ctx.fillStyle = l.c;
      ctx.beginPath();
      ctx.moveTo(-l.r * 0.7 + wob, l.o);
      ctx.quadraticCurveTo(-l.r * 0.9 + wob, -l.r * 0.9, wob * 0.4, -l.r * 1.9 * stretch);
      ctx.quadraticCurveTo(l.r * 0.9 + wob, -l.r * 0.9, l.r * 0.7 + wob, l.o);
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
  };

  Art.glow = function (ctx, x, y, r, color) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  /* Cuerpo humanoide genérico (goblins, orcos, caballeros, ogros...). */
  Art.humanoid = function (ctx, o) {
    var s = o.scale || 1;
    var swing = Math.sin(o.walk * 7) * 3.4 * s;

    ctx.save();
    ctx.translate(o.x, o.y);

    /* Piernas. */
    ctx.strokeStyle = o.legColor || o.cloth;
    ctx.lineCap = 'round';
    ctx.lineWidth = 3.2 * s;
    ctx.beginPath();
    ctx.moveTo(-2 * s, 2 * s); ctx.lineTo(-2 * s + swing, 9 * s);
    ctx.moveTo(2 * s, 2 * s); ctx.lineTo(2 * s - swing, 9 * s);
    ctx.stroke();

    /* Torso. */
    var bob = Math.sin(o.walk * 14) * 0.7 * s;
    ctx.fillStyle = o.cloth;
    ctx.beginPath();
    ctx.ellipse(0, -1 * s + bob, 6.8 * s, 7.8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.28)';
    ctx.lineWidth = 0.9 * s;
    ctx.stroke();
    if (o.armor) {
      ctx.fillStyle = o.armor;
      ctx.beginPath();
      ctx.ellipse(0, -2 * s + bob, 7 * s, 5.2 * s, 0, Math.PI, Math.PI * 2);
      ctx.fill();
      /* Hombreras. */
      ctx.beginPath();
      ctx.ellipse(-6 * s, -3.4 * s + bob, 2.6 * s, 2.2 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(6 * s, -3.4 * s + bob, 2.6 * s, 2.2 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    /* Brazos. */
    ctx.strokeStyle = o.skin;
    ctx.lineWidth = 2.8 * s;
    ctx.beginPath();
    ctx.moveTo(-5 * s, -2 * s + bob); ctx.lineTo(-7 * s - swing * 0.4, 3 * s + bob);
    ctx.moveTo(5 * s, -2 * s + bob); ctx.lineTo(7 * s + swing * 0.4, 3 * s + bob);
    ctx.stroke();

    /* Cabeza. */
    var hy = -10.5 * s + bob;
    ctx.fillStyle = o.skin;
    ctx.beginPath();
    ctx.arc(0, hy, 4 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.28)';
    ctx.lineWidth = 0.9 * s;
    ctx.stroke();
    if (o.ears) {
      ctx.beginPath();
      ctx.moveTo(-3.4 * s, hy - 1 * s); ctx.lineTo(-8 * s, hy - 4.5 * s); ctx.lineTo(-3.4 * s, hy + 2 * s);
      ctx.moveTo(3.4 * s, hy - 1 * s); ctx.lineTo(8 * s, hy - 4.5 * s); ctx.lineTo(3.4 * s, hy + 2 * s);
      ctx.fill();
    }
    if (o.helmet) {
      ctx.fillStyle = o.helmet;
      ctx.beginPath();
      ctx.arc(0, hy - 0.5 * s, 4.5 * s, Math.PI * 1.02, Math.PI * 1.98);
      ctx.lineTo(4.2 * s, hy + 1.8 * s);
      ctx.lineTo(-4.2 * s, hy + 1.8 * s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.7)';
      ctx.fillRect(-3 * s, hy - 1.4 * s, 6 * s, 1.7 * s);
      /* Cimera. */
      ctx.fillStyle = o.shield || '#7b2f2a';
      ctx.fillRect(-0.8 * s, hy - 7.5 * s, 1.6 * s, 3.2 * s);
    } else {
      ctx.fillStyle = o.eye || '#2a1608';
      ctx.beginPath();
      ctx.arc(-1.8 * s, hy - 0.4 * s, 0.95 * s, 0, Math.PI * 2);
      ctx.arc(1.8 * s, hy - 0.4 * s, 0.95 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    if (o.horns) {
      ctx.fillStyle = '#d8cdb2';
      ctx.beginPath();
      ctx.moveTo(-3.6 * s, hy - 3 * s); ctx.lineTo(-6.5 * s, hy - 8 * s); ctx.lineTo(-2 * s, hy - 4.4 * s);
      ctx.moveTo(3.6 * s, hy - 3 * s); ctx.lineTo(6.5 * s, hy - 8 * s); ctx.lineTo(2 * s, hy - 4.4 * s);
      ctx.fill();
    }

    /* Arma en la mano derecha. */
    if (o.weapon === 'club') {
      ctx.strokeStyle = '#6b4a28';
      ctx.lineWidth = 2.6 * s;
      ctx.beginPath();
      ctx.moveTo(7 * s + swing * 0.4, 3 * s + bob);
      ctx.lineTo(11 * s + swing * 0.4, -6 * s + bob);
      ctx.stroke();
      ctx.fillStyle = '#7d5a33';
      ctx.beginPath();
      ctx.arc(11.5 * s + swing * 0.4, -7.5 * s + bob, 3.2 * s, 0, Math.PI * 2);
      ctx.fill();
    } else if (o.weapon === 'sword') {
      ctx.strokeStyle = '#cfd6de';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(7 * s + swing * 0.4, 2 * s + bob);
      ctx.lineTo(10 * s + swing * 0.4, -10 * s + bob);
      ctx.stroke();
      ctx.strokeStyle = '#8a6a3a';
      ctx.lineWidth = 2.4 * s;
      ctx.beginPath();
      ctx.moveTo(5.6 * s + swing * 0.4, 1 * s + bob);
      ctx.lineTo(8.4 * s + swing * 0.4, -1.4 * s + bob);
      ctx.stroke();
    } else if (o.weapon === 'axe') {
      ctx.strokeStyle = '#5d4326';
      ctx.lineWidth = 2.4 * s;
      ctx.beginPath();
      ctx.moveTo(7 * s + swing * 0.4, 3 * s + bob);
      ctx.lineTo(10 * s + swing * 0.4, -9 * s + bob);
      ctx.stroke();
      ctx.fillStyle = '#b9c0c8';
      ctx.beginPath();
      ctx.moveTo(9 * s, -8 * s + bob);
      ctx.lineTo(15 * s, -10 * s + bob);
      ctx.lineTo(13 * s, -3 * s + bob);
      ctx.closePath();
      ctx.fill();
    }

    /* Escudo en la mano izquierda. */
    if (o.shield) {
      ctx.fillStyle = o.shield;
      ctx.beginPath();
      ctx.moveTo(-11 * s, -5 * s + bob);
      ctx.lineTo(-5.5 * s, -5 * s + bob);
      ctx.lineTo(-5.5 * s, 3 * s + bob);
      ctx.lineTo(-8.2 * s, 6 * s + bob);
      ctx.lineTo(-11 * s, 3 * s + bob);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.4)';
      ctx.lineWidth = 1 * s;
      ctx.stroke();
    }
    ctx.restore();
  };

  TD.Art = Art;
})(window.TD = window.TD || {});
