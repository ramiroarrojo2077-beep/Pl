/* Proyectiles, partículas y rótulos flotantes.
 *
 * Todo se calcula en el plano del tablero (x, y en píxeles) más una altura h en
 * casillas; el renderizador 3D lo traduce a la escena. */
(function (TD) {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Proyectiles                                                         */
  /* ------------------------------------------------------------------ */

  function Projectile(o) {
    Object.assign(this, o);
    this.done = false;
    this.life = 0;
    this.hitSet = [];
    if (this.kind === 'rock') {
      this.sx = this.x;
      this.sy = this.y;
      this.travel = TD.dist(this.x, this.y, this.tx, this.ty);
      this.duration = Math.max(0.35, this.travel / this.speed);
      this.arc = 34 + this.travel * 0.22;
    }
  }

  Projectile.prototype.update = function (dt, game) {
    this.life += dt;

    switch (this.kind) {
      case 'arrow':
      case 'poison':
      case 'frost': {
        var tgt = this.target;
        if (tgt && !tgt.dead && !tgt.leaked) {
          this.tx = tgt.x;
          this.ty = tgt.y;
        } else if (this.tx === undefined) {
          this.done = true;
          return;
        }
        var dx = this.tx - this.x, dy = this.ty - this.y;
        var d = Math.hypot(dx, dy);
        var step = this.speed * dt;
        this.angle = Math.atan2(dy, dx);
        if (d <= step || d < 5) {
          this.x = this.tx;
          this.y = this.ty;
          this.impact(game);
          this.done = true;
          return;
        }
        this.x += (dx / d) * step;
        this.y += (dy / d) * step;
        if (this.kind === 'frost' && Math.random() < 0.5) {
          game.effects.spark(this.x, this.y, '#aae1fa', 0.35, 1.6, 0.55);
        } else if (this.kind === 'poison' && Math.random() < 0.5) {
          game.effects.spark(this.x, this.y, '#9ad24f', 0.35, 1.8, 0.55);
        }
        if (this.life > 3) this.done = true;
        break;
      }

      case 'bolt': {
        var vx = Math.cos(this.angle) * this.speed * dt;
        var vy = Math.sin(this.angle) * this.speed * dt;
        this.x += vx;
        this.y += vy;
        this.traveled = (this.traveled || 0) + Math.hypot(vx, vy);
        for (var i = 0; i < game.enemies.length; i++) {
          var e = game.enemies[i];
          if (e.dead || e.leaked || this.hitSet.indexOf(e) >= 0) continue;
          if (this.tower && !this.tower.canTarget(e)) continue;
          var rr = e.type.radius + 5;
          if (TD.dist2(this.x, this.y, e.x, e.y) <= rr * rr) {
            this.hitSet.push(e);
            game.dealDamage(e, this.damage, this.damageType, this.tower);
            game.effects.burst(this.x, this.y, '#f0e4c0', 5, 80, e.height());
            TD.Audio.hit();
            if (this.hitSet.length >= this.pierce) { this.done = true; break; }
          }
        }
        if (this.traveled > this.maxDist || this.x < -40 || this.x > TD.W + 40 ||
            this.y < -40 || this.y > TD.H + 40) this.done = true;
        break;
      }

      case 'rock': {
        var t = this.life / this.duration;
        if (t >= 1) {
          this.x = this.tx;
          this.y = this.ty;
          this.impact(game);
          this.done = true;
          return;
        }
        this.x = TD.lerp(this.sx, this.tx, t);
        this.y = TD.lerp(this.sy, this.ty, t) - Math.sin(t * Math.PI) * this.arc;
        this.spin = (this.spin || 0) + dt * 9;
        break;
      }
    }
  };

  Projectile.prototype.impact = function (game) {
    if (this.splash) {
      var hitAny = false;
      for (var i = 0; i < game.enemies.length; i++) {
        var e = game.enemies[i];
        if (e.dead || e.leaked) continue;
        if (this.groundOnly && e.type.flying) continue;
        var d = TD.dist(this.x, this.y, e.x, e.y);
        if (d > this.splash + e.type.radius * 0.5) continue;
        var falloff = TD.clamp(1 - (d / (this.splash * 1.25)) * 0.55, 0.45, 1);
        game.dealDamage(e, this.damage * falloff, this.damageType, this.tower);
        if (this.slow) e.applySlow(this.slow, this.slowTime);
        if (this.poison) e.applyPoison(this.poison, this.poisonTime);
        hitAny = true;
      }
      if (this.kind === 'frost') {
        game.effects.ring(this.x, this.y, this.splash, 'rgba(150,220,250,.85)', 0.12);
        game.effects.burst(this.x, this.y, '#bfe9ff', 12, 70, 0.5);
      } else if (this.kind === 'poison') {
        game.effects.ring(this.x, this.y, this.splash, 'rgba(150,220,120,.85)', 0.12);
        game.effects.burst(this.x, this.y, '#9ad24f', 14, 60, 0.45);
      } else {
        game.effects.explosion(this.x, this.y, this.splash);
        TD.Audio.boom();
        game.shakeCamera(0.35);
      }
      if (!hitAny && this.kind === 'rock') game.effects.dust(this.x, this.y);
    } else if (this.target && !this.target.dead && !this.target.leaked) {
      game.dealDamage(this.target, this.damage, this.damageType, this.tower);
      game.effects.burst(this.x, this.y, '#f5e6bd', 5, 80, this.target.height());
      TD.Audio.hit();
    }
  };

  /* ------------------------------------------------------------------ */
  /* Sistema de partículas y rótulos                                     */
  /* ------------------------------------------------------------------ */

  function Effects() {
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.bolts = [];
  }

  Effects.prototype.clear = function () {
    this.particles.length = 0;
    this.texts.length = 0;
    this.rings.length = 0;
    this.bolts.length = 0;
  };

  /* Rayo encadenado: una polilínea que se apaga enseguida. */
  Effects.prototype.lightning = function (points) {
    if (points.length < 2) return;
    this.bolts.push({ points: points, life: 0.22, max: 0.22 });
    if (this.bolts.length > 8) this.bolts.shift();
    for (var i = 1; i < points.length; i++) {
      this.burst(points[i].x, points[i].y, '#cfe6ff', 4, 60, points[i].h);
    }
  };

  /* x, y van en píxeles del tablero; h es la altura en casillas. */
  Effects.prototype.add = function (o) {
    if (this.particles.length > 700) return;
    this.particles.push(o);
  };

  Effects.prototype.spark = function (x, y, color, life, size, h) {
    this.add({
      x: x, y: y, h: h === undefined ? 0.4 : h,
      vx: (Math.random() - 0.5) * 30, vz: (Math.random() - 0.5) * 30,
      vh: (Math.random() - 0.2) * 1.2, gravity: 2.2,
      life: life, max: life, color: color, size: size || 2
    });
  };

  Effects.prototype.burst = function (x, y, color, count, speed, h) {
    var sp = speed || 90;
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var v = sp * (0.35 + Math.random() * 0.9);
      this.add({
        x: x, y: y, h: h === undefined ? 0.4 : h,
        vx: Math.cos(a) * v, vz: Math.sin(a) * v,
        vh: 1.2 + Math.random() * 2.6, gravity: 7,
        life: 0.3 + Math.random() * 0.3, max: 0.6, color: color,
        size: 1.4 + Math.random() * 1.8
      });
    }
  };

  Effects.prototype.explosion = function (x, y, radius, h) {
    var base = h === undefined ? 0.25 : h;
    this.ring(x, y, radius, 'rgba(255,170,70,.9)', 0.1);
    for (var i = 0; i < 20; i++) {
      var a = Math.random() * Math.PI * 2;
      var v = 40 + Math.random() * 150;
      this.add({
        x: x, y: y, h: base,
        vx: Math.cos(a) * v, vz: Math.sin(a) * v,
        vh: 1.5 + Math.random() * 4, gravity: 8,
        life: 0.35 + Math.random() * 0.45, max: 0.8,
        color: ['#ffd27a', '#f08b32', '#8c6b4a', '#5c5049'][Math.floor(Math.random() * 4)],
        size: 2 + Math.random() * 3.4
      });
    }
    for (var j = 0; j < 7; j++) {
      this.add({
        x: x + (Math.random() - 0.5) * radius, y: y + (Math.random() - 0.5) * radius,
        h: base + 0.2,
        vx: (Math.random() - 0.5) * 20, vz: (Math.random() - 0.5) * 20,
        vh: 0.6 + Math.random() * 0.8, gravity: -0.4,
        life: 0.6 + Math.random() * 0.5, max: 1.1, color: '#6b6259',
        size: 5 + Math.random() * 6, smoke: true
      });
    }
  };

  Effects.prototype.dust = function (x, y, h) {
    for (var i = 0; i < 10; i++) {
      var a = Math.random() * Math.PI * 2;
      this.add({
        x: x, y: y, h: h === undefined ? 0.1 : h,
        vx: Math.cos(a) * 50, vz: Math.sin(a) * 50,
        vh: 0.7 + Math.random() * 1.1, gravity: 5,
        life: 0.3 + Math.random() * 0.3, max: 0.6, color: '#9a8768',
        size: 2 + Math.random() * 3
      });
    }
  };

  Effects.prototype.blood = function (x, y, color, h) {
    for (var i = 0; i < 14; i++) {
      var a = Math.random() * Math.PI * 2;
      var v = 30 + Math.random() * 110;
      this.add({
        x: x, y: y, h: h === undefined ? 0.4 : h,
        vx: Math.cos(a) * v, vz: Math.sin(a) * v,
        vh: 1.6 + Math.random() * 2.4, gravity: 9,
        life: 0.3 + Math.random() * 0.4, max: 0.7, color: color,
        size: 1.6 + Math.random() * 2.4
      });
    }
  };

  Effects.prototype.emberTrail = function (x0, y0, x1, y1, h) {
    if (Math.random() > 0.45) return;
    var t = Math.random();
    this.add({
      x: TD.lerp(x0, x1, t), y: TD.lerp(y0, y1, t),
      h: TD.lerp(0.95, h === undefined ? 0.4 : h, t),
      vx: (Math.random() - 0.5) * 24, vz: (Math.random() - 0.5) * 24,
      vh: 0.5 + Math.random() * 0.9, gravity: -0.8,
      life: 0.3 + Math.random() * 0.3, max: 0.6,
      color: Math.random() < 0.5 ? '#ffb347' : '#ffe28a',
      size: 1.2 + Math.random() * 1.6
    });
  };

  Effects.prototype.ring = function (x, y, radius, color, h) {
    this.rings.push({
      x: x, y: y, r: radius * 0.25, max: radius, life: 0.42, maxLife: 0.42,
      color: color, h: h === undefined ? 0.08 : h
    });
    if (this.rings.length > 10) this.rings.shift();
  };

  Effects.prototype.text = function (x, y, str, color, size, h) {
    this.texts.push({
      x: x, y: y, h: h === undefined ? 0.9 : h, text: str, color: color || '#f3e6c4',
      life: 1.0, max: 1.0, size: size || 14
    });
    if (this.texts.length > 24) this.texts.shift();
  };

  Effects.prototype.update = function (dt) {
    var i;
    for (i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vz * dt;
      p.h += p.vh * dt;
      p.vh -= p.gravity * dt;
      p.vx *= 0.97;
      p.vz *= 0.97;
      if (p.h < 0.04) {
        p.h = 0.04;
        p.vh *= -0.25;
        p.vx *= 0.6;
        p.vz *= 0.6;
      }
    }
    for (i = this.rings.length - 1; i >= 0; i--) {
      var r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) { this.rings.splice(i, 1); continue; }
      r.r = TD.lerp(r.max * 0.25, r.max, 1 - r.life / r.maxLife);
    }
    for (i = this.texts.length - 1; i >= 0; i--) {
      var t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    for (i = this.bolts.length - 1; i >= 0; i--) {
      this.bolts[i].life -= dt;
      if (this.bolts[i].life <= 0) this.bolts.splice(i, 1);
    }
  };

  TD.Projectile = Projectile;
  TD.Effects = Effects;
})(window.TD = window.TD || {});
