/* Guion de las oleadas: 20 asaltos escritos a mano + modo infinito. */
(function (TD) {
  'use strict';

  /* g(tipo, cantidad, separación entre unidades, retardo inicial) */
  function g(type, count, gap, delay) {
    return { type: type, count: count, gap: gap || 0.8, delay: delay || 0 };
  }

  var WAVES = [
    [g('goblin', 6, 1.0)],
    [g('goblin', 9, 0.9)],
    [g('goblin', 8, 0.7), g('wolf', 5, 0.5, 5)],
    [g('orc', 6, 1.1), g('goblin', 6, 0.6, 7)],
    [g('wolf', 10, 0.42), g('goblin', 8, 0.6, 6)],
    [g('orc', 8, 0.9), g('goblin', 8, 0.5, 8)],
    [g('wyvern', 6, 1.1), g('goblin', 6, 0.7, 3)],
    [g('knight', 6, 1.2), g('wolf', 8, 0.4, 6)],
    [g('orc', 10, 0.8), g('wolf', 10, 0.35, 5)],
    [g('warlord', 1, 1), g('goblin', 10, 0.5, 3), g('orc', 4, 1, 12)],
    [g('wyvern', 10, 0.8), g('orc', 8, 0.8, 4)],
    [g('knight', 8, 0.9), g('necromancer', 1, 1, 6), g('wolf', 8, 0.35, 9)],
    [g('ogre', 3, 2.4), g('goblin', 12, 0.4, 2), g('wyvern', 4, 1, 10)],
    [g('wolf', 14, 0.3), g('wyvern', 8, 0.7, 5)],
    [g('knight', 10, 0.8), g('necromancer', 2, 2.5, 5)],
    [g('ogre', 4, 2.2), g('orc', 10, 0.7, 3), g('wyvern', 5, 1, 12)],
    [g('wyvern', 14, 0.6), g('necromancer', 3, 2, 6)],
    [g('knight', 12, 0.7), g('ogre', 4, 2.2, 6)],
    [g('orc', 20, 0.45), g('wolf', 12, 0.3, 6), g('necromancer', 2, 2, 10)],
    [g('dragon', 1, 1), g('wyvern', 10, 0.7, 4), g('ogre', 2, 2.5, 10), g('knight', 8, 0.7, 16)]
  ];

  var ENDLESS_POOL = [
    [g('orc', 16, 0.5), g('wolf', 14, 0.3, 4)],
    [g('knight', 14, 0.6), g('necromancer', 3, 2, 8)],
    [g('wyvern', 16, 0.5), g('ogre', 3, 2, 6)],
    [g('ogre', 6, 1.8), g('orc', 14, 0.5, 4)],
    [g('dragon', 1, 1), g('wyvern', 12, 0.55, 5)],
    [g('warlord', 2, 4), g('knight', 12, 0.6, 6)]
  ];

  TD.TOTAL_WAVES = WAVES.length;

  /* Devuelve la definición de la oleada n (1-based), escalada si es infinita. */
  /* La dificultad sube con la oleada: los primeros asaltos son de tanteo. */
  function scriptedHpMul(n) {
    return n <= 4 ? 1 : Math.pow(1.12, n - 4);
  }

  TD.getWave = function (n) {
    if (n <= WAVES.length) {
      return {
        groups: WAVES[n - 1],
        hpMul: scriptedHpMul(n),
        speedMul: 1,
        endless: false
      };
    }
    var over = n - WAVES.length;
    var groups = ENDLESS_POOL[(over - 1) % ENDLESS_POOL.length];
    return {
      groups: groups,
      hpMul: scriptedHpMul(WAVES.length) * Math.pow(1.16, over),
      speedMul: Math.min(1.5, 1 + over * 0.015),
      endless: true
    };
  };

  /* Resumen agregado para el panel "Próxima oleada". */
  TD.waveSummary = function (n) {
    var wave = TD.getWave(n);
    var totals = {};
    wave.groups.forEach(function (grp) {
      totals[grp.type] = (totals[grp.type] || 0) + grp.count;
    });
    return Object.keys(totals).map(function (key) {
      var type = TD.ENEMY_TYPES[key];
      return { key: key, name: type.name, count: totals[key], color: type.color, boss: !!type.boss };
    });
  };
})(window.TD = window.TD || {});
