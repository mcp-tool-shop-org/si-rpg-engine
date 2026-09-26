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

si-rpg-engine è un motore di simulazione per mondi 3D che permette di riprodurre esattamente le stesse situazioni. Calcola la fisica a intervalli fissi di 64 volte al secondo, registra un'impronta del mondo dopo ogni intervallo e può ricostruire qualsiasi simulazione a partire dal punto di partenza e dagli input ricevuti, bit per bit. La fisica è implementata in Rust e compilata in un unico file WebAssembly. Un modello linguistico può suggerire cosa accadrà dopo; regole definite manualmente stabiliscono cosa viene incluso nella simulazione. È il complemento di [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) e viene valutato in base a ciò che simula.

## Cos’è e quali sono i suoi obiettivi

I motori JavaScript alla base di Chrome, Firefox e Safari, ovvero V8, SpiderMonkey e JavaScriptCore, generano la stessa impronta digitale per lo stesso ambiente virtuale a ogni iterazione, e la stessa configurazione fisica la genera sia su architettura x64 che ARM64. Tutto il resto si basa su questa premessa: due macchine concordano su un ambiente virtuale, byte per byte, dato un valore iniziale e un elenco di input accettati. Su questa base si costruiscono elementi che cadono, scivolano, si spingono, si inclinano e rotolano in tre dimensioni; un personaggio che cammina, scala pendii, trasporta oggetti e li appoggia; file che rappresentano l’ambiente virtuale e che vengono rifiutati con una motivazione quando sono errati; e personaggi dotati di una mente che osserva, ricorda ciò che ha visto e rifiuta una credenza basata su prove più datate rispetto a quelle che la sostituirebbero.

L’obiettivo è creare un nucleo di simulazione all’interno di un ambiente ospite: un browser, Godot o Unreal Engine generano le immagini e inviano gli input, mentre la fisica, l’impronta digitale e i dati vengono elaborati qui. Il lavoro attuale consiste nella creazione di una suite di test necessaria per un motore di gioco completo, e la maggior parte di essa è già implementata: un tracciamento che identifica il primo passaggio e il valore in cui due esecuzioni divergono, funzioni di salvataggio e ripristino che garantiscono la precisione, una seconda architettura CPU, un controllo sulla fisica compilata e test che verificano cosa è successo nel mondo, e non solo la sua impronta digitale. Dopo la suite, verranno implementate le collisioni tra mesh e il collegamento all’ambiente ospite. Il progetto e i piani sono disponibili in [docs/PHASE-0.md](docs/PHASE-0.md), [docs/PHASE-1.md](docs/PHASE-1.md) e [docs/PHASE-2.md](docs/PHASE-2.md).

## Cosa è stato costruito

| Capacità | Dove | Prova. |
|---|---|---|
| Un ciclo con intervallo di tempo fisso; lo stato di ogni ciclo viene sottoposto a una funzione di hash utilizzando l’algoritmo FNV-1a a due canali su ogni valore a 64 bit; i valori NaN e infiniti vengono rifiutati; lo zero con segno viene normalizzato. | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` ha letto `0d38671370d12d1e` fin dalla prima versione. |
| La simulazione fisica in Rust su `rapier3d-f64` con `enhanced-determinism` prevede un singolo file binario WebAssembly con l’hash specifico per Linux, un singolo ambiente di simulazione fisica in esecuzione, che viene ricostruito solo quando la geometria cambia, e un oggetto che viene sostituito al suo posto all’inizio o alla fine di un’azione. | `solver/` | `fixtures/solver.sha256`, che viene ricostruito e confrontato dal sistema di integrazione continua; `harness/switch.test.js` |
| Oggetti dotati di posizione, velocità, un quaternione canonico, velocità angolare e dimensioni massime; le scatole dinamiche ruotano; un personaggio cinematografico con un passo automatico di 0,3, un angolo di salita di 45° e un valore di scatto di 0,2; il conteggio del tempo di inattività avviene a passi. | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| File di gioco: corpi, collider statici orientati, mappe di altezza, zone utilizzate come partizioni, dodici punti di rifiuto del caricamento, pericoli presenti durante il caricamento e un indice di cui il sistema principale si fida; le azioni si svolgono sulla stessa superficie del terreno, composta da due triangoli, con cui interagiscono gli elementi fisici. | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js`, `harness/surface.test.js` |
| Quando un mondo viene ammesso, viene eseguita una verifica della raggiungibilità: i suoi stati raggiungibili vengono esplorati utilizzando le azioni ammesse, tramite il controllore, a partire dai dati salvati nel ciclo corrente. Una zona in cui nulla può essere raggiunto, un oggetto rimosso dal mondo o un lancio che rifiuta il mondo, con un elemento di controllo che `replay` riproduce. | `packages/load/sweep.js` | `harness/sweep.test.js`, le sale in cui si svolgono i test a porte chiuse presso `fixtures/sweep/`. |
| Le azioni ammesse al momento del caricamento sono quelle che producono gli effetti `drive`, `climb`, `carry`, `release` e `episode`, ciascuna delle quali è associata a specifici scenari di rischio. | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| Menti: capacità di visione, con indicazione della linea di vista, credenze associate all’episodio di provenienza, possibilità di sovrascrivere le informazioni con una nota, rifiuto di modifiche obsolete e obiettivi in corso con indicatore di completamento. | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| Ogni passaggio viene registrato con precisione, e uno strumento identifica il primo passaggio, il corpo principale e il campo in cui i due percorsi si separano. | `harness/trace.mjs`, `harness/first-difference.js` | `harness/trace.test.js`; CI stampa la prima differenza quando un motore esce dalla zona ottimale. |
| Dati relativi al comportamento, accanto a quelli relativi al soggetto principale: numero di passi compiuti e posizione finale di ogni soggetto, area di movimento del soggetto e durata e sintesi dello scatto fotografico. | `fixtures/golden-behaviour.json`, `harness/check.js` | `harness/check.test.js` |
| È possibile salvare e ripristinare i dati in tre modi: riproducendo gli input di una fase, copiando la memoria del modulo fisico o salvando lo stato completo tramite la funzione di salvataggio automatica, che consente il ripristino senza dover ripetere la simulazione; tutti e tre i metodi sono stati testati e si sono dimostrati efficaci per garantire la continuità. | `packages/tick/runs.js`, `packages/tick/tick.js`, `solver/build.mjs` | `harness/restore.test.js` |
| Pacchetti: un test non superato registra il suo seed, il mondo di riferimento, gli input accettati e gli hash, che `replay` riproduce con un singolo comando; un job settimanale riesegue ogni pacchetto, configurazione e registro per un periodo di tempo molto più lungo di quanto consentirebbe una richiesta di pull. | `packages/tick/bundle.js`, `.github/workflows/corpus.yml` | `harness/bundle.test.js` |
| Un unico file eseguibile compatibile con due architetture di CPU, con una memoria fissa di 32 MiB e un sistema di controllo che rifiuta le istruzioni scelte dall’ambiente di esecuzione, l’espansione della memoria e lo stato dei dati memorizzato al di fuori della memoria. | `solver/build.rs`, `solver/src/arena.rs`, `solver/lint.mjs` | Processo CI per ARM64; `solver/lint.test.js`, `harness/caps.test.js` |
| Test per valutare le reazioni del mondo: un percorso a ostacoli che mette alla prova i limiti del personaggio, un passo deciso ad ogni fase di una lunga camminata su terreno pianeggiante, un corpo agile e veloce che si muove vicino a una parete sottile, variazioni del terreno e l’intera scena che si anima con un milione di elementi. | `harness/course.test.js`, `harness/outcome.test.js` | `write-golden` si rifiuta di scrivere finché uno di essi non avrà esito positivo. |
| Ruoli per i modelli di riferimento: un elenco esplicito per ogni ruolo, la «Regola dei Due» derivata dalla descrizione del ruolo, un controllo di validità del ruolo nel sistema di verifica, informazioni sull’origine per ogni elemento, etichette di affidabilità che rimangono associate a una determinata credenza e registrazione e verifica di ogni chiamata al modello senza l’utilizzo di una GPU; entrambi i ruoli dichiarati vengono bloccati. | `predicates/roles/`, `packages/tick/roles.js`, `packages/tick/gate.js`, `packages/propose` | `packages/tick/gate.test.js`, `packages/propose/record.test.js` durante le sessioni in `fixtures/sessions/` |
| Riproduci la simulazione a partire da un file di configurazione e da un file di registro, e visualizza le informazioni di debug relative all’esecuzione in locale. | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json` rappresenta l’interazione di un utente con l’ambiente virtuale. |

352 test, sette suite di test comportamentali che riproducono ogni passaggio, e due valori di riferimento ottenuti tramite tre motori di calcolo su architettura x64 e tramite Node.js su architettura ARM64, ad ogni commit.

## Installa

Requisiti: Node 20 o versione successiva e la toolchain Rust con il target `wasm32-unknown-unknown` per la compilazione della fisica. In CI, viene utilizzata Rust 1.98.1; `rustup target add wasm32-unknown-unknown` è l'unico passaggio aggiuntivo dopo l'installazione di rustup.

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, both goldens, and the behaviour numbers under node
```

`npm test` compila la fisica e verifica il codice binario. Su Linux, la compilazione viene confrontata con l'hash memorizzato; su un altro sistema, segnala il proprio hash, poiché la compilazione Linux è l'artefatto memorizzato.

## Utilizzo

Ogni comando viene eseguito da qualsiasi directory, risponde a `--help`, termina con codice 0 in caso di successo, con codice 1 in caso di rifiuto e con codice 2 in caso di errore di utilizzo o di errore imprevisto. `--debug` consente la visualizzazione della traccia dello stack.

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

Quando due esecuzioni producono risultati diversi, la traccia indica dove si è verificata la discrepanza.

```bash
node harness/trace.mjs > a.trace                    # the product scene, one line per step in exact bits
node harness/first-difference.js a.trace b.trace    # identical, or the first step, body, and field that differ
node solver/lint.mjs                                # refuse a binary that could grow memory or let the host choose a result
```

Un mondo viene ripristinato in tre modi e nessuno di essi modifica lo stato interno del motore fisico, motivo per cui ognuno di essi è preciso. È possibile riprodurre gli input accettati in una fase specifica. È possibile copiare l'intera memoria del modulo fisico con `imageSolver()` e ripristinarla con `restoreImage()`. Oppure, è possibile salvare l'intero ciclo con `save()` e ripristinarlo con `restore(saved)`, il che non richiede la riproduzione ed è il modo in cui il processo ritorna a uno stato migliaia di volte. Un'immagine proveniente da un altro binario, di lunghezza errata o con un byte modificato, viene rifiutata e un salvataggio che non verifica le modifiche complete non cambia nulla.

La vista di debug è una vista di debug. Visualizza i fotogrammi validati come riquadri proiettati lungo l'asse scelto con `x`, `y` o `z`; un clic indica un punto di riferimento sul piano di base; `M`, `C`, `G`, `D` e `U` consentono di muoversi, arrampicarsi, raccogliere, lasciare cadere e utilizzare; la zona del personaggio e le convinzioni di ciascuna entità sono visualizzate accanto al ciclo e all'hash. Non visualizza mai nulla che non sia presente nel ciclo.

Un file di mondo è in formato JSON: `name`, `seed`, `bodies`, `colliders`, `zones` e, facoltativamente, `heightfield` e `goal`. Un corpo è `{ id, x, y, z, vx, vy, vz, hx, hy, hz }` con un quaternione e una velocità angolare facoltativi; un collider statico è un riquadro definito dai suoi limiti con un quaternione facoltativo attorno al suo centro; una zona è un riquadro con nome. I campi sconosciuti, gli ID duplicati, i corpi sovrapposti, un corpo all'interno di un collider, un quaternione non unitario, una zona degenerata o irraggiungibile e un obiettivo che non fa riferimento a nulla vengono tutti rifiutati con una motivazione.

## La legge, in un respiro

Un ciclo con seme è la legge. Un passo, un quantum, è di 1/64 di secondo; ogni passo viene sottoposto a hashing e l'azione di un personaggio si estende su molti passi. La riproduzione è il seme più il registro di ciò che è stato ammesso. Il modello propone intenzioni, convinzioni tipizzate e bozze del corpo; il controllore per tale classe le ammette o le rifiuta. Le bozze delle azioni e i file del mondo attendono fino al momento del caricamento e superano una serie di test. L'host riceve i fotogrammi validati e restituisce le intenzioni. La presentazione non ha un percorso di ritorno all'hash.

## Modello di fiducia

Il motore viene eseguito localmente e accede solo ai file all'interno della propria directory di checkout: mondi, bozze di azioni, elementi e qualsiasi registro in cui un comando deve scrivere. `host` associa solo `127.0.0.1`. Nessun comando apre altre socket tranne `propose`, che comunica con un server Ollama locale e nessun altro, e solo per un ruolo il cui manifesto è stato sbloccato per agire in un mondo di test; entrambi i ruoli dichiarati dal motore sono bloccati, quindi rifiuta prima che venga caricato qualsiasi client del modello. La proposta di un modello entra nel mondo solo attraverso il gateway del ruolo, che la vincola al manifesto del ruolo. Nessuna credenziale viene letta, archiviata o inviata. Nessun dato di telemetria viene raccolto. Il contenuto creato viene considerato non affidabile e viene convalidato al momento del caricamento; un file rifiutato non cambia nulla. Il binario WebAssembly viene compilato dal codice sorgente in CI e viene memorizzato in base al suo SHA-256, non viene mai memorizzato come byte. La sua memoria è fissata a 32 MiB e non può aumentare, quindi un mondo troppo denso per esso si interrompe nello stesso modo su ogni host invece di divergere. Vedere [SECURITY.md](SECURITY.md).

## Stato del supporto

Pre-1.0, rilasciato come `0.x` da `main`. Non esiste una promessa di compatibilità tra le versioni; ogni modifica alla legge sottoposta a hashing viene registrata in [CHANGELOG.md](CHANGELOG.md) insieme all'hash di riferimento che ha prodotto. Testato su Node 22 e Rust 1.98.1 su Ubuntu x64 e ARM64 in CI e compilato quotidianamente su Windows 11.

## Licenza

MIT, ad eccezione di `solver/src/kcc.rs`, una copia modificata di parte del controller del personaggio di Rapier, che è sotto licenza Apache 2.0 (`solver/LICENSE-APACHE-2.0`, `solver/NOTICE`). Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
