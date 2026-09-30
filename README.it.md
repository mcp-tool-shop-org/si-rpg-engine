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

si-rpg-engine è un motore di simulazione per mondi 3D che riproduce esattamente gli eventi. Esegue la fisica a un ritmo fisso di 64 passaggi al secondo, registra un'impronta del mondo dopo ogni passaggio e può ricostruire qualsiasi simulazione a partire dal seme iniziale e dagli input ricevuti, bit per bit. La fisica è scritta in Rust e compilata in un unico file WebAssembly. Un modello linguistico può suggerire cosa accadrà dopo; regole scritte a mano decidono cosa viene incluso. È l'equivalente di [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) e viene valutato in base a ciò che simula.

## Cos'è e quali sono i suoi obiettivi

I motori JavaScript alla base di Chrome, Firefox e Safari, ovvero V8, SpiderMonkey e JavaScriptCore, stampano la stessa impronta per lo stesso mondo a ogni commit e la stessa simulazione fisica la stampa su x64 e ARM64. Tutto il resto si basa su questa promessa: due macchine concordano su un mondo, byte per byte, dato un seme e un elenco di input accettati. Su questo si basano corpi che cadono, scivolano, spingono, si ribaltano e rotolano in tre dimensioni; un personaggio che cammina, scala pendii, trasporta oggetti e li appoggia; file di mondo che vengono rifiutati con una motivazione quando sono errati; e personaggi con una mente che vede, ricorda ciò che ha visto e rifiuta una convinzione basata su prove più vecchie rispetto a quelle che sostituirebbe.

L'obiettivo è essere il motore di simulazione all'interno di un host: un browser, Godot o Unreal disegna l'immagine e invia gli input, mentre la fisica, l'impronta e la registrazione rimangono qui. Il lavoro attuale è la suite di test di cui ha bisogno un motore pronto per la distribuzione, e la maggior parte di essa è costituita da: una traccia che indica il primo passaggio e il valore in cui due simulazioni divergono, un salvataggio e un ripristino che si dimostrano esatti, una seconda architettura CPU, un controllo sulla fisica compilata e test che verificano cosa ha fatto il mondo piuttosto che solo la sua impronta. La collisione tra mesh è implementata: una scena può specificare una singola mesh triangolare fissa e la scena risultante non ne specifica nessuna. L'host si connette alla socket in [docs/host-binding.md](docs/host-binding.md). Il design e i piani sono disponibili in [docs/PHASE-0.md](docs/PHASE-0.md), [docs/PHASE-1.md](docs/PHASE-1.md) e [docs/PHASE-2.md](docs/PHASE-2.md).

## Cosa viene costruito

| Capacità. | Dove. | Prova. |
|---|---|---|
| Un passo a intervalli fissi; lo stato di ogni passo viene sottoposto a hash con un FNV-1a a due canali su ogni valore f64; NaN e infiniti vengono rifiutati; lo zero con segno viene normalizzato. | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` ha letto `0d38671370d12d1e` dall'inizio dei test. |
| La legge della fisica in Rust su `rapier3d-f64` con `enhanced-determinism`, un singolo file binario WebAssembly con il suo hash Linux memorizzato; un mondo fisico in esecuzione, ricostruito solo quando la geometria cambia, con un corpo sostituito al suo posto quando un'azione inizia o termina. | `solver/` | `fixtures/solver.sha256`, che viene ricostruito e confrontato dal CI; `harness/switch.test.js`. |
| Corpi con posizione, velocità, un quaternione canonico, velocità angolare e metà estensioni; i box dinamici ruotano; un personaggio cinematico con un autostep di 0,3, una scalata di 45° e uno snap di 0,2; il tempo di inattività viene calcolato in passaggi. | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| La spinta del personaggio attraverso la copia del motore della routine di impulso di Rapier, con la successiva correzione di Rapier applicata retroattivamente, in modo che un corpo venga spinto solo nei suoi punti di contatto e l'impulso di ogni punto sia dimensionato in base alla massa effettiva del corpo in quel punto, inclusa la sua rotazione; una guardia nella fisica fa fallire qualsiasi spinta che lasci un corpo più veloce di un multiplo dichiarato della velocità del suo spingitore. | `solver/src/impulses.rs` | `harness/push.test.js`, `fixtures/push/red-room-a.json` e un test nativo che la copia senza la correzione spinge come farebbe la routine di Rapier, bit per bit. |
| Un corpo guidato non interagisce con un corpo dinamico. Un collider guidato è nel gruppo di solver 3 ed esclude il gruppo 2; un collider dinamico è nel gruppo 2 ed esclude il gruppo 3. Gli oggetti statici mantengono le impostazioni predefinite di Rapier. I gruppi di collisione non cambiano, quindi la fase di filtraggio continua a trovare la coppia. Non c'è un'interruzione JavaScript. Nella stanza di test, entrambi i box rimangono al di sotto di 1 m/s. La velocità di 16 m/s del personaggio corrisponde a un passo di 0,25 m in un singolo quantum, che è il passo. | `solver/src/rapier_law.rs` | `harness/step-up-121.test.js`, `harness/sweep.test.js` e un test nativo che i gruppi si escludono a vicenda e che il gestore del collider rimane. |
| Una singola mesh triangolare fissa. Una scena può specificarla e la scena risultante non ne specifica nessuna. Il costruttore rifiuta una mesh che il caricatore rifiuterebbe e la legge rifiuta un indice fuori intervallo, un indice ripetuto o un vertice non finito prima che la mesh venga costruita. Un modulo di fisica intrappolato viene eliminato. Un caricamento o un passo rifiutati non mantengono quel mondo né copiano i corpi. | `solver/src/rapier_law.rs`, `packages/tick/scene.js`, `packages/tick/world.js` | `harness/mesh.test.js`, `harness/mesh-refusal.test.js` |
| File di mondo: corpi, collider statici orientati, heightfield, zone come partizione, dodici rifiuti di caricamento, pericoli al caricamento e un indice di cui l'host si fida; le azioni si trovano sulla stessa superficie del terreno a due triangoli con cui la fisica entra in collisione. | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js`, `harness/surface.test.js` |
| Una scansione di raggiungibilità quando un mondo viene ammesso: i suoi stati raggiungibili vengono esplorati con le azioni ammesse, attraverso il checker, a partire dai salvataggi del passo stesso. Una zona che non è raggiungibile, un corpo trasportato fuori dal mondo o un lancio rifiutano il mondo, con una testimonianza che `replay` riproduce. | `packages/load/sweep.js` | `harness/sweep.test.js`, le stanze di test chiuse in `fixtures/sweep/`. |
| Azioni ammesse al caricamento con gli effetti `drive`, `climb`, `carry`, `release` e `episode`, ciascuna con scenari di pericolo. | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| Menti: vista con linea di vista, convinzioni tipizzate che citano l'episodio da cui provengono, sostituzione tramite lapide, scritture obsolete rifiutate e obiettivi permanenti con un flag "soddisfatto". | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| Una traccia di ogni passo in bit esatti e uno strumento che indica il primo passo, il corpo e il campo in cui due simulazioni divergono. | `harness/trace.mjs`, `harness/first-difference.js` | `harness/trace.test.js`; il CI stampa la prima differenza quando un motore si discosta dal valore di riferimento. |
| Numeri di comportamento accanto al valore di riferimento: il passo di inattività e la posizione finale di ogni corpo, la zona del personaggio e la lunghezza e l'hash dello snapshot. | `fixtures/golden-behaviour.json`, `harness/check.js` | `harness/check.test.js` |
| Salvataggio e ripristino in tre modi: riproducendo gli input di un passo, copiando la memoria del modulo di fisica o utilizzando il salvataggio dello stato completo del passo stesso, che ripristina senza riproduzione; ciascuno di essi si dimostra in grado di continuare esattamente. | `packages/tick/runs.js`, `packages/tick/tick.js`, `solver/build.mjs` | `harness/restore.test.js` |
| Bundle: un test fallito scrive il suo seme, il mondo, gli input accettati e gli hash, che `replay` riproduce con un singolo comando; un job settimanale riproduce ogni bundle, scenario e log per un periodo di tempo molto più lungo di quanto possa fare una richiesta di pull. | `packages/tick/bundle.js`, `.github/workflows/corpus.yml` | `harness/bundle.test.js` |
| Un singolo eseguibile su due architetture CPU, con la memoria fissata a 32 MiB e un controllo che rifiuta le istruzioni scelte dall'host, l'aumento della memoria e lo stato mantenuto al di fuori della memoria. | `solver/build.rs`, `solver/src/arena.rs`, `solver/lint.mjs` | Job ARM64 di CI; `solver/lint.test.js`, `harness/caps.test.js` |
| Test di ciò che ha fatto il mondo: un percorso per il personaggio ai limiti misurati del controller, un passo completo ad ogni passo di una lunga camminata su terreno pianeggiante e nessun passo che affonda nel pavimento, un corpo sottile e veloce contro una parete sottile, giunti del terreno e l'intera scena spostata di un milione di unità. | `harness/course.test.js`, `harness/outcome.test.js` | `write-golden` rifiuta di scrivere finché uno di essi fallisce. |
| La "banca di prova" dello strumento: una modifica e la build precedente, ogni albero eseguito in un processo separato. Assegna un nome al codice e ai dati toccati dalla modifica, esegue ogni input candidato su entrambi gli alberi e segnala cosa ha raggiunto la modifica, dove le due esecuzioni divergono per la prima volta e cosa fallisce solo con la modifica, ogni risultato dal motore e nessuno da un modello. La portata della "legge" viene letta da una build di copertura la cui esecuzione deve corrispondere fotogramma per fotogramma alla build del prodotto, e i "mutanti" inseriti nella modifica misurano la "banca di prova". | `packages/bench` | 86 test in `packages/bench/` contro modifiche con effetti noti; la modifica della "legge" di F2, inserita manualmente, è stata trovata al livello 98. |
| Ruoli per i modelli: un manifesto per ogni ruolo, la "Regola dei Due" derivata da ciò che legge il ruolo, un "gate" di ruolo nel checker, la provenienza per ogni ammissione, etichette di fiducia che rimangono con una credenza e ogni chiamata al modello registrata e verificata senza una GPU; entrambi i ruoli dichiarati sono fissi. | `predicates/roles/`, `packages/tick/roles.js`, `packages/tick/gate.js`, `packages/propose` | `packages/tick/gate.test.js`, `packages/propose/record.test.js` durante le sessioni in `fixtures/sessions/` |
| Riproduzione da un seme e un log, e un binding dell'host per il flusso di fotogrammi, la "porta delle intenzioni" e la regola di fusione. | `packages/tick/replay.js`, `packages/host`, `docs/host-binding.md` | `fixtures/first-scene-played.json` è l'esecuzione di una persona attraverso il confine dell'host; `harness/binding.test.js` esegue lo scenario attraverso il socket. |

521 test, sette scenari comportamentali che riproducono passo dopo passo, e due hash "oro" stampati da tre motori su x64 e da node su ARM64, ad ogni commit.

## Installazione

Requisiti: Node 20 o versione successiva e la toolchain Rust con il target `wasm32-unknown-unknown` per la build della fisica. CI fissa Rust 1.98.1; `rustup target add wasm32-unknown-unknown` è l'unico passaggio aggiuntivo dopo l'installazione di rustup.

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, both goldens, and the behaviour numbers under node
```

`npm test` compila la fisica e controlla l'eseguibile per primo. Su Linux, la build viene confrontata con il digest fissato; su un altro host, segnala il proprio digest, perché la build di Linux è l'artefatto fissato.

## Utilizzo

Ogni comando viene eseguito da qualsiasi directory, risponde a `--help`, esce con codice 0 in caso di successo, 1 con una motivazione in caso di rifiuto e 2 in caso di errore di utilizzo o di un errore imprevisto. `--debug` consente la visualizzazione di una traccia dello stack.

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

Una modifica può essere misurata rispetto alla build precedente. La "banca di prova" viene eseguita manualmente e nessun flusso di lavoro la esegue:

```bash
npx bench trees . main HEAD ../trees                # the base and the head as git worktrees, the head's binary built in its own tree
npx bench anchors --base ../trees/base --head ../trees/head    # the code and data the change touches, as JSON
npx bench run --base ../trees/base --head ../trees/head --out ../bench --product-scene    # reach, differences, and catches, with a report
```

Il report indica il suo seme, conta i suoi budget in "quanta" e "restore" e indica cosa non ha misurato; due esecuzioni con un singolo seme producono lo stesso report al di fuori del loro blocco di ambiente. Quando `solver/` cambia, ogni albero compila il proprio eseguibile e la portata della "legge" deriva da una build di copertura dell'head che deve eseguire la scena del prodotto esattamente come fa la build del prodotto, altrimenti la "banca di prova" si interrompe con la motivazione.

Un mondo si ripristina in tre modi e nessuno scrive nello stato interno del motore fisico, motivo per cui ognuno è esatto. È possibile riprodurre i suoi input accettati fino a un determinato passo. È possibile copiare l'intera memoria del modulo fisico con `imageSolver()` e ripristinarla con `restoreImage()`. Oppure è possibile salvare l'intero "tick" con `save()` e ripristinarlo con `restore(saved)`, il che non richiede la riproduzione ed è il modo in cui la scansione ritorna a uno stato migliaia di volte. Un'immagine proveniente da un altro eseguibile, di lunghezza errata o con un byte modificato, viene rifiutata e un salvataggio che non verifica l'intero contenuto non cambia nulla.

La vista di debug è una vista di debug. Disegna i fotogrammi impegnati come caselle proiettate lungo l'asse scelto con `x`, `y` o `z`; un clic è un target sul piano di terra; `M`, `C`, `G`, `D` e `U` scelgono muovi, arrampica, prendi, lascia e usa; la zona del personaggio e le credenze di ogni "mente" si trovano accanto al "tick" e all'hash. Non disegna mai nulla che il "tick" non contenga.

Un file del mondo è in formato JSON: `name`, `seed`, `bodies`, `colliders`, `zones` e, facoltativamente, `heightfield`, `mesh` e `goal`. Una mesh è `{ positions, indices }`. Un corpo è `{ id, x, y, z, vx, vy, vz, hx, hy, hz }` con un quaternione e una velocità angolare opzionali; un collider statico è una scatola definita dai suoi limiti con un quaternione opzionale attorno al suo centro; una zona è una scatola con nome. I campi sconosciuti, gli ID duplicati, i corpi sovrapposti, un corpo all'interno di un collider, un quaternione non unitario, una zona degenerata o irraggiungibile e un obiettivo che non nomina nulla vengono tutti rifiutati con una motivazione.

## La "legge", in un solo respiro

Un "tick" con seme è la "legge". Un corpo guidato e un corpo dinamico non condividono un contatto del solver e la fase "narrow" trova comunque la coppia. Un passo, un "quanta", è di 1/64 di secondo; ogni passo viene sottoposto a hash e l'azione di un personaggio si estende su molti passi. La riproduzione è il seme più il log di ciò che è stato ammesso. Il modello propone intenzioni, credenze tipizzate e bozze del corpo; il checker per quella classe le ammette o le rifiuta. Le bozze delle azioni e i file del mondo attendono fino al momento del caricamento e superano una suite di test. L'host riceve i fotogrammi impegnati e restituisce le intenzioni. La presentazione non ha un percorso di ritorno all'hash.

## Modello di fiducia

Il motore viene eseguito in locale e accede solo ai file all’interno della sua directory di lavoro: mondi, bozze di azioni, elementi di scena e qualsiasi registro in cui un comando è autorizzato a scrivere. `host` associa solo `127.0.0.1`. `bench` è l’eccezione alla directory di lavoro: scrive le sue strutture dati e il suo report dove viene indicato, ed esegue ogni struttura dati in un processo figlio separato. Nessun comando apre socket diversi da `propose`, che comunica con un server Ollama locale e nessun altro, e solo per un ruolo il cui manifesto è stato sbloccato per operare in un mondo nuovo; entrambi i ruoli dichiarati dal motore sono bloccati, quindi rifiuta prima che venga caricato qualsiasi modello client. Una proposta di modello entra nel mondo solo attraverso il gateway del ruolo, che la vincola al manifesto del ruolo. Per creare la fisica di una struttura dati, `bench` esegue `cargo build --locked`, come fa il processo di creazione del solver, e cargo recupera un pacchetto specifico da crates.io solo quando non è presente nella cache. Nessuna credenziale viene letta, archiviata o inviata. Nessun dato di telemetria viene raccolto. Il contenuto creato non è considerato attendibile e viene convalidato al momento del caricamento; un file rifiutato non modifica nulla. Il file binario WebAssembly viene creato a partire dal codice sorgente in CI e viene bloccato tramite il suo hash SHA-256, e non viene mai salvato come file binario. La sua memoria è fissata a 32 MiB e non può aumentare, quindi un mondo troppo denso per esso si interrompe nello stesso modo su ogni host invece di divergere. Consultare [SECURITY.md](SECURITY.md).

## Stato del supporto

Pre-1.0, rilasciato come `0.x` da `main`. Non esiste alcuna garanzia di compatibilità tra le versioni; ogni modifica alla legge con hash viene registrata in [CHANGELOG.md](CHANGELOG.md) insieme all’hash finale prodotto. Testato su Node 22 e Rust 1.98.1 su Ubuntu x64 e ARM64 in CI, e compilato quotidianamente su Windows 11.

## Licenza

MIT, ad eccezione di `solver/src/kcc.rs` e `solver/src/impulses.rs`, copie modificate di parti del controller dei personaggi di Rapier, che sono soggette alla licenza Apache 2.0 (`solver/LICENSE-APACHE-2.0`, `solver/NOTICE`). Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
