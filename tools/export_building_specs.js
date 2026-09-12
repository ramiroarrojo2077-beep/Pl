#!/usr/bin/env node
/* Exporta el catálogo de js/buildings.js a blender/buildings.json.
 *
 * Blender lee ese fichero para modelar un edificio distinto por clave, así que
 * el catálogo del juego y los modelos nunca se desincronizan.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'js/buildings.js'), 'utf8');
const mod = { exports: {} };
new Function('module', src)(mod);
const TD = mod.exports;

const specs = TD.TOWER_ORDER.map((key) => {
  const t = TD.TOWER_TYPES[key];
  const fam = TD.FAMILIES.filter((f) => f.id === t.family)[0];
  return {
    key: key,
    name: t.name,
    family: t.family,
    tier: t.tier,
    tiers: fam.tiers.length,
    kind: t.kind,
    shape: t.shape
  };
});

const out = path.join(root, 'blender/buildings.json');
fs.writeFileSync(out, JSON.stringify(specs, null, 1));
console.log(`${specs.length} construcciones -> ${path.relative(root, out)}`);
