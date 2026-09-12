/* Panel lateral, tienda, atajos de teclado y superposiciones. */
(function (TD) {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function UI(game) {
    this.game = game;
    this.el = {
      gold: $('stat-gold'), lives: $('stat-lives'), wave: $('stat-wave'), score: $('stat-score'),
      shop: $('shop'), selection: $('selection'), selectionBlock: $('selection-block'),
      nextWave: $('next-wave'), log: $('log'), overlay: $('overlay'),
      btnWave: $('btn-wave'), btnPause: $('btn-pause'), btnSpeed: $('btn-speed'),
      btnSound: $('btn-sound'), btnRestart: $('btn-restart'), waveTimer: $('wave-timer')
    };
    this.cache = {};
    this.buildShop();
    this.bindButtons();
    this.bindKeys();
    this.renderNextWave();
  }

  /* ------------------------------------------------------------------ */
  /* Tienda                                                              */
  /* ------------------------------------------------------------------ */

  UI.prototype.buildShop = function () {
    var self = this;
    this.el.shop.innerHTML = '';
    this.cards = {};
    TD.TOWER_ORDER.forEach(function (key) {
      var type = TD.TOWER_TYPES[key];
      var card = document.createElement('button');
      card.className = 'card';
      card.type = 'button';
      card.dataset.key = key;

      var icon = TD.towerIcon(key, 0, 44);
      icon.style.width = '44px';
      icon.style.height = '44px';
      card.appendChild(icon);

      var info = document.createElement('div');
      info.innerHTML = '<div class="card-name"><span class="card-key">' + type.hotkey + '</span>' +
        type.name + '</div><div class="card-desc">' + type.desc + '</div>';
      card.appendChild(info);

      var cost = document.createElement('div');
      cost.className = 'card-cost';
      cost.textContent = type.cost + ' ◍';
      card.appendChild(cost);

      card.addEventListener('click', function () {
        TD.Audio.resume();
        self.game.setBuildType(self.game.buildType === key ? null : key);
      });
      self.el.shop.appendChild(card);
      self.cards[key] = card;
    });
  };

  UI.prototype.refreshShop = function () {
    var g = this.game;
    for (var key in this.cards) {
      var card = this.cards[key];
      card.classList.toggle('selected', g.buildType === key);
      card.classList.toggle('poor', g.gold < TD.TOWER_TYPES[key].cost);
    }
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
      if (ev.key >= '1' && ev.key <= '5') {
        var key = TD.TOWER_ORDER[parseInt(ev.key, 10) - 1];
        if (key) { TD.Audio.resume(); g.setBuildType(g.buildType === key ? null : key); }
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
    this.setStat('wave', g.wave + '/' + (g.endless ? '∞' : TD.TOTAL_WAVES));
    this.setStat('score', TD.num(g.score));

    /* Botón de oleada. */
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

    /* Marcador de tiempo / enemigos. */
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
    }
    var speedLabel = g.speed() + '×';
    if (this.cache.speed !== speedLabel) {
      this.cache.speed = speedLabel;
      this.el.btnSpeed.textContent = speedLabel;
      this.el.btnSpeed.classList.toggle('btn-on', g.speed() > 1);
    }

    this.refreshShop();
    this.refreshSelectionButtons();

    var nextKey = g.state + ':' + g.wave + ':' + g.endless;
    if (this.cache.nextKey !== nextKey) {
      this.cache.nextKey = nextKey;
      this.renderNextWave();
    }
  };

  UI.prototype.renderNextWave = function () {
    var g = this.game;
    var n = g.state === 'wave' ? g.wave + 1 : g.wave + 1;
    if (!g.endless && n > TD.TOTAL_WAVES) {
      this.el.nextWave.innerHTML = '<div class="nw-item">Última oleada del asedio</div>';
      return;
    }
    var summary = TD.waveSummary(n);
    this.el.nextWave.innerHTML = '<div class="nw-item" style="border-color:#6b5a3a">Oleada ' + n + '</div>' +
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
    var next = tower.maxLevel() ? null : tower.type.levels[tower.level + 1];
    var mode = TD.TARGET_MODES.filter(function (m) { return m.key === tower.targetMode; })[0];

    function row(label, value, nextValue, suffix) {
      var up = '';
      if (nextValue !== undefined && nextValue !== null && nextValue !== value) {
        up = ' <span class="up">→ ' + nextValue + (suffix || '') + '</span>';
      }
      return '<div class="stat-row"><span>' + label + '</span><span>' + value + (suffix || '') + up + '</span></div>';
    }

    var rows = '';
    if (tower.type.kind === 'flame') {
      rows += row('Daño por segundo', st.damage, next && next.damage);
      rows += row('Quemadura', st.burn + '/s', next && (next.burn + '/s'));
    } else {
      rows += row('Daño', st.damage, next && next.damage);
      rows += row('Cadencia', st.rate.toFixed(2), next && next.rate.toFixed(2), '/s');
    }
    rows += row('Alcance', Math.round(st.range), next && Math.round(next.range));
    if (st.splash) rows += row('Área', Math.round(st.splash), next && Math.round(next.splash));
    if (st.pierce) rows += row('Perforación', st.pierce, next && next.pierce);
    if (st.slow) rows += row('Ralentiza', Math.round(st.slow * 100) + '%', next && (Math.round(next.slow * 100) + '%'));
    if (st.shots > 1 || (next && next.shots > 1)) rows += row('Proyectiles', st.shots || 1, next && (next.shots || 1));
    rows += row('Bajas', tower.kills, null);
    rows += row('Daño total', TD.num(tower.dealt), null);

    var upCost = tower.upgradeCost();
    this.el.selection.innerHTML =
      '<div class="sel-head"><span class="sel-icon"></span><div>' +
        '<div class="sel-name">' + tower.type.name + '</div>' +
        '<div class="sel-lvl">Nivel ' + (tower.level + 1) + ' / ' + tower.type.levels.length +
        ' · ' + (tower.type.canHitAir ? 'tierra y aire' : 'sólo tierra') + '</div>' +
      '</div></div>' +
      rows +
      '<div class="sel-actions">' +
        '<button class="btn" id="sel-upgrade">' + (upCost === null ? 'Nivel máximo' : 'Mejorar ' + upCost + ' ◍') + '</button>' +
        '<button class="btn" id="sel-target" title="Cambiar prioridad (T)">' + mode.name + '</button>' +
        '<button class="btn btn-danger" id="sel-sell">Vender ' + tower.sellValue() + ' ◍</button>' +
      '</div>';

    var icon = TD.towerIcon(tower.type.key, tower.level, 44);
    this.el.selection.querySelector('.sel-icon').replaceWith(icon);

    var g = this.game;
    var upBtn = $('sel-upgrade');
    upBtn.addEventListener('click', function () { g.upgradeSelected(); });
    $('sel-sell').addEventListener('click', function () { g.sellSelected(); });
    $('sel-target').addEventListener('click', function () { g.cycleTargetMode(); });

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
    var best = 0;
    try { best = parseInt(localStorage.getItem('rocanegra.best') || '0', 10) || 0; } catch (e) { best = 0; }
    this.showOverlay({
      title: 'Murallas de Rocanegra',
      text: 'Las hordas del Yermo marchan hacia la fortaleza. Levanta torres junto al camino, ' +
            'mejóralas entre asaltos y resiste <strong>' + TD.TOTAL_WAVES + ' oleadas</strong>.' +
            (best ? ' Mejor puntuación: <strong>' + TD.num(best) + '</strong>.' : ''),
      tips: '<li><b>1–5</b> elige torre · <b>clic</b> construye · <b>Esc</b> cancela</li>' +
            '<li><b>U</b> mejorar · <b>X</b> vender · <b>T</b> prioridad de objetivo</li>' +
            '<li><b>Espacio</b> adelantar oleada · <b>P</b> pausa · <b>F</b> velocidad</li>' +
            '<li>Las <b>catapultas</b> no alcanzan a los voladores; la <b>escarcha</b> ignora la armadura</li>',
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
    var stats =
      '<div>Oleadas<b>' + g.wave + '</b></div>' +
      '<div>Bajas<b>' + TD.num(g.kills) + '</b></div>' +
      '<div>Puntuación<b>' + TD.num(g.score) + '</b></div>' +
      '<div>Récord<b>' + TD.num(g.best) + '</b></div>';

    var buttons = [{
      label: 'Nuevo asedio', primary: true,
      onClick: function () { self.restart(); }
    }];
    if (victory) {
      buttons.unshift({
        label: 'Modo infinito', primary: true,
        onClick: function () { self.hideOverlay(); g.continueEndless(); }
      });
      buttons[1].primary = false;
    }

    this.showOverlay({
      title: victory ? '¡Rocanegra resiste!' : 'La fortaleza ha caído',
      text: victory
        ? 'El último dragón se desploma sobre el camino y los cuervos callan. El estandarte sigue en pie.'
        : 'El portón cede y la horda inunda el patio de armas. Rocanegra arde.',
      stats: stats,
      buttons: buttons
    });
  };

  TD.UI = UI;
})(window.TD = window.TD || {});
