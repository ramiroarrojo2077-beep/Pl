/* La Forja: mejoras permanentes que se pagan con el oro de las bajas.
 *
 * Cada nivel comprado multiplica las estadísticas de TODAS las torres (o repara
 * la muralla), así que el oro que sueltan los enemigos al morir tiene dos
 * destinos: torres nuevas o una horda que cada vez rinde más.
 */
(function (TD) {
  'use strict';

  var PERKS = [
    {
      key: 'edge', name: 'Filo templado', icon: '⚔',
      desc: '+12 % de daño en todas las torres',
      max: 4, costs: [160, 300, 540, 900], stat: 'damage', step: 0.12
    },
    {
      key: 'sight', name: 'Ojo de halcón', icon: '👁',
      desc: '+8 % de alcance en todas las torres',
      max: 3, costs: [150, 300, 560], stat: 'range', step: 0.08
    },
    {
      key: 'drill', name: 'Instrucción', icon: '⏱',
      desc: '+10 % de cadencia de disparo',
      max: 3, costs: [190, 370, 680], stat: 'rate', step: 0.10
    },
    {
      key: 'loot', name: 'Botín de guerra', icon: '💰',
      desc: '+20 % de oro por cada baja',
      max: 3, costs: [200, 400, 760], stat: 'gold', step: 0.20
    },
    {
      key: 'walls', name: 'Reparar muralla', icon: '🛡',
      desc: 'Devuelve 3 vidas a la fortaleza',
      max: 5, costs: [240, 330, 450, 620, 840], stat: 'lives', step: 3
    }
  ];

  var BY_KEY = {};
  PERKS.forEach(function (p) { BY_KEY[p.key] = p; });

  TD.PERKS = PERKS;
  TD.perk = function (key) { return BY_KEY[key]; };

  /* Coste del siguiente nivel, o null si ya está al máximo. */
  TD.perkCost = function (perk, level) {
    return level >= perk.max ? null : perk.costs[level];
  };

  /* Multiplicadores derivados del estado actual de la Forja. */
  TD.perkMultipliers = function (levels, stamp) {
    var mul = { damage: 1, range: 1, rate: 1, gold: 1, stamp: stamp };
    PERKS.forEach(function (p) {
      var lvl = levels[p.key] || 0;
      if (!lvl || p.stat === 'lives') return;
      mul[p.stat] = 1 + p.step * lvl;
    });
    return mul;
  };
})(window.TD = window.TD || {});
