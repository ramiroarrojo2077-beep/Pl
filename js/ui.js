/* Panel lateral, tienda, Forja, atajos de teclado y superposiciones. */
(function (TD) {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function UI(game) {
    this.game = game;
    this.el = {
      gold: $('stat-gold'), lives: $('stat-lives'), wave: $('stat-wave'), score: $('stat-score'),
      shop: $('shop'), selection: $('selection'), selectionBlock: $('selection-block'),
      forge: $('forge'), killGold: $('kill-gold'),
      nextWave: $('next-wave'), log: $('log'), overlay: $('overlay'),
      btnWave: $('btn-wave'), btnPause: $('btn-pause'), btnSpeed: $('btn-speed'),
      btnSound: $('btn-sound'), btnRestart: $('btn-restart'), waveTimer: $('wave-timer'),
      banner: $('banner'), hurt: $('hurt'), pauseVeil: $('pause-veil')
    };
    this.cache = {};
    this.bannerText = document.createElement('span');
    this.el.banner.appendChild(this.bannerText);

    this.buildShop();
    this.buildForge();
    this.bindButtons();
    this.bindKeys();
    this.renderNextWave();
  }

  /* Icono renderizado con el propio modelo 3D. */
  UI.prototype.iconFor = function (modelName) {
    var img = document.createElement('img');
    img.className = 'icon3d';
    img.alt = '';
    var url = this.game.view.icon(modelName, 96);
    if (url) img.src = url;
    return img;
  };

  /* ------------------------------------------------------------------ */
  /* Tienda: 100 construcciones repartidas en pestañas por familia        */
  /* ------------------------------------------------------------------ */

  UI.prototype.buildShop = function () {
    var self = this;
    var g = this.game;
    this.el.shop.innerHTML = '';

    var tabs = document.createElement('div');
    tabs.className = 'fam-tabs';
    this.famTabs = {};
    TD.FAMILIES.forEach(function (fam) {
      var tab = document.createElement('button');
      tab.className = 'fam-tab';
      tab.type = 'button';
      tab.title = fam.name + ' — ' + fam.desc;
      tab.innerHTML = '<span>' + fam.icon + '</span>' + fam.name;
      tab.addEventListener('click', function () {
        g.shopFamily = fam.id;
        self.renderFamily();
      });
      tabs.appendChild(tab);
      self.famTabs[fam.id] = tab;
    });
    this.el.shop.appendChild(tabs);

    this.famList = document.createElement('div');
    this.famList.className = 'fam-list';
    this.el.shop.appendChild(this.famList);

    this.iconCache = {};
    this.renderFamily();
  };

  /* Los iconos 3D se generan la primera vez que se abre cada pestaña. */
  UI.prototype.iconFor = function (modelName) {
    var img = document.createElement('img');
    img.className = 'icon3d';
    img.alt = '';
    var url = this.iconCache[modelName];
    if (!url) {
      url = this.game.view.icon(modelName, 96);
      this.iconCache[modelName] = url;
    }
    if (url) img.src = url;
    return img;
  };

  UI.prototype.renderFamily = function () {
    var self = this;
    var g = this.game;
    var fam = TD.FAMILIES.filter(function (f) { return f.id === g.shopFamily; })[0];

    for (var id in this.famTabs) {
      this.famTabs[id].classList.toggle('on', id === fam.id);
    }

    this.famList.innerHTML = '';
    this.cards = {};
    fam.keys.forEach(function (key, i) {
      var type = TD.TOWER_TYPES[key];
      var card = document.createElement('button');
      card.className = 'card';
      card.type = 'button';
      card.dataset.key = key;
      card.appendChild(self.iconFor(type.model));

      var info = document.createElement('div');
      info.innerHTML =
        '<div class="card-name">' +
          (i < 9 ? '<span class="card-key">' + (i + 1) + '</span>' : '') +
          type.name + ' <span class="card-tier">·&nbsp;grado&nbsp;' + type.tier + '</span></div>' +
        '<div class="card-desc"></div>';
      card.appendChild(info);
      card.querySelector('.card-desc').textContent = self.summaryOf(type);

      var cost = document.createElement('div');
      cost.className = 'card-cost';
      card.appendChild(cost);

      card.addEventListener('click', function () {
        TD.Audio.resume();
        if (!g.isUnlocked(type)) { TD.Audio.denied(); return; }
        g.setBuildType(g.buildType === key ? null : key);
      });
      self.famList.appendChild(card);
      self.cards[key] = { el: card, cost: cost, type: type };
    });
    this.refreshShop();
  };

  /* Una línea con lo que de verdad distingue a cada construcción. */
  UI.prototype.summaryOf = function (type) {
    var st = type.levels[0];
    switch (type.kind) {
      case 'econ': return 'Renta de ' + TD.num(st.income) + ' oro por oleada';
      case 'aura': return '+' + Math.round(st.auraDamage * 100) + ' % daño y +' +
        Math.round(st.auraRate * 100) + ' % cadencia en ' + Math.round(st.range) + ' de radio';
      case 'slowfield': return 'Ralentiza un ' + Math.round(st.fieldSlow * 100) + ' % en ' +
        Math.round(st.range) + ' de radio';
      case 'loot': return '+' + Math.round(st.lootBonus * 100) + ' % de oro en las bajas cercanas';
      case 'flame': return TD.num(st.damage) + ' daño/s · quema ' + TD.num(st.burn) + '/s';
      case 'chain': return TD.num(st.damage) + ' daño · salta a ' + st.jumps + ' enemigos';
      case 'poison': return TD.num(st.damage) + ' + veneno ' + TD.num(st.poison) + '/s en área';
      case 'multi': return TD.num(st.damage) + ' daño a ' + st.targets + ' objetivos a la vez';
      case 'bolt': return TD.num(st.damage) + ' daño · atraviesa ' + st.pierce;
      case 'rock': return TD.num(st.damage) + ' daño en área de ' + st.splash;
      case 'frost': return TD.num(st.damage) + ' en área · ralentiza ' + Math.round(st.slow * 100) + ' %';
      case 'sniper': return TD.num(st.damage) + ' daño · alcance ' + Math.round(st.range);
      default: return TD.num(st.damage) + ' daño · ' + st.rate.toFixed(2) + '/s';
    }
  };

  UI.prototype.refreshShop = function () {
    var g = this.game;
    for (var key in this.cards) {
      var card = this.cards[key];
      var type = card.type;
      var unlocked = g.isUnlocked(type);
      card.el.classList.toggle('selected', g.buildType === key);
      card.el.classList.toggle('poor', unlocked && g.gold < type.cost);
      card.el.classList.toggle('locked', !unlocked);
      var label = unlocked ? TD.num(type.cost) + ' ◍' : 'Oleada ' + type.unlockWave;
      if (card.cost.textContent !== label) card.cost.textContent = label;
    }
    /* Marca las pestañas que tienen algo nuevo que ofrecer. */
    for (var id in this.famTabs) {
      var fam = TD.FAMILIES.filter(function (f) { return f.id === id; })[0];
      var affordable = fam.keys.some(function (k) {
        var t = TD.TOWER_TYPES[k];
        return g.isUnlocked(t) && g.gold >= t.cost;
      });
      this.famTabs[id].classList.toggle('ready', affordable);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Forja                                                               */
  /* ------------------------------------------------------------------ */

  UI.prototype.buildForge = function () {
    var self = this;
    this.el.forge.innerHTML = '';
    this.perkButtons = {};
    TD.PERKS.forEach(function (perk) {
      var btn = document.createElement('button');
      btn.className = 'perk';
      btn.type = 'button';
      btn.innerHTML =
        '<span class="perk-ico">' + perk.icon + '</span>' +
        '<span><span class="perk-name">' + perk.name +
        '<span class="pips"></span></span>' +
        '<span class="perk-desc">' + perk.desc + '</span></span>' +
        '<span class="perk-cost"></span>';
      btn.addEventListener('click', function () {
        TD.Audio.resume();
        self.game.buyPerk(perk.key);
        self.refreshForge();
      });
      self.el.forge.appendChild(btn);
      self.perkButtons[perk.key] = btn;
    });
    this.refreshForge();
  };

  UI.prototype.refreshForge = function () {
    var g = this.game;
    TD.PERKS.forEach(function (perk) {
      var btn = this.perkButtons[perk.key];
      var level = g.perkLevel(perk.key);
      var cost = TD.perkCost(perk, level);
      var pips = btn.querySelector('.pips');
      if (pips.childElementCount !== perk.max) {
        pips.innerHTML = new Array(perk.max + 1).join('<i class="pip"></i>');
      }
      for (var i = 0; i < perk.max; i++) {
        pips.children[i].className = 'pip' + (i < level ? ' on' : '');
      }
      btn.querySelector('.perk-cost').textContent = cost === null ? 'máx.' : cost + ' ◍';
      btn.disabled = cost === null || g.gold < cost;
      btn.classList.toggle('maxed', cost === null);
    }, this);
  };

  /* ------------------------------------------------------------------ */
  /* Botones y teclado                                                   */
  /* ------------------------------------------------------------------ */

  UI.prototype.bindButtons = function () {
    var self = this;
    var g = this.game;

    this.el.btnWave.addEventListener('click', function () {
      TD.Audio.resume();
      if (g.state === 'prep') g.startWave();
    });
    this.el.btnPause.addEventListener('click', function () { g.togglePause(); });
    this.el.btnSpeed.addEventListener('click', function () { g.cycleSpeed(); });
    this.el.btnSound.addEventListener('click', function () {
      TD.Audio.resume();
      var muted = TD.Audio.toggle();
      self.el.btnSound.textContent = muted ? '🔇' : '🔊';
      self.el.btnSound.classList.toggle('btn-on', !muted);
    });
    this.el.btnRestart.addEventListener('click', function () { self.restart(); });
  };

  UI.prototype.bindKeys = function () {
    var self = this;
    var g = this.game;
    window.addEventListener('keydown', function (ev) {
      if (ev.target && /input|textarea/i.test(ev.target.tagName)) return;
      var k = ev.key.toLowerCase();
      if (ev.key >= '1' && ev.key <= '9') {
        var fam = TD.FAMILIES.filter(function (f) { return f.id === g.shopFamily; })[0];
        var key = fam.keys[parseInt(ev.key, 10) - 1];
        if (key && g.isUnlocked(TD.TOWER_TYPES[key])) {
          TD.Audio.resume();
          g.setBuildType(g.buildType === key ? null : key);
        } else if (key) {
          TD.Audio.denied();
        }
        return;
      }
      switch (k) {
        case 'escape': g.setBuildType(null); g.select(null); break;
        case 'u': g.upgradeSelected(); break;
        case 'x': g.sellSelected(); break;
        case 't': g.cycleTargetMode(); break;
        case 'p': g.togglePause(); break;
        case 'f': g.cycleSpeed(); break;
        case 'm': self.el.btnSound.click(); break;
        case 'q': case 'e': {
          /* Q y E cambian de familia en la tienda. */
          var ids = TD.FAMILIES.map(function (f) { return f.id; });
          var at = ids.indexOf(g.shopFamily);
          g.shopFamily = ids[(at + (k === 'e' ? 1 : ids.length - 1)) % ids.length];
          self.renderFamily();
          break;
        }
        case ' ':
          ev.preventDefault();
          TD.Audio.resume();
          if (g.state === 'prep') g.startWave();
          else g.togglePause();
          break;
      }
    });
  };

  UI.prototype.restart = function () {
    var g = this.game;
    g.reset();
    g.setBuildType(null);
    g.select(null);
    this.el.log.innerHTML = '';
    this.refreshForge();
    this.showMenu();
  };

  /* ------------------------------------------------------------------ */
  /* Estado visible                                                      */
  /* ------------------------------------------------------------------ */

  UI.prototype.setStat = function (name, value, bad) {
    if (this.cache[name] === value) return;
    var prev = this.cache[name];
    this.cache[name] = value;
    var el = this.el[name];
    el.textContent = value;
    if (prev === undefined) return;
    var box = el.parentElement;
    box.classList.remove('flash', 'flash-bad');
    void box.offsetWidth;
    box.classList.add(bad ? 'flash-bad' : 'flash');
  };

  UI.prototype.update = function () {
    var g = this.game;

    this.setStat('gold', TD.num(g.gold));
    this.setStat('lives', String(g.lives), true);
    this.setStat('wave', g.wave + ' / ∞');
    this.setStat('score', TD.num(g.score));

    if (this.cache.killGold !== g.killGold) {
      this.cache.killGold = g.killGold;
      this.el.killGold.textContent = TD.num(g.killGold) + ' ◍';
    }

    var label, disabled = false;
    if (g.state === 'prep') {
      var bonus = Math.ceil(Math.max(0, g.prepTimer)) * 3;
      label = bonus > 0 ? 'Iniciar oleada (+' + bonus + ' ◍)' : 'Iniciar oleada';
    } else if (g.state === 'wave') {
      label = 'Oleada en curso';
      disabled = true;
    } else {
      label = 'Iniciar oleada';
      disabled = true;
    }
    if (this.cache.waveBtn !== label) {
      this.cache.waveBtn = label;
      this.el.btnWave.textContent = label;
    }
    this.el.btnWave.disabled = disabled;

    var timer = '';
    if (g.state === 'prep') timer = 'Asalto en <b>' + Math.ceil(Math.max(0, g.prepTimer)) + 's</b>';
    else if (g.state === 'wave') timer = 'Enemigos en campo: <b>' + (g.enemies.length + g.spawnQueue.length) + '</b>';
    if (this.cache.timer !== timer) {
      this.cache.timer = timer;
      this.el.waveTimer.innerHTML = timer;
    }

    var pauseLabel = g.paused ? 'Reanudar' : 'Pausa';
    if (this.cache.pause !== pauseLabel) {
      this.cache.pause = pauseLabel;
      this.el.btnPause.textContent = pauseLabel;
      this.el.btnPause.classList.toggle('btn-on', g.paused);
      this.el.pauseVeil.hidden = !g.paused;
    }
    var speedLabel = g.speed() + '×';
    if (this.cache.speed !== speedLabel) {
      this.cache.speed = speedLabel;
      this.el.btnSpeed.textContent = speedLabel;
      this.el.btnSpeed.classList.toggle('btn-on', g.speed() > 1);
    }

    /* Cartel de oleada y destello de daño. */
    var b = g.banner;
    if (b) {
      if (this.bannerText.textContent !== b.text) this.bannerText.textContent = b.text;
      this.el.banner.className = 'banner' + (b.good ? ' good' : '');
      this.bannerText.style.opacity = Math.min(1, b.life / 0.6);
      this.bannerText.style.transform = 'translateY(' + (-6 * (1 - Math.min(1, b.life))) + 'px)';
    } else if (this.bannerText.style.opacity !== '0') {
      this.bannerText.style.opacity = '0';
    }
    var hurt = (g.hurtFlash * 0.55).toFixed(2);
    if (this.cache.hurt !== hurt) {
      this.cache.hurt = hurt;
      this.el.hurt.style.opacity = hurt;
    }

    if (this.cache.shopKey !== g.gold + ':' + g.wave + ':' + g.buildType) {
      this.cache.shopKey = g.gold + ':' + g.wave + ':' + g.buildType;
      this.refreshShop();
    }
    this.refreshSelectionButtons();
    if (this.cache.forgeGold !== g.gold || this.cache.forgeStamp !== g.perkStamp) {
      this.cache.forgeGold = g.gold;
      this.cache.forgeStamp = g.perkStamp;
      this.refreshForge();
    }

    var nextKey = g.state + ':' + g.wave;
    if (this.cache.nextKey !== nextKey) {
      this.cache.nextKey = nextKey;
      this.renderNextWave();
    }
  };

  UI.prototype.renderNextWave = function () {
    var g = this.game;
    var n = g.wave + 1;
    var summary = TD.waveSummary(n);
    var unlocks = g.newUnlocks(n);
    this.el.nextWave.innerHTML = '<div class="nw-item" style="border-color:#6b5a3a">Oleada ' + n +
      (n % 10 === 0 ? ' · hito' : '') + '</div>' +
      unlocks.map(function (t) {
        return '<span class="nw-item nw-new">' + t.icon + ' ' + t.name + '</span>';
      }).join('') +
      summary.map(function (s) {
        return '<span class="nw-item' + (s.boss ? ' nw-boss' : '') + '">' +
          '<span class="nw-dot" style="background:' + s.color + '"></span>' +
          s.name + ' ×' + s.count + '</span>';
      }).join('');
  };

  /* ------------------------------------------------------------------ */
  /* Torre seleccionada                                                  */
  /* ------------------------------------------------------------------ */

  UI.prototype.renderSelection = function (tower) {
    if (!tower) {
      this.el.selectionBlock.hidden = true;
      this.el.selection.innerHTML = '';
      this.selEls = null;
      return;
    }
    var st = tower.stats();
    var base = tower.baseStats();
    var nextBase = tower.maxLevel() ? null : tower.type.levels[tower.level + 1];
    var mul = this.game.perkMul;
    var next = null;
    if (nextBase) {
      next = {};
      for (var nk in nextBase) next[nk] = nextBase[nk];
      next.damage = nextBase.damage * mul.damage * (1 + tower.auraDamage);
      next.rate = nextBase.rate * mul.rate * (1 + tower.auraRate);
      next.range = nextBase.range * mul.range;
      if (nextBase.burn) next.burn = nextBase.burn * mul.damage;
      if (nextBase.poison) next.poison = nextBase.poison * mul.damage;
    }
    var mode = TD.TARGET_MODES.filter(function (m) { return m.key === tower.targetMode; })[0];

    function row(label, value, nextValue, suffix) {
      var up = '';
      if (nextValue !== undefined && nextValue !== null && nextValue !== value) {
        up = ' <span class="up">→ ' + nextValue + (suffix || '') + '</span>';
      }
      return '<div class="stat-row"><span>' + label + '</span><span>' + value + (suffix || '') + up + '</span></div>';
    }

    var rows = '';
    if (tower.type.kind === 'econ') {
      rows += row('Renta por oleada', TD.num(st.income), next && TD.num(next.income));
      rows += row('Oro rendido', TD.num(tower.earned), null);
    } else if (tower.type.kind === 'aura') {
      rows += row('Daño a las vecinas', '+' + Math.round(st.auraDamage * 100) + '%',
        next && ('+' + Math.round(next.auraDamage * 100) + '%'));
      rows += row('Cadencia a las vecinas', '+' + Math.round(st.auraRate * 100) + '%',
        next && ('+' + Math.round(next.auraRate * 100) + '%'));
      rows += row('Radio', Math.round(st.range), next && Math.round(next.range));
    } else if (tower.type.kind === 'slowfield') {
      rows += row('Ralentización', Math.round(st.fieldSlow * 100) + '%',
        next && (Math.round(next.fieldSlow * 100) + '%'));
      rows += row('Radio', Math.round(st.range), next && Math.round(next.range));
    } else if (tower.type.kind === 'loot') {
      rows += row('Oro extra en las bajas', '+' + Math.round(st.lootBonus * 100) + '%',
        next && ('+' + Math.round(next.lootBonus * 100) + '%'));
      rows += row('Radio', Math.round(st.range), next && Math.round(next.range));
    } else if (tower.type.kind === 'flame') {
      rows += row('Daño por segundo', Math.round(st.damage), next && Math.round(next.damage));
      rows += row('Quemadura', Math.round(st.burn) + '/s', next && (Math.round(next.burn) + '/s'));
    } else {
      rows += row('Daño', TD.num(st.damage), next && TD.num(next.damage));
      rows += row('Cadencia', st.rate.toFixed(2), next && next.rate.toFixed(2), '/s');
    }
    if (!tower.type.passive) {
      rows += row('Alcance', Math.round(st.range), next && Math.round(next.range));
    }
    if (st.splash) rows += row('Área', Math.round(st.splash), next && Math.round(next.splash));
    if (st.pierce) rows += row('Perforación', st.pierce, next && next.pierce);
    if (st.slow) rows += row('Ralentiza', Math.round(st.slow * 100) + '%', next && (Math.round(next.slow * 100) + '%'));
    if (st.jumps) rows += row('Saltos', st.jumps, next && next.jumps);
    if (st.poison) rows += row('Veneno', TD.num(st.poison) + '/s', next && (TD.num(next.poison) + '/s'));
    if (st.targets) rows += row('Objetivos', st.targets, next && next.targets);
    if (st.shots > 1 || (next && next.shots > 1)) rows += row('Proyectiles', st.shots || 1, next && (next.shots || 1));
    if (tower.auraDamage) {
      rows += '<div class="stat-row"><span>Bono de mando</span><span class="up">+' +
        Math.round(tower.auraDamage * 100) + '% daño</span></div>';
    }
    if (st.damage !== base.damage) {
      rows += '<div class="stat-row"><span>Bonos de la Forja</span><span class="up">+' +
        Math.round((st.damage / base.damage - 1) * 100) + '% daño</span></div>';
    }
    rows += row('Bajas', tower.kills, null);
    rows += row('Daño total', TD.num(tower.dealt), null);

    var upCost = tower.upgradeCost();
    this.el.selection.innerHTML =
      '<div class="sel-head"><span class="sel-icon"></span><div>' +
        '<div class="sel-name">' + tower.type.name + '</div>' +
        '<div class="sel-lvl">' + tower.type.familyName + ' · grado ' + tower.type.tier +
        ' · nivel ' + (tower.level + 1) + '/' + tower.type.levels.length +
        (tower.type.passive ? '' : ' · ' + (tower.type.canHitAir ? 'tierra y aire' : 'sólo tierra')) +
        '</div>' +
      '</div></div>' +
      rows +
      '<div class="sel-actions">' +
        '<button class="btn" id="sel-upgrade">' + (upCost === null ? 'Nivel máximo' : 'Mejorar ' + upCost + ' ◍') + '</button>' +
        (tower.type.passive ? '' :
          '<button class="btn" id="sel-target" title="Cambiar prioridad (T)">' + mode.name + '</button>') +
        '<button class="btn btn-danger" id="sel-sell">Vender ' + tower.sellValue() + ' ◍</button>' +
      '</div>';

    this.el.selection.querySelector('.sel-icon').replaceWith(this.iconFor(tower.type.model));

    var g = this.game;
    var upBtn = $('sel-upgrade');
    upBtn.addEventListener('click', function () { g.upgradeSelected(); });
    $('sel-sell').addEventListener('click', function () { g.sellSelected(); });
    var targetBtn = $('sel-target');
    if (targetBtn) targetBtn.addEventListener('click', function () { g.cycleTargetMode(); });

    this.selEls = { upgrade: upBtn, cost: upCost };
    this.el.selectionBlock.hidden = false;
    this.refreshSelectionButtons();
  };

  UI.prototype.refreshSelectionButtons = function () {
    if (!this.selEls) return;
    var cost = this.selEls.cost;
    this.selEls.upgrade.disabled = cost === null || this.game.gold < cost;
  };

  /* ------------------------------------------------------------------ */
  /* Crónica y superposiciones                                           */
  /* ------------------------------------------------------------------ */

  UI.prototype.addLog = function (msg, cls) {
    var li = document.createElement('li');
    li.textContent = msg;
    if (cls) li.className = cls;
    this.el.log.insertBefore(li, this.el.log.firstChild);
    while (this.el.log.children.length > 8) this.el.log.removeChild(this.el.log.lastChild);
  };

  UI.prototype.hideOverlay = function () { this.el.overlay.hidden = true; };

  UI.prototype.showOverlay = function (cfg) {
    var card = this.el.overlay.querySelector('.overlay-card');
    card.innerHTML =
      '<h2>' + cfg.title + '</h2>' +
      '<p>' + cfg.text + '</p>' +
      (cfg.stats ? '<div class="ov-stats">' + cfg.stats + '</div>' : '') +
      (cfg.tips ? '<ul class="tips">' + cfg.tips + '</ul>' : '') +
      '<div class="ov-actions"></div>';
    var actions = card.querySelector('.ov-actions');
    cfg.buttons.forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = 'btn btn-big' + (b.primary ? ' btn-primary' : '');
      btn.textContent = b.label;
      btn.addEventListener('click', b.onClick);
      actions.appendChild(btn);
    });
    this.el.overlay.hidden = false;
  };

  UI.prototype.showMenu = function () {
    var self = this;
    var g = this.game;
    var best = 0, bestWave = 0;
    try {
      best = parseInt(localStorage.getItem('rocanegra.best') || '0', 10) || 0;
      bestWave = parseInt(localStorage.getItem('rocanegra.bestWave') || '0', 10) || 0;
    } catch (e) { best = bestWave = 0; }
    this.showOverlay({
      title: 'Murallas de Rocanegra',
      text: 'Las hordas del Yermo no dejan de llegar: las oleadas son <strong>infinitas</strong> ' +
            'y la partida solo acaba cuando cae la fortaleza. Levanta construcciones junto al ' +
            'camino —hay <strong>' + TD.BUILDING_COUNT + '</strong>, y se van desbloqueando— y ' +
            'funde el oro de las bajas en la <strong>Forja</strong>.' +
            (bestWave ? ' Tu récord: <strong>oleada ' + bestWave + '</strong> (' + TD.num(best) + ' puntos).' : ''),
      tips: '<li><b>1–9</b> elige construcción · <b>Q</b>/<b>E</b> cambia de familia · <b>clic</b> construye</li>' +
            '<li><b>U</b> mejorar · <b>X</b> vender · <b>T</b> prioridad de objetivo · <b>Esc</b> cancela</li>' +
            '<li><b>Espacio</b> adelantar oleada · <b>P</b> pausa · <b>F</b> velocidad</li>' +
            '<li>Las <b>catapultas</b> no alcanzan a los voladores; <b>escarcha</b>, <b>fuego</b>, <b>ponzoña</b> y <b>tormenta</b> ignoran la armadura</li>',
      buttons: [{
        label: 'A las almenas', primary: true,
        onClick: function () {
          TD.Audio.resume();
          self.hideOverlay();
          g.begin();
        }
      }]
    });
  };

  UI.prototype.showEnd = function (victory, g) {
    var self = this;
    var record = g.wave >= g.bestWaveEver;
    var stats =
      '<div>Oleadas<b>' + g.wave + '</b></div>' +
      '<div>Bajas<b>' + TD.num(g.kills) + '</b></div>' +
      '<div>Construcciones<b>' + g.towers.length + '</b></div>' +
      '<div>Oro de bajas<b>' + TD.num(g.killGold) + '</b></div>' +
      '<div>Puntuación<b>' + TD.num(g.score) + '</b></div>' +
      '<div>Récord<b>oleada ' + g.bestWaveEver + '</b></div>';

    this.showOverlay({
      title: 'La fortaleza ha caído',
      text: 'El portón cede en la <strong>oleada ' + g.wave + '</strong> y la horda inunda el ' +
            'patio de armas.' + (record ? ' Aun así, nadie había aguantado tanto.' : ''),
      stats: stats,
      buttons: [{
        label: 'Nuevo asedio', primary: true,
        onClick: function () { self.restart(); }
      }]
    });
  };

  TD.UI = UI;
})(window.TD = window.TD || {});
