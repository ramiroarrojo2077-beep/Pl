#!/usr/bin/env node
/* Empaqueta el .glb exportado por Blender dentro de un .js como base64.
 *
 * Así el juego funciona abriendo index.html directamente (file://) y dentro
 * del WebView de Android, donde fetch() sobre ficheros locales está capado.
 */
const fs = require('fs');
const path = require('path');

const src = process.argv[2] || 'assets/models/rocanegra.glb';
const dst = process.argv[3] || 'js/models.gen.js';

const glb = fs.readFileSync(src);
const b64 = glb.toString('base64');

const out = `/* Generado por tools/pack_models.js — NO editar a mano.
 * Fuente: ${path.basename(src)} (${glb.length} bytes) modelado en blender/build_models.py
 */
(function (TD) {
  'use strict';
  TD.MODELS_GLB = '${b64}';
})(window.TD = window.TD || {});
`;

fs.writeFileSync(dst, out);
console.log(`${src} (${(glb.length / 1024).toFixed(1)} KB) -> ${dst} (${(out.length / 1024).toFixed(1)} KB)`);
