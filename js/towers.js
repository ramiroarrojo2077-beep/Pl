/* Torres: definiciones, mejoras y puntería.
 *
 * Cada torre se dibuja con el modelo tower_<clave>_<nivel> del .glb generado
 * en Blender; aquí solo viven las reglas de combate. */
(function (TD) {
  'use strict';

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
    this.game = null;
    this._cache = null;
  }

  Tower.prototype.baseStats = function () { return this.type.levels[this.level]; };

  /* Estadísticas ya multiplicadas por las mejoras compradas en la Forja. */
  Tower.prototype.stats = function () {
    var base = this.type.levels[this.level];
    var mul = this.game && this.game.perkMul;
    if (!mul || mul.stamp === 0) return base;
    if (this._cache && this._cache.base === base && this._cache.stamp === mul.stamp) {
      return this._cache.val;
    }
    var out = {};
    for (var k in base) out[k] = base[k];
    out.damage = base.damage * mul.damage;
    out.range = base.range * mul.range;
    out.rate = base.rate * mul.rate;
    if (base.burn) out.burn = base.burn * mul.damage;
    this._cache = { base: base, stamp: mul.stamp, val: out };
    return out;
  };
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
    this._cache = null;
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
      game.effects.emberTrail(this.x, this.y, this.target.x, this.target.y, this.target.height());
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
    var muzzle = 16;
    var ox = this.x + Math.cos(this.angle) * muzzle;
    var oy = this.y + Math.sin(this.angle) * muzzle;

    if (kind === 'arrow') {
      var shots = st.shots || 1;
      for (var s = 0; s < shots; s++) {
        game.spawnProjectile({
          kind: 'arrow', x: ox + s * 4, y: oy + s * 4, target: this.target, speed: this.type.projSpeed,
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
        kind: 'rock', x: this.x, y: this.y, tx: lp.x, ty: lp.y, speed: this.type.projSpeed,
        damage: st.damage, damageType: this.type.damageType, splash: st.splash,
        groundOnly: true, tower: this
      });
      TD.Audio.launch();
    }
  };

  TD.TOWER_TYPES = TYPES;
  TD.TOWER_ORDER = ORDER;
  TD.TARGET_MODES = TARGET_MODES;
  TD.Tower = Tower;
  TD.towerModel = function (key, level) { return 'tower_' + key + '_' + (level + 1); };
})(window.TD = window.TD || {});
