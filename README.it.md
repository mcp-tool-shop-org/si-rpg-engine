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

si-rpg-engine è un motore di simulazione per mondi 3D che riproduce esattamente gli stessi eventi. Esegue la fisica a un ritmo fisso di 64 passaggi al secondo, registra un'impronta del mondo dopo ogni passaggio e può ricostruire qualsiasi esecuzione a partire dal seme iniziale e dagli input che ha ricevuto, bit per bit. La fisica è scritta in Rust e compilata in un unico file WebAssembly. Un modello linguistico può suggerire cosa accadrà dopo; regole scritte a mano decidono cosa viene incluso. È l'equivalente di [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) e viene valutato in base a ciò che simula.

## Cos'è e quali sono i suoi obiettivi

I motori JavaScript alla base di Chrome, Firefox e Safari, ovvero V8, SpiderMonkey e JavaScriptCore, stampano la stessa impronta per lo stesso mondo a ogni commit e la stessa simulazione fisica la stampa su x64 e ARM64. Tutto il resto si basa su questa promessa: due macchine concordano su un mondo, byte per byte, dato un seme e un elenco di input accettati. Su questa base si trovano corpi che cadono, scivolano, spingono, si inclinano e rotolano in tre dimensioni; un personaggio che cammina, scala pendii, trasporta oggetti e li appoggia; file di mondo che vengono rifiutati con una motivazione quando sono errati; e personaggi con una mente che vede, ricorda ciò che ha visto e rifiuta una convinzione basata su prove più vecchie di quelle che sostituirebbe.

L'obiettivo è essere il motore di simulazione all'interno di un host: un browser, Godot o Unreal disegna l'immagine e invia gli input, mentre la fisica, l'impronta e la registrazione rimangono qui. Il lavoro attuale è la suite di test di cui ha bisogno un motore pronto per la distribuzione, e la maggior parte di essa è costituita da: una traccia che indica il primo passaggio e il valore in cui due esecuzioni divergono, un salvataggio e un ripristino che si dimostrano esatti, una seconda architettura CPU, un controllo sulla fisica compilata e test che verificano cosa ha fatto il mondo piuttosto che solo la sua impronta. Dopo la suite, verranno aggiunte le collisioni da mesh e un'interfaccia con l'host. Il progetto e i piani sono disponibili in [docs/PHASE-0.md](docs/PHASE-0.md), [docs/PHASE-1.md](docs/PHASE-1.md) e [docs/PHASE-2.md](docs/PHASE-2.md).

## Cosa viene costruito

| Capacità. | Dove. | Prova. |
|---|---|---|
| Un ciclo a passo fisso; lo stato di ogni passaggio viene sottoposto a hash con un FNV-1a a due canali su ogni f64; NaN e infiniti vengono rifiutati; lo zero con segno viene normalizzato. | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` ha letto `0d38671370d12d1e` dall'inizio dei test. |
| La legge della fisica in Rust su `rapier3d-f64` con `enhanced-determinism`, un singolo file binario WebAssembly con il suo hash Linux fissato; un mondo fisico in esecuzione, ricostruito solo quando la geometria cambia, con un corpo sostituito al suo posto quando un'azione inizia o termina. | `solver/` | `fixtures/solver.sha256`, che viene ricostruito e confrontato da CI; `harness/switch.test.js`. |
| Corpi con posizione, velocità, un quaternione canonico, velocità angolare e metà estensioni; le scatole dinamiche ruotano; un personaggio cinematico con un autostep di 0,3, una salita di 45° e uno snap di 0,2; il tempo di inattività viene calcolato in passaggi. | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| File di mondo: corpi, collider statici orientati, heightfield, zone come partizione, dodici rifiuti di caricamento, pericoli al caricamento e un indice di cui l'host si fida; le azioni si trovano sulla stessa superficie del terreno a due triangoli con cui la fisica entra in collisione. | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js`, `harness/surface.test.js` |
| Azioni ammesse al caricamento con gli effetti `drive`, `climb`, `carry`, `release` e `episode`, ciascuna con scenari di pericolo. | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| Menti: vista con linea di vista, convinzioni tipizzate che citano l'episodio da cui provengono, sostituzione tramite lapide, scritture obsolete rifiutate e obiettivi in corso con un flag "soddisfatto". | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| Una traccia di ogni passaggio in bit esatti e uno strumento che indica il primo passaggio, il corpo e il campo in cui due esecuzioni divergono. | `harness/trace.mjs`, `harness/first-difference.js` | `harness/trace.test.js`; CI stampa la prima differenza quando un motore si discosta dal valore di riferimento. |
| Numeri di comportamento accanto al valore di riferimento: il passaggio di inattività e la posizione finale di ogni corpo, la zona del camminatore e la lunghezza e l'hash dello snapshot. | `fixtures/golden-behaviour.json`, `harness/check.js` | `harness/check.test.js` |
| Salvataggio e ripristino in due modi, riproducendo gli input a un passaggio o copiando la memoria del modulo fisico, entrambi dimostrati per continuare esattamente. | `packages/tick/runs.js`, `solver/build.mjs` | `harness/restore.test.js` |
| Bundle: un test fallito scrive il suo seme, il mondo, gli input accettati e gli hash, che `replay` riproduce con un singolo comando; un lavoro settimanale riproduce ogni bundle, fixture e log per un periodo di tempo molto più lungo di quanto possa durare una richiesta di pull. | `packages/tick/bundle.js`, `.github/workflows/corpus.yml` | `harness/bundle.test.js` |
| Un singolo file binario su due architetture CPU, con la memoria fissata a 32 MiB e un controllo che rifiuta le istruzioni scelte dall'host, la crescita della memoria e lo stato mantenuto al di fuori della memoria. | `solver/build.rs`, `solver/src/arena.rs`, `solver/lint.mjs` | Il lavoro ARM64 di CI; `solver/lint.test.js`, `harness/caps.test.js`. |
| Test di ciò che ha fatto il mondo: un percorso del personaggio ai limiti misurati del controller, un corpo sottile e veloce contro una parete sottile e giunzioni del terreno. | `harness/course.test.js`, `harness/outcome.test.js` | `write-golden` rifiuta di scrivere se uno di questi fallisce. |
| Riproduzione da un seme e da un log e una visualizzazione di debug del ciclo su localhost. | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json` è una persona che gioca attraverso il confine dell'host. |

241 test, sette fixture di comportamento che riproducono passo dopo passo e due hash di riferimento stampati da tre motori su x64 e da node su ARM64, a ogni commit.

## Installazione

Requisiti: Node 20 o successivo e la toolchain Rust con il target `wasm32-unknown-unknown` per la compilazione della fisica. CI fissa Rust 1.98.1; `rustup target add wasm32-unknown-unknown` è l'unico passaggio aggiuntivo dopo l'installazione di rustup.

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, both goldens, and the behaviour numbers under node
```

`npm test` compila prima la fisica e controlla il file binario. Su Linux, la build viene confrontata con l'hash fissato; su un altro host, segnala il proprio hash, perché la build Linux è l'artefatto fissato.

## Utilizzo

Ogni comando viene eseguito da qualsiasi directory, risponde `--help`, esce con 0 in caso di successo, 1 con una motivazione in caso di rifiuto e 2 in caso di errore di utilizzo o di errore imprevisto. `--debug` consente il passaggio di una traccia dello stack.

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

Quando due esecuzioni non sono d'accordo, la traccia indica dove:

```bash
node harness/trace.mjs > a.trace                    # the product scene, one line per step in exact bits
node harness/first-difference.js a.trace b.trace    # identical, or the first step, body, and field that differ
node solver/lint.mjs                                # refuse a binary that could grow memory or let the host choose a result
```

Un mondo viene ripristinato in due modi, e nessuno dei due modifica lo stato interno del motore fisico, motivo per cui entrambi sono precisi: riprodurre gli input accettati in un determinato passaggio, oppure copiare l’intera memoria del modulo fisico con `imageSolver()` e ripristinarla con `restoreImage()`. Un’immagine proveniente da un altro file binario, di lunghezza errata o con un byte modificato, viene rifiutata.

La vista di debug è una vista di debug. Visualizza i fotogrammi elaborati come riquadri proiettati lungo l’asse scelto con `x`, `y` o `z`; un clic indica un punto di riferimento sul piano di base; `M`, `C`, `G`, `D` e `U` consentono di scegliere le azioni di movimento, arrampicata, presa, rilascio e utilizzo; la zona del personaggio e le convinzioni di ciascuna entità sono visualizzate accanto al contatore e all’hash. Non visualizza mai nulla che non sia presente nel contatore.

Un file di mondo è in formato JSON: `name`, `seed`, `bodies`, `colliders`, `zones` e, facoltativamente, `heightfield` e `goal`. Un corpo è rappresentato da `{ id, x, y, z, vx, vy, vz, hx, hy, hz }`, con un quaternione e una velocità angolare facoltativi; un collider statico è un riquadro definito dai suoi limiti, con un quaternione facoltativo relativo al suo centro; una zona è un riquadro con un nome. I campi sconosciuti, gli ID duplicati, i corpi sovrapposti, un corpo all’interno di un collider, un quaternione non unitario, una zona degenerata o inaccessibile e un obiettivo che non indica nulla vengono tutti rifiutati con una motivazione.

## La legge, in un solo respiro

Un contatore con seme è la legge. Un singolo passaggio, un quantum, è pari a 1/64 di secondo; ogni passaggio viene sottoposto a hashing e l’azione di un personaggio si estende su molti passaggi. La riproduzione consiste nel seme più il registro di ciò che è stato accettato. Il modello propone intenzioni, convinzioni tipizzate e bozze del corpo; il controllore per tale classe le accetta o le rifiuta. Le bozze delle azioni e i file di mondo attendono fino al momento del caricamento e superano una serie di test. L’host riceve i fotogrammi elaborati e restituisce le intenzioni. La presentazione non ha un percorso di ritorno all’hash.

## Modello di fiducia

Il motore viene eseguito localmente e accede solo ai file all’interno della propria directory: mondi, bozze delle azioni, elementi grafici e qualsiasi registro in cui un comando scrive. `host` associa solo `127.0.0.1`. Nessun comando apre altre connessioni; lo strumento `propose`, una volta sbloccato da un utente, comunica con un server Ollama locale e solo con questo. Nessuna credenziale viene letta, archiviata o inviata. Nessun dato di telemetria viene raccolto. I contenuti creati sono considerati non affidabili e vengono convalidati al momento del caricamento; un file rifiutato non modifica nulla. Il file binario WebAssembly viene creato a partire dal codice sorgente in CI e viene fissato tramite il suo hash SHA-256, e non viene mai archiviato come byte. La sua memoria è fissata a 32 MiB e non può aumentare, quindi un mondo troppo denso per esso si interrompe nello stesso modo su ogni host invece di divergere. Vedere [SECURITY.md](SECURITY.md).

## Stato del supporto

Precedente alla versione 1.0, rilasciato come `0.x` da `main`. Non esiste una promessa di compatibilità tra le versioni; ogni modifica alla legge sottoposta a hashing viene registrata in [CHANGELOG.md](CHANGELOG.md) insieme all’hash di riferimento che ha prodotto. Testato su Node 22 e Rust 1.98.1 su Ubuntu x64 e ARM64 in CI e compilato quotidianamente su Windows 11.

## Licenza

MIT. Creato da <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
