/* Motor del juego: economía, oleadas, bucle principal y pintado. */
(function (TD) {
  'use strict';

  var START_GOLD = 300;
  var START_LIVES = 20;
  var PREP_FIRST = 20;
  var PREP_NEXT = 13;
  var SPEEDS = [1, 2, 3];
  var BEST_KEY = 'rocanegra.best';

  function Game(canvas, hooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.hooks = hooks || {};
    this.level = TD.buildLevel();
    this.effects = new TD.Effects();
    this.time = 0;
    this.speedIndex = 0;
    this.paused = false;
    this.state = 'menu';
    this.hover = null;
    this.buildType = null;
    this.selected = null;
    this.reset();
    this.setupInput();
    this.resize();
    window.addEventListener('resize', this.resize.bind(this));
  }

  Game.prototype.reset = function () {
    this.gold = START_GOLD;
    this.lives = START_LIVES;
    this.wave = 0;
    this.score = 0;
    this.endless = false;
    this.kills = 0;
    this.leaked = 0;
    this.enemies = [];
    this.towers = [];
    this.towerGrid = {};
    this.projectiles = [];
    this.spawnQueue = [];
    this.effects.clear();
    this.prepTimer = PREP_FIRST;
    this.state = 'menu';
    this.paused = false;
    this.buildType = null;
    this.selected = null;
    this.banner = null;
    this.hurtFlash = 0;
    this.emit();
  };

  Game.prototype.emit = function () {
    if (this.hooks.onStats) this.hooks.onStats(this);
  };
  Game.prototype.log = function (msg, cls) {
    if (this.hooks.onLog) this.hooks.onLog(msg, cls);
  };

  /* ------------------------------------------------------------------ */
  /* Entrada                                                             */
  /* ------------------------------------------------------------------ */

  Game.prototype.toCanvas = function (ev) {
    var rect = this.canvas.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left) * (TD.W / rect.width),
      y: (ev.clientY - rect.top) * (TD.H / rect.height)
    };
  };

  Game.prototype.setupInput = function () {
    var self = this;

    this.canvas.addEventListener('pointermove', function (ev) {
      var p = self.toCanvas(ev);
      var col = Math.floor(p.x / TD.TILE);
      var row = Math.floor(p.y / TD.TILE);
      self.hover = (col >= 0 && col < TD.GRID_W && row >= 0 && row < TD.GRID_H)
        ? { col: col, row: row, x: p.x, y: p.y } : null;
    });

    this.canvas.addEventListener('pointerleave', function () { self.hover = null; });

    this.canvas.addEventListener('pointerdown', function (ev) {
      if (ev.button === 2) return;
      TD.Audio.resume();
      var p = self.toCanvas(ev);
      var col = Math.floor(p.x / TD.TILE);
      var row = Math.floor(p.y / TD.TILE);
      self.hover = { col: col, row: row, x: p.x, y: p.y };
      self.click(col, row);
    });

    this.canvas.addEventListener('contextmenu', function (ev) {
      ev.preventDefault();
      self.setBuildType(null);
      self.select(null);
    });
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

  Game.prototype.canBuild = function (col, row) {
    if (!this.level.isFree(col, row)) return false;
    return !this.towerGrid[col + ',' + row];
  };

  Game.prototype.build = function (col, row) {
    var type = TD.TOWER_TYPES[this.buildType];
    if (!type) return;
    if (!this.canBuild(col, row)) {
      TD.Audio.denied();
      this.effects.text((col + 0.5) * TD.TILE, (row + 0.5) * TD.TILE, 'Terreno ocupado', '#e08a80', 12);
      return;
    }
    if (this.gold < type.cost) {
      TD.Audio.denied();
      this.effects.text((col + 0.5) * TD.TILE, (row + 0.5) * TD.TILE, 'Sin oro', '#e08a80', 13);
      return;
    }
    var tower = new TD.Tower(type.key, col, row);
    this.towers.push(tower);
    this.towerGrid[col + ',' + row] = tower;
    this.gold -= type.cost;
    this.effects.dust(tower.x, tower.y + 8);
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
    TD.Audio.upgrade();
    this.effects.ring(t.x, t.y - 10, 34, 'rgba(217,164,65,.9)');
    this.effects.text(t.x, t.y - 30, '¡Mejorada!', '#f0cf87', 12);
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
    this.effects.dust(t.x, t.y + 6);
    this.effects.text(t.x, t.y - 20, '+' + value, '#f0cf87', 13);
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
    this.canvas.classList.toggle('building', !!key);
    if (key) this.select(null);
    if (this.hooks.onBuildType) this.hooks.onBuildType(key);
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
      this.effects.text(TD.W / 2, 90, '+' + bonus + ' oro por adelantarse', '#f0cf87', 15);
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
    this.banner = { text: 'Oleada ' + this.wave, life: 2.2 };
    TD.Audio.horn();
    this.log('¡Comienza la oleada ' + this.wave + '!', 'bad');
    this.emit();
  };

  Game.prototype.completeWave = function () {
    var bonus = 30 + this.wave * 8;
    this.gold += bonus;
    this.score += 100 * this.wave;
    this.effects.text(TD.W / 2, TD.H / 2 - 40, 'Oleada superada  +' + bonus + ' oro', '#f0cf87', 18);
    this.log('Oleada ' + this.wave + ' rechazada (+' + bonus + ' oro).', 'good');

    if (this.wave >= TD.TOTAL_WAVES && !this.endless) {
      this.finish(true);
      return;
    }
    this.state = 'prep';
    this.prepTimer = PREP_NEXT;
    this.emit();
  };

  Game.prototype.finish = function (victory) {
    this.state = victory ? 'win' : 'over';
    this.score += this.lives * 25 + this.kills * 5;
    var best = 0;
    try { best = parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) { best = 0; }
    if (this.score > best) {
      best = this.score;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) { /* almacenamiento no disponible */ }
    }
    this.best = best;
    if (victory) TD.Audio.victory(); else TD.Audio.defeat();
    if (this.hooks.onFinish) this.hooks.onFinish(victory, this);
    this.emit();
  };

  Game.prototype.continueEndless = function () {
    this.endless = true;
    this.state = 'prep';
    this.prepTimer = PREP_NEXT;
    this.log('La fortaleza resiste… pero el Yermo envía más.', 'bad');
    this.emit();
  };

  /* ------------------------------------------------------------------ */
  /* Combate                                                             */
  /* ------------------------------------------------------------------ */

  Game.prototype.spawnProjectile = function (opts) {
    this.projectiles.push(new TD.Projectile(opts));
  };

  Game.prototype.dealDamage = function (enemy, amount, kind, tower) {
    this._credit = tower || null;
    var dealt = enemy.damage(amount, kind, this);
    if (tower) tower.dealt += dealt;
    if (amount >= 45) {
      this.effects.text(enemy.x, enemy.y - enemy.type.radius - 6, '-' + TD.num(dealt), '#ffd9a0', 12);
    }
    this._credit = null;
    return dealt;
  };

  Game.prototype.onEnemyKilled = function (enemy) {
    this.gold += enemy.type.gold;
    this.kills++;
    this.score += enemy.type.gold * 2 + Math.round(enemy.maxHp / 20);
    if (this._credit) this._credit.kills++;
    this.effects.blood(enemy.x, enemy.y, enemy.type.boss ? '#d9a441' : '#7a2b22');
    this.effects.text(enemy.x, enemy.y - enemy.type.radius - 4, '+' + enemy.type.gold, '#f0cf87', 12);
    if (enemy.type.boss) {
      this.effects.explosion(enemy.x, enemy.y, 70);
      this.log('¡' + enemy.type.name + ' ha caído!', 'good');
    }
    TD.Audio.die();
    this.emit();
  };

  Game.prototype.onEnemyLeaked = function (enemy) {
    this.lives -= enemy.type.leak;
    this.leaked++;
    this.hurtFlash = 1;
    TD.Audio.leak();
    this.effects.text(this.level.gate.x - 30, this.level.gate.y - 30, '-' + enemy.type.leak, '#e0554a', 16);
    this.log(enemy.type.name + ' ha cruzado el portón (-' + enemy.type.leak + ').', 'bad');
    if (this.lives <= 0) {
      this.lives = 0;
      this.finish(false);
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
    if (this.paused || this.state === 'menu' || this.state === 'over' || this.state === 'win') {
      this.effects.update(dt);
      return;
    }
    var steps = SPEEDS[this.speedIndex];
    for (var i = 0; i < steps; i++) this.update(dt);
  };

  /* ------------------------------------------------------------------ */
  /* Pintado                                                             */
  /* ------------------------------------------------------------------ */

  Game.prototype.resize = function () {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = TD.W * dpr;
    this.canvas.height = TD.H * dpr;
    this.dpr = dpr;
  };

  Game.prototype.draw = function () {
    var ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, TD.W, TD.H);
    ctx.drawImage(this.level.bg, 0, 0);

    this.drawBuildHints(ctx);

    /* Torres y enemigos ordenados por profundidad. */
    var drawables = this.towers.concat(this.enemies);
    drawables.sort(function (a, b) {
      var ay = a.baseY !== undefined ? a.baseY : a.y;
      var by = b.baseY !== undefined ? b.baseY : b.y;
      return ay - by;
    });
    for (var i = 0; i < drawables.length; i++) drawables[i].draw(ctx, this.time);

    for (var j = 0; j < this.projectiles.length; j++) this.projectiles[j].draw(ctx);
    this.effects.draw(ctx);

    this.drawGhost(ctx);
    this.drawSelection(ctx);
    this.drawHud(ctx);
  };

  Game.prototype.drawBuildHints = function (ctx) {
    if (!this.buildType || !this.hover) return;
    ctx.save();
    ctx.globalAlpha = 0.16;
    for (var r = 0; r < TD.GRID_H; r++) {
      for (var c = 0; c < TD.GRID_W; c++) {
        if (!this.canBuild(c, r)) continue;
        ctx.fillStyle = '#eaf3d8';
        ctx.fillRect(c * TD.TILE + 2, r * TD.TILE + 2, TD.TILE - 4, TD.TILE - 4);
      }
    }
    ctx.restore();
  };

  Game.prototype.drawGhost = function (ctx) {
    if (!this.buildType || !this.hover) return;
    var type = TD.TOWER_TYPES[this.buildType];
    var col = this.hover.col, row = this.hover.row;
    var x = (col + 0.5) * TD.TILE, y = (row + 0.5) * TD.TILE;
    var ok = this.canBuild(col, row) && this.gold >= type.cost;

    ctx.save();
    ctx.globalAlpha = 0.85;
    drawRange(ctx, x, y, type.levels[0].range, ok ? 'rgba(150,220,120,' : 'rgba(220,90,70,');
    ctx.globalAlpha = ok ? 0.72 : 0.42;
    var ghost = new TD.Tower(type.key, col, row);
    ghost.buildAnim = 0;
    ghost.draw(ctx, this.time);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = ok ? 'rgba(160,230,130,.95)' : 'rgba(230,100,80,.95)';
    ctx.lineWidth = 2;
    TD.roundRect(ctx, col * TD.TILE + 2, row * TD.TILE + 2, TD.TILE - 4, TD.TILE - 4, 4);
    ctx.stroke();
    ctx.restore();
  };

  Game.prototype.drawSelection = function (ctx) {
    var t = this.selected;
    if (!t) return;
    drawRange(ctx, t.x, t.y, t.stats().range, 'rgba(240,207,135,');
    ctx.save();
    ctx.strokeStyle = 'rgba(240,207,135,.95)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -this.time * 18;
    TD.roundRect(ctx, t.col * TD.TILE + 2, t.row * TD.TILE + 2, TD.TILE - 4, TD.TILE - 4, 4);
    ctx.stroke();
    ctx.restore();
  };

  function drawRange(ctx, x, y, r, rgbPrefix) {
    ctx.save();
    ctx.fillStyle = rgbPrefix + '0.08)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = rgbPrefix + '0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  }

  Game.prototype.drawHud = function (ctx) {
    /* Destello rojo cuando la fortaleza recibe daño. */
    if (this.hurtFlash > 0) {
      ctx.save();
      var g = ctx.createRadialGradient(TD.W / 2, TD.H / 2, TD.H * 0.3, TD.W / 2, TD.H / 2, TD.H);
      g.addColorStop(0, 'rgba(180,40,30,0)');
      g.addColorStop(1, 'rgba(180,40,30,' + (this.hurtFlash * 0.55) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, TD.W, TD.H);
      ctx.restore();
    }

    if (this.banner) {
      ctx.save();
      var a = TD.clamp(this.banner.life / 0.6, 0, 1);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.font = '700 44px Cinzel, Georgia, serif';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,.8)';
      ctx.strokeText(this.banner.text, TD.W / 2, 96);
      var grad = ctx.createLinearGradient(0, 60, 0, 110);
      grad.addColorStop(0, '#f6e1a8');
      grad.addColorStop(1, '#c9922f');
      ctx.fillStyle = grad;
      ctx.fillText(this.banner.text, TD.W / 2, 96);
      ctx.restore();
    }

    if (this.paused && this.state !== 'menu') {
      ctx.save();
      ctx.fillStyle = 'rgba(8,7,6,.55)';
      ctx.fillRect(0, 0, TD.W, TD.H);
      ctx.textAlign = 'center';
      ctx.font = '700 38px Cinzel, Georgia, serif';
      ctx.fillStyle = '#e9dcbe';
      ctx.fillText('Tregua', TD.W / 2, TD.H / 2);
      ctx.font = '16px Georgia, serif';
      ctx.fillStyle = '#b9a77f';
      ctx.fillText('Pulsa P para reanudar', TD.W / 2, TD.H / 2 + 28);
      ctx.restore();
    }
  };

  Game.prototype.speed = function () { return SPEEDS[this.speedIndex]; };
  Game.prototype.cycleSpeed = function () {
    this.speedIndex = (this.speedIndex + 1) % SPEEDS.length;
    this.emit();
    return this.speed();
  };
  Game.prototype.togglePause = function () {
    if (this.state === 'menu' || this.state === 'over' || this.state === 'win') return;
    this.paused = !this.paused;
    this.emit();
    return this.paused;
  };

  TD.Game = Game;
  TD.SPEEDS = SPEEDS;
})(window.TD = window.TD || {});
