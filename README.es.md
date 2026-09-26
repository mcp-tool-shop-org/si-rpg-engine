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

Los motores de JavaScript que impulsan Chrome, Firefox y Safari, que son V8, SpiderMonkey y JavaScriptCore, imprimen la misma huella para el mismo mundo en cada confirmación, y la misma construcción de física la imprime en x64 y ARM64. Todo lo demás se basa en esa promesa: dos máquinas están de acuerdo sobre un mundo, byte por byte, dada una semilla y una lista de entradas aceptadas. Sobre esto se construyen cuerpos que caen, se deslizan, empujan, se inclinan y giran en tres dimensiones; un personaje que camina, escala pendientes, transporta objetos y los coloca; archivos de mundo que se rechazan con una razón cuando son incorrectos; y personajes con mentes que ven, recuerdan lo que vieron y se niegan a creer en algo basándose en pruebas más antiguas que las que reemplazarían.

Lo que pretende ser es el núcleo de simulación dentro de un host: un navegador, Godot o Unreal dibujan la imagen y envían entradas, mientras que la física, la huella y el registro permanecen aquí. El trabajo actual es el conjunto de pruebas que necesita un motor listo para su distribución, y la mayor parte está en: un rastreo que identifica el primer paso y el valor en el que dos ejecuciones divergen, una función de guardar y restaurar que se ha demostrado que es exacta, una segunda arquitectura de CPU, un análisis del código de la física compilada y pruebas que verifican lo que hizo el mundo en lugar de solo su huella. Después del conjunto de pruebas, se implementan las colisiones de mallas y la vinculación al host. El diseño y los planes se encuentran en [docs/PHASE-0.md](docs/PHASE-0.md), [docs/PHASE-1.md](docs/PHASE-1.md) y [docs/PHASE-2.md](docs/PHASE-2.md).

## Qué se está construyendo

| Capacidad. | Dónde. | Prueba. |
|---|---|---|
| Un paso de tiempo fijo; el estado de cada paso se calcula con un hash FNV-1a de dos carriles sobre cada valor f64; se rechazan NaN e infinitos; el cero con signo se normaliza. | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` ha leído `0d38671370d12d1e` desde la primera ejecución. |
| La ley de la física en Rust en `rapier3d-f64` con `enhanced-determinism`, un único archivo binario de WebAssembly con su resumen de Linux fijado; un mundo de física en ejecución, reconstruido solo cuando cambia la geometría, con un cuerpo que se sustituye en su lugar cuando comienza o termina una acción. | `solver/` | `fixtures/solver.sha256`, que CI reconstruye y compara; `harness/switch.test.js`. |
| Cuerpos con posición, velocidad, un cuaternión canónico, velocidad angular y semiextensiones; las cajas dinámicas giran; un personaje cinemático con un autodesplazamiento de 0,3, una escalada de 45° y un ajuste de 0,2; el tiempo de inactividad se cuenta en pasos. | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| El empuje del personaje a través de la copia del motor de la rutina de impulso de Rapier, con la corrección posterior de Rapier incorporada, de modo que un cuerpo solo se empuja en sus propios puntos de contacto, y el impulso de cada punto se dimensiona según la masa efectiva del cuerpo en ese punto, incluida su rotación; una protección en la física impide cualquier empuje que deje un cuerpo más rápido que un múltiplo establecido de la velocidad de su propulsor. | `solver/src/impulses.rs` | `harness/push.test.js`, `fixtures/push/red-room-a.json` y una prueba nativa de que la copia sin la corrección empuja como lo hace la rutina de Rapier, bit a bit. |
| Archivos de mundo: cuerpos, colisionadores estáticos orientados, mapas de altura, zonas como partición, doce rechazos de carga, peligros en la carga y un índice en el que el host confía; las acciones se sitúan en la misma superficie de terreno de dos triángulos con la que la física colisiona. | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js`, `harness/surface.test.js` |
| Un barrido de accesibilidad cuando se admite un mundo: sus estados accesibles se exploran con las acciones admitidas, a través del comprobador, a partir de los guardados del propio paso. Una zona a la que nada llega, un cuerpo que se saca del mundo o un lanzamiento rechazan el mundo, con un testigo que `replay` reproduce. | `packages/load/sweep.js` | `harness/sweep.test.js`, las salas de prueba cerradas en `fixtures/sweep/`. |
| Acciones admitidas en la carga con los efectos `drive`, `climb`, `carry`, `release` y `episode`, cada una con escenarios de peligro. | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| Mentes: visión con línea de visión, creencias tipadas que citan el episodio del que provienen, sustitución por lápida, rechazo de escrituras obsoletas y objetivos permanentes con una marca de cumplimiento. | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| Un rastreo de cada paso en bits exactos, y una herramienta que identifica el primer paso, cuerpo y campo en el que dos ejecuciones divergen. | `harness/trace.mjs`, `harness/first-difference.js` | `harness/trace.test.js`; CI imprime la primera diferencia cuando un motor se desvía de la versión dorada. |
| Números de comportamiento junto con la versión dorada: el paso de sueño y la posición final de cada cuerpo, la zona del caminante y la longitud y el resumen de la instantánea. | `fixtures/golden-behaviour.json`, `harness/check.js` | `harness/check.test.js` |
| Guardar y restaurar de tres maneras: reproduciendo las entradas de un paso, copiando la memoria del módulo de física o utilizando el propio guardado del paso de todo su estado, que se restaura sin reproducción; se ha demostrado que cada una de ellas continúa exactamente. | `packages/tick/runs.js`, `packages/tick/tick.js`, `solver/build.mjs` | `harness/restore.test.js` |
| Paquetes: una prueba fallida escribe su semilla, mundo, entradas aceptadas y hashes, que `replay` reproduce en un solo comando; un trabajo semanal reproduce cada paquete, caso de prueba y registro durante mucho más tiempo del que puede durar una solicitud de extracción. | `packages/tick/bundle.js`, `.github/workflows/corpus.yml` | `harness/bundle.test.js` |
| Un único archivo binario en dos arquitecturas de CPU, con la memoria fija en 32 MiB y un análisis que rechaza las instrucciones elegidas por el host, el crecimiento de la memoria y el estado que se mantiene fuera de la memoria. | `solver/build.rs`, `solver/src/arena.rs`, `solver/lint.mjs` | El trabajo ARM64 de CI; `solver/lint.test.js`, `harness/caps.test.js`. |
| Pruebas de lo que hizo el mundo: un recorrido de personaje en los límites medidos del controlador, un paso completo en cada paso de una larga caminata plana y ningún paso se hunde en el suelo, un cuerpo delgado y rápido contra una pared delgada, costuras del terreno y toda la escena se mueve un millón de unidades. | `harness/course.test.js`, `harness/outcome.test.js` | `write-golden` se niega a escribir mientras alguna de ellas falle. |
| El banco de pruebas del instrumento: un cambio y la configuración previa, cada prueba se ejecuta en su propio proceso. Identifica el código y los datos que afectan al cambio, ejecuta cada entrada candidata en ambos árboles y muestra qué llegó al cambio, dónde se separan las dos ejecuciones y qué falla solo en el cambio, cada resultado del motor y ninguno de un modelo. El alcance de la ley se lee a partir de una configuración de cobertura cuya ejecución debe coincidir con la configuración del producto, fotograma a fotograma, y los mutantes plantados en el cambio miden el banco de pruebas. | `packages/bench` | 86 pruebas en `packages/bench/` contra cambios con efectos conocidos; el cambio de la ley de F2, plantado manualmente, se encontró en el cuantil 98. |
| Roles para las pruebas del modelo: un manifiesto por rol, la Regla de los Dos derivada de lo que lee el rol, una puerta de acceso al rol en el verificador, información de procedencia en cada admisión, etiquetas de confianza que permanecen con una creencia, y cada llamada al modelo registrada y verificada sin una GPU; ambos roles declarados están congelados. | `predicates/roles/`, `packages/tick/roles.js`, `packages/tick/gate.js`, `packages/propose` | `packages/tick/gate.test.js`, `packages/propose/record.test.js` a lo largo de las sesiones en `fixtures/sessions/`. |
| Reproducción a partir de una semilla y un registro, y una vista de depuración del ciclo en localhost. | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json` es la interacción de una persona a través del límite del host. |

479 pruebas, siete configuraciones de comportamiento que reproducen paso a paso, y dos hashes dorados impresos por tres motores en x64 y por node en ARM64, en cada confirmación.

## Instalar

Requisitos: Node 20 o posterior, y la cadena de herramientas Rust con el objetivo `wasm32-unknown-unknown` para la configuración de física. CI fija Rust 1.98.1; `rustup target add wasm32-unknown-unknown` es el paso adicional después de instalar rustup.

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, both goldens, and the behaviour numbers under node
```

`npm test` construye la física y realiza primero el análisis estático del binario. En Linux, la configuración se compara con el hash fijado; en otro host, informa de su propio hash, porque la configuración de Linux es el artefacto fijado.

## Usar

Cada comando se ejecuta desde cualquier directorio, responde `--help`, sale con 0 en caso de éxito, 1 con una razón en caso de rechazo y 2 en caso de error de uso o un fallo inesperado. `--debug` permite que se muestre un rastreo de la pila.

```bash
npx play proposals.json --seed 7 --log out.json    # run proposals through the tick and print every committed frame
npx replay out.json                                 # rerun a log; fails on the first hash that differs
npx replay fixtures/corpus/product-rebuild-261.bundle.json   # rerun a bundle to its save tick, compare every hash, and restore its memory image
npx load world worlds/crate-and-door.json           # validate a world, run its hazards, sweep its reachable states, and write its load hash to the index
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

Se puede medir un cambio en relación con la configuración anterior. El banco de pruebas se ejecuta manualmente y ningún flujo de trabajo lo ejecuta:

```bash
npx bench trees . main HEAD ../trees                # the base and the head as git worktrees, the head's binary built in its own tree
npx bench anchors --base ../trees/base --head ../trees/head    # the code and data the change touches, as JSON
npx bench run --base ../trees/base --head ../trees/head --out ../bench --product-scene    # reach, differences, and catches, with a report
```

El informe indica su semilla, cuenta sus presupuestos en cuantos y restauraciones, y dice qué no midió; dos ejecuciones con una semilla dan el mismo informe fuera de su bloque de entorno. Cuando `solver/` cambia, cada árbol construye su propio binario, y el alcance de la ley proviene de una configuración de cobertura del encabezado que debe ejecutar la escena del producto exactamente como lo hace la configuración del producto, o el banco de pruebas se detiene con la razón.

Un mundo se restaura de tres maneras, y ninguna escribe en el estado interno del motor de física, por lo que cada una es exacta. Puede reproducir sus entradas aceptadas hasta un paso. Puede copiar toda la memoria del módulo de física con `imageSolver()` y volver a colocarla con `restoreImage()`. O puede guardar todo el ciclo con `save()` y volver a colocarlo con `restore(saved)`, lo que no requiere reproducción y es la forma en que la simulación vuelve a un estado miles de veces. Una imagen de otro binario, de la longitud incorrecta o con un byte cambiado, se rechaza, y un guardado que no verifica todo no cambia nada.

La vista de depuración es una vista de depuración. Dibuja los fotogramas confirmados como cajas proyectadas a lo largo del eje elegido con `x`, `y` o `z`; un clic es un objetivo del plano de suelo; `M`, `C`, `G`, `D` y `U` eligen mover, escalar, recoger, soltar y usar; la zona del caminante y las creencias de cada mente se encuentran junto al ciclo y el hash. Nunca dibuja nada que el ciclo no contenga.

Un archivo de mundo es JSON: `name`, `seed`, `bodies`, `colliders`, `zones` y, opcionalmente, `heightfield` y `goal`. Un cuerpo es `{ id, x, y, z, vx, vy, vz, hx, hy, hz }` con un cuaternión y una velocidad angular opcionales; un colisionador estático es una caja definida por sus límites con un cuaternión opcional sobre su centro; una zona es una caja con nombre. Los campos desconocidos, los ID duplicados, los cuerpos superpuestos, un cuerpo dentro de un colisionador, un cuaternión no unitario, una zona degenerada o inalcanzable y un objetivo que no nombra nada se rechazan con una razón.

## La ley, en una sola respiración

Un ciclo con semilla es la ley. Un paso, un cuanto, es 1/64 s; cada paso se calcula con hash, y la acción de un personaje abarca muchos pasos. La reproducción es la semilla más el registro de lo que se admitió. El modelo propone intenciones, creencias tipificadas y borradores de cuerpo; el verificador para esa clase los admite o los rechaza. Los borradores de acción y los archivos de mundo esperan hasta el momento de la carga y pasan una suite de pruebas de seguridad. El host recibe los fotogramas confirmados y devuelve las intenciones. La presentación no tiene ninguna vía de regreso al hash.

## Modelo de confianza

El motor se ejecuta localmente y solo accede a los archivos dentro de su propio directorio de extracción: mundos, borradores de acción, configuraciones y cualquier registro que un comando escriba. `host` vincula `127.0.0.1` únicamente. `bench` es la excepción al directorio de extracción: escribe sus árboles y su informe donde usted lo indique, y ejecuta cada árbol en su propio proceso hijo. Ningún comando abre ningún otro socket que no sea `propose`, que se comunica con un servidor Ollama local y en ningún otro lugar, y solo para un rol cuyo manifiesto se ha descongelado para actuar en un mundo de prueba; ambos roles que declara el motor están congelados, por lo que rechaza antes de que se cargue cualquier cliente de modelo. La propuesta de un modelo entra en el mundo solo a través de la puerta de acceso al rol, que lo limita al manifiesto de su rol. Para construir la física de un árbol, `bench` ejecuta `cargo build --locked`, como lo hace la propia configuración del solucionador, y cargo obtiene un crate fijado de crates.io solo cuando su caché carece de él. No se lee, almacena ni envía ninguna credencial. No se recopila ninguna telemetría. El contenido creado por el usuario no es de confianza y se valida en el momento de la carga; un archivo rechazado no cambia nada. El binario WebAssembly se construye a partir del código fuente en CI y se fija mediante su SHA-256, y nunca se confirma como bytes. Su memoria está fija en 32 MiB y no puede crecer, por lo que un mundo demasiado denso para él se detiene de la misma manera en cada host en lugar de divergir. Consulte [SECURITY.md](SECURITY.md).

## Estado de soporte

Versión anterior a la 1.0, publicada como `0.x` desde `main`. No se garantiza la compatibilidad entre las diferentes versiones; cada cambio en la regla hash se registra en [CHANGELOG.md](CHANGELOG.md) junto con el hash resultante. Se ha probado en Node 22 y Rust 1.98.1 en Ubuntu x64 y ARM64 en el entorno de integración continua (CI), y se compila diariamente en Windows 11.

## Licencia

MIT, excepto `solver/src/kcc.rs` y `solver/src/impulses.rs`, que son copias modificadas de partes del controlador de personajes de Rapier, y que están bajo la licencia Apache 2.0 (`solver/LICENSE-APACHE-2.0`, `solver/NOTICE`). Creado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
