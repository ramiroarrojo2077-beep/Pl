/* Torres: definiciones, mejoras, puntería y dibujo. */
(function (TD) {
  'use strict';

  var Art = TD.Art;

  /* range en píxeles · rate en disparos por segundo. */
  var TYPES = {
    archer: {
      key: 'archer', name: 'Torre de Arqueros', hotkey: '1',
      desc: 'Disparo rápido y barato. Alcanza a tierra y aire.',
      cost: 70, kind: 'arrow', damageType: 'physical', canHitAir: true, projSpeed: 560,
      levels: [
        { cost: 70, damage: 12, rate: 1.4, range: 120, shots: 1 },
        { cost: 60, damage: 20, rate: 1.55, range: 134, shots: 1 },
        { cost: 110, damage: 19, rate: 1.8, range: 148, shots: 2 }
      ]
    },
    ballista: {
      key: 'ballista', name: 'Ballesta de asedio', hotkey: '2',
      desc: 'Virote perforante de largo alcance que atraviesa varios enemigos.',
      cost: 150, kind: 'bolt', damageType: 'physical', canHitAir: true, projSpeed: 760,
      levels: [
        { cost: 150, damage: 55, rate: 0.55, range: 190, pierce: 2 },
        { cost: 115, damage: 85, rate: 0.6, range: 208, pierce: 3 },
        { cost: 200, damage: 130, rate: 0.65, range: 228, pierce: 4 }
      ]
    },
    frost: {
      key: 'frost', name: 'Torre de Escarcha', hotkey: '3',
      desc: 'Daño mágico en área que ralentiza a la horda. Ignora armadura.',
      cost: 120, kind: 'frost', damageType: 'magic', canHitAir: true, projSpeed: 400,
      levels: [
        { cost: 120, damage: 11, rate: 0.9, range: 112, splash: 46, slow: 0.35, slowTime: 1.8 },
        { cost: 95, damage: 18, rate: 1, range: 126, splash: 58, slow: 0.45, slowTime: 2.2 },
        { cost: 165, damage: 27, rate: 1.1, range: 142, splash: 72, slow: 0.55, slowTime: 2.6 }
      ]
    },
    catapult: {
      key: 'catapult', name: 'Catapulta', hotkey: '4',
      desc: 'Pedrusco con gran daño en área. No alcanza a los voladores.',
      cost: 200, kind: 'rock', damageType: 'physical', canHitAir: false, projSpeed: 300,
      levels: [
        { cost: 200, damage: 72, rate: 0.4, range: 172, splash: 58 },
        { cost: 155, damage: 108, rate: 0.45, range: 186, splash: 70 },
        { cost: 250, damage: 158, rate: 0.5, range: 202, splash: 84 }
      ]
    },
    pyre: {
      key: 'pyre', name: 'Pira arcana', hotkey: '5',
      desc: 'Lengua de fuego continua que prende a los enemigos. Corto alcance.',
      cost: 140, kind: 'flame', damageType: 'magic', canHitAir: true,
      levels: [
        { cost: 140, damage: 26, rate: 1, range: 100, burn: 12, burnTime: 3 },
        { cost: 110, damage: 44, rate: 1, range: 112, burn: 20, burnTime: 3.2 },
        { cost: 185, damage: 66, rate: 1, range: 126, burn: 32, burnTime: 3.5 }
      ]
    }
  };

  var ORDER = ['archer', 'ballista', 'frost', 'catapult', 'pyre'];
  var TARGET_MODES = [
    { key: 'first', name: 'Primero' },
    { key: 'last', name: 'Último' },
    { key: 'strong', name: 'Más fuerte' },
    { key: 'close', name: 'Más cerca' }
  ];

  function Tower(typeKey, col, row) {
    this.type = TYPES[typeKey];
    this.col = col;
    this.row = row;
    this.x = (col + 0.5) * TD.TILE;
    this.y = (row + 0.5) * TD.TILE;
    this.level = 0;
    this.cooldown = 0;
    this.angle = -Math.PI / 2;
    this.target = null;
    this.spent = this.type.levels[0].cost;
    this.targetMode = 'first';
    this.kills = 0;
    this.dealt = 0;
    this.recoil = 0;
    this.beam = null;
    this.buildAnim = 1;
  }

  Tower.prototype.stats = function () { return this.type.levels[this.level]; };
  Tower.prototype.maxLevel = function () { return this.level >= this.type.levels.length - 1; };
  Tower.prototype.upgradeCost = function () {
    return this.maxLevel() ? null : this.type.levels[this.level + 1].cost;
  };
  Tower.prototype.sellValue = function () { return Math.floor(this.spent * 0.6); };

  Tower.prototype.upgrade = function () {
    if (this.maxLevel()) return false;
    this.level++;
    this.spent += this.type.levels[this.level].cost;
    this.buildAnim = 1;
    return true;
  };

  Tower.prototype.canTarget = function (enemy) {
    return !(enemy.type.flying && !this.type.canHitAir);
  };

  Tower.prototype.findTarget = function (enemies) {
    var st = this.stats();
    var r2 = st.range * st.range;
    var best = null, bestScore = -Infinity;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead || e.leaked || !this.canTarget(e)) continue;
      var d2 = TD.dist2(this.x, this.y, e.x, e.y);
      if (d2 > r2) continue;
      var score;
      switch (this.targetMode) {
        case 'last': score = -e.dist; break;
        case 'strong': score = e.hp; break;
        case 'close': score = -d2; break;
        default: score = e.dist;
      }
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  };

  /* Punto de intercepción: adelanta el tiro según la velocidad del objetivo. */
  Tower.prototype.leadPoint = function (enemy, projSpeed) {
    var lead = enemy.dist;
    for (var i = 0; i < 3; i++) {
      var p = enemy.posAtDist(lead);
      var t = TD.dist(this.x, this.y, p.x, p.y) / projSpeed;
      lead = enemy.dist + enemy.speed() * t;
    }
    return enemy.posAtDist(lead);
  };

  Tower.prototype.update = function (dt, game) {
    var st = this.stats();
    if (this.buildAnim > 0) this.buildAnim = Math.max(0, this.buildAnim - dt * 2.2);
    if (this.recoil > 0) this.recoil = Math.max(0, this.recoil - dt * 5);

    if (!this.target || this.target.dead || this.target.leaked ||
        TD.dist2(this.x, this.y, this.target.x, this.target.y) > st.range * st.range) {
      this.target = this.findTarget(game.enemies);
    }

    this.beam = null;
    if (!this.target) return;

    var wanted = Math.atan2(this.target.y - this.y, this.target.x - this.x);
    this.angle = TD.turnTo(this.angle, wanted, dt * 7);

    if (this.type.kind === 'flame') {
      /* La pira quema de forma continua mientras el objetivo siga en rango. */
      this.beam = this.target;
      var dealt = this.target.damage(st.damage * dt, 'magic', game);
      this.dealt += dealt;
      this.target.applyBurn(st.burn, st.burnTime);
      game.effects.emberTrail(this.x, this.y - 20, this.target.x, this.target.y);
      TD.Audio.fire();
      return;
    }

    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    if (TD.angleDiff(this.angle, wanted) > 0.25) return;

    this.cooldown = 1 / st.rate;
    this.recoil = 1;
    this.fire(game);
  };

  Tower.prototype.fire = function (game) {
    var st = this.stats();
    var kind = this.type.kind;
    var muzzle = 14;
    var ox = this.x + Math.cos(this.angle) * muzzle;
    var oy = this.y - 18 + Math.sin(this.angle) * muzzle;

    if (kind === 'arrow') {
      var shots = st.shots || 1;
      for (var s = 0; s < shots; s++) {
        game.spawnProjectile({
          kind: 'arrow', x: ox, y: oy + s * 5, target: this.target, speed: this.type.projSpeed,
          damage: st.damage, damageType: this.type.damageType, tower: this
        });
      }
      TD.Audio.arrow();
    } else if (kind === 'bolt') {
      var p = this.leadPoint(this.target, this.type.projSpeed);
      var ang = Math.atan2(p.y - oy, p.x - ox);
      game.spawnProjectile({
        kind: 'bolt', x: ox, y: oy, angle: ang, speed: this.type.projSpeed,
        damage: st.damage, damageType: this.type.damageType, pierce: st.pierce,
        maxDist: st.range + 60, tower: this
      });
      TD.Audio.bolt();
    } else if (kind === 'frost') {
      game.spawnProjectile({
        kind: 'frost', x: ox, y: oy, target: this.target, speed: this.type.projSpeed,
        damage: st.damage, damageType: 'magic', splash: st.splash,
        slow: st.slow, slowTime: st.slowTime, tower: this
      });
      TD.Audio.frost();
    } else if (kind === 'rock') {
      var lp = this.leadPoint(this.target, this.type.projSpeed);
      game.spawnProjectile({
        kind: 'rock', x: this.x, y: this.y - 14, tx: lp.x, ty: lp.y, speed: this.type.projSpeed,
        damage: st.damage, damageType: this.type.damageType, splash: st.splash,
        groundOnly: true, tower: this
      });
      TD.Audio.launch();
    }
  };

  /* ------------------------------------------------------------------ */
  /* Dibujo                                                              */
  /* ------------------------------------------------------------------ */

  var TOWER_SCALE = 1.14;

  Tower.prototype.draw = function (ctx, t) {
    var pop = TOWER_SCALE * (this.buildAnim > 0 ? 1 + Math.sin(this.buildAnim * Math.PI) * 0.12 : 1);
    ctx.save();
    ctx.translate(this.x, this.y + 6);
    ctx.scale(pop, pop);
    ctx.translate(-this.x, -(this.y + 6));
    drawBase(ctx, this.x, this.y, this.level);
    DRAW[this.type.key](ctx, this.x, this.y, this.angle, this.level, t, this.recoil);
    ctx.restore();

    if (this.beam) drawFlameBeam(ctx, this, t);
  };

  function drawBase(ctx, x, y, level) {
    Art.shadow(ctx, x + 2, y + 16, 20, 8, 0.3);
    ctx.save();
    /* Plataforma de tierra apisonada con losas. */
    ctx.fillStyle = '#5c4b33';
    TD.roundRect(ctx, x - 21, y - 4, 42, 22, 5);
    ctx.fill();
    var g = ctx.createLinearGradient(0, y - 10, 0, y + 12);
    g.addColorStop(0, '#8b7b60');
    g.addColorStop(1, '#6a5b45');
    ctx.fillStyle = g;
    TD.roundRect(ctx, x - 21, y - 8, 42, 22, 5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 7, y - 8); ctx.lineTo(x - 7, y + 14);
    ctx.moveTo(x + 7, y - 8); ctx.lineTo(x + 7, y + 14);
    ctx.moveTo(x - 21, y + 3); ctx.lineTo(x + 21, y + 3);
    ctx.stroke();
    if (level > 0) {
      ctx.strokeStyle = level > 1 ? 'rgba(217,164,65,.85)' : 'rgba(190,190,190,.6)';
      ctx.lineWidth = 1.6;
      TD.roundRect(ctx, x - 21, y - 8, 42, 22, 5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function stoneTower(ctx, x, y, w, h, top, bottom) {
    var g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    g.addColorStop(0, top);
    g.addColorStop(0.45, bottom);
    g.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = g;
    TD.roundRect(ctx, x - w / 2, y - h, w, h, 3);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.32)';
    ctx.lineWidth = 1;
    for (var ry = y - h + 7; ry < y; ry += 7) {
      ctx.beginPath();
      ctx.moveTo(x - w / 2, ry); ctx.lineTo(x + w / 2, ry);
      ctx.stroke();
    }
  }

  function battlements(ctx, x, y, w, color) {
    ctx.fillStyle = color;
    for (var bx = x - w / 2; bx < x + w / 2 - 1; bx += 7) ctx.fillRect(bx, y - 6, 4.5, 7);
    ctx.fillRect(x - w / 2 - 2, y - 1, w + 4, 4);
  }

  function banner(ctx, x, y, t, color) {
    ctx.fillStyle = '#3a2f24';
    ctx.fillRect(x - 0.8, y - 18, 1.6, 18);
    ctx.fillStyle = color;
    var w = Math.sin(t * 3) * 1.6;
    ctx.beginPath();
    ctx.moveTo(x + 1, y - 18);
    ctx.quadraticCurveTo(x + 9 + w, y - 15, x + 12 + w, y - 11);
    ctx.lineTo(x + 1, y - 7);
    ctx.closePath();
    ctx.fill();
  }

  var DRAW = {
    archer: function (ctx, x, y, angle, level, t, recoil) {
      stoneTower(ctx, x, y - 4, 24, 30, '#b4ab99', '#8d8474');
      battlements(ctx, x, y - 34, 26, '#a29a88');
      if (level >= 1) {
        ctx.fillStyle = '#6a3f33';
        ctx.beginPath();
        ctx.moveTo(x - 16, y - 38);
        ctx.lineTo(x, y - 54);
        ctx.lineTo(x + 16, y - 38);
        ctx.closePath();
        ctx.fill();
      }
      if (level >= 2) banner(ctx, x + 14, y - 40, t, '#8e2b26');

      /* Arquero girando sobre la almena. */
      var ay = y - 40 - (level >= 1 ? 2 : 0);
      ctx.save();
      ctx.translate(x, ay);
      ctx.rotate(0);
      ctx.fillStyle = '#3f5a7a';
      ctx.beginPath();
      ctx.ellipse(0, 0, 4, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c9a07a';
      ctx.beginPath();
      ctx.arc(0, -6, 3, 0, Math.PI * 2);
      ctx.fill();
      /* Arco apuntando al objetivo. */
      ctx.rotate(angle);
      var pull = 4 - recoil * 3;
      ctx.strokeStyle = '#6b4a28';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(pull + 4, 0, 6, -Math.PI / 1.7, Math.PI / 1.7);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(240,235,220,.8)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(pull + 2.4, -5.6);
      ctx.lineTo(pull - 1 + recoil * 2, 0);
      ctx.lineTo(pull + 2.4, 5.6);
      ctx.stroke();
      ctx.restore();
    },

    ballista: function (ctx, x, y, angle, level, t, recoil) {
      /* Torre de madera. */
      ctx.fillStyle = '#6b4d2e';
      ctx.fillRect(x - 13, y - 22, 26, 24);
      ctx.strokeStyle = 'rgba(0,0,0,.3)';
      ctx.lineWidth = 1;
      for (var i = -12; i < 13; i += 6) {
        ctx.beginPath(); ctx.moveTo(x + i, y - 22); ctx.lineTo(x + i, y + 2); ctx.stroke();
      }
      ctx.fillStyle = '#83603c';
      TD.roundRect(ctx, x - 17, y - 28, 34, 8, 2);
      ctx.fill();

      ctx.save();
      ctx.translate(x, y - 30);
      ctx.rotate(angle);
      /* Cureña. */
      ctx.fillStyle = '#7a5836';
      TD.roundRect(ctx, -12, -2.6, 24, 5.2, 2);
      ctx.fill();
      /* Brazos del arco. */
      ctx.strokeStyle = '#4e3a22';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(3, 0); ctx.quadraticCurveTo(8, -6, 4, -11);
      ctx.moveTo(3, 0); ctx.quadraticCurveTo(8, 6, 4, 11);
      ctx.stroke();
      /* Cuerda y virote cargado. */
      var back = -4 + recoil * 6;
      ctx.strokeStyle = 'rgba(235,230,215,.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(4, -11); ctx.lineTo(back, 0); ctx.lineTo(4, 11);
      ctx.stroke();
      if (recoil < 0.4) {
        ctx.strokeStyle = '#d8cbb0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(back, 0); ctx.lineTo(14, 0);
        ctx.stroke();
      }
      if (level >= 2) {
        ctx.fillStyle = '#d9a441';
        ctx.beginPath();
        ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      if (level >= 1) banner(ctx, x - 15, y - 24, t, '#2f5d7a');
    },

    frost: function (ctx, x, y, angle, level, t) {
      stoneTower(ctx, x, y - 4, 22, 28, '#9fb6c9', '#748ea6');
      /* Tejado cónico de mago. */
      ctx.fillStyle = '#2f5f86';
      ctx.beginPath();
      ctx.moveTo(x - 15, y - 30);
      ctx.lineTo(x, y - 52 - level * 3);
      ctx.lineTo(x + 15, y - 30);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      ctx.beginPath();
      ctx.moveTo(x - 15, y - 30);
      ctx.lineTo(x, y - 52 - level * 3);
      ctx.lineTo(x - 3, y - 30);
      ctx.closePath();
      ctx.fill();

      /* Orbe de hielo flotante. */
      var oy = y - 34 + Math.sin(t * 2) * 2;
      Art.glow(ctx, x, oy, 16 + level * 3, 'rgba(120,200,240,.35)');
      var g = ctx.createRadialGradient(x - 2, oy - 2, 1, x, oy, 7);
      g.addColorStop(0, '#eafaff');
      g.addColorStop(1, '#4d9dc4');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, oy, 5.5 + level * 0.7, 0, Math.PI * 2);
      ctx.fill();
      /* Cristales orbitando. */
      for (var i = 0; i < 3 + level; i++) {
        var a = t * 1.6 + (i * Math.PI * 2) / (3 + level);
        var rx = x + Math.cos(a) * 11;
        var ry = oy + Math.sin(a) * 4;
        ctx.fillStyle = 'rgba(190,235,255,.85)';
        ctx.beginPath();
        ctx.moveTo(rx, ry - 3);
        ctx.lineTo(rx + 2, ry);
        ctx.lineTo(rx, ry + 3);
        ctx.lineTo(rx - 2, ry);
        ctx.closePath();
        ctx.fill();
      }
    },

    catapult: function (ctx, x, y, angle, level, t, recoil) {
      ctx.save();
      ctx.translate(x, y - 9);
      ctx.rotate(angle);

      /* Chasis de vigas cruzadas visto casi desde arriba. */
      ctx.fillStyle = '#5b4025';
      TD.roundRect(ctx, -17, -10, 32, 4.5, 2); ctx.fill();
      TD.roundRect(ctx, -17, 5.5, 32, 4.5, 2); ctx.fill();
      ctx.fillStyle = '#7d5a37';
      TD.roundRect(ctx, -15, -10, 6, 20, 2); ctx.fill();
      TD.roundRect(ctx, 7, -10, 6, 20, 2); ctx.fill();

      /* Ruedas. */
      ctx.fillStyle = '#42301d';
      [[-11, -12], [-11, 12], [9, -12], [9, 12]].forEach(function (w) {
        ctx.beginPath();
        ctx.ellipse(w[0], w[1], 4.6, 2.6, 0, 0, Math.PI * 2);
        ctx.fill();
      });

      /* Caballete en A sobre el que pivota el brazo. */
      ctx.strokeStyle = '#6b4c2c';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-4, -8); ctx.lineTo(-1, 0); ctx.lineTo(-4, 8);
      ctx.stroke();

      /* Brazo lanzador con cuchara: retrocede al disparar. */
      var arm = -1.15 + (1 - recoil) * 1.6;
      var len = 20;
      var ex = -1 + Math.cos(arm) * len;
      var lift = Math.max(0, Math.sin(arm)) * 3;
      ctx.strokeStyle = '#8a6339';
      ctx.lineWidth = 3.8;
      ctx.beginPath();
      ctx.moveTo(-1, 0);
      ctx.lineTo(ex, 0);
      ctx.stroke();
      /* Contrapeso en la cola del brazo. */
      ctx.fillStyle = '#3f3a34';
      ctx.beginPath();
      ctx.arc(-1 - Math.cos(arm) * 7, 0, 4 + lift * 0.2, 0, Math.PI * 2);
      ctx.fill();
      /* Cuchara y proyectil. */
      ctx.fillStyle = '#6b4c2c';
      ctx.beginPath();
      ctx.arc(ex, 0, 4.4, 0, Math.PI * 2);
      ctx.fill();
      if (recoil < 0.3) {
        ctx.fillStyle = '#9a938a';
        ctx.beginPath();
        ctx.arc(ex, -1, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
      /* Cuerda tensada. */
      ctx.strokeStyle = 'rgba(230,220,195,.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(13, -6); ctx.lineTo(ex, 0); ctx.lineTo(13, 6);
      ctx.stroke();
      ctx.restore();

      if (level >= 1) {
        ctx.fillStyle = level >= 2 ? '#d9a441' : '#9a9088';
        ctx.fillRect(x - 17, y + 4, 34, 2.5);
      }
    },

    pyre: function (ctx, x, y, angle, level, t) {
      stoneTower(ctx, x, y - 2, 20, 22, '#6d5c52', '#4d4038');
      /* Pebetero. */
      ctx.fillStyle = '#3d3129';
      ctx.beginPath();
      ctx.moveTo(x - 13, y - 26);
      ctx.lineTo(x + 13, y - 26);
      ctx.lineTo(x + 8, y - 34);
      ctx.lineTo(x - 8, y - 34);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#5a4a3c';
      TD.roundRect(ctx, x - 14, y - 28, 28, 4, 2);
      ctx.fill();

      Art.glow(ctx, x, y - 34, 22 + level * 4, 'rgba(255,140,40,.3)');
      Art.flame(ctx, x, y - 30, 1 + level * 0.22, t);
      if (level >= 2) {
        /* Runas encendidas alrededor de la base. */
        for (var i = 0; i < 4; i++) {
          var a = t * 0.9 + (i * Math.PI) / 2;
          ctx.fillStyle = 'rgba(255,190,90,' + (0.4 + Math.sin(t * 4 + i) * 0.25) + ')';
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * 16, y + 2 + Math.sin(a) * 6, 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  };

  function drawFlameBeam(ctx, tower, t) {
    var e = tower.beam;
    var sx = tower.x, sy = tower.y - 30;
    var dx = e.x - sx, dy = e.y - sy;
    var len = Math.hypot(dx, dy) || 1;
    var ang = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(ang);
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 3; i++) {
      var w = (7 - i * 2) + Math.sin(t * 18 + i * 2) * 1.4;
      ctx.fillStyle = ['rgba(255,90,20,.22)', 'rgba(255,160,50,.3)', 'rgba(255,225,150,.4)'][i];
      ctx.beginPath();
      ctx.moveTo(0, -w * 0.35);
      ctx.quadraticCurveTo(len * 0.5, -w, len, -w * 0.5);
      ctx.quadraticCurveTo(len * 0.5, w, 0, w * 0.35);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /* Icono para la tienda y el panel de selección. */
  function towerIcon(typeKey, level, size) {
    var s = size || 44;
    var cv = document.createElement('canvas');
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = s * dpr;
    cv.height = s * dpr;
    var ctx = cv.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.save();
    ctx.translate(s / 2, s * 0.78);
    ctx.scale(s / 62, s / 62);
    drawBase(ctx, 0, 0, level || 0);
    DRAW[typeKey](ctx, 0, 0, -Math.PI / 2, level || 0, 0.6, 0);
    ctx.restore();
    return cv;
  }

  TD.TOWER_TYPES = TYPES;
  TD.TOWER_ORDER = ORDER;
  TD.TARGET_MODES = TARGET_MODES;
  TD.Tower = Tower;
  TD.towerIcon = towerIcon;
  TD.drawTowerBase = drawBase;
})(window.TD = window.TD || {});
