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

si-rpg-engine es un núcleo de simulación para mundos 3D que reproduce exactamente las mismas acciones. Ejecuta la física en 64 pasos fijos por segundo, registra una huella del mundo después de cada paso y puede reconstruir cualquier ejecución a partir de su semilla inicial y las entradas que aceptó, bit a bit. La física está compilada en Rust y se convierte en un único archivo WebAssembly. Un modelo de lenguaje puede sugerir lo que sucede a continuación; las reglas escritas a mano deciden qué se incluye. Es el equivalente de [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine), y se mide por lo que simula.

## Qué es y qué pretende ser

Los motores de JavaScript que impulsan Chrome, Firefox y Safari, que son V8, SpiderMonkey y JavaScriptCore, imprimen la misma huella para el mismo mundo en cada confirmación, y la misma construcción de física la imprime en x64 y ARM64. Todo lo demás se basa en esa promesa: dos máquinas coinciden en un mundo, byte por byte, dada una semilla y una lista de entradas aceptadas. Sobre esto se construyen cuerpos que caen, se deslizan, empujan, se inclinan y giran en tres dimensiones; un personaje que camina, escala pendientes, transporta objetos y los coloca; archivos de mundo que se rechazan con una razón cuando son incorrectos; y personajes con mentes que ven, recuerdan lo que vieron y rechazan una creencia basada en pruebas más antiguas que las que reemplazarían.

Lo que pretende ser es el núcleo de simulación dentro de un host: un navegador, Godot o Unreal dibujan la imagen y envían entradas, mientras que la física, la huella y el registro permanecen aquí. El trabajo actual es el conjunto de pruebas que necesita un motor listo para su distribución, y la mayor parte está en: un rastreo que identifica el primer paso y el valor en el que dos ejecuciones divergen, una función de guardar y restaurar que se ha demostrado que es exacta, una segunda arquitectura de CPU, un análisis del código de la física compilada y pruebas que verifican lo que hizo el mundo en lugar de solo su huella. Después del conjunto de pruebas, se implementan las colisiones de mallas y la vinculación al host. El diseño y los planes se encuentran en [docs/PHASE-0.md](docs/PHASE-0.md), [docs/PHASE-1.md](docs/PHASE-1.md) y [docs/PHASE-2.md](docs/PHASE-2.md).

## Qué se está construyendo

| Capacidad. | Dónde. | Prueba. |
|---|---|---|
| Un paso de tiempo fijo; el estado de cada paso se calcula con un hash FNV-1a de dos carriles sobre cada f64; se rechazan NaN e infinitos; el cero con signo se normaliza. | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` ha leído `0d38671370d12d1e` desde la primera ejecución. |
| La ley de la física en Rust en `rapier3d-f64` con `enhanced-determinism`, un único archivo binario de WebAssembly con su resumen de Linux fijado; un mundo de física en ejecución, que se reconstruye solo cuando cambia la geometría, con un cuerpo que se sustituye en su lugar cuando comienza o termina una acción. | `solver/` | `fixtures/solver.sha256`, que CI reconstruye y compara; `harness/switch.test.js`. |
| Cuerpos con posición, velocidad, un cuaternión canónico, velocidad angular y semiextensiones; las cajas dinámicas giran; un personaje cinemático con un autodesplazamiento de 0,3, una escalada de 45° y un ajuste de 0,2; el tiempo de inactividad se cuenta en pasos. | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| Archivos de mundo: cuerpos, colisionadores estáticos orientados, mapas de altura, zonas como partición, doce rechazos de carga, peligros en la carga y un índice en el que el host confía; las acciones se sitúan en la misma superficie de terreno de dos triángulos con la que la física colisiona. | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js`, `harness/surface.test.js` |
| Acciones admitidas en la carga con los efectos `drive`, `climb`, `carry`, `release` y `episode`, cada una con escenarios de peligro. | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| Mentes: visión con línea de visión, creencias tipadas que citan el episodio del que provienen, sustitución por lápida, se rechazan las escrituras obsoletas y objetivos permanentes con una marca de cumplimiento. | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| Un rastreo de cada paso en bits exactos, y una herramienta que identifica el primer paso, el cuerpo y el campo en el que dos ejecuciones divergen. | `harness/trace.mjs`, `harness/first-difference.js` | `harness/trace.test.js`; CI imprime la primera diferencia cuando un motor se desvía de la versión de referencia. |
| Números de comportamiento junto con la versión de referencia: el paso de inactividad y la posición final de cada cuerpo, la zona del caminante y la longitud y el resumen de la instantánea. | `fixtures/golden-behaviour.json`, `harness/check.js` | `harness/check.test.js` |
| Guardar y restaurar de dos maneras: reproduciendo las entradas hasta un paso o copiando la memoria del módulo de física, y se ha demostrado que cada una continúa exactamente. | `packages/tick/runs.js`, `solver/build.mjs` | `harness/restore.test.js` |
| Paquetes: una prueba fallida escribe su semilla, mundo, entradas aceptadas y hashes, que `replay` reproduce en un solo comando; un trabajo semanal reproduce cada paquete, configuración y registro durante mucho más tiempo del que puede durar una solicitud de extracción. | `packages/tick/bundle.js`, `.github/workflows/corpus.yml` | `harness/bundle.test.js` |
| Un único archivo binario en dos arquitecturas de CPU, con la memoria fija en 32 MiB y un análisis que rechaza las instrucciones elegidas por el host, el crecimiento de la memoria y el estado que se mantiene fuera de la memoria. | `solver/build.rs`, `solver/src/arena.rs`, `solver/lint.mjs` | El trabajo de ARM64 de CI; `solver/lint.test.js`, `harness/caps.test.js`. |
| Pruebas de lo que hizo el mundo: una trayectoria de personaje en los límites medidos del controlador, un cuerpo delgado y rápido contra una pared delgada y uniones de terreno. | `harness/course.test.js`, `harness/outcome.test.js` | `write-golden` se niega a escribir mientras alguna de ellas falle. |
| Reproducción a partir de una semilla y un registro, y una vista de depuración del paso en localhost. | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json` es la reproducción de una persona a través del límite del host. |

241 pruebas, siete configuraciones de comportamiento que reproducen paso a paso y dos hashes de referencia impresos por tres motores en x64 y por node en ARM64, en cada confirmación.

## Instalación

Requisitos: Node 20 o posterior, y la cadena de herramientas de Rust con el objetivo `wasm32-unknown-unknown` para la construcción de la física. CI fija Rust 1.98.1; `rustup target add wasm32-unknown-unknown` es el paso adicional después de instalar rustup.

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, both goldens, and the behaviour numbers under node
```

`npm test` construye la física y analiza el binario primero. En Linux, la construcción se compara con el resumen fijado; en otro host, informa de su propio resumen, porque la construcción de Linux es el artefacto fijado.

## Uso

Cada comando se ejecuta desde cualquier directorio, responde `--help`, sale con 0 en caso de éxito, 1 con una razón en caso de rechazo y 2 en caso de error de uso o un fallo inesperado. `--debug` permite que se muestre un rastreo de la pila.

```bash
npx play proposals.json --seed 7 --log out.json    # run proposals through the tick and print every committed frame
npx replay out.json                                 # rerun a log; fails on the first hash that differs
npx replay fixtures/corpus/product-rebuild-261.bundle.json   # rerun a bundle to its save tick, compare every hash, and restore its memory image
npx load world worlds/crate-and-door.json           # validate a world, run its hazards, and write its load hash to the index
npx load admit fixtures/climb-draft.json            # compile an action draft, run the hazards for its effect, and add it to the catalog
npx load retire climb                               # take an action out of the catalog
npx host --world worlds/crate-and-door.json         # serve the debug view at http://127.0.0.1:4173
npx write-golden                                    # run the course and outcome tests, then rewrite the goldens and name what moved
```

Cuando dos ejecuciones no coinciden, el rastreo indica dónde:

```bash
node harness/trace.mjs > a.trace                    # the product scene, one line per step in exact bits
node harness/first-difference.js a.trace b.trace    # identical, or the first step, body, and field that differ
node solver/lint.mjs                                # refuse a binary that could grow memory or let the host choose a result
```

Un mundo se restaura de dos maneras, y ninguna de ellas modifica el estado interno del motor de física, por lo que ambas son exactas: reproducir sus entradas aceptadas en un paso, o copiar toda la memoria del módulo de física con `imageSolver()` y volver a colocarla con `restoreImage()`. Se rechaza una imagen de otro archivo binario, de la longitud incorrecta o con un byte modificado.

La vista de depuración es una vista de depuración. Dibuja los fotogramas confirmados como cajas proyectadas a lo largo del eje elegido con `x`, `y` o `z`; un clic es un objetivo en el plano base; `M`, `C`, `G`, `D` y `U` eligen moverse, escalar, recoger, soltar y usar; la zona del personaje y las creencias de cada entidad se muestran junto al contador y el hash. Nunca dibuja nada que el contador no contenga.

Un archivo de mundo es JSON: `name`, `seed`, `bodies`, `colliders`, `zones` y, opcionalmente, `heightfield` y `goal`. Un cuerpo es `{ id, x, y, z, vx, vy, vz, hx, hy, hz }` con un cuaternión y una velocidad angular opcionales; un colisionador estático es una caja definida por sus límites con un cuaternión opcional alrededor de su centro; una zona es una caja con nombre. Los campos desconocidos, los ID duplicados, los cuerpos superpuestos, un cuerpo dentro de un colisionador, un cuaternión no unitario, una zona degenerada o inalcanzable y un objetivo que no nombra nada se rechazan con una razón.

## La ley, de un solo aliento

Un contador inicializado es la ley. Un paso, un cuanto, es de 1/64 s; cada paso se calcula con un hash, y la acción de un personaje abarca muchos pasos. La reproducción es la semilla más el registro de lo que se admitió. El modelo propone intenciones, creencias tipificadas y borradores de cuerpos; el verificador para esa clase los admite o los rechaza. Los borradores de acciones y los archivos de mundo esperan hasta el momento de la carga y pasan una serie de pruebas. El host recibe los fotogramas confirmados y devuelve las intenciones. La presentación no tiene un camino de regreso al hash.

## Modelo de confianza

El motor se ejecuta localmente y solo accede a los archivos dentro de su propia copia: mundos, borradores de acciones, accesorios y cualquier registro que solicite un comando para escribir. `host` vincula solo a `127.0.0.1`. Ningún comando abre ningún otro socket; el instrumento `propose` congelado, una vez que una persona lo descongela, se comunica con un servidor Ollama local y en ningún otro lugar. No se leen, almacenan ni envían credenciales. No se recopila ninguna telemetría. El contenido creado por el usuario no es de confianza y se valida en el momento de la carga; un archivo rechazado no cambia nada. El archivo binario de WebAssembly se crea a partir del código fuente en CI y se fija mediante su SHA-256, y nunca se incluye como bytes. Su memoria está fija en 32 MiB y no puede crecer, por lo que un mundo demasiado denso para él se detiene de la misma manera en cada host en lugar de divergir. Consulte [SECURITY.md](SECURITY.md).

## Estado de soporte

Pre-1.0, lanzado como `0.x` desde `main`. No existe una promesa de compatibilidad entre las versiones; cada cambio en la ley calculada con hash se registra en [CHANGELOG.md](CHANGELOG.md) junto con el hash dorado que produjo. Probado en Node 22 y Rust 1.98.1 en Ubuntu x64 y ARM64 en CI, y compilado diariamente en Windows 11.

## Licencia

MIT. Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
