/* Motor del juego: economía, oleadas y bucle principal.
 *
 * No dibuja nada: mantiene el estado en coordenadas de tablero (píxeles) y la
 * escena de js/render3d.js lo refleja cada fotograma.
 */
(function (TD) {
  'use strict';

  var START_GOLD = 300;
  var START_LIVES = 20;
  var PREP_FIRST = 20;
  var PREP_NEXT = 13;
  var SPEEDS = [1, 2, 3];
  var BEST_KEY = 'rocanegra.best';
  var BEST_WAVE_KEY = 'rocanegra.bestWave';
  var MILESTONE = 10;

  function Game(canvas, hooks) {
    this.canvas = canvas;
    this.hooks = hooks || {};
    this.level = TD.buildLevel();
    this.effects = new TD.Effects();
    this.view = new TD.Renderer3D(canvas, this);
    this.time = 0;
    this.speedIndex = 0;
    this.paused = false;
    this.state = 'menu';
    this.hover = null;
    this.buildType = null;
    this.selected = null;
    this.reset();
    this.setupInput();
    window.addEventListener('resize', this.resize.bind(this));
  }

  Game.prototype.load = function (onReady) {
    this.view.load(onReady);
  };

  Game.prototype.reset = function () {
    this.gold = START_GOLD;
    this.lives = START_LIVES;
    this.wave = 0;
    this.score = 0;
    this.income = 0;
    this.auraStamp = 0;
    this.kills = 0;
    this.leaked = 0;
    this.killGold = 0;
    this.enemies = [];
    this.towers = [];
    this.towerGrid = {};
    this.projectiles = [];
    this.spawnQueue = [];
    this.perks = {};
    this.perkStamp = 0;
    this.shopFamily = TD.FAMILIES[0].id;
    this.perkMul = TD.perkMultipliers(this.perks, 0);
    this.effects.clear();
    this.prepTimer = PREP_FIRST;
    this.state = 'menu';
    this.paused = false;
    this.buildType = null;
    this.selected = null;
    this.banner = null;
    this.hurtFlash = 0;
    if (this.view) this.view.resetViews();
    this.emit();
  };

  Game.prototype.emit = function () {
    if (this.hooks.onStats) this.hooks.onStats(this);
  };
  Game.prototype.log = function (msg, cls) {
    if (this.hooks.onLog) this.hooks.onLog(msg, cls);
  };
  Game.prototype.resize = function () {
    if (this.view && this.view.renderer) this.view.resize();
  };
  Game.prototype.shakeCamera = function (amount) {
    if (this.view) this.view.shake(amount);
  };

  /* ------------------------------------------------------------------ */
  /* Entrada                                                             */
  /* ------------------------------------------------------------------ */

  Game.prototype.setupInput = function () {
    var self = this;

    this.canvas.addEventListener('pointermove', function (ev) {
      self.hover = self.view.ready ? self.view.pick(ev.clientX, ev.clientY) : null;
    });
    this.canvas.addEventListener('pointerleave', function () { self.hover = null; });

    this.canvas.addEventListener('pointerdown', function (ev) {
      if (ev.button === 2) return;
      TD.Audio.resume();
      var hit = self.view.ready ? self.view.pick(ev.clientX, ev.clientY) : null;
      if (!hit) {
        /* Tocar fuera del tablero suelta lo que hubiera en la mano. */
        self.clearSelection();
        return;
      }
      self.hover = hit;
      self.click(hit.col, hit.row);
    });

    this.canvas.addEventListener('contextmenu', function (ev) {
      ev.preventDefault();
      self.setBuildType(null);
      self.select(null);
    });
  };

  /* Suelta a la vez el edificio elegido y la torre seleccionada. */
  Game.prototype.clearSelection = function () {
    if (!this.buildType && !this.selected) return false;
    this.setBuildType(null);
    this.select(null);
    return true;
  };

  Game.prototype.click = function (col, row) {
    var existing = this.towerGrid[col + ',' + row];
    if (this.buildType) {
      if (existing) { this.select(existing); this.setBuildType(null); return; }
      this.build(col, row);
      return;
    }
    this.select(existing || null);
  };

  /* ------------------------------------------------------------------ */
  /* Construcción                                                        */
  /* ------------------------------------------------------------------ */

  /* Un edificio está disponible en cuanto se alcanza su oleada de desbloqueo. */
  Game.prototype.isUnlocked = function (type) {
    return (this.wave + 1) >= type.unlockWave;
  };

  Game.prototype.canBuild = function (col, row) {
    if (!this.level.isFree(col, row)) return false;
    return !this.towerGrid[col + ',' + row];
  };

  /* Alcance ya multiplicado por la Forja (para el fantasma de construcción). */
  Game.prototype.towerRange = function (type, level) {
    return type.levels[level].range * this.perkMul.range;
  };

  Game.prototype.build = function (col, row) {
    var type = TD.TOWER_TYPES[this.buildType];
    if (!type) return;
    var cx = (col + 0.5) * TD.TILE;
    var cy = (row + 0.5) * TD.TILE;
    if (!this.isUnlocked(type)) {
      TD.Audio.denied();
      this.effects.text(cx, cy, 'Se desbloquea en la oleada ' + type.unlockWave, '#e08a80', 13);
      return;
    }
    if (!this.canBuild(col, row)) {
      TD.Audio.denied();
      this.effects.text(cx, cy, 'Terreno ocupado', '#e08a80', 13);
      return;
    }
    if (this.gold < type.cost) {
      TD.Audio.denied();
      this.effects.text(cx, cy, 'Sin oro', '#e08a80', 14);
      return;
    }
    var tower = new TD.Tower(type.key, col, row);
    tower.game = this;
    this.towers.push(tower);
    this.towerGrid[col + ',' + row] = tower;
    this.gold -= type.cost;
    this.recomputeAuras();
    this.effects.dust(tower.x, tower.y);
    TD.Audio.build();
    this.log('Construida ' + type.name + '.', 'good');
    this.select(tower);
    this.emit();
  };

  Game.prototype.upgradeSelected = function () {
    var t = this.selected;
    if (!t || t.maxLevel()) return;
    var cost = t.upgradeCost();
    if (this.gold < cost) { TD.Audio.denied(); return; }
    this.gold -= cost;
    t.upgrade();
    this.recomputeAuras();
    TD.Audio.upgrade();
    this.effects.ring(t.x, t.y, 42, 'rgba(217,164,65,.9)', 0.12);
    this.effects.text(t.x, t.y, '¡Mejorada!', '#f0cf87', 14, 1.3);
    this.log(t.type.name + ' mejorada a nivel ' + (t.level + 1) + '.', 'good');
    this.select(t);
    this.emit();
  };

  Game.prototype.sellSelected = function () {
    var t = this.selected;
    if (!t) return;
    var value = t.sellValue();
    this.gold += value;
    this.towers.splice(this.towers.indexOf(t), 1);
    delete this.towerGrid[t.col + ',' + t.row];
    this.recomputeAuras();
    this.effects.dust(t.x, t.y);
    this.effects.text(t.x, t.y, '+' + value, '#f0cf87', 14, 1.1);
    TD.Audio.sell();
    this.log('Desmantelada ' + t.type.name + ' (+' + value + ' oro).');
    this.select(null);
    this.emit();
  };

  Game.prototype.cycleTargetMode = function () {
    var t = this.selected;
    if (!t) return;
    var keys = TD.TARGET_MODES.map(function (m) { return m.key; });
    t.targetMode = keys[(keys.indexOf(t.targetMode) + 1) % keys.length];
    t.target = null;
    this.select(t);
  };

  Game.prototype.select = function (tower) {
    this.selected = tower;
    if (this.hooks.onSelect) this.hooks.onSelect(tower, this);
  };

  Game.prototype.setBuildType = function (key) {
    this.buildType = key;
    if (key) this.select(null);
    if (this.hooks.onBuildType) this.hooks.onBuildType(key);
  };

  /* Reparte los bonos de los edificios de mando entre las torres que cubren. */
  Game.prototype.recomputeAuras = function () {
    var auras = [];
    var i, t;
    for (i = 0; i < this.towers.length; i++) {
      t = this.towers[i];
      if (t.type.kind !== 'aura') continue;
      var st = t.baseStats();
      auras.push({ x: t.x, y: t.y, r2: Math.pow(st.range * this.perkMul.range, 2),
                   damage: st.auraDamage, rate: st.auraRate });
    }
    for (i = 0; i < this.towers.length; i++) {
      t = this.towers[i];
      var dmg = 0, rate = 0;
      if (t.type.kind !== 'aura') {
        for (var a = 0; a < auras.length; a++) {
          if (TD.dist2(auras[a].x, auras[a].y, t.x, t.y) > auras[a].r2) continue;
          dmg += auras[a].damage;
          rate += auras[a].rate;
        }
      }
      t.auraDamage = dmg;
      t.auraRate = rate;
    }
    this.auraStamp++;
  };

  /* Bonificación de oro de las casas de botín que cubren un punto. */
  Game.prototype.lootBonusAt = function (x, y) {
    var bonus = 0;
    for (var i = 0; i < this.towers.length; i++) {
      var t = this.towers[i];
      if (t.type.kind !== 'loot') continue;
      var st = t.stats();
      if (TD.dist2(t.x, t.y, x, y) > st.range * st.range) continue;
      bonus += st.lootBonus;
      t.earned += 1;
    }
    return bonus;
  };

  /* ------------------------------------------------------------------ */
  /* Forja: mejoras compradas con el oro de las bajas                    */
  /* ------------------------------------------------------------------ */

  Game.prototype.perkLevel = function (key) { return this.perks[key] || 0; };

  Game.prototype.buyPerk = function (key) {
    var perk = TD.perk(key);
    if (!perk) return false;
    var level = this.perkLevel(key);
    var cost = TD.perkCost(perk, level);
    if (cost === null || this.gold < cost) { TD.Audio.denied(); return false; }

    this.gold -= cost;
    this.perks[key] = level + 1;
    this.perkStamp++;
    this.perkMul = TD.perkMultipliers(this.perks, this.perkStamp);
    this.recomputeAuras();

    if (perk.stat === 'lives') {
      this.lives += perk.step;
      this.effects.text(this.level.gate.x - 60, this.level.gate.y, '+' + perk.step + ' vidas', '#7fd86a', 16, 1.6);
    } else {
      var self = this;
      this.towers.forEach(function (t) {
        self.effects.ring(t.x, t.y, 34, 'rgba(217,164,65,.9)', 0.12);
      });
    }
    TD.Audio.upgrade();
    this.log('Forja: ' + perk.name + ' nivel ' + (level + 1) + '.', 'good');
    this.emit();
    return true;
  };

  /* ------------------------------------------------------------------ */
  /* Oleadas                                                             */
  /* ------------------------------------------------------------------ */

  Game.prototype.begin = function () {
    if (this.state !== 'menu') return;
    this.state = 'prep';
    this.prepTimer = PREP_FIRST;
    this.log('Los vigías avistan polvo en el horizonte…');
    this.emit();
  };

  Game.prototype.startWave = function () {
    if (this.state !== 'prep') return;
    if (this.prepTimer > 0.5) {
      var bonus = Math.ceil(this.prepTimer) * 3;
      this.gold += bonus;
      this.effects.text(this.level.spawn.x + 120, this.level.spawn.y,
        '+' + bonus + ' oro por adelantarse', '#f0cf87', 15, 1.8);
    }
    this.wave++;
    var wave = TD.getWave(this.wave);
    this.spawnQueue = [];
    var self = this;
    wave.groups.forEach(function (grp) {
      for (var i = 0; i < grp.count; i++) {
        self.spawnQueue.push({
          type: grp.type,
          at: grp.delay + i * grp.gap,
          hpMul: wave.hpMul,
          speedMul: wave.speedMul
        });
      }
    });
    this.spawnQueue.sort(function (a, b) { return a.at - b.at; });
    this.waveTime = 0;
    this.state = 'wave';
    this.banner = { text: 'Oleada ' + this.wave, life: 2.4 };
    TD.Audio.horn();
    this.log('¡Comienza la oleada ' + this.wave + '!', 'bad');
    this.emit();
  };

  Game.prototype.completeWave = function () {
    var bonus = Math.round((30 + this.wave * 8) * Math.max(1, TD.waveGoldMul(this.wave) * 0.3));
    var income = this.collectIncome();
    this.gold += bonus + income;
    this.score += 100 * this.wave;
    this.bestWave = Math.max(this.bestWave || 0, this.wave);

    var text = 'Oleada superada  +' + TD.num(bonus) + ' oro';
    if (income) text += '  ·  Rentas +' + TD.num(income);
    this.banner = { text: text, life: 2.0, good: true };
    this.log('Oleada ' + this.wave + ' rechazada (+' + TD.num(bonus + income) + ' oro).', 'good');

    /* Cada diez oleadas, un hito con recompensa. La partida no termina nunca:
       solo acaba cuando cae la fortaleza. */
    if (this.wave % MILESTONE === 0) {
      var prize = 250 * (this.wave / MILESTONE) * Math.max(1, TD.waveGoldMul(this.wave) * 0.25);
      prize = Math.round(prize);
      this.gold += prize;
      this.banner = { text: '¡Hito: ' + this.wave + ' oleadas!  +' + TD.num(prize) + ' oro', life: 3.2, good: true };
      this.log('Hito alcanzado: ' + this.wave + ' oleadas (+' + TD.num(prize) + ' oro).', 'good');
      TD.Audio.victory();
    }

    var unlocked = this.newUnlocks(this.wave + 2);
    if (unlocked.length) {
      this.log('Nueva construcción: ' + unlocked.map(function (t) { return t.name; }).join(', ') + '.', 'good');
    }

    this.state = 'prep';
    this.prepTimer = PREP_NEXT;
    this.emit();
  };

  /* Renta de los edificios de economía al cerrar la oleada. */
  Game.prototype.collectIncome = function () {
    var total = 0;
    for (var i = 0; i < this.towers.length; i++) {
      var t = this.towers[i];
      if (t.type.kind !== 'econ') continue;
      var amount = t.stats().income;
      total += amount;
      t.earned += amount;
      this.effects.text(t.x, t.y, '+' + TD.num(amount), '#f0cf87', 13, 1.2);
    }
    this.income = total;
    return total;
  };

  /* Construcciones que se estrenan al llegar a esa oleada. */
  Game.prototype.newUnlocks = function (wave) {
    var out = [];
    for (var i = 0; i < TD.TOWER_ORDER.length; i++) {
      var t = TD.TOWER_TYPES[TD.TOWER_ORDER[i]];
      if (t.unlockWave === wave) out.push(t);
    }
    return out;
  };

  /* No hay victoria: las oleadas no se acaban. La partida termina cuando la
     fortaleza cae, y lo que queda es hasta dónde aguantaste. */
  Game.prototype.finish = function () {
    this.state = 'over';
    this.score += this.kills * 5;
    var best = 0, bestWave = 0;
    try {
      best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
      bestWave = parseInt(localStorage.getItem(BEST_WAVE_KEY) || '0', 10) || 0;
    } catch (e) { best = bestWave = 0; }
    if (this.score > best) {
      best = this.score;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* sin almacenamiento */ }
    }
    if (this.wave > bestWave) {
      bestWave = this.wave;
      try { localStorage.setItem(BEST_WAVE_KEY, String(bestWave)); } catch (e) { /* sin almacenamiento */ }
    }
    this.best = best;
    this.bestWaveEver = bestWave;
    TD.Audio.defeat();
    if (this.hooks.onFinish) this.hooks.onFinish(false, this);
    this.emit();
  };

  /* ------------------------------------------------------------------ */
  /* Combate                                                             */
  /* ------------------------------------------------------------------ */

  /* Camada: crías, jinetes desmontados y lo que suelten los jefes. */
  Game.prototype.spawnEnemy = function (typeKey, parent, dist) {
    var e = new TD.Enemy(typeKey, this.level,
      parent ? parent.hpMul : 1, parent ? parent.speedMul : 1);
    e.dist = TD.clamp(dist === undefined ? (parent ? parent.dist : 0) : dist,
      0, e.path.length - 1);
    var p = e.path.at(e.dist);
    e.x = p.x;
    e.y = p.y;
    e.angle = p.angle;
    this.enemies.push(e);
    return e;
  };

  Game.prototype.spawnProjectile = function (opts) {
    this.projectiles.push(new TD.Projectile(opts));
  };

  Game.prototype.dealDamage = function (enemy, amount, kind, tower) {
    this._credit = tower || null;
    var dealt = enemy.damage(amount, kind, this);
    if (tower) tower.dealt += dealt;
    if (amount >= 45) {
      this.effects.text(enemy.x, enemy.y, '-' + TD.num(dealt), '#ffd9a0', 13,
        enemy.height() + 0.45);
    }
    this._credit = null;
    return dealt;
  };

  Game.prototype.onEnemyKilled = function (enemy) {
    var reward = Math.round(enemy.type.gold * this.perkMul.gold *
      TD.waveGoldMul(this.wave) * (1 + this.lootBonusAt(enemy.x, enemy.y)));
    this.gold += reward;
    this.killGold += reward;
    this.kills++;
    this.score += enemy.type.gold * 2 + Math.round(enemy.maxHp / 20);
    if (this._credit) this._credit.kills++;
    this.effects.blood(enemy.x, enemy.y, enemy.type.boss ? '#d9a441' : '#7a2b22', enemy.height());

    /* Lo que sale de dentro al morir. */
    if (enemy.type.onDeath) {
      var self = this;
      enemy.type.onDeath.forEach(function (grp) {
        for (var i = 0; i < grp.count; i++) {
          self.spawnEnemy(grp.type, enemy, enemy.dist - 6 - i * 12);
        }
      });
      this.effects.ring(enemy.x, enemy.y, 60, 'rgba(200,160,90,.8)', 0.15);
    }
    this.effects.text(enemy.x, enemy.y, '+' + reward, '#f0cf87', 13, enemy.height() + 0.4);
    if (enemy.type.boss) {
      this.effects.explosion(enemy.x, enemy.y, 80, enemy.height());
      this.shakeCamera(0.8);
      this.log('¡' + enemy.type.name + ' ha caído!', 'good');
    }
    TD.Audio.die();
    this.emit();
  };

  Game.prototype.onEnemyLeaked = function (enemy) {
    this.lives -= enemy.type.leak;
    this.leaked++;
    this.hurtFlash = 1;
    this.shakeCamera(0.5 + enemy.type.leak * 0.06);
    TD.Audio.leak();
    this.effects.text(this.level.gate.x - 40, this.level.gate.y,
      '-' + enemy.type.leak, '#e0554a', 18, 1.4);
    this.log(enemy.type.name + ' ha cruzado el portón (-' + enemy.type.leak + ').', 'bad');
    if (this.lives <= 0) {
      this.lives = 0;
      this.finish();
    }
    this.emit();
  };

  /* ------------------------------------------------------------------ */
  /* Bucle                                                               */
  /* ------------------------------------------------------------------ */

  Game.prototype.update = function (dt) {
    this.time += dt;
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.6);
    if (this.banner) {
      this.banner.life -= dt;
      if (this.banner.life <= 0) this.banner = null;
    }
    this.effects.update(dt);

    if (this.state === 'prep') {
      this.prepTimer -= dt;
      if (this.prepTimer <= 0) this.startWave();
    }

    if (this.state === 'wave') {
      this.waveTime += dt;
      while (this.spawnQueue.length && this.spawnQueue[0].at <= this.waveTime) {
        var s = this.spawnQueue.shift();
        this.enemies.push(new TD.Enemy(s.type, this.level, s.hpMul, s.speedMul));
      }
    }

    var i;
    /* Las auras se recalculan cada fotograma: escuderos y tamborileros solo
       amparan a quien tengan cerca en ese momento. */
    for (i = 0; i < this.enemies.length; i++) {
      this.enemies[i].auraArmor = 0;
      this.enemies[i].auraHaste = 0;
    }
    for (i = 0; i < this.enemies.length; i++) {
      if (this.enemies[i].type.aura && !this.enemies[i].dead) {
        this.enemies[i].applyAura(this.enemies);
      }
    }

    for (i = 0; i < this.enemies.length; i++) {
      var e = this.enemies[i];
      if (!e.dead) e.update(dt, this);
      if (e.leaked && !e._counted) {
        e._counted = true;
        this.onEnemyLeaked(e);
      }
    }
    for (i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].dead || this.enemies[i].leaked) this.enemies.splice(i, 1);
    }

    for (i = 0; i < this.towers.length; i++) this.towers[i].update(dt, this);

    for (i = this.projectiles.length - 1; i >= 0; i--) {
      var p = this.projectiles[i];
      p.update(dt, this);
      if (p.done) this.projectiles.splice(i, 1);
    }

    if (this.state === 'wave' && !this.spawnQueue.length && !this.enemies.length) {
      this.completeWave();
    }
  };

  Game.prototype.step = function (dt) {
    if (this.paused || this.state === 'menu' || this.state === 'over') {
      this.effects.update(dt);
      return;
    }
    var steps = SPEEDS[this.speedIndex];
    for (var i = 0; i < steps; i++) this.update(dt);
  };

  Game.prototype.draw = function (dt) {
    this.view.frame(dt);
  };

  Game.prototype.speed = function () { return SPEEDS[this.speedIndex]; };
  Game.prototype.cycleSpeed = function () {
    this.speedIndex = (this.speedIndex + 1) % SPEEDS.length;
    this.emit();
    return this.speed();
  };
  Game.prototype.togglePause = function () {
    if (this.state === 'menu' || this.state === 'over') return;
    this.paused = !this.paused;
    this.emit();
    return this.paused;
  };

  TD.Game = Game;
})(window.TD = window.TD || {});
