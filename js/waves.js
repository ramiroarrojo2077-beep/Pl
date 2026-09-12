/* Guion de oleadas: 20 asaltos escritos a mano y después, oleadas infinitas.
 *
 * A partir de la 21 la composición se genera sola: más enemigos, más vida y un
 * jefe cada cinco oleadas. El oro que sueltan crece con ellas para que las
 * construcciones de grado alto lleguen a ser asequibles.
 */
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

  /* Tropa disponible según lo avanzada que esté la partida. */
  var ROSTER = [
    { type: 'goblin', from: 1, weight: 3, gap: 0.42 },
    { type: 'wolf', from: 3, weight: 3, gap: 0.3 },
    { type: 'orc', from: 4, weight: 3, gap: 0.5 },
    { type: 'wyvern', from: 7, weight: 2, gap: 0.55 },
    { type: 'knight', from: 8, weight: 2.5, gap: 0.6 },
    { type: 'necromancer', from: 12, weight: 0.7, gap: 2.0 },
    { type: 'ogre', from: 13, weight: 1.2, gap: 1.8 }
  ];

  TD.TOTAL_WAVES = WAVES.length;

  /* La dificultad sube con la oleada; los primeros asaltos son de tanteo. */
  function hpMul(n) {
    if (n <= 4) return 1;
    /* Crecimiento exponencial y, pasada la treintena, un empujón extra: en el
       modo infinito la horda tiene que terminar comiéndose cualquier defensa. */
    return Math.pow(1.12, n - 4) * (1 + Math.max(0, n - 30) * 0.025);
  }

  /* El oro también crece: sin eso, los edificios de grado alto serían inalcanzables. */
  TD.waveGoldMul = function (n) {
    return 1 + 0.09 * n + 0.0016 * n * n;
  };

  TD.waveHpMul = hpMul;

  function generated(n) {
    var rnd = TD.rng(n * 7919);
    var pool = ROSTER.filter(function (r) { return n >= r.from; });
    var budget = 16 + (n - 20) * 1.05;
    var groups = [];
    var families = 3 + Math.floor(rnd() * 2);

    var total = pool.reduce(function (a, r) { return a + r.weight; }, 0);
    for (var i = 0; i < families; i++) {
      var roll = rnd() * total;
      var chosen = pool[0];
      for (var j = 0; j < pool.length; j++) {
        roll -= pool[j].weight;
        if (roll <= 0) { chosen = pool[j]; break; }
      }
      var share = budget * (0.22 + rnd() * 0.3);
      var count = Math.max(2, Math.round(share / (chosen.type === 'ogre' ? 3 : 1)));
      groups.push(g(chosen.type, count, chosen.gap, i * (2 + rnd() * 4)));
    }

    /* Un jefe cada cinco oleadas, y más de uno cuando la cosa se pone seria. */
    if (n % 5 === 0) {
      var bosses = 1 + Math.floor((n - 20) / 25);
      groups.unshift(g(n % 10 === 0 ? 'dragon' : 'warlord', bosses, 3.5, 1));
    }
    return groups;
  }

  TD.getWave = function (n) {
    return {
      groups: n <= WAVES.length ? WAVES[n - 1] : generated(n),
      hpMul: hpMul(n),
      speedMul: Math.min(1.45, 1 + Math.max(0, n - 20) * 0.008),
      scripted: n <= WAVES.length
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
