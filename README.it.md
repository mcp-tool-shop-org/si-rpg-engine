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

si-rpg-engine è un motore di simulazione per mondi 3D che li riproduce esattamente. Esegue la fisica a un ritmo fisso di 64 passaggi al secondo, registra un'impronta del mondo dopo ogni passaggio e può ricostruire qualsiasi esecuzione a partire dal seme iniziale e dagli input che ha ricevuto, bit per bit. La fisica è scritta in Rust e compilata in un unico file WebAssembly. Un modello linguistico può suggerire cosa accadrà dopo; regole scritte a mano decidono cosa viene incluso. È l'equivalente di [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) e viene valutato in base a ciò che simula.

## Cos'è e a cosa aspira

I motori JavaScript alla base di Chrome, Firefox e Safari, ovvero V8, SpiderMonkey e JavaScriptCore, stampano la stessa impronta per lo stesso mondo a ogni commit e la stessa simulazione fisica la stampa su x64 e ARM64. Tutto il resto si basa su questa promessa: due macchine concordano su un mondo, byte per byte, dato un seme e un elenco di input accettati. Su questo si basano corpi che cadono, scivolano, spingono, si inclinano e rotolano in tre dimensioni; un personaggio che cammina, scala pendii, trasporta oggetti e li appoggia; file di mondo che vengono rifiutati con una motivazione quando sono errati; e personaggi con una mente che vede, ricorda ciò che ha visto e rifiuta una credenza basata su prove più vecchie di quelle che sostituirebbe.

L'obiettivo è che sia il motore di simulazione all'interno di un host: un browser, Godot o Unreal disegna l'immagine e invia gli input, mentre la fisica, l'impronta e la registrazione rimangono qui. Il lavoro attuale è la suite di test di cui ha bisogno un motore pronto per la distribuzione, e la maggior parte di essa è costituita da: una traccia che indica il primo passaggio e il valore in cui due esecuzioni divergono, un salvataggio e un ripristino che si dimostrano esatti, una seconda architettura CPU, un controllo sulla fisica compilata e test che verificano cosa ha fatto il mondo piuttosto che solo la sua impronta. Dopo la suite, ci sono le collisioni da mesh e un binding per l'host. Il design e i piani sono disponibili in [docs/PHASE-0.md](docs/PHASE-0.md), [docs/PHASE-1.md](docs/PHASE-1.md) e [docs/PHASE-2.md](docs/PHASE-2.md).

## Cosa viene costruito

| Capacità | Dove | Prova |
|---|---|---|
| Un passo a intervalli fissi; lo stato di ogni passo viene sottoposto a hash con un FNV-1a a due canali su ogni f64; NaN rifiutato; zero con segno normalizzato | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` ha letto `0d38671370d12d1e` dall'inizio del test |
| Legge fisica in Rust su `rapier3d-f64` con `enhanced-determinism`, un unico file binario WebAssembly, digest di Linux fissato | `solver/` | `fixtures/solver.sha256`; CI ricostruisce e confronta |
| Corpi con posizione, velocità, un quaternione normalizzato, velocità angolare e metà estensioni; le scatole dinamiche ruotano; un personaggio cinematico con un autostep di 0,3, una scalata di 45° e uno snap di 0,2; il riposo viene conteggiato in passaggi | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| File di mondo: corpi, collider statici orientati, heightfield, zone come partizione, dodici rifiuti di caricamento, pericoli al caricamento e un indice di cui l'host si fida; le azioni si trovano sulla stessa superficie del terreno a due triangoli con cui la fisica entra in collisione | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js`, `harness/surface.test.js` |
| Verbi accettati al caricamento con effetti `drive`, `climb`, `carry`, `release`, `episode`, ciascuno con scenari di pericolo | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| Menti: vista con linea di vista, credenze tipizzate che citano l'episodio da cui provengono, sostituzione tramite lapide, scritture obsolete rifiutate e obiettivi in sospeso con un flag "soddisfatto" | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| Una traccia di ogni passaggio in bit esatti e uno strumento che indica il primo passaggio, il corpo e il campo in cui due esecuzioni divergono | `harness/trace.mjs`, `harness/first-difference.js` | `harness/trace.test.js`; CI stampa la prima differenza quando un motore si discosta dal valore di riferimento |
| Numeri di comportamento accanto al valore di riferimento: il passo di riposo e la posizione finale di ogni corpo, la zona del camminatore e la lunghezza e il digest dello snapshot | `fixtures/golden-behaviour.json`, `harness/check.js` | `harness/check.test.js` |
| Salvataggio e ripristino in due modi, riproducendo gli input a un passaggio o copiando la memoria del modulo di fisica, entrambi dimostrati per continuare esattamente | `harness/replay-to.mjs`, `solver/build.mjs` | `harness/restore.test.js` |
| Un binario su due architetture CPU, con la memoria fissata a 32 MiB e un controllo che rifiuta le istruzioni scelte dall'host, la crescita della memoria e lo stato mantenuto al di fuori della memoria | `solver/build.rs`, `solver/src/arena.rs`, `solver/lint.mjs` | Lavoro ARM64 di CI; `solver/lint.test.js`, `harness/caps.test.js` |
| Test di ciò che ha fatto il mondo: un percorso del personaggio ai limiti misurati del controller, un corpo sottile e veloce contro una parete sottile e giunzioni del terreno | `harness/course.test.js`, `harness/outcome.test.js` | `write-golden` rifiuta di scrivere se uno di questi fallisce |
| Riproduzione da seme e registro; una vista di debug del ciclo di simulazione su localhost | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json` è la simulazione di una persona attraverso il confine dell'host |

174 test, sette fixture di comportamento che riproducono passo dopo passo e due hash di riferimento stampati da tre motori su x64 e da node su ARM64, a ogni commit.

## Installazione

Requisiti: Node 20 o versione successiva e la toolchain Rust con il target `wasm32-unknown-unknown` per la compilazione del risolutore. CI fissa Rust 1.98.1; `rustup target add wasm32-unknown-unknown` è l'unico passaggio aggiuntivo dopo l'installazione di rustup.

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, both goldens, and the behaviour numbers under node
```

`npm test` compila prima il risolutore. Su Linux, la build viene confrontata con il digest fissato; su un altro host, segnala il proprio digest, perché la build di Linux è l'artefatto fissato.

## Utilizzo

Ogni comando viene eseguito da qualsiasi directory, restituisce `--help`, esce con codice 0 in caso di successo, 1 con una motivazione in caso di rifiuto e 2 in caso di errore di utilizzo o di errore imprevisto. `--debug` consente la visualizzazione di una traccia dello stack.

```bash
npx play proposals.json --seed 7 --log out.json    # run proposals through the tick and print every committed frame
npx replay out.json                                 # rerun a log; fails on the first hash that differs
npx load world worlds/crate-and-door.json           # validate a world, run its hazards, and write its load hash to the index
npx load admit fixtures/climb-draft.json            # compile an action draft, run the hazards for its effect, and add it to the catalog
npx load retire climb                               # take an action out of the catalog
npx host --world worlds/crate-and-door.json         # serve the debug view at http://127.0.0.1:4173
npx write-golden                                    # run the course and outcome tests, then rewrite the goldens and name what moved
```

Quando due esecuzioni non concordano, la traccia indica dove:

```bash
node harness/trace.mjs > a.trace                    # the product scene, one line per step in exact bits
node harness/first-difference.js a.trace b.trace    # identical, or the first step, body, and field that differ
node solver/lint.mjs                                # refuse a binary that could grow memory or let the host choose a result
```

Un mondo si ripristina in due modi e nessuno di essi scrive nello stato interno del motore di fisica, motivo per cui entrambi sono esatti: riproduce i suoi input accettati a un passaggio o copia l'intera memoria del modulo di fisica con `imageSolver()` e la rimette con `restoreImage()`. Un'immagine da un altro binario, di lunghezza errata o con un byte modificato, viene rifiutata.

La vista di debug è una vista di debug. Disegna i fotogrammi impegnati come box proiettati lungo l'asse scelto con `x`, `y` o `z`; un clic è un target sul piano di terra; `M`, `C`, `G`, `D` e `U` selezionano le azioni di movimento, arrampicata, presa, rilascio e utilizzo; la zona del personaggio e le convinzioni di ogni mente sono visualizzate accanto al ciclo di simulazione e all'hash. Non disegna mai nulla che il ciclo di simulazione non tenga.

Un file di mondo è in formato JSON: `name`, `seed`, `bodies`, `colliders`, `zones` e, facoltativamente, `heightfield` e `goal`. Un oggetto è `{ id, x, y, z, vx, vy, vz, hx, hy, hz }` con un quaternione e una velocità angolare facoltativi; un collider statico è un box definito dai suoi limiti con un quaternione facoltativo attorno al suo centro; una zona è un box con nome. I campi sconosciuti, gli ID duplicati, gli oggetti sovrapposti, un oggetto all'interno di un collider, un quaternione non unitario, una zona degenerata o irraggiungibile e un obiettivo che non nomina nulla vengono tutti rifiutati con una motivazione.

## La legge, in un unico respiro

Un ciclo di simulazione basato su seme è la legge. Il quanto è di 1/64 di secondo, ogni quanto viene sottoposto a hashing e un'azione del giocatore si estende su molti quanti. La riproduzione si basa sul seme più sul registro di ciò che è stato accettato. Il modello propone intenzioni, convinzioni tipizzate e bozze di oggetti; il controllore per tale classe accetta o rifiuta. Le bozze di verbi e i file di mondo attendono fino al momento del caricamento e superano una suite di test. L'host riceve i fotogrammi impegnati e restituisce le intenzioni. La presentazione non ha un percorso di ritorno all'hash.

## Modello di fiducia

Il motore viene eseguito localmente e tocca solo i file all'interno del proprio checkout: mondi, bozze di azioni, fixture e qualsiasi log che si chiede a un comando di scrivere. `host` lega solo `127.0.0.1`. Nessun comando apre altre socket; lo strumento `propose` congelato, una volta che una persona lo scongela, comunica con un server Ollama locale e solo con quello. Nessuna credenziale viene letta, archiviata o inviata. Nessun dato di telemetria viene raccolto. Il contenuto creato è considerato non affidabile e viene convalidato al caricamento; un file rifiutato non cambia nulla. Il binario WebAssembly viene costruito dal codice sorgente in CI e viene fissato tramite il suo SHA-256, non viene mai committato come byte. La sua memoria è fissata a 32 MiB e non può crescere, quindi un mondo troppo denso per esso si interrompe nello stesso modo su ogni host invece di divergere. Vedere [SECURITY.md](SECURITY.md).

## Stato del supporto

Versione precedente alla 1.0, rilasciata come `0.x` da `main`. Non è garantita la compatibilità tra le diverse versioni; ogni modifica alla regola hash è registrata in [CHANGELOG.md](CHANGELOG.md) insieme all’hash corrispondente. Testata su Node 22 e Rust 1.98.1 su Ubuntu in ambiente CI e compilata quotidianamente su Windows 11.

## Licenza

MIT. Realizzata da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
