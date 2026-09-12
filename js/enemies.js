/* Bestiario: definiciones de enemigos y su lógica de movimiento. */
(function (TD) {
  'use strict';

  var Art = TD.Art;

  /* speed en casillas/segundo · armor resta daño físico · gold recompensa. */
  var TYPES = {
    goblin: {
      name: 'Trasgo', hp: 40, speed: 1.9, armor: 0, gold: 10, leak: 1, radius: 13, color: '#7aa33f',
      draw: function (ctx, e, t) {
        Art.humanoid(ctx, { x: e.x, y: e.y, scale: 1.15, walk: e.walk, skin: '#7aa33f',
          cloth: '#6b4630', legColor: '#5a3a28', ears: true, weapon: 'club' });
      }
    },
    wolf: {
      name: 'Lobo huargo', hp: 34, speed: 3.2, armor: 0, gold: 9, leak: 1, radius: 14, color: '#8a8f96',
      draw: function (ctx, e, t) { drawWolf(ctx, e); }
    },
    orc: {
      name: 'Orco', hp: 130, speed: 1.5, armor: 3, gold: 17, leak: 1, radius: 16, color: '#4f7a3a',
      draw: function (ctx, e) {
        Art.humanoid(ctx, { x: e.x, y: e.y, scale: 1.45, walk: e.walk, skin: '#4f7a3a',
          cloth: '#4a3c2a', armor: '#6b6058', weapon: 'axe', eye: '#f0d27a' });
      }
    },
    knight: {
      name: 'Caballero negro', hp: 230, speed: 1.35, armor: 10, gold: 26, leak: 1, radius: 16, color: '#8d93a1',
      draw: function (ctx, e) {
        Art.humanoid(ctx, { x: e.x, y: e.y, scale: 1.4, walk: e.walk, skin: '#8d93a1',
          cloth: '#3a3d47', armor: '#9aa1b0', helmet: '#aab1bf', shield: '#7b2f2a', weapon: 'sword' });
      }
    },
    ogre: {
      name: 'Ogro', hp: 560, speed: 1.0, armor: 6, gold: 48, leak: 3, radius: 22, color: '#9c7a4e',
      draw: function (ctx, e) {
        Art.humanoid(ctx, { x: e.x, y: e.y, scale: 2.15, walk: e.walk, skin: '#a8895b',
          cloth: '#5d4a2e', legColor: '#4e3d26', weapon: 'club', eye: '#6b2a1a' });
      }
    },
    wyvern: {
      name: 'Guiverno', hp: 110, speed: 1.8, armor: 1, gold: 20, leak: 1, radius: 16,
      flying: true, color: '#7b5aa8',
      draw: function (ctx, e, t) { drawWyvern(ctx, e, t, 1.25, '#6d4f96', '#a884d8'); }
    },
    necromancer: {
      name: 'Nigromante', hp: 200, speed: 1.25, armor: 2, gold: 30, leak: 2, radius: 16, color: '#6a4a86',
      heal: { amount: 30, radius: 95, every: 2.1 },
      draw: function (ctx, e, t) { drawNecromancer(ctx, e, t); }
    },
    warlord: {
      name: 'Señor de la Guerra', hp: 2800, speed: 0.95, armor: 8, gold: 280, leak: 6, radius: 28,
      boss: true, color: '#b23a2c',
      draw: function (ctx, e, t) {
        Art.humanoid(ctx, { x: e.x, y: e.y, scale: 2.9, walk: e.walk, skin: '#7d3a2c',
          cloth: '#2f2a2e', armor: '#8e2b26', helmet: '#5c5b62', horns: true, weapon: 'axe', shield: '#3d3a42' });
        Art.glow(ctx, e.x, e.y - 8, 34, 'rgba(200,60,40,.16)');
      }
    },
    dragon: {
      name: 'Dragón de Ceniza', hp: 4000, speed: 0.85, armor: 7, gold: 350, leak: 8, radius: 28,
      flying: true, boss: true, color: '#c0462c',
      draw: function (ctx, e, t) {
        drawWyvern(ctx, e, t, 2.5, '#8c2f22', '#d4633c');
        Art.flame(ctx, e.x + 26, e.y + 2, 0.7, t);
      }
    }
  };

  Object.keys(TYPES).forEach(function (k) { TYPES[k].key = k; });

  /* ------------------------------------------------------------------ */

  function Enemy(typeKey, level, hpMul, speedMul) {
    var type = TYPES[typeKey];
    var mul = hpMul || 1;
    /* Los jefes ya tienen mucha vida: escalan a la mitad de ritmo. */
    if (type.boss) mul = 1 + (mul - 1) * 0.5;
    this.type = type;
    this.maxHp = Math.round(type.hp * mul);
    this.hp = this.maxHp;
    this.baseSpeed = type.speed * (speedMul || 1) * TD.TILE;
    this.path = type.flying ? level.airPath : level.path;
    this.dist = 0;
    this.walk = Math.random() * 10;
    this.slow = 0;          // 0..1 de reducción de velocidad
    this.slowTimer = 0;
    this.burnDps = 0;
    this.burnTimer = 0;
    this.flash = 0;
    this.healTimer = type.heal ? type.heal.every : 0;
    this.dead = false;
    this.leaked = false;
    this.hover = type.flying ? 26 : 0;
    var p = this.path.at(0);
    this.x = p.x;
    this.y = p.y - this.hover;
    this.baseY = p.y;
    this.angle = p.angle;
  }

  /* Posición futura sobre su trazado, para que las torres puedan adelantar el tiro. */
  Enemy.prototype.posAtDist = function (d) {
    var p = this.path.at(Math.min(d, this.path.length));
    return { x: p.x, y: p.y - this.hover };
  };

  Enemy.prototype.speed = function () {
    return this.baseSpeed * (1 - this.slow);
  };

  Enemy.prototype.update = function (dt, game) {
    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      if (this.slowTimer <= 0) this.slow = 0;
    }
    if (this.burnTimer > 0) {
      this.burnTimer -= dt;
      this.damage(this.burnDps * dt, 'magic', game, true);
      if (this.burnTimer <= 0) this.burnDps = 0;
      if (this.dead) return;
    }
    if (this.flash > 0) this.flash -= dt;

    var v = this.speed();
    this.dist += v * dt;
    this.walk += dt * (v / TD.TILE);

    if (this.dist >= this.path.length) {
      this.leaked = true;
      return;
    }

    var p = this.path.at(this.dist);
    this.x = p.x;
    this.baseY = p.y;
    this.y = p.y - this.hover + (this.type.flying ? Math.sin(this.walk * 2.2) * 3 : 0);
    this.angle = p.angle;

    /* El nigromante restaura la vida de sus aliados cercanos. */
    if (this.type.heal) {
      this.healTimer -= dt;
      if (this.healTimer <= 0) {
        this.healTimer = this.type.heal.every;
        var healed = 0;
        for (var i = 0; i < game.enemies.length; i++) {
          var o = game.enemies[i];
          if (o === this || o.dead || o.hp >= o.maxHp) continue;
          if (TD.dist2(this.x, this.y, o.x, o.y) > this.type.heal.radius * this.type.heal.radius) continue;
          o.hp = Math.min(o.maxHp, o.hp + this.type.heal.amount);
          healed++;
        }
        if (healed) game.effects.ring(this.x, this.y, this.type.heal.radius, 'rgba(150,90,200,.7)');
      }
    }
  };

  /* kind: 'physical' (lo reduce la armadura) o 'magic' (la ignora). */
  Enemy.prototype.damage = function (amount, kind, game, silent) {
    if (this.dead) return 0;
    var dmg = amount;
    if (kind !== 'magic') dmg = Math.max(1, amount - this.type.armor);
    this.hp -= dmg;
    if (!silent) this.flash = 0.1;
    if (this.hp <= 0) {
      this.dead = true;
      game.onEnemyKilled(this);
    }
    return dmg;
  };

  Enemy.prototype.applySlow = function (factor, duration) {
    if (factor >= this.slow) {
      this.slow = factor;
      this.slowTimer = Math.max(this.slowTimer, duration);
    } else {
      this.slowTimer = Math.max(this.slowTimer, duration * 0.5);
    }
  };

  Enemy.prototype.applyBurn = function (dps, duration) {
    this.burnDps = Math.max(this.burnDps, dps);
    this.burnTimer = Math.max(this.burnTimer, duration);
  };

  Enemy.prototype.draw = function (ctx, t) {
    var type = this.type;

    Art.shadow(ctx, this.x, this.baseY + type.radius * 0.55,
      type.radius * 0.9, type.radius * 0.38, type.flying ? 0.18 : 0.3);

    ctx.save();
    /* Si avanza hacia la izquierda se dibuja reflejado sobre su propio eje. */
    if (Math.cos(this.angle) < -0.2) {
      ctx.translate(this.x * 2, 0);
      ctx.scale(-1, 1);
    }
    type.draw(ctx, this, t);
    ctx.restore();

    if (this.flash > 0) {
      /* Fogonazo aditivo: destaca el impacto sin borrar la silueta. */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(0.55, this.flash * 4);
      var fy = this.y - type.radius * 0.3;
      var fr = type.radius * 1.15;
      var fg = ctx.createRadialGradient(this.x, fy, 0, this.x, fy, fr);
      fg.addColorStop(0, 'rgba(255,240,210,.95)');
      fg.addColorStop(0.6, 'rgba(255,190,130,.35)');
      fg.addColorStop(1, 'rgba(255,160,100,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(this.x, fy, fr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (this.slow > 0) {
      ctx.save();
      ctx.globalAlpha = 0.35 + this.slow * 0.3;
      ctx.strokeStyle = '#9fdcf5';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(this.x, this.y - type.radius * 0.3, type.radius * 0.95, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    if (this.burnTimer > 0) {
      Art.flame(ctx, this.x, this.y - type.radius * 0.9, 0.45, t + this.walk);
    }

    if (this.hp < this.maxHp) {
      var w = type.boss ? 52 : Math.max(22, type.radius * 2);
      Art.healthBar(ctx, this.x, this.y - type.radius - (type.boss ? 26 : 16), w, this.hp / this.maxHp, type.boss);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Dibujos específicos                                                 */
  /* ------------------------------------------------------------------ */

  function drawWolf(ctx, e) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(1.25, 1.25);
    ctx.translate(-e.x, -e.y);
    var x = e.x, y = e.y;
    var swing = Math.sin(e.walk * 9) * 3.5;
    ctx.save();
    ctx.strokeStyle = '#4c4f56';
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 1); ctx.lineTo(x - 6 + swing, y + 9);
    ctx.moveTo(x + 5, y + 1); ctx.lineTo(x + 5 - swing, y + 9);
    ctx.moveTo(x - 3, y + 1); ctx.lineTo(x - 3 - swing, y + 9);
    ctx.moveTo(x + 8, y + 1); ctx.lineTo(x + 8 + swing, y + 9);
    ctx.stroke();

    var g = ctx.createLinearGradient(0, y - 8, 0, y + 4);
    g.addColorStop(0, '#8a8f96');
    g.addColorStop(1, '#585c63');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 11, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    /* Cola. */
    ctx.strokeStyle = '#6d7178';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 10, y - 3);
    ctx.quadraticCurveTo(x - 17, y - 7 + Math.sin(e.walk * 6) * 2, x - 19, y - 1);
    ctx.stroke();

    /* Cabeza y hocico. */
    ctx.fillStyle = '#7d828a';
    ctx.beginPath();
    ctx.arc(x + 10, y - 6, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 12, y - 6); ctx.lineTo(x + 18, y - 4); ctx.lineTo(x + 12, y - 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#5c6067';
    ctx.beginPath();
    ctx.moveTo(x + 7, y - 9); ctx.lineTo(x + 8, y - 14); ctx.lineTo(x + 11, y - 9.6);
    ctx.moveTo(x + 12, y - 9.6); ctx.lineTo(x + 14, y - 13.5); ctx.lineTo(x + 14.5, y - 8.6);
    ctx.fill();
    ctx.fillStyle = '#f4d05c';
    ctx.beginPath();
    ctx.arc(x + 11.5, y - 6.6, 1.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  function drawWyvern(ctx, e, t, s, bodyCol, wingCol) {
    var x = e.x, y = e.y;
    var flap = Math.sin(t * 7 + e.walk);
    ctx.save();

    /* Alas membranosas. */
    [-1, 1].forEach(function (dir) {
      ctx.fillStyle = wingCol;
      ctx.beginPath();
      ctx.moveTo(x, y - 3 * s);
      ctx.quadraticCurveTo(x + dir * 11 * s, y - (14 + flap * 7) * s, x + dir * 23 * s, y - (3 + flap * 9) * s);
      ctx.quadraticCurveTo(x + dir * 15 * s, y + (4 - flap * 2) * s, x + dir * 4 * s, y + 3 * s);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(20,10,30,.55)';
      ctx.lineWidth = 1.2 * s;
      ctx.stroke();
      /* Nervios de la membrana. */
      ctx.strokeStyle = 'rgba(20,10,30,.3)';
      ctx.lineWidth = 0.8 * s;
      ctx.beginPath();
      ctx.moveTo(x + dir * 3 * s, y - 2 * s);
      ctx.lineTo(x + dir * 19 * s, y - (5 + flap * 7) * s);
      ctx.stroke();
    });

    /* Cuerpo y cola. */
    var g = ctx.createLinearGradient(0, y - 8 * s, 0, y + 6 * s);
    g.addColorStop(0, bodyCol);
    g.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(x, y, 11.5 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(20,10,30,.45)';
    ctx.lineWidth = 1 * s;
    ctx.stroke();
    ctx.strokeStyle = bodyCol;
    ctx.lineWidth = 3 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 8 * s, y);
    ctx.quadraticCurveTo(x - 18 * s, y + 3 * s + flap * 2, x - 24 * s, y - 2 * s);
    ctx.stroke();

    /* Cabeza. */
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.ellipse(x + 11 * s, y - 4 * s, 5 * s, 4 * s, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 13 * s, y - 5 * s);
    ctx.lineTo(x + 20 * s, y - 2.5 * s);
    ctx.lineTo(x + 13 * s, y - 1 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f6c04a';
    ctx.beginPath();
    ctx.arc(x + 12 * s, y - 5 * s, 1.2 * s, 0, Math.PI * 2);
    ctx.fill();
    /* Cuernos. */
    ctx.strokeStyle = '#e0d3b4';
    ctx.lineWidth = 1.4 * s;
    ctx.beginPath();
    ctx.moveTo(x + 9 * s, y - 7 * s); ctx.lineTo(x + 6 * s, y - 12 * s);
    ctx.stroke();
    ctx.restore();
  }

  function drawNecromancer(ctx, e, t) {
    var x = e.x, y = e.y + Math.sin(t * 2 + e.walk) * 2;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1.3, 1.3);
    ctx.translate(-x, -y);
    Art.glow(ctx, x, y - 4, 22, 'rgba(140,80,200,.2)');

    /* Túnica. */
    var g = ctx.createLinearGradient(0, y - 14, 0, y + 12);
    g.addColorStop(0, '#553a72');
    g.addColorStop(1, '#2b1c3c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y - 16);
    ctx.lineTo(x + 10, y + 12);
    ctx.lineTo(x - 10, y + 12);
    ctx.closePath();
    ctx.fill();

    /* Capucha y ojos. */
    ctx.fillStyle = '#402a58';
    ctx.beginPath();
    ctx.arc(x, y - 15, 6, Math.PI, Math.PI * 2);
    ctx.lineTo(x + 5, y - 9);
    ctx.lineTo(x - 5, y - 9);
    ctx.fill();
    ctx.fillStyle = '#c9f36b';
    ctx.beginPath();
    ctx.arc(x - 2, y - 13, 1.2, 0, Math.PI * 2);
    ctx.arc(x + 2, y - 13, 1.2, 0, Math.PI * 2);
    ctx.fill();

    /* Báculo con orbe. */
    ctx.strokeStyle = '#4c3520';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 9, y + 10); ctx.lineTo(x + 7, y - 18);
    ctx.stroke();
    var pulse = 3.2 + Math.sin(t * 5) * 0.7;
    Art.glow(ctx, x + 7, y - 20, 10, 'rgba(160,255,110,.5)');
    ctx.fillStyle = '#cdf76f';
    ctx.beginPath();
    ctx.arc(x + 7, y - 20, pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  TD.ENEMY_TYPES = TYPES;
  TD.Enemy = Enemy;
})(window.TD = window.TD || {});
