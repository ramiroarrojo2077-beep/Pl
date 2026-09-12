/* Arranque: carga los modelos, conecta motor e interfaz y mantiene el bucle. */
(function (TD) {
  'use strict';

  window.addEventListener('DOMContentLoaded', function () {
    var canvas = document.getElementById('game');
    var ui = null;

    var game = new TD.Game(canvas, {
      onStats: function () { if (ui) ui.update(); },
      onLog: function (msg, cls) { if (ui) ui.addLog(msg, cls); },
      onSelect: function (tower) { if (ui) ui.renderSelection(tower); },
      onBuildType: function () { if (ui) ui.refreshShop(); },
      onFinish: function (victory, g) { if (ui) ui.showEnd(victory, g); }
    });

    game.view.attachTextLayer(document.getElementById('fx'));

    game.load(function () {
      ui = new TD.UI(game);
      ui.showMenu();
      ui.update();
      game.resize();

      var last = performance.now();
      function frame(now) {
        var dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        game.step(dt);
        game.draw(dt);
        ui.update();
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });

    /* Expuesto para depuración desde la consola del navegador. */
    TD.game = game;
    TD.ui = function () { return ui; };
  });
})(window.TD = window.TD || {});
