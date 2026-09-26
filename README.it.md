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

si-rpg-engine è un motore di simulazione per mondi 3D che esegue esattamente le stesse azioni. Esegue i calcoli fisici a una velocità fissa di 64 passaggi al secondo, registra un'impronta del mondo dopo ogni passaggio e può ricostruire qualsiasi esecuzione a partire dal seme iniziale e dagli input che ha ricevuto, bit per bit. La fisica è scritta in Rust e compilata in un unico file WebAssembly. Un modello linguistico può suggerire cosa accadrà dopo; regole scritte a mano decidono cosa viene incluso. È l'equivalente di [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) e viene valutato in base a ciò che simula.

## Cos'è e cosa si prefigge di essere

I motori JavaScript alla base di Chrome, Firefox e Safari, ovvero V8, SpiderMonkey e JavaScriptCore, stampano la stessa impronta per lo stesso mondo a ogni commit e lo stesso motore fisico la stampa su x64 e ARM64. Tutto il resto si basa su questa promessa: due macchine concordano su un mondo, byte per byte, dato un seme e un elenco di input accettati. Su questo si basano corpi che cadono, scivolano, spingono, si ribaltano e rotolano in tre dimensioni; un personaggio che cammina, scala pendii, trasporta oggetti e li appoggia; file di mondo che vengono rifiutati con una motivazione quando sono errati; e personaggi con una mente che vede, ricorda ciò che ha visto e rifiuta una credenza basata su prove più vecchie rispetto a quelle che sostituirebbe.

Ciò che si prefigge di essere è il motore di simulazione all'interno di un host: un browser, Godot o Unreal disegna l'immagine e invia gli input, mentre la fisica, l'impronta e la registrazione rimangono qui. Il lavoro attuale è la suite di test di cui ha bisogno un motore pronto per la distribuzione, e la maggior parte di essa è costituita da: una traccia che indica il primo passaggio e il valore in cui due esecuzioni divergono, un salvataggio e un ripristino che si dimostrano esatti, una seconda architettura CPU, un controllo sul codice fisico compilato e test che verificano cosa ha fatto il mondo piuttosto che solo la sua impronta. Dopo la suite, ci sono le collisioni tra mesh e un binding per l'host. Il design e i piani sono disponibili in [docs/PHASE-0.md](docs/PHASE-0.md), [docs/PHASE-1.md](docs/PHASE-1.md) e [docs/PHASE-2.md](docs/PHASE-2.md).

## Cosa viene costruito

| Capacità | Dove | Prova |
|---|---|---|
| Un ciclo a passo fisso; lo stato di ogni passaggio viene sottoposto a hashing con un FNV-1a a due canali su ogni f64; NaN e infiniti vengono rifiutati; lo zero con segno viene normalizzato | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` ha letto `0d38671370d12d1e` dall'inizio del test |
| La legge fisica in Rust su `rapier3d-f64` con `enhanced-determinism`, un singolo file binario WebAssembly con il suo hash Linux memorizzato; un mondo fisico in esecuzione, ricostruito solo quando la geometria cambia, con un corpo sostituito al suo posto quando un'azione inizia o termina | `solver/` | `fixtures/solver.sha256`, che viene ricostruito e confrontato dal CI; `harness/switch.test.js` |
| Corpi con posizione, velocità, un quaternione canonico, velocità angolare e metà estensioni; i box dinamici ruotano; un personaggio cinematico con un autostep di 0,3, una salita di 45° e uno snap di 0,2; il tempo di inattività viene conteggiato in passaggi | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| La spinta del personaggio attraverso la copia del motore della routine di impulso di Rapier, con la successiva correzione di Rapier applicata retroattivamente, in modo che un corpo venga spinto solo nei suoi punti di contatto e l'impulso di ogni punto sia dimensionato in base alla massa effettiva del corpo in quel punto, inclusa la sua rotazione; una guardia nella fisica fa fallire qualsiasi spinta che lasci un corpo più veloce di un multiplo dichiarato della velocità del suo propulsore | `solver/src/impulses.rs` | `harness/push.test.js`, `fixtures/push/red-room-a.json` e un test nativo che la copia senza la correzione spinge come fa la routine di Rapier, bit per bit |
| File di mondo: corpi, collider statici orientati, heightfield, zone come partizione, dodici rifiuti di caricamento, pericoli al caricamento e un indice di cui l'host si fida; le azioni si trovano sulla stessa superficie del terreno a due triangoli con cui la fisica entra in collisione | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js`, `harness/surface.test.js` |
| Una scansione di raggiungibilità quando un mondo viene ammesso: i suoi stati raggiungibili vengono esplorati con le azioni ammesse, attraverso il checker, a partire dai salvataggi del ciclo stesso. Una zona che non è raggiungibile, un corpo trasportato fuori dal mondo o un lancio rifiutano il mondo, con un testimone che `replay` riproduce | `packages/load/sweep.js` | `harness/sweep.test.js`, le stanze di test chiuse in `fixtures/sweep/` |
| Azioni ammesse al caricamento con gli effetti `drive`, `climb`, `carry`, `release` e `episode`, ciascuna con scenari di pericolo | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| Menti: vista con linea di vista, credenze tipizzate che citano l'episodio da cui provengono, sostituzione tramite lapide, scritture obsolete rifiutate e obiettivi permanenti con un flag "soddisfatto" | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| Una traccia di ogni passaggio in bit esatti e uno strumento che indica il primo passaggio, il corpo e il campo in cui due esecuzioni divergono | `harness/trace.mjs`, `harness/first-difference.js` | `harness/trace.test.js`; il CI stampa la prima differenza quando un motore si discosta dal valore di riferimento |
| Numeri di comportamento accanto al valore di riferimento: il passo di inattività e la posizione finale di ogni corpo, la zona del camminatore e la lunghezza e l'hash dello snapshot | `fixtures/golden-behaviour.json`, `harness/check.js` | `harness/check.test.js` |
| Salvataggio e ripristino in tre modi: riproducendo gli input di un passaggio, copiando la memoria del modulo fisico o utilizzando il salvataggio dello stato completo del ciclo stesso, che ripristina senza riproduzione; ciascuno di essi si dimostra in grado di continuare esattamente | `packages/tick/runs.js`, `packages/tick/tick.js`, `solver/build.mjs` | `harness/restore.test.js` |
| Bundle: un test fallito scrive il suo seme, il mondo, gli input accettati e gli hash, che `replay` riproduce con un singolo comando; un lavoro settimanale riproduce ogni bundle, fixture e log per un periodo di tempo molto più lungo di quanto possa fare una richiesta di pull | `packages/tick/bundle.js`, `.github/workflows/corpus.yml` | `harness/bundle.test.js` |
| Un singolo binario su due architetture CPU, con la memoria fissata a 32 MiB e un controllo che rifiuta le istruzioni scelte dall'host, la crescita della memoria e lo stato mantenuto al di fuori della memoria | `solver/build.rs`, `solver/src/arena.rs`, `solver/lint.mjs` | Il lavoro ARM64 di CI; `solver/lint.test.js`, `harness/caps.test.js` |
| Test di ciò che ha fatto il mondo: un percorso del personaggio ai limiti misurati del controller, un passo completo in ogni passaggio di una lunga camminata su una superficie piana e nessun passo affonda nel pavimento, un corpo sottile e veloce contro una parete sottile, giunture del terreno e l'intera scena spostata di un milione di unità | `harness/course.test.js`, `harness/outcome.test.js` | `write-golden` rifiuta di scrivere se uno di questi test fallisce |
| La "bench" dello strumento: una modifica e la configurazione precedente, ogni albero viene eseguito in un processo a sé stante. Identifica il codice e i dati interessati dalla modifica, esegue ogni input candidato su entrambi gli alberi e segnala cosa ha raggiunto la modifica, dove le due esecuzioni divergono per la prima volta e cosa fallisce solo con la modifica, ogni risultato fornito dal motore e nessuno da un modello. La portata della "legge" viene letta da una configurazione di copertura la cui esecuzione deve corrispondere fotogramma per fotogramma alla configurazione del prodotto, e i "mutanti" inseriti nella modifica misurano la "bench". | `packages/bench` | 86 test in `packages/bench/` contro modifiche con effetti noti; la modifica della "legge" di F2, inserita manualmente, è stata rilevata al livello 98. |
| Ruoli per le "sedute" del modello: un manifesto per ogni ruolo, la "Regola dei Due" derivata da ciò che legge il ruolo, un "gate" di ruolo nel checker, la provenienza per ogni ammissione, etichette di fiducia che rimangono associate a una credenza e ogni chiamata al modello registrata e verificata senza una GPU; entrambi i ruoli dichiarati sono bloccati. | `predicates/roles/`, `packages/tick/roles.js`, `packages/tick/gate.js`, `packages/propose` | `packages/tick/gate.test.js`, `packages/propose/record.test.js` durante le sessioni in `fixtures/sessions/` |
| Riproduzione da un seme e un log, e una visualizzazione di debug del "tick" su localhost. | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json` è l'interazione di una persona attraverso il confine dell'host. |

474 test, sette "fixture" comportamentali che riproducono passo dopo passo, e due hash "golden" stampati da tre motori su x64 e da node su ARM64, per ogni commit.

## Installazione

Requisiti: Node 20 o versione successiva e la toolchain Rust con il target `wasm32-unknown-unknown` per la configurazione della fisica. CI utilizza Rust 1.98.1; `rustup target add wasm32-unknown-unknown` è il passaggio aggiuntivo dopo l'installazione di rustup.

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, both goldens, and the behaviour numbers under node
```

`npm test` crea la fisica e verifica il binario per primo. Su Linux, la configurazione viene confrontata con l'hash "pinned"; su un altro host, segnala il proprio hash, perché la configurazione Linux è l'artefatto "pinned".

## Utilizzo

Ogni comando viene eseguito da qualsiasi directory, risponde `--help`, termina con codice 0 in caso di successo, 1 con una motivazione in caso di rifiuto e 2 in caso di errore di utilizzo o di errore imprevisto. `--debug` consente la visualizzazione di una traccia dello stack.

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

Quando due esecuzioni non concordano, la traccia indica dove:

```bash
node harness/trace.mjs > a.trace                    # the product scene, one line per step in exact bits
node harness/first-difference.js a.trace b.trace    # identical, or the first step, body, and field that differ
node solver/lint.mjs                                # refuse a binary that could grow memory or let the host choose a result
```

Una modifica può essere misurata rispetto alla configurazione precedente. La "bench" viene eseguita manualmente e nessun flusso di lavoro la esegue:

```bash
npx bench trees . main HEAD ../trees                # the base and the head as git worktrees, the head's binary built in its own tree
npx bench anchors --base ../trees/base --head ../trees/head    # the code and data the change touches, as JSON
npx bench run --base ../trees/base --head ../trees/head --out ../bench --product-scene    # reach, differences, and catches, with a report
```

Il report indica il suo seme, conta i suoi "budget" in "quanta" e "restore" e indica cosa non ha misurato; due esecuzioni con un seme forniscono lo stesso report al di fuori del loro blocco di ambiente. Quando `solver/` cambia, ogni albero crea il proprio binario e la portata della "legge" deriva da una configurazione di copertura dell'head che deve eseguire la scena del prodotto esattamente come fa la configurazione del prodotto, altrimenti la "bench" si interrompe con la motivazione.

Un mondo viene ripristinato in tre modi e nessuno di essi scrive nello stato interno del motore fisico, motivo per cui ognuno è preciso. È possibile riprodurre i suoi input accettati fino a un determinato passo. È possibile copiare l'intera memoria del modulo fisico con `imageSolver()` e ripristinarla con `restoreImage()`. Oppure è possibile salvare l'intero "tick" con `save()` e ripristinarlo con `restore(saved)`, il che non richiede la riproduzione ed è il modo in cui la scansione ritorna a uno stato migliaia di volte. Un'immagine proveniente da un altro binario, di lunghezza errata o con un byte modificato, viene rifiutata e un salvataggio che non verifica l'intero contenuto non cambia nulla.

La visualizzazione di debug è una visualizzazione di debug. Disegna i fotogrammi "committed" come caselle proiettate lungo l'asse scelto con `x`, `y` o `z`; un clic è un target sul piano di base; `M`, `C`, `G`, `D` e `U` selezionano le azioni di movimento, arrampicata, raccolta, rilascio e utilizzo; la zona del "walker" e le credenze di ogni "mind" sono posizionate accanto al "tick" e all'hash. Non disegna mai nulla che il "tick" non contenga.

Un file di mondo è in formato JSON: `name`, `seed`, `bodies`, `colliders`, `zones` e, facoltativamente, `heightfield` e `goal`. Un corpo è `{ id, x, y, z, vx, vy, vz, hx, hy, hz }` con un quaternione e una velocità angolare facoltativi; un collider statico è una scatola definita dai suoi limiti con un quaternione facoltativo attorno al suo centro; una zona è una scatola con nome. I campi sconosciuti, gli ID duplicati, i corpi sovrapposti, un corpo all'interno di un collider, un quaternione non unitario, una zona degenerata o irraggiungibile e un obiettivo che non nomina nulla vengono tutti rifiutati con una motivazione.

## La legge, in un solo respiro

Un "tick" con seme è la legge. Un passo, un "quantum", è di 1/64 di secondo; ogni passo viene sottoposto a hash e l'azione di un personaggio si estende su molti passi. La riproduzione è il seme più il log di ciò che è stato ammesso. Il modello propone intenzioni, credenze tipizzate e bozze di corpo; il checker per quella classe le ammette o le rifiuta. Le bozze di azione e i file di mondo attendono fino al momento del caricamento e superano una suite di test. L'host riceve i fotogrammi "committed" e restituisce le intenzioni. La presentazione non ha un percorso di ritorno all'hash.

## Modello di fiducia

Il motore viene eseguito localmente e accede solo ai file all'interno della propria area di lavoro: mondi, bozze di azione, "fixture" e qualsiasi log che si chiede a un comando di scrivere. `host` lega `127.0.0.1`. `bench` è l'eccezione all'area di lavoro: scrive i suoi alberi e il suo report dove si specifica, ed esegue ogni albero in un processo figlio separato. Nessun comando apre altre socket tranne `propose`, che comunica con un server Ollama locale e solo per un ruolo il cui manifesto è stato "thawed" per agire in un mondo di prova; entrambi i ruoli dichiarati dal motore sono bloccati, quindi rifiuta prima che venga caricato qualsiasi client del modello. La proposta di un modello entra nel mondo solo attraverso il "gate" del ruolo, che la vincola al manifesto del ruolo. Per creare la fisica di un albero, `bench` esegue `cargo build --locked`, come fa la propria configurazione del solver, e cargo recupera un crate "pinned" da crates.io solo quando la sua cache non lo contiene. Non vengono lette, archiviate o inviate credenziali. Non vengono raccolti dati di telemetria. I contenuti creati sono considerati non affidabili e vengono convalidati al momento del caricamento; un file rifiutato non cambia nulla. Il binario WebAssembly viene creato dal codice sorgente in CI ed è "pinned" tramite il suo SHA-256, non viene mai "committed" come byte. La sua memoria è fissata a 32 MiB e non può aumentare, quindi un mondo troppo denso per esso si interrompe nello stesso modo su ogni host invece di divergere. Vedere [SECURITY.md](SECURITY.md).

## Stato del supporto

Versione precedente alla 1.0, rilasciata come `0.x` da `main`. Non è garantita la compatibilità tra le diverse versioni; ogni modifica alla funzione hash è registrata in [CHANGELOG.md](CHANGELOG.md) insieme al valore hash corrispondente. Testata su Node 22 e Rust 1.98.1 su Ubuntu x64 e ARM64 in ambiente CI, e compilata quotidianamente su Windows 11.

## Licenza

MIT, ad eccezione di `solver/src/kcc.rs` e `solver/src/impulses.rs`, ovvero copie modificate di parti del controller dei personaggi di Rapier, che sono soggette alla licenza Apache 2.0 (`solver/LICENSE-APACHE-2.0`, `solver/NOTICE`). Realizzato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
