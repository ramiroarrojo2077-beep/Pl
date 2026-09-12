# Murallas de Rocanegra

Tower defense medieval **en 3D**, con **100 construcciones** y **oleadas
infinitas**. Todos los modelos están hechos en **Blender** por script, y el juego
va en el navegador y como **APK de Android**.

Las hordas del Yermo no dejan de llegar: no hay pantalla de victoria, solo hasta
dónde aguantas. Levanta construcciones junto al camino, fúndelas con el oro de
las bajas en la **Forja** y mira cuántas oleadas resiste Rocanegra.

![El asedio en curso](assets/screenshot.png)

## Jugar

- **Navegador:** abre `index.html`. Sin servidor, sin instalación — los modelos
  viajan incrustados en el propio JavaScript.
- **Android:** instala `dist/rocanegra.apk` (hay que permitir orígenes
  desconocidos). Funciona sin conexión y no pide ningún permiso.

Requisitos: WebGL 2 (cualquier navegador moderno; en Android, Chrome/WebView 56+).

## Controles

| Acción | Teclado | Ratón / táctil |
| --- | --- | --- |
| Elegir construcción | `1` – `9` | toca la tienda |
| Cambiar de familia | `Q` / `E` | toca la pestaña |
| Construir | — | toca una casilla libre |
| Cancelar / deseleccionar | `Esc` | clic derecho |
| Mejorar torre | `U` | botón del panel |
| Vender torre (60 % de lo invertido) | `X` | botón del panel |
| Prioridad de objetivo | `T` | botón del panel |
| Adelantar oleada (oro extra) | `Espacio` | botón *Iniciar oleada* |
| Pausa | `P` | botón *Pausa* |
| Velocidad 1× / 2× / 3× | `F` | botón de velocidad |
| Silenciar | `M` | botón 🔊 |

## Las 100 construcciones

Están repartidas en 13 familias. Dentro de cada familia hay varios **grados**
(del Puesto de Arqueros a la Torre del Arquero Legendario), y cada construcción
tiene además **tres niveles de mejora**. Se van desbloqueando según avanzan las
oleadas, así que la armería crece contigo.

| Familia | Nº | Qué hace |
| --- | --- | --- |
| 🏹 Arquería | 10 | Saetas rápidas y baratas; a nivel 3 disparan dos flechas |
| 🎯 Balistas | 8 | Virote perforante de largo alcance que atraviesa varios enemigos |
| 🪨 Asedio | 10 | Gran daño en área, pero **no alcanza a los voladores** |
| ❄ Escarcha | 8 | Daño mágico en área que ralentiza a la horda |
| 🔥 Fuego | 8 | Llamarada continua que prende a los enemigos |
| ⚡ Tormenta | 8 | Descarga que salta entre varios enemigos perdiendo fuerza |
| ☠ Ponzoña | 8 | Veneno en área: daño sostenido que ignora la armadura |
| 👁 Precisión | 8 | Un solo disparo, muchísimo alcance y daño demoledor |
| 🎇 Andanada | 7 | Dispara a varios enemigos a la vez en cada salva |
| 🛡 Mando | 8 | No dispara: potencia daño y cadencia de las torres cercanas |
| 💰 Economía | 8 | No dispara: rinde oro al terminar cada oleada |
| 🌨 Campo helado | 5 | No dispara: ralentiza a todo el que entre en su círculo |
| 🪙 Botín | 4 | No dispara: las bajas cercanas sueltan más oro |

Los cuatro últimos grupos son construcciones **pasivas**: enseñan su radio de
influencia en el tablero y no gastan turno de puntería. Una defensa que solo
apila torres se queda corta enseguida; el truco está en mezclar daño, control,
mando y economía.

Las armas mágicas (escarcha, fuego, ponzoña y tormenta) ignoran la armadura;
las físicas (arquería, balistas, asedio, precisión, andanada) la sufren.

## La Forja: mejoras pagadas con el oro de las bajas

Cada enemigo abatido suelta monedas. Ese oro tiene dos destinos: torres nuevas o
la Forja, que multiplica lo que ya tienes en el tablero.

| Mejora | Niveles | Efecto acumulativo |
| --- | --- | --- |
| Filo templado | 4 | +12 % de daño en **todas** las torres |
| Ojo de halcón | 3 | +8 % de alcance |
| Instrucción | 3 | +10 % de cadencia |
| Botín de guerra | 3 | +20 % de oro por baja |
| Reparar muralla | 5 | +3 vidas de la fortaleza |

El panel lleva la cuenta del oro fundido de las bajas, y la ficha de cada torre
muestra el bono que le aporta la Forja.

## Oleadas infinitas

Las veinte primeras oleadas están escritas a mano; a partir de ahí la
composición se genera sola y no se acaba nunca:

- La vida de los enemigos crece de forma exponencial, y pasada la oleada 30 con
  un empujón extra: tarde o temprano la horda se come cualquier defensa.
- Cada cinco oleadas aparece un jefe (y más de uno cuando la cosa se pone seria).
- Cada diez oleadas se alcanza un **hito** con una recompensa de oro.
- El oro que sueltan los enemigos también sube con las oleadas: sin eso, los
  grados altos serían inalcanzables.

No hay victoria. La partida termina cuando cae la fortaleza, y lo que queda es
el récord de oleadas.

## Enemigos

Trasgos, lobos huargos, orcos, caballeros negros, ogros, guivernos, nigromantes
y dos jefes: el **Señor de la Guerra** y el **Dragón de Ceniza**.

- **Armadura.** Resta daño a cada impacto *físico*. Los caballeros (armadura 10)
  casi ignoran a los arqueros, pero caen ante ballestas y catapultas.
- **Magia.** Escarcha y pira hacen daño *mágico*: la armadura no lo reduce.
- **Aire.** Guivernos y dragón sobrevuelan el campo saltándose el camino. Todas
  las torres los alcanzan salvo la catapulta.
- Los nigromantes curan a sus aliados cercanos cada dos segundos.

## Compilar

```bash
npm install            # esbuild + three (solo para regenerar vendor/)
npm run models         # Blender -> assets/models/rocanegra.glb -> js/models.gen.js
npm run vendor         # empaqueta three.js + GLTFLoader + bloom en vendor/
npm run preview        # hoja de contactos de todos los modelos
npm run apk            # dist/rocanegra.apk
```

Los artefactos ya están en el repositorio: no hace falta compilar nada para
jugar.

### Modelado (Blender)

`blender/build_models.py` construye los 125 assets con primitivas y los exporta a
un único `.glb`. Las 100 construcciones salen de `blender/buildings.json`, que
exporta el propio catálogo del juego: cuerpo, tejado, paleta y remate dependen de
la familia y del grado, así que cada clave tiene su modelo:

```bash
blender -b -P blender/build_models.py -- --out assets/models/rocanegra.glb
```

Los nodos que el juego anima llevan sufijos convenidos: `__yaw` (parte que gira
hacia el objetivo), `__arm` (brazo de catapulta), `__body`, `__legL`/`__legR`,
`__wingL`/`__wingR`, `__blades`. El paso `optimize_meshes()` funde las mallas que
comparten padre y material: de ~450 objetos a ~230, lo que reduce mucho las
llamadas de dibujo en el móvil.

### APK sin el SDK de Google

`tools/build_apk.sh` monta el APK con las herramientas empaquetadas en Debian
(`aapt`, `zipalign`, `apksigner`, `android.jar` de `android-sdk-platform-23`) más
el dexer `dx` republicado en Maven Central. No hace falta Gradle ni el SDK de
Android:

```bash
sudo apt-get install aapt apksigner zipalign android-sdk-platform-23 default-jdk
npm run apk
```

El juego entero se copia a `assets/www` (quitando la tipografía remota), se
compila la Activity, se convierte a Dalvik, se alinea y se firma con un almacén
de depuración que el script crea la primera vez.

## Estructura

```
index.html              maquetación y orden de carga
css/style.css           interfaz (piedra, pergamino y oro)
blender/build_models.py modelado procedural de todos los assets
assets/models/          rocanegra.glb + hoja de contactos
tools/pack_models.js    empaqueta el .glb en js/models.gen.js (base64)
tools/three-entry.js    entrada que esbuild convierte en vendor/three.bundle.js
tools/build_apk.sh      construcción del APK
android/                manifiesto, Activity con WebView, icono y recursos
vendor/three.bundle.js  three.js + GLTFLoader + bloom (empaquetado)
tools/export_building_specs.js  catálogo -> blender/buildings.json
js/buildings.js         catálogo de las 100 construcciones (13 familias)
js/utils.js             constantes, matemáticas y recorrido de polilíneas
js/audio.js             efectos de sonido sintetizados con WebAudio
js/level.js             camino, casillas bloqueadas y textura del suelo
js/enemies.js           bestiario y lógica de movimiento
js/towers.js            puntería, disparo y efectos pasivos
js/effects.js           proyectiles, partículas y rótulos
js/waves.js             20 oleadas escritas a mano y generador infinito
js/perks.js             la Forja
js/render3d.js          escena 3D: paisaje, modelos, cámara y post-procesado
js/game.js              motor: economía, oleadas y bucle
js/ui.js                panel lateral, tienda, Forja y atajos
js/main.js              arranque
```

El motor no dibuja: mantiene el estado en coordenadas de tablero (píxeles) y
`js/render3d.js` lo refleja cada fotograma en la escena (x → X, y → Z, altura en
casillas). `TD.game` queda expuesto en la consola del navegador para trastear.
