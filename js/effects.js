/* Proyectiles, partículas y rótulos flotantes. */
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
          game.effects.spark(this.x, this.y, 'rgba(170,225,250,.8)', 0.35, 1.6);
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
            game.effects.burst(this.x, this.y, '#f0e4c0', 4);
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
        hitAny = true;
      }
      if (this.kind === 'frost') {
        game.effects.ring(this.x, this.y, this.splash, 'rgba(150,220,250,.85)');
        game.effects.burst(this.x, this.y, '#bfe9ff', 10, 70);
      } else {
        game.effects.explosion(this.x, this.y, this.splash);
        TD.Audio.boom();
      }
      if (!hitAny && this.kind === 'rock') game.effects.dust(this.x, this.y);
    } else if (this.target && !this.target.dead && !this.target.leaked) {
      game.dealDamage(this.target, this.damage, this.damageType, this.tower);
      game.effects.burst(this.x, this.y, '#f5e6bd', 5);
      TD.Audio.hit();
    }
  };

  Projectile.prototype.draw = function (ctx) {
    ctx.save();
    switch (this.kind) {
      case 'arrow':
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.strokeStyle = '#d9c9a3';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-9, 0); ctx.lineTo(5, 0);
        ctx.stroke();
        ctx.fillStyle = '#cfd6de';
        ctx.beginPath();
        ctx.moveTo(9, 0); ctx.lineTo(4, -2.2); ctx.lineTo(4, 2.2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#e8e2d0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-9, 0); ctx.lineTo(-6, -2.4);
        ctx.moveTo(-9, 0); ctx.lineTo(-6, 2.4);
        ctx.stroke();
        break;

      case 'bolt':
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.fillStyle = 'rgba(255,240,200,.3)';
        ctx.fillRect(-22, -1.4, 22, 2.8);
        ctx.fillStyle = '#8a6a3a';
        ctx.fillRect(-11, -1.8, 18, 3.6);
        ctx.fillStyle = '#dfe6ef';
        ctx.beginPath();
        ctx.moveTo(13, 0); ctx.lineTo(6, -3.4); ctx.lineTo(6, 3.4);
        ctx.closePath();
        ctx.fill();
        break;

      case 'frost':
        TD.Art.glow(ctx, this.x, this.y, 11, 'rgba(130,210,245,.5)');
        ctx.fillStyle = '#e7fbff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(210,245,255,.9)';
        ctx.lineWidth = 1.2;
        for (var i = 0; i < 3; i++) {
          var a = this.life * 6 + (i * Math.PI) / 3;
          ctx.beginPath();
          ctx.moveTo(this.x - Math.cos(a) * 6, this.y - Math.sin(a) * 6);
          ctx.lineTo(this.x + Math.cos(a) * 6, this.y + Math.sin(a) * 6);
          ctx.stroke();
        }
        break;

      case 'rock': {
        var t = TD.clamp(this.life / this.duration, 0, 1);
        var gy = TD.lerp(this.sy, this.ty, t);
        TD.Art.shadow(ctx, TD.lerp(this.sx, this.tx, t), gy, 7 - t * 1.5, 3, 0.22);
        ctx.translate(this.x, this.y);
        ctx.rotate(this.spin || 0);
        var g = ctx.createLinearGradient(-7, -7, 7, 7);
        g.addColorStop(0, '#a39c92');
        g.addColorStop(1, '#5f5951');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-7, 2); ctx.lineTo(-4, -6); ctx.lineTo(4, -7); ctx.lineTo(7, 1); ctx.lineTo(2, 7); ctx.lineTo(-5, 6);
        ctx.closePath();
        ctx.fill();
        break;
      }
    }
    ctx.restore();
  };

  /* ------------------------------------------------------------------ */
  /* Sistema de partículas y rótulos                                     */
  /* ------------------------------------------------------------------ */

  function Effects() {
    this.particles = [];
    this.texts = [];
    this.rings = [];
    this.emberCd = 0;
  }

  Effects.prototype.clear = function () {
    this.particles.length = 0;
    this.texts.length = 0;
    this.rings.length = 0;
  };

  Effects.prototype.spark = function (x, y, color, life, size) {
    this.particles.push({
      x: x, y: y, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30,
      life: life, max: life, color: color, size: size || 2, gravity: 0
    });
  };

  Effects.prototype.burst = function (x, y, color, count, speed) {
    var sp = speed || 90;
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var v = sp * (0.35 + Math.random() * 0.9);
      this.particles.push({
        x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 0.3 + Math.random() * 0.3, max: 0.6, color: color,
        size: 1.4 + Math.random() * 1.8, gravity: 120
      });
    }
  };

  Effects.prototype.explosion = function (x, y, radius) {
    this.ring(x, y, radius, 'rgba(255,170,70,.9)');
    for (var i = 0; i < 18; i++) {
      var a = Math.random() * Math.PI * 2;
      var v = 40 + Math.random() * 150;
      this.particles.push({
        x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30,
        life: 0.35 + Math.random() * 0.45, max: 0.8,
        color: ['#ffd27a', '#f08b32', '#8c6b4a', '#5c5049'][Math.floor(Math.random() * 4)],
        size: 2 + Math.random() * 3.2, gravity: 200
      });
    }
    for (var j = 0; j < 6; j++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * radius, y: y + (Math.random() - 0.5) * radius * 0.6,
        vx: (Math.random() - 0.5) * 20, vy: -18 - Math.random() * 20,
        life: 0.6 + Math.random() * 0.5, max: 1.1, color: 'rgba(90,80,70,.55)',
        size: 5 + Math.random() * 6, gravity: -10, smoke: true
      });
    }
  };

  Effects.prototype.dust = function (x, y) {
    for (var i = 0; i < 8; i++) {
      var a = Math.random() * Math.PI * 2;
      this.particles.push({
        x: x, y: y, vx: Math.cos(a) * 50, vy: Math.sin(a) * 30 - 15,
        life: 0.3 + Math.random() * 0.3, max: 0.6, color: 'rgba(150,130,100,.6)',
        size: 2 + Math.random() * 3, gravity: 120
      });
    }
  };

  Effects.prototype.blood = function (x, y, color) {
    for (var i = 0; i < 12; i++) {
      var a = Math.random() * Math.PI * 2;
      var v = 30 + Math.random() * 110;
      this.particles.push({
        x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40,
        life: 0.3 + Math.random() * 0.4, max: 0.7, color: color,
        size: 1.6 + Math.random() * 2.4, gravity: 260
      });
    }
  };

  Effects.prototype.emberTrail = function (x0, y0, x1, y1) {
    if (Math.random() > 0.4) return;
    var t = Math.random();
    this.particles.push({
      x: TD.lerp(x0, x1, t), y: TD.lerp(y0, y1, t),
      vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30,
      life: 0.3 + Math.random() * 0.3, max: 0.6,
      color: Math.random() < 0.5 ? '#ffb347' : '#ffe28a',
      size: 1.2 + Math.random() * 1.6, gravity: -30
    });
  };

  Effects.prototype.ring = function (x, y, radius, color) {
    this.rings.push({ x: x, y: y, r: radius * 0.25, max: radius, life: 0.42, maxLife: 0.42, color: color });
  };

  Effects.prototype.text = function (x, y, str, color, size) {
    this.texts.push({
      x: x, y: y, text: str, color: color || '#f3e6c4',
      life: 0.95, max: 0.95, size: size || 13, vy: -34
    });
  };

  Effects.prototype.update = function (dt) {
    var i;
    for (i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= 0.98;
    }
    for (i = this.rings.length - 1; i >= 0; i--) {
      var r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) { this.rings.splice(i, 1); continue; }
      r.r = TD.lerp(r.max * 0.25, r.max, 1 - r.life / r.maxLife);
    }
    for (i = this.texts.length - 1; i >= 0; i--) {
      var tx = this.texts[i];
      tx.life -= dt;
      if (tx.life <= 0) { this.texts.splice(i, 1); continue; }
      tx.y += tx.vy * dt;
      tx.vy *= 0.92;
    }
  };

  Effects.prototype.draw = function (ctx) {
    var i;
    ctx.save();
    for (i = 0; i < this.rings.length; i++) {
      var r = this.rings[i];
      ctx.globalAlpha = Math.max(0, r.life / r.maxLife) * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      ctx.globalAlpha = Math.max(0, p.life / p.max) * (p.smoke ? 0.6 : 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (p.smoke ? 1 + (1 - p.life / p.max) : p.life / p.max + 0.3), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (i = 0; i < this.texts.length; i++) {
      var t = this.texts[i];
      ctx.globalAlpha = Math.min(1, t.life / t.max * 1.6);
      ctx.font = '700 ' + t.size + 'px Cinzel, Georgia, serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,.75)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  };

  TD.Projectile = Projectile;
  TD.Effects = Effects;
})(window.TD = window.TD || {});
