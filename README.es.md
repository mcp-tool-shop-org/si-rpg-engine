<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.md">English</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/si-rpg-engine/readme.png" width="400" alt="SI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/si-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/si-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/si-rpg-engine/"><img src="https://img.shields.io/badge/Landing-Page-blue" alt="Landing Page"></a>
</p>

Un motor de simulación 3D determinista, con hash y reproducible. El ciclo se ejecuta en un paso de tiempo fijo, cada estado se calcula su hash y la ley de la física se compila en Rust para generar un único archivo binario de WebAssembly. La reproducción se basa en la semilla más el registro de lo que se admitió. Un modelo de lenguaje puede proponer elementos al mundo; un verificador creado manualmente decide qué entra en él. Es el equivalente de [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine), y se mide por lo que simula.

## Qué es y en qué aspira a convertirse

Tres motores de JavaScript, V8, SpiderMonkey y JavaScriptCore, imprimen el mismo hash para el mismo mundo en cada confirmación. Esa es la promesa en la que se basa el resto del motor: un mundo sobre el que dos máquinas pueden ponerse de acuerdo, byte por byte, a partir de una semilla y una lista de entradas admitidas. Sobre esto, existen objetos que caen, se deslizan, empujan, se inclinan y giran en tres dimensiones; un personaje que camina, escala pendientes, transporta objetos y los deja; archivos de mundo que se rechazan con una razón cuando son incorrectos; y mentes que ven, recuerdan lo que vieron y rechazan una creencia que se basa en pruebas más antiguas que la que reemplazaría.

Lo que aspira a ser es el núcleo de simulación dentro de un host: un navegador, Godot o Unreal dibujan la imagen y envían intenciones, mientras que la ley, el hash y el registro permanecen aquí. La siguiente fase es el conjunto de pruebas de un motor listo para su distribución, determinado por un estudio de cómo prueban los estudios en la actualidad; después, se añaden colisiones a partir de mallas, una vinculación al host y la activación del modelo como instrumento de prueba. Los planes son [docs/PHASE-0.md](docs/PHASE-0.md) y [docs/PHASE-1.md](docs/PHASE-1.md), y cada parte se construyó a partir de un informe escrito en `docs/`.

## Qué se está construyendo

| Capacidad | Dónde | Prueba |
|---|---|---|
| Ciclo de paso de tiempo fijo, hash FNV-1a de dos carriles sobre cada f64, NaN rechazado, cero con signo normalizado | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` ha leído `0d38671370d12d1e` desde el primer conjunto de pruebas |
| Ley de la física en Rust en `rapier3d-f64` con `enhanced-determinism`, un único archivo binario de WebAssembly, resumen de Linux fijado | `solver/` | `fixtures/solver.sha256`; CI reconstruye y compara |
| Objetos con posición, velocidad, un cuaternión canónico, velocidad angular y semiextensiones; las cajas dinámicas giran; un personaje cinemático con un paso de 0,3, una escalada de 45° y un ajuste de 0,2; el tiempo de inactividad se cuenta en cuantos; el resumen del solucionador se calcula su hash | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| Archivos de mundo: objetos, colisionadores estáticos orientados, mapas de altura, zonas como partición, doce rechazos de carga, peligros en la carga, un índice en el que el host confía | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js` |
| Verbos admitidos en la carga con efectos `drive`, `climb`, `carry`, `release`, `episode`, cada uno con escenarios de peligro | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| Mentes: visión con línea de visión, creencias tipadas que citan episodios, supresión de lápidas, escrituras obsoletas rechazadas, objetivos permanentes con una marca de cumplimiento | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| Reproducción a partir de la semilla y el registro; una vista de depuración del ciclo en localhost | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json` es la reproducción de una persona a través del límite del host |

Setenta y tres pruebas, siete accesorios de comportamiento que reproducen fotograma a fotograma y dos hashes de referencia en tres motores, en cada confirmación.

## Instalación

Requisitos: Node 20 o posterior, y la cadena de herramientas de Rust con el objetivo `wasm32-unknown-unknown` para la compilación del solucionador. CI fija Rust 1.98.1; `rustup target add wasm32-unknown-unknown` es el paso adicional después de instalar rustup.

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, and both goldens under node
```

`npm test` compila primero el solucionador. En Linux, la compilación se compara con el resumen fijado; en otro host, informa de su propio resumen, porque la compilación de Linux es el artefacto fijado.

## Uso

Cada comando se ejecuta desde cualquier directorio, responde `--help`, sale con 0 en caso de éxito, 1 con una razón en caso de rechazo y 2 en caso de error de uso o un fallo inesperado. `--debug` permite que se muestre un rastreo de la pila.

```bash
npx play proposals.json --seed 7 --log out.json    # run proposals through the tick, print every committed frame
npx replay out.json                                 # rerun a log; fails on the first hash that differs
npx load world worlds/crate-and-door.json           # validate a world, run its hazards, write its load hash to the index
npx load admit fixtures/climb-draft.json            # compile a verb draft, run the hazards for its effect, add it to the catalog
npx load retire climb                               # take a verb out of the catalog
npx host --world worlds/crate-and-door.json         # serve the debug view at http://127.0.0.1:4173
npx write-golden                                    # rewrite fixtures/golden.txt from harness/sim.mjs, with a reason in the commit
```

La vista de depuración es una vista de depuración. Dibuja los fotogramas confirmados como cajas proyectadas a lo largo del eje elegido con `x`, `y` o `z`; un clic es un objetivo del plano de suelo; `M`, `C`, `G`, `D` y `U` eligen moverse, escalar, recoger, dejar y usar; la zona del caminante y las creencias de cada mente se muestran junto al ciclo y el hash. Nunca dibuja nada que el ciclo no contenga.

Un archivo de mundo es JSON: `name`, `seed`, `bodies`, `colliders`, `zones` y, opcionalmente, `heightfield` y `goal`. Un objeto es `{ id, x, y, z, vx, vy, vz, hx, hy, hz }` con un cuaternión y una velocidad angular opcionales; un colisionador estático es una caja definida por sus límites con un cuaternión opcional sobre su centro; una zona es una caja con nombre. Los campos desconocidos, los ID duplicados, los objetos superpuestos, un objeto dentro de un colisionador, un cuaternión no unitario, una zona degenerada o inalcanzable y un objetivo que no nombra nada se rechazan con una razón.

## La ley, en una sola respiración

Un ciclo con semilla es la ley. El cuanto es de 1/64 s, cada cuanto se calcula su hash y una acción del jugador abarca muchos cuantos. La reproducción se basa en la semilla más el registro de lo que se admitió. El modelo propone intenciones, creencias tipadas y borradores de objetos; el verificador de esa clase admite o rechaza. Los borradores de verbos y los archivos de mundo esperan hasta el momento de la carga y superan una serie de pruebas de peligro. El host recibe los fotogramas confirmados y devuelve las intenciones. La presentación no tiene ningún camino de vuelta al hash.

## Modelo de confianza

El motor se ejecuta localmente y solo accede a los archivos dentro de su propio directorio de extracción: mundos, borradores de verbos, accesorios y cualquier registro que pida un comando que escriba. `host` solo vincula `127.0.0.1`. Ningún comando abre ningún otro socket; el instrumento `propose` congelado, una vez que una persona lo descongela, se comunica con un servidor Ollama local y en ningún otro lugar. No se leen, almacenan ni envían credenciales. No se recopilan datos de telemetría. El contenido creado se considera no confiable y se valida en el momento de la carga; un archivo rechazado no cambia nada. El archivo binario de WebAssembly se compila a partir del código fuente en CI y se fija mediante su SHA-256, y nunca se confirma como bytes. Consulte [SECURITY.md](SECURITY.md).

## Estado de soporte

Versión anterior a la 1.0, publicada como `0.x` desde `main`. No se garantiza la compatibilidad entre las diferentes versiones; cada cambio en la regla hash se registra en [CHANGELOG.md](CHANGELOG.md) junto con el hash resultante. Probado en Node 22 y Rust 1.98.1 en Ubuntu en el entorno de integración continua (CI), y se compila diariamente en Windows 11.

## Licencia

MIT. Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
