<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.md">English</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/si-rpg-engine/readme.png" width="400" alt="SI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/si-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/si-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/si-rpg-engine/"><img src="https://img.shields.io/badge/Landing-Page-blue" alt="Landing Page"></a>
</p>

Un motore di simulazione 3D deterministico, basato su hash e riproducibile. Il ciclo di simulazione si basa su un passo temporale fisso, ogni stato viene sottoposto a hashing e la legge fisica è compilata in Rust in un unico file binario WebAssembly. La riproduzione si basa sul seme più sul registro di ciò che è stato accettato. Un modello linguistico può proporre elementi nel mondo; un controllore definito manualmente decide cosa viene accettato. È l'equivalente di [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) e viene valutato in base a ciò che simula.

## Cos'è e a cosa aspira

Tre motori JavaScript, V8, SpiderMonkey e JavaScriptCore, generano lo stesso hash per lo stesso mondo ad ogni commit. Questa è la promessa su cui si basa il resto del motore: un mondo su cui due macchine possono concordare, byte per byte, a partire da un seme e da un elenco di input accettati. Su questo si basano oggetti che cadono, scivolano, spingono, si inclinano e rotolano in tre dimensioni; un personaggio che cammina, scala pendii, trasporta oggetti e li appoggia; file di mondo che vengono rifiutati con una motivazione quando sono errati; e menti che vedono, ricordano ciò che hanno visto e rifiutano una convinzione basata su prove più vecchie rispetto a quelle che sostituirebbero.

A cosa aspira: il motore di simulazione all'interno di un host: un browser, Godot o Unreal disegnano l'immagine e inviano le intenzioni, mentre la legge, l'hash e il registro rimangono qui. La fase successiva è la suite di test di un motore pronto per la distribuzione, definita da uno studio su come i vari studi effettuano i test oggi; successivamente, verranno implementate le collisioni tra mesh, un collegamento all'host e l'attivazione del modello come strumento di test. I piani sono [docs/PHASE-0.md](docs/PHASE-0.md) e [docs/PHASE-1.md](docs/PHASE-1.md), e ogni sezione è stata creata a partire da un documento scritto in `docs/`.

## Cosa viene costruito

| Capacità | Dove | Prova |
|---|---|---|
| Ciclo di simulazione a passo temporale fisso, hash FNV-1a a due livelli su ogni valore f64, NaN rifiutato, zero con segno normalizzato | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` ha letto `0d38671370d12d1e` dall'inizio del test |
| Legge fisica in Rust su `rapier3d-f64` con `enhanced-determinism`, un unico file binario WebAssembly, digest di Linux fissato | `solver/` | `fixtures/solver.sha256`; CI ricostruisce e confronta |
| Oggetti con posizione, velocità, un quaternione normalizzato, velocità angolare e metà estensioni; i box dinamici ruotano; un personaggio cinematico con un passo di 0,3, una capacità di arrampicata di 45° e uno scatto di 0,2; il tempo di inattività viene conteggiato in quanti; lo snapshot del risolutore viene sottoposto a hashing | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| File di mondo: oggetti, collider statici orientati, heightfield, zone come partizione, dodici rifiuti di caricamento, pericoli al caricamento, un indice di cui l'host si fida | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js` |
| Verbi accettati al caricamento con effetti `drive`, `climb`, `carry`, `release`, `episode`, ciascuno con scenari di pericolo | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| Menti: vista con linea di vista, convinzioni tipizzate che citano episodi, sostituzione di tombe, scritture obsolete rifiutate, obiettivi in corso con un flag "completato" | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| Riproduzione da seme e registro; una vista di debug del ciclo di simulazione su localhost | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json` è la simulazione di una persona attraverso il confine dell'host |

Settantatré test, sette fixture di comportamento che riproducono fotogramma per fotogramma e due hash di riferimento sotto tre motori, ad ogni commit.

## Installazione

Requisiti: Node 20 o versione successiva e la toolchain Rust con il target `wasm32-unknown-unknown` per la compilazione del risolutore. CI fissa Rust 1.98.1; `rustup target add wasm32-unknown-unknown` è l'unico passaggio aggiuntivo dopo l'installazione di rustup.

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, and both goldens under node
```

`npm test` compila prima il risolutore. Su Linux, la build viene confrontata con il digest fissato; su un altro host, segnala il proprio digest, perché la build di Linux è l'artefatto fissato.

## Utilizzo

Ogni comando viene eseguito da qualsiasi directory, restituisce `--help`, esce con codice 0 in caso di successo, 1 con una motivazione in caso di rifiuto e 2 in caso di errore di utilizzo o di errore imprevisto. `--debug` consente la visualizzazione di una traccia dello stack.

```bash
npx play proposals.json --seed 7 --log out.json    # run proposals through the tick, print every committed frame
npx replay out.json                                 # rerun a log; fails on the first hash that differs
npx load world worlds/crate-and-door.json           # validate a world, run its hazards, write its load hash to the index
npx load admit fixtures/climb-draft.json            # compile a verb draft, run the hazards for its effect, add it to the catalog
npx load retire climb                               # take a verb out of the catalog
npx host --world worlds/crate-and-door.json         # serve the debug view at http://127.0.0.1:4173
npx write-golden                                    # rewrite fixtures/golden.txt from harness/sim.mjs, with a reason in the commit
```

La vista di debug è una vista di debug. Disegna i fotogrammi impegnati come box proiettati lungo l'asse scelto con `x`, `y` o `z`; un clic è un target sul piano di terra; `M`, `C`, `G`, `D` e `U` selezionano le azioni di movimento, arrampicata, presa, rilascio e utilizzo; la zona del personaggio e le convinzioni di ogni mente sono visualizzate accanto al ciclo di simulazione e all'hash. Non disegna mai nulla che il ciclo di simulazione non tenga.

Un file di mondo è in formato JSON: `name`, `seed`, `bodies`, `colliders`, `zones` e, facoltativamente, `heightfield` e `goal`. Un oggetto è `{ id, x, y, z, vx, vy, vz, hx, hy, hz }` con un quaternione e una velocità angolare facoltativi; un collider statico è un box definito dai suoi limiti con un quaternione facoltativo attorno al suo centro; una zona è un box con nome. I campi sconosciuti, gli ID duplicati, gli oggetti sovrapposti, un oggetto all'interno di un collider, un quaternione non unitario, una zona degenerata o irraggiungibile e un obiettivo che non nomina nulla vengono tutti rifiutati con una motivazione.

## La legge, in un unico respiro

Un ciclo di simulazione basato su seme è la legge. Il quanto è di 1/64 di secondo, ogni quanto viene sottoposto a hashing e un'azione del giocatore si estende su molti quanti. La riproduzione si basa sul seme più sul registro di ciò che è stato accettato. Il modello propone intenzioni, convinzioni tipizzate e bozze di oggetti; il controllore per tale classe accetta o rifiuta. Le bozze di verbi e i file di mondo attendono fino al momento del caricamento e superano una suite di test. L'host riceve i fotogrammi impegnati e restituisce le intenzioni. La presentazione non ha un percorso di ritorno all'hash.

## Modello di fiducia

Il motore viene eseguito localmente e accede solo ai file all'interno della propria directory di checkout: mondi, bozze di verbi, fixture e qualsiasi registro che si richieda a un comando di scrivere. `host` lega `127.0.0.1`. Nessun comando apre altre socket; lo strumento `propose` congelato, una volta che una persona lo scongela, comunica con un server Ollama locale e con nessun altro. Nessuna credenziale viene letta, archiviata o inviata. Nessun dato di telemetria viene raccolto. Il contenuto creato viene considerato non affidabile e viene convalidato al caricamento; un file rifiutato non cambia nulla. Il file binario WebAssembly viene costruito a partire dal codice sorgente in CI e viene fissato tramite il suo SHA-256, non viene mai inserito come byte. Vedere [SECURITY.md](SECURITY.md).

## Stato del supporto

Versione precedente alla 1.0, rilasciata come `0.x` da `main`. Non è garantita la compatibilità tra le diverse versioni; ogni modifica alla regola hash è registrata in [CHANGELOG.md](CHANGELOG.md) insieme all’hash corrispondente. Testata su Node 22 e Rust 1.98.1 su Ubuntu in ambiente CI e compilata quotidianamente su Windows 11.

## Licenza

MIT. Realizzata da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
