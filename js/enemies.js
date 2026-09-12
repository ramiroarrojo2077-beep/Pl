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
      color: '#7aa33f', modelScale: 1.92
    },
    wolf: {
      name: 'Lobo huargo', hp: 34, speed: 3.2, armor: 0, gold: 9, leak: 1, radius: 14,
      color: '#8a8f96', modelScale: 1.92
    },
    orc: {
      name: 'Orco', hp: 130, speed: 1.5, armor: 3, gold: 17, leak: 1, radius: 16,
      color: '#4f7a3a', modelScale: 1.86
    },
    knight: {
      name: 'Caballero negro', hp: 230, speed: 1.35, armor: 10, gold: 26, leak: 1, radius: 16,
      color: '#8d93a1', modelScale: 1.86
    },
    ogre: {
      name: 'Ogro', hp: 560, speed: 1.0, armor: 6, gold: 48, leak: 3, radius: 22,
      color: '#9c7a4e', modelScale: 1.67
    },
    wyvern: {
      name: 'Guiverno', hp: 110, speed: 1.8, armor: 1, gold: 20, leak: 1, radius: 16,
      flying: true, color: '#7b5aa8', modelScale: 1.86
    },
    necromancer: {
      name: 'Nigromante', hp: 200, speed: 1.25, armor: 2, gold: 30, leak: 2, radius: 16,
      color: '#6a4a86', heal: { amount: 30, radius: 95, every: 2.1 }, modelScale: 1.74
    },
    bat: {
      name: 'Murciélago de mina', hp: 70, speed: 3.4, armor: 0, gold: 12, leak: 1, radius: 13,
      flying: true, slowImmune: true, color: '#6b5a7a', modelScale: 1.7
    },
    drummer: {
      name: 'Tamborilero', hp: 240, speed: 1.4, armor: 2, gold: 30, leak: 1, radius: 16,
      color: '#a86a3a', modelScale: 1.8,
      aura: { kind: 'haste', value: 0.3, radius: 120 }
    },
    shieldbearer: {
      name: 'Escudero orco', hp: 320, speed: 1.2, armor: 12, gold: 34, leak: 1, radius: 17,
      color: '#5d7a4a', modelScale: 1.8,
      aura: { kind: 'armor', value: 0.25, radius: 110 }
    },
    wolfrider: {
      name: 'Jinete de huargo', hp: 200, speed: 2.6, armor: 3, gold: 26, leak: 1, radius: 16,
      color: '#8a7f6a', modelScale: 1.8,
      onDeath: [{ type: 'wolf', count: 1 }, { type: 'goblin', count: 1 }]
    },
    spider: {
      name: 'Araña de la fosa', hp: 180, speed: 1.9, armor: 1, gold: 24, leak: 1, radius: 16,
      color: '#4a3a52', modelScale: 1.7,
      onDeath: [{ type: 'spiderling', count: 3 }]
    },
    spiderling: {
      name: 'Cría de araña', hp: 40, speed: 2.9, armor: 0, gold: 5, leak: 1, radius: 11,
      color: '#6a5a72', modelScale: 1.5
    },
    wraith: {
      name: 'Espectro', hp: 260, speed: 1.7, armor: 0, gold: 32, leak: 2, radius: 16,
      color: '#7fb0c8', modelScale: 1.8,
      physicalResist: 0.7
    },
    flameborn: {
      name: 'Nacido del fuego', hp: 380, speed: 1.5, armor: 4, gold: 40, leak: 2, radius: 17,
      color: '#e07a2c', modelScale: 1.8,
      burnImmune: true, poisonImmune: true, magicResist: 0.15
    },
    golem: {
      name: 'Golem de piedra', hp: 900, speed: 0.8, armor: 18, gold: 60, leak: 3, radius: 22,
      color: '#8a8880', modelScale: 1.6,
      slowImmune: true, magicResist: 0.2
    },
    bonetitan: {
      name: 'Titán de hueso', hp: 6000, speed: 0.9, armor: 14, gold: 400, leak: 8, radius: 30,
      boss: true, color: '#d8cdb2', modelScale: 1.35,
      shield: 3000, slowImmune: true
    },
    hordequeen: {
      name: 'Reina de la horda', hp: 5200, speed: 1.1, armor: 8, gold: 380, leak: 8, radius: 28,
      boss: true, color: '#a8437e', modelScale: 1.3,
      spawner: { type: 'goblin', every: 2.6, count: 2 }
    },
    warlord: {
      name: 'Señor de la Guerra', hp: 2800, speed: 0.95, armor: 8, gold: 280, leak: 6,
      radius: 28, boss: true, color: '#b23a2c', modelScale: 1.55
    },
    dragon: {
      name: 'Dragón de Ceniza', hp: 4000, speed: 0.85, armor: 7, gold: 350, leak: 8,
      radius: 34, flying: true, boss: true, color: '#c0462c', modelScale: 1.43
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
    this.spawnTimer = type.spawner ? type.spawner.every : 0;
    this.hpMul = mul;
    this.speedMul = speedMul || 1;
    this.shield = type.shield ? Math.round(type.shield * mul) : 0;
    this.maxShield = this.shield;
    this.shieldIdle = 0;
    this.auraArmor = 0;     // reducción de daño que le regalan sus aliados
    this.auraHaste = 0;
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
    return this.baseSpeed * (1 - this.slow) * (1 + this.auraHaste);
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

    /* El escudo vuelve a cerrarse si nadie lo toca durante unos segundos. */
    if (this.maxShield && this.shield < this.maxShield) {
      this.shieldIdle += dt;
      if (this.shieldIdle > 4) {
        this.shield = Math.min(this.maxShield, this.shield + this.maxShield * 0.12 * dt);
      }
    }

    /* La reina va soltando camada sin dejar de avanzar. */
    if (this.type.spawner) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = this.type.spawner.every;
        for (var k = 0; k < this.type.spawner.count; k++) {
          game.spawnEnemy(this.type.spawner.type, this,
            Math.max(0, this.dist - 20 - k * 14));
        }
        game.effects.ring(this.x, this.y, 70, 'rgba(220,120,190,.8)', 0.2);
      }
    }

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

  /* Reparte el efecto de escuderos y tamborileros entre los suyos. */
  Enemy.prototype.applyAura = function (enemies) {
    var aura = this.type.aura;
    var r2 = aura.radius * aura.radius;
    for (var i = 0; i < enemies.length; i++) {
      var o = enemies[i];
      if (o === this || o.dead || o.leaked) continue;
      if (TD.dist2(this.x, this.y, o.x, o.y) > r2) continue;
      if (aura.kind === 'armor') o.auraArmor = Math.max(o.auraArmor, aura.value);
      else o.auraHaste = Math.max(o.auraHaste, aura.value);
    }
  };

  /* kind: 'physical' (lo reduce la armadura) o 'magic' (la ignora). */
  Enemy.prototype.damage = function (amount, kind, game, silent) {
    if (this.dead) return 0;
    var type = this.type;
    var dmg = amount;
    if (kind === 'magic') {
      if (type.magicResist) dmg *= (1 - type.magicResist);
    } else {
      dmg = Math.max(1, amount - type.armor);
      if (type.physicalResist) dmg *= (1 - type.physicalResist);
    }
    if (this.auraArmor) dmg *= (1 - this.auraArmor);

    /* El escudo se come el golpe antes que la carne. */
    if (this.shield > 0) {
      var absorbed = Math.min(this.shield, dmg);
      this.shield -= absorbed;
      dmg -= absorbed;
      this.shieldIdle = 0;
      if (!silent) this.flash = 0.1;
      if (dmg <= 0) return absorbed;
    }
    this.shieldIdle = 0;
    this.hp -= dmg;
    if (!silent) this.flash = 0.1;
    if (this.hp <= 0) {
      this.dead = true;
      game.onEnemyKilled(this);
    }
    return dmg;
  };

  Enemy.prototype.applySlow = function (factor, duration) {
    if (this.type.slowImmune) return;
    if (factor >= this.slow) {
      this.slow = factor;
      this.slowTimer = Math.max(this.slowTimer, duration);
    } else {
      this.slowTimer = Math.max(this.slowTimer, duration * 0.5);
    }
  };

  Enemy.prototype.applyPoison = function (dps, duration) {
    if (this.type.poisonImmune) return;
    this.poisonDps = Math.max(this.poisonDps, dps);
    this.poisonTimer = Math.max(this.poisonTimer, duration);
  };

  Enemy.prototype.applyBurn = function (dps, duration) {
    if (this.type.burnImmune) return;
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
