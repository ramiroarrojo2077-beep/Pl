/* Torres y edificios: puntería, disparo y efectos pasivos.
 *
 * El catálogo vive en js/buildings.js; aquí solo está la lógica común a las 100
 * construcciones. Cada una se dibuja con su propio modelo del .glb de Blender.
 */
(function (TD) {
  'use strict';

  function Tower(typeKey, col, row) {
    this.type = TD.TOWER_TYPES[typeKey];
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
    this.earned = 0;
    this.recoil = 0;
    this.beam = null;
    this.buildAnim = 1;
    this.game = null;
    this.auraDamage = 0;   // bonos que le regalan los edificios de mando
    this.auraRate = 0;
    this._cache = null;
  }

  Tower.prototype.baseStats = function () { return this.type.levels[this.level]; };

  /* Estadísticas con las mejoras de la Forja y las auras de mando aplicadas. */
  Tower.prototype.stats = function () {
    var base = this.type.levels[this.level];
    var g = this.game;
    var mul = g && g.perkMul;
    if (!mul) return base;
    var stamp = mul.stamp * 1000 + (g.auraStamp || 0);
    if (!mul.stamp && !this.auraDamage && !this.auraRate) return base;
    if (this._cache && this._cache.base === base && this._cache.stamp === stamp) {
      return this._cache.val;
    }
    var out = {};
    for (var k in base) out[k] = base[k];
    out.damage = base.damage * mul.damage * (1 + this.auraDamage);
    out.range = base.range * mul.range;
    out.rate = base.rate * mul.rate * (1 + this.auraRate);
    if (base.burn) out.burn = base.burn * mul.damage * (1 + this.auraDamage);
    if (base.poison) out.poison = base.poison * mul.damage * (1 + this.auraDamage);
    this._cache = { base: base, stamp: stamp, val: out };
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

  Tower.prototype.scoreOf = function (enemy, d2) {
    switch (this.targetMode) {
      case 'last': return -enemy.dist;
      case 'strong': return enemy.hp;
      case 'close': return -d2;
      default: return enemy.dist;
    }
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
      var score = this.scoreOf(e, d2);
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  };

  /* Varios objetivos distintos para las baterías de andanada. */
  Tower.prototype.findTargets = function (enemies, count) {
    var st = this.stats();
    var r2 = st.range * st.range;
    var found = [];
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i];
      if (e.dead || e.leaked || !this.canTarget(e)) continue;
      var d2 = TD.dist2(this.x, this.y, e.x, e.y);
      if (d2 > r2) continue;
      found.push({ e: e, s: this.scoreOf(e, d2) });
    }
    found.sort(function (a, b) { return b.s - a.s; });
    return found.slice(0, count).map(function (o) { return o.e; });
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
    this.beam = null;

    var kind = this.type.kind;

    /* Construcciones pasivas: sin puntería. */
    if (kind === 'aura' || kind === 'econ' || kind === 'loot') return;

    if (kind === 'slowfield') {
      var r2 = st.range * st.range;
      for (var i = 0; i < game.enemies.length; i++) {
        var e = game.enemies[i];
        if (e.dead || e.leaked) continue;
        if (TD.dist2(this.x, this.y, e.x, e.y) > r2) continue;
        e.applySlow(st.fieldSlow, 0.35);
      }
      return;
    }

    if (!this.target || this.target.dead || this.target.leaked ||
        TD.dist2(this.x, this.y, this.target.x, this.target.y) > st.range * st.range) {
      this.target = this.findTarget(game.enemies);
    }
    if (!this.target) return;

    var wanted = Math.atan2(this.target.y - this.y, this.target.x - this.x);
    this.angle = TD.turnTo(this.angle, wanted, dt * 7);

    if (kind === 'flame') {
      /* La llamarada quema de forma continua mientras el objetivo siga en rango. */
      this.beam = this.target;
      this.dealt += this.target.damage(st.damage * dt, 'magic', game);
      this.target.applyBurn(st.burn, st.burnTime);
      game.effects.emberTrail(this.x, this.y, this.target.x, this.target.y, this.target.height());
      TD.Audio.fire();
      return;
    }

    this.cooldown -= dt;
    if (this.cooldown > 0) return;
    if (TD.angleDiff(this.angle, wanted) > 0.3) return;

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

    if (kind === 'arrow' || kind === 'sniper') {
      var shots = st.shots || 1;
      for (var s = 0; s < shots; s++) {
        game.spawnProjectile({
          kind: 'arrow', x: ox + s * 4, y: oy + s * 4, target: this.target,
          speed: this.type.projSpeed, damage: st.damage,
          damageType: this.type.damageType, tower: this
        });
      }
      TD.Audio.arrow();

    } else if (kind === 'multi') {
      var targets = this.findTargets(game.enemies, st.targets);
      for (var t = 0; t < targets.length; t++) {
        game.spawnProjectile({
          kind: 'arrow', x: ox, y: oy, target: targets[t],
          speed: this.type.projSpeed, damage: st.damage,
          damageType: this.type.damageType, tower: this
        });
      }
      TD.Audio.arrow();

    } else if (kind === 'bolt') {
      var p = this.leadPoint(this.target, this.type.projSpeed);
      game.spawnProjectile({
        kind: 'bolt', x: ox, y: oy, angle: Math.atan2(p.y - oy, p.x - ox),
        speed: this.type.projSpeed, damage: st.damage,
        damageType: this.type.damageType, pierce: st.pierce,
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

    } else if (kind === 'poison') {
      game.spawnProjectile({
        kind: 'poison', x: ox, y: oy, target: this.target, speed: this.type.projSpeed,
        damage: st.damage, damageType: 'magic', splash: st.splash,
        poison: st.poison, poisonTime: st.poisonTime, tower: this
      });
      TD.Audio.frost();

    } else if (kind === 'rock') {
      var lp = this.leadPoint(this.target, this.type.projSpeed);
      game.spawnProjectile({
        kind: 'rock', x: this.x, y: this.y, tx: lp.x, ty: lp.y,
        speed: this.type.projSpeed, damage: st.damage,
        damageType: this.type.damageType, splash: st.splash,
        groundOnly: true, tower: this
      });
      TD.Audio.launch();

    } else if (kind === 'chain') {
      this.fireChain(game, st);
    }
  };

  /* Descarga que salta de enemigo en enemigo perdiendo fuerza. */
  Tower.prototype.fireChain = function (game, st) {
    var hit = [];
    var points = [{ x: this.x, y: this.y, h: 0.95 }];
    var current = this.target;
    var damage = st.damage;
    var jumpRange2 = 120 * 120;

    for (var j = 0; j < st.jumps && current; j++) {
      game.dealDamage(current, damage, 'magic', this);
      hit.push(current);
      points.push({ x: current.x, y: current.y, h: current.height() });
      damage *= st.chainFalloff;

      var next = null, bestD = Infinity;
      for (var i = 0; i < game.enemies.length; i++) {
        var e = game.enemies[i];
        if (e.dead || e.leaked || hit.indexOf(e) >= 0 || !this.canTarget(e)) continue;
        var d2 = TD.dist2(current.x, current.y, e.x, e.y);
        if (d2 < jumpRange2 && d2 < bestD) { bestD = d2; next = e; }
      }
      current = next;
    }
    game.effects.lightning(points);
    TD.Audio.zap();
  };

  TD.Tower = Tower;
})(window.TD = window.TD || {});
