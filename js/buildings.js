/* Catálogo de construcciones: 100 edificios repartidos en 13 familias.
 *
 * Cada familia define su comportamiento (proyectil, área, aura, economía…) y
 * una progresión de niveles tecnológicos; de ahí salen las 100 entradas con sus
 * costes, estadísticas y oleada de desbloqueo. Este fichero es la única fuente
 * de verdad: tools/export_building_specs.js lo lee para que Blender modele un
 * edificio distinto por clave.
 */
(function (TD) {
  'use strict';

  /* Multiplicadores de los tres niveles de mejora de cada edificio. */
  var LEVEL = {
    damage: [1, 1.68, 2.7],
    rate: [1, 1.1, 1.22],
    range: [1, 1.08, 1.17],
    cost: [1, 0.85, 1.5]
  };

  var FAMILIES = [
    {
      id: 'arq', name: 'Arquería', icon: '🏹', kind: 'arrow',
      damageType: 'physical', canHitAir: true, projSpeed: 580,
      desc: 'Saetas rápidas y baratas. Alcanza tierra y aire.',
      shape: { body: 'round', roof: 'cone', palette: 'stone', figure: 'archer' },
      unlock0: 1, unlockStep: 4,
      cost0: 70, costMul: 1.82, damage0: 12, damageMul: 1.95,
      rate0: 1.4, rateMul: 1.035, range0: 120, rangeMul: 1.05,
      extra: { shots: 1 },
      tiers: ['Puesto de Arqueros', 'Torre de Arqueros', 'Torre de Ballesteros',
              'Nido de Saeteros', 'Torre de Arqueros Élficos', 'Atalaya de Tiradores',
              'Torre de Arqueros Reales', 'Bastión de Saeteros',
              'Torre de Arqueros de Rocanegra', 'Torre del Arquero Legendario']
    },
    {
      id: 'bal', name: 'Balistas', icon: '🎯', kind: 'bolt',
      damageType: 'physical', canHitAir: true, projSpeed: 800,
      desc: 'Virote perforante de largo alcance que atraviesa varios enemigos.',
      shape: { body: 'frame', roof: 'none', palette: 'wood', figure: 'ballista' },
      unlock0: 2, unlockStep: 5,
      cost0: 150, costMul: 1.88, damage0: 55, damageMul: 2.0,
      rate0: 0.55, rateMul: 1.03, range0: 190, rangeMul: 1.05,
      extra: { pierce: [2, 3, 4] },
      tiers: ['Ballesta ligera', 'Ballesta de asedio', 'Escorpión', 'Balista pesada',
              'Polibolos', 'Balista de hierro', 'Balista Real', 'Gran Balista de Rocanegra']
    },
    {
      id: 'sie', name: 'Asedio', icon: '🪨', kind: 'rock',
      damageType: 'physical', canHitAir: false, projSpeed: 320,
      desc: 'Proyectil pesado con gran daño en área. No alcanza a los voladores.',
      shape: { body: 'platform', roof: 'none', palette: 'wood', figure: 'catapult' },
      unlock0: 3, unlockStep: 4,
      cost0: 200, costMul: 1.85, damage0: 72, damageMul: 2.05,
      rate0: 0.4, rateMul: 1.03, range0: 172, rangeMul: 1.05,
      extra: { splash: 58, splashMul: 1.06 },
      tiers: ['Onagro', 'Catapulta', 'Catapulta reforzada', 'Trabuquete',
              'Trabuquete pesado', 'Mortero de piedra', 'Mortero de hierro',
              'Bombarda', 'Gran Bombarda', 'Coloso de Asedio']
    },
    {
      id: 'esc', name: 'Escarcha', icon: '❄', kind: 'frost',
      damageType: 'magic', canHitAir: true, projSpeed: 420,
      desc: 'Daño mágico en área que ralentiza a la horda. Ignora la armadura.',
      shape: { body: 'round', roof: 'spire', palette: 'ice', figure: 'orb' },
      unlock0: 2, unlockStep: 5,
      cost0: 120, costMul: 1.86, damage0: 11, damageMul: 1.96,
      rate0: 0.9, rateMul: 1.03, range0: 112, rangeMul: 1.05,
      extra: { splash: 46, splashMul: 1.07, slow: [0.35, 0.45, 0.55], slowTime: 2 },
      tiers: ['Altar de escarcha', 'Torre de Escarcha', 'Obelisco helado',
              'Torre de ventisca', 'Cúpula glacial', 'Corazón de invierno',
              'Trono de hielo', 'Cima del Invierno Eterno']
    },
    {
      id: 'fue', name: 'Fuego', icon: '🔥', kind: 'flame',
      damageType: 'magic', canHitAir: true,
      desc: 'Llamarada continua que prende a los enemigos. Corto alcance.',
      shape: { body: 'square', roof: 'brazier', palette: 'ember', figure: 'flame' },
      unlock0: 3, unlockStep: 5,
      cost0: 140, costMul: 1.87, damage0: 26, damageMul: 1.97,
      rate0: 1, rateMul: 1, range0: 100, rangeMul: 1.05,
      extra: { burn: 12, burnMul: 1.95, burnTime: 3 },
      tiers: ['Brasero de guerra', 'Pira arcana', 'Torre de fuego', 'Horno rúnico',
              'Columna ardiente', 'Fragua de dragón', 'Faro de llamas', 'Pira del Fénix']
    },
    {
      id: 'tor', name: 'Tormenta', icon: '⚡', kind: 'chain',
      damageType: 'magic', canHitAir: true,
      desc: 'Descarga que salta entre varios enemigos perdiendo fuerza.',
      shape: { body: 'obelisk', roof: 'spire', palette: 'storm', figure: 'orb' },
      unlock0: 6, unlockStep: 5,
      cost0: 210, costMul: 1.9, damage0: 34, damageMul: 1.98,
      rate0: 0.8, rateMul: 1.04, range0: 138, rangeMul: 1.05,
      extra: { jumps: [3, 4, 5], chainFalloff: 0.72 },
      tiers: ['Pararrayos', 'Torre de chispas', 'Obelisco de tormenta',
              'Torre de rayos', 'Aguja eléctrica', 'Yunque de trueno',
              'Corona de tormenta', 'Trono del Trueno']
    },
    {
      id: 'ven', name: 'Ponzoña', icon: '☠', kind: 'poison',
      damageType: 'magic', canHitAir: true, projSpeed: 380,
      desc: 'Frasco que envenena en área: daño sostenido que ignora la armadura.',
      shape: { body: 'hut', roof: 'dome', palette: 'venom', figure: 'cauldron' },
      unlock0: 5, unlockStep: 5,
      cost0: 175, costMul: 1.86, damage0: 14, damageMul: 1.9,
      rate0: 0.7, rateMul: 1.03, range0: 126, rangeMul: 1.05,
      extra: { splash: 52, splashMul: 1.06, poison: 22, poisonMul: 2.0, poisonTime: 4 },
      tiers: ['Choza del alquimista', 'Torre de esporas', 'Caldero ponzoñoso',
              'Torre de miasma', 'Jardín venenoso', 'Alambique mayor',
              'Torre de plaga', 'Santuario de la Peste']
    },
    {
      id: 'pre', name: 'Precisión', icon: '👁', kind: 'sniper',
      damageType: 'physical', canHitAir: true, projSpeed: 1100,
      desc: 'Un solo disparo, muchísimo alcance y daño demoledor.',
      shape: { body: 'tall', roof: 'cone', palette: 'stone', figure: 'archer' },
      unlock0: 7, unlockStep: 5,
      cost0: 260, costMul: 1.9, damage0: 150, damageMul: 2.05,
      rate0: 0.28, rateMul: 1.02, range0: 300, rangeMul: 1.06,
      extra: {},
      tiers: ['Puesto de vigía', 'Torre de cazadores', 'Nido de águilas',
              'Torre de tiradores', 'Atalaya larga', 'Torre del Halcón',
              'Ojo de la fortaleza', 'Ojo del Dragón']
    },
    {
      id: 'mul', name: 'Andanada', icon: '🎇', kind: 'multi',
      damageType: 'physical', canHitAir: true, projSpeed: 620,
      desc: 'Dispara a varios enemigos a la vez en cada salva.',
      shape: { body: 'battery', roof: 'none', palette: 'wood', figure: 'battery' },
      unlock0: 9, unlockStep: 6,
      cost0: 320, costMul: 1.92, damage0: 30, damageMul: 1.95,
      rate0: 0.85, rateMul: 1.03, range0: 150, rangeMul: 1.05,
      extra: { targets: [3, 4, 5] },
      tiers: ['Torre de honderos', 'Torre de venablos', 'Torre de andanada',
              'Batería de saetas', 'Torre de descarga', 'Batería Real',
              'Tempestad de Saetas']
    },
    {
      id: 'aur', name: 'Mando', icon: '🛡', kind: 'aura',
      damageType: 'none', canHitAir: false,
      desc: 'No dispara: potencia el daño y la cadencia de las torres cercanas.',
      shape: { body: 'keep', roof: 'flat', palette: 'royal', figure: 'banner' },
      unlock0: 4, unlockStep: 5,
      cost0: 230, costMul: 1.8, damage0: 0, damageMul: 1,
      rate0: 0, rateMul: 1, range0: 150, rangeMul: 1.06,
      extra: { auraDamage: 0.1, auraRate: 0.06, auraMul: 1.32 },
      tiers: ['Estandarte de guerra', 'Puesto de mando', 'Cuartel',
              'Taller del armero', 'Templo marcial', 'Academia de guerra',
              'Ciudadela menor', 'Gran Cuartel General']
    },
    {
      id: 'eco', name: 'Economía', icon: '💰', kind: 'econ',
      damageType: 'none', canHitAir: false,
      desc: 'No dispara: rinde oro al terminar cada oleada.',
      shape: { body: 'house', roof: 'gable', palette: 'farm', figure: 'none' },
      unlock0: 2, unlockStep: 5,
      cost0: 160, costMul: 1.78, damage0: 0, damageMul: 1,
      rate0: 0, rateMul: 1, range0: 0, rangeMul: 1,
      extra: { income: 26, incomeMul: 1.92 },
      tiers: ['Choza del leñador', 'Granja', 'Molino harinero', 'Mina de oro',
              'Mercado', 'Casa de la moneda', 'Gremio de mercaderes',
              'Tesorería Real']
    },
    {
      id: 'fri', name: 'Campo helado', icon: '🌨', kind: 'slowfield',
      damageType: 'none', canHitAir: true,
      desc: 'No dispara: ralentiza de forma permanente a todo el que entre en su círculo.',
      shape: { body: 'circle', roof: 'none', palette: 'ice', figure: 'runes' },
      unlock0: 8, unlockStep: 7,
      cost0: 260, costMul: 1.82, damage0: 0, damageMul: 1,
      rate0: 0, rateMul: 1, range0: 130, rangeMul: 1.08,
      extra: { fieldSlow: [0.22, 0.3, 0.38], fieldMul: 1.14 },
      tiers: ['Tótem de escarcha', 'Círculo rúnico', 'Menhir helado',
              'Círculo de invierno', 'Corona de Hielo']
    },
    {
      id: 'bot', name: 'Botín', icon: '🪙', kind: 'loot',
      damageType: 'none', canHitAir: false,
      desc: 'No dispara: las bajas dentro de su radio sueltan más oro.',
      shape: { body: 'house', roof: 'dome', palette: 'royal', figure: 'coin' },
      unlock0: 11, unlockStep: 8,
      cost0: 340, costMul: 1.85, damage0: 0, damageMul: 1,
      rate0: 0, rateMul: 1, range0: 160, rangeMul: 1.07,
      extra: { lootBonus: [0.25, 0.4, 0.6], lootMul: 1.2 },
      tiers: ['Recaudador de impuestos', 'Tienda del prestamista',
              'Casa de subastas', 'Banca de Rocanegra']
    }
  ];

  function pick(value, level) {
    return Array.isArray(value) ? value[Math.min(level, value.length - 1)] : value;
  }

  function roundCost(n) {
    if (n < 1000) return Math.round(n / 5) * 5;
    if (n < 10000) return Math.round(n / 25) * 25;
    return Math.round(n / 100) * 100;
  }

  /* Construye las tres mejoras de un edificio a partir de su familia y grado. */
  function buildLevels(fam, tier) {
    var cost = fam.cost0 * Math.pow(fam.costMul, tier);
    var damage = fam.damage0 * Math.pow(fam.damageMul, tier);
    var rate = fam.rate0 * Math.pow(fam.rateMul, tier);
    var range = fam.range0 * Math.pow(fam.rangeMul, tier);
    var e = fam.extra;

    return [0, 1, 2].map(function (lvl) {
      var st = {
        cost: roundCost(cost * LEVEL.cost[lvl]),
        damage: Math.round(damage * LEVEL.damage[lvl] * 10) / 10,
        rate: Math.round(rate * LEVEL.rate[lvl] * 100) / 100,
        range: Math.round(range * LEVEL.range[lvl])
      };
      if (e.shots) st.shots = lvl >= 2 ? 2 : 1;
      if (e.pierce) st.pierce = pick(e.pierce, lvl);
      if (e.splash) st.splash = Math.round(e.splash * Math.pow(e.splashMul || 1, tier) * (1 + lvl * 0.16));
      if (e.slow) { st.slow = pick(e.slow, lvl); st.slowTime = e.slowTime + lvl * 0.3; }
      if (e.burn) { st.burn = Math.round(e.burn * Math.pow(e.burnMul, tier) * LEVEL.damage[lvl]); st.burnTime = e.burnTime + lvl * 0.25; }
      if (e.jumps) { st.jumps = pick(e.jumps, lvl); st.chainFalloff = e.chainFalloff; }
      if (e.poison) { st.poison = Math.round(e.poison * Math.pow(e.poisonMul, tier) * LEVEL.damage[lvl]); st.poisonTime = e.poisonTime + lvl * 0.5; }
      if (e.targets) st.targets = pick(e.targets, lvl);
      if (e.auraDamage) {
        var auraScale = Math.pow(e.auraMul, tier) * (1 + lvl * 0.35);
        st.auraDamage = Math.round(e.auraDamage * auraScale * 1000) / 1000;
        st.auraRate = Math.round(e.auraRate * auraScale * 1000) / 1000;
      }
      if (e.income) st.income = Math.round(e.income * Math.pow(e.incomeMul, tier) * (1 + lvl * 0.55));
      if (e.fieldSlow) st.fieldSlow = Math.min(0.75, pick(e.fieldSlow, lvl) * Math.pow(e.fieldMul, tier));
      if (e.lootBonus) st.lootBonus = pick(e.lootBonus, lvl) * Math.pow(e.lootMul, tier);
      return st;
    });
  }

  var TYPES = {};
  var ORDER = [];

  FAMILIES.forEach(function (fam) {
    fam.keys = [];
    fam.tiers.forEach(function (name, tier) {
      var key = fam.id + (tier + 1);
      var levels = buildLevels(fam, tier);
      TYPES[key] = {
        key: key,
        family: fam.id,
        familyName: fam.name,
        icon: fam.icon,
        tier: tier + 1,
        name: name,
        desc: fam.desc,
        kind: fam.kind,
        damageType: fam.damageType,
        canHitAir: fam.canHitAir,
        projSpeed: fam.projSpeed,
        passive: fam.kind === 'aura' || fam.kind === 'econ' ||
                 fam.kind === 'slowfield' || fam.kind === 'loot',
        unlockWave: fam.unlock0 + tier * fam.unlockStep,
        cost: levels[0].cost,
        levels: levels,
        model: 'b_' + key,
        shape: fam.shape
      };
      fam.keys.push(key);
      ORDER.push(key);
    });
  });

  ORDER.sort(function (a, b) {
    return TYPES[a].unlockWave - TYPES[b].unlockWave || TYPES[a].cost - TYPES[b].cost;
  });

  TD.FAMILIES = FAMILIES;
  TD.TOWER_TYPES = TYPES;
  TD.TOWER_ORDER = ORDER;
  TD.BUILDING_COUNT = ORDER.length;
  TD.towerModel = function (key) { return TYPES[key].model; };

  TD.TARGET_MODES = [
    { key: 'first', name: 'Primero' },
    { key: 'last', name: 'Último' },
    { key: 'strong', name: 'Más fuerte' },
    { key: 'close', name: 'Más cerca' }
  ];
})(typeof window !== 'undefined' ? (window.TD = window.TD || {}) : (module.exports = {}));
