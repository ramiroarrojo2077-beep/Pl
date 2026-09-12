/* Bestiario: definiciones de enemigos y su lógica de movimiento.
 *
 * El aspecto lo ponen los modelos de Blender (enemy_<clave> en el .glb); aquí
 * solo viven las reglas: vida, velocidad, armadura, recompensa y estados.
 */
(function (TD) {
  'use strict';

  /* speed en casillas/segundo · armor resta daño físico · gold recompensa
     radius en píxeles del tablero (alcance, salpicaduras y barra de vida). */
  var TYPES = {
    goblin: {
      name: 'Trasgo', hp: 40, speed: 1.9, armor: 0, gold: 10, leak: 1, radius: 13,
      color: '#7aa33f', modelScale: 1.55
    },
    wolf: {
      name: 'Lobo huargo', hp: 34, speed: 3.2, armor: 0, gold: 9, leak: 1, radius: 14,
      color: '#8a8f96', modelScale: 1.55
    },
    orc: {
      name: 'Orco', hp: 130, speed: 1.5, armor: 3, gold: 17, leak: 1, radius: 16,
      color: '#4f7a3a', modelScale: 1.5
    },
    knight: {
      name: 'Caballero negro', hp: 230, speed: 1.35, armor: 10, gold: 26, leak: 1, radius: 16,
      color: '#8d93a1', modelScale: 1.5
    },
    ogre: {
      name: 'Ogro', hp: 560, speed: 1.0, armor: 6, gold: 48, leak: 3, radius: 22,
      color: '#9c7a4e', modelScale: 1.35
    },
    wyvern: {
      name: 'Guiverno', hp: 110, speed: 1.8, armor: 1, gold: 20, leak: 1, radius: 16,
      flying: true, color: '#7b5aa8', modelScale: 1.5
    },
    necromancer: {
      name: 'Nigromante', hp: 200, speed: 1.25, armor: 2, gold: 30, leak: 2, radius: 16,
      color: '#6a4a86', heal: { amount: 30, radius: 95, every: 2.1 }, modelScale: 1.4
    },
    warlord: {
      name: 'Señor de la Guerra', hp: 2800, speed: 0.95, armor: 8, gold: 280, leak: 6,
      radius: 28, boss: true, color: '#b23a2c', modelScale: 1.25
    },
    dragon: {
      name: 'Dragón de Ceniza', hp: 4000, speed: 0.85, armor: 7, gold: 350, leak: 8,
      radius: 34, flying: true, boss: true, color: '#c0462c', modelScale: 1.15
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
    this.poisonDps = 0;
    this.poisonTimer = 0;
    this.flash = 0;
    this.healTimer = type.heal ? type.heal.every : 0;
    this.dead = false;
    this.leaked = false;
    var p = this.path.at(0);
    this.x = p.x;
    this.y = p.y;
    this.angle = p.angle;
  }

  /* Posición futura sobre su trazado, para que las torres adelanten el tiro. */
  Enemy.prototype.posAtDist = function (d) {
    return this.path.at(Math.min(d, this.path.length));
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
    if (this.poisonTimer > 0) {
      this.poisonTimer -= dt;
      this.damage(this.poisonDps * dt, 'magic', game, true);
      if (this.poisonTimer <= 0) this.poisonDps = 0;
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
    this.y = p.y;
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
        if (healed) game.effects.ring(this.x, this.y, this.type.heal.radius, 'rgba(150,220,120,.8)', 0.5);
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

  Enemy.prototype.applyPoison = function (dps, duration) {
    this.poisonDps = Math.max(this.poisonDps, dps);
    this.poisonTimer = Math.max(this.poisonTimer, duration);
  };

  Enemy.prototype.applyBurn = function (dps, duration) {
    this.burnDps = Math.max(this.burnDps, dps);
    this.burnTimer = Math.max(this.burnTimer, duration);
  };

  /* Altura a la que se dibuja: los voladores planean sobre el tablero. */
  Enemy.prototype.height = function () {
    return this.type.flying ? 1.05 : 0.3;
  };

  TD.ENEMY_TYPES = TYPES;
  TD.Enemy = Enemy;
})(window.TD = window.TD || {});
