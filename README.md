# Murallas de Rocanegra

Tower defense medieval para navegador. Sin dependencias, sin compilación: HTML, CSS y
JavaScript de toda la vida sobre un `<canvas>`.

Las hordas del Yermo avanzan por el camino hacia la fortaleza. Levanta torres a los
lados, mejóralas entre asaltos y aguanta **20 oleadas** (y después, todas las que puedas
en el modo infinito).

## Jugar

Abre `index.html` en el navegador. Nada más.

Si prefieres servirlo:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

## Controles

| Acción | Teclado | Ratón |
| --- | --- | --- |
| Elegir torre | `1` – `5` | clic en la tienda |
| Construir | — | clic en una casilla libre |
| Cancelar / deseleccionar | `Esc` | clic derecho |
| Mejorar torre | `U` | botón del panel |
| Vender torre (60 % de lo invertido) | `X` | botón del panel |
| Prioridad de objetivo | `T` | botón del panel |
| Adelantar oleada (oro extra) | `Espacio` | botón *Iniciar oleada* |
| Pausa | `P` | botón *Pausa* |
| Velocidad 1× / 2× / 3× | `F` | botón de velocidad |
| Silenciar | `M` | botón 🔊 |

## Torres

| Torre | Coste | Daño | Notas |
| --- | --- | --- | --- |
| Torre de Arqueros | 70 | físico | Barata y rápida; a nivel 3 dispara dos flechas |
| Ballesta de asedio | 150 | físico | Largo alcance; el virote atraviesa hasta 4 enemigos |
| Torre de Escarcha | 120 | **mágico** | Daño en área y ralentización; ignora la armadura |
| Catapulta | 200 | físico | Gran daño en área, **no alcanza a los voladores** |
| Pira arcana | 140 | **mágico** | Llama continua que prende a los enemigos; corto alcance |

Cada torre tiene tres niveles. La mejora sube daño, cadencia, alcance y área.

## Enemigos

Trasgos, lobos huargos, orcos, caballeros negros, ogros, guivernos, nigromantes y dos
jefes: el **Señor de la Guerra** (oleada 10) y el **Dragón de Ceniza** (oleada 20).

Tres reglas gobiernan el combate:

- **Armadura.** Resta daño a cada impacto *físico*. Los caballeros (armadura 10) casi
  ignoran a los arqueros, pero caen ante ballestas y catapultas.
- **Magia.** Escarcha y pira hacen daño *mágico*: la armadura no los reduce.
- **Aire.** Guivernos y dragón vuelan en línea recta sobre el campo, saltándose el
  camino. Todas las torres los alcanzan salvo la catapulta.

Los nigromantes curan a sus aliados cercanos cada dos segundos: convienen como objetivo
prioritario (prioridad *Más fuerte* o *Más cerca*).

## Economía

- Empiezas con 300 de oro y 20 vidas.
- Cada baja da oro; superar una oleada da una bonificación creciente.
- Adelantar la oleada con `Espacio` da 3 de oro por segundo no consumido.
- Un ogro cuesta 3 vidas al colarse; los jefes, 6 y 8.

## Estructura

```
index.html          maquetación y orden de carga
css/style.css       interfaz (piedra, pergamino y oro)
js/utils.js         constantes, matemáticas y recorrido de polilíneas
js/audio.js         efectos de sonido sintetizados con WebAudio
js/level.js         camino, casillas bloqueadas y pintado del terreno
js/art.js           primitivas de dibujo compartidas
js/enemies.js       bestiario y lógica de movimiento
js/towers.js        torres, mejoras, puntería y dibujo
js/effects.js       proyectiles, partículas y rótulos
js/waves.js         guion de las 20 oleadas y modo infinito
js/game.js          motor: economía, oleadas, bucle y render
js/ui.js            panel lateral, tienda y atajos
js/main.js          arranque
```

El terreno se dibuja una sola vez en un canvas fuera de pantalla y se reutiliza como
fondo; el resto se repinta cada fotograma. `TD.game` queda expuesto en la consola del
navegador para trastear.
