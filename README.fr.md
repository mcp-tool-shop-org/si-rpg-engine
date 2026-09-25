<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.md">English</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/si-rpg-engine/readme.png" width="400" alt="SI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/si-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/si-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/si-rpg-engine/"><img src="https://img.shields.io/badge/Landing-Page-blue" alt="Landing Page"></a>
</p>

Un moteur de simulation 3D déterministe, haché et rejouable. Le cycle s’exécute à un pas de temps fixe, chaque état est haché, et la loi physique est compilée en Rust en un seul fichier WebAssembly. La relecture se fait à partir de la graine et du journal des éléments acceptés. Un modèle de langage peut proposer des éléments dans le monde ; un vérificateur défini manuellement décide de ce qui y est intégré. Il s’agit de la contrepartie de [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine), et il est évalué en fonction de ce qu’il simule.

## Ce que c’est et ce que cela vise à être

Trois moteurs JavaScript, V8, SpiderMonkey et JavaScriptCore, affichent le même hachage pour le même monde à chaque validation. C’est la promesse sur laquelle repose le reste du moteur : un monde sur lequel deux machines peuvent s’accorder, octet par octet, à partir d’une graine et d’une liste d’entrées acceptées. Au-dessus, il y a des corps qui tombent, glissent, poussent, basculent et roulent dans les trois dimensions ; un personnage qui marche, escalade des pentes, transporte des objets et les pose ; des fichiers de monde qui sont refusés avec une explication lorsqu’ils sont incorrects ; et des esprits qui voient, se souviennent de ce qu’ils ont vu et refusent une croyance qui repose sur des preuves plus anciennes que celles qu’ils remplaceraient.

Ce que cela vise à être est le noyau de simulation à l’intérieur d’un hôte : un navigateur, Godot ou Unreal dessine l’image et envoie des intentions, tandis que la loi, le hachage et l’enregistrement restent ici. La phase suivante est la suite de tests d’un moteur prêt à être déployé, définie par une étude sur la façon dont les studios effectuent des tests aujourd’hui ; ensuite, il y a les collisions à partir de maillages, une liaison à l’hôte et le dégel du modèle en tant qu’instrument de test. Les plans sont [docs/PHASE-0.md](docs/PHASE-0.md) et [docs/PHASE-1.md](docs/PHASE-1.md), et chaque étape a été construite à partir d’un document écrit dans `docs/`.

## Ce qui est construit

| Capacité | Où | Preuve |
|---|---|---|
| Cycle à pas de temps fixe, hachage FNV-1a sur chaque nombre à virgule flottante, NaN refusé, zéro signé normalisé | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` a lu `0d38671370d12d1e` depuis le premier ensemble de tests |
| Loi physique en Rust sur `rapier3d-f64` avec `enhanced-determinism`, un seul fichier WebAssembly, hachage Linux enregistré | `solver/` | `fixtures/solver.sha256` ; CI reconstruit et compare |
| Corps avec position, vitesse, un quaternion canonique, vitesse angulaire et demi-dimensions ; les boîtes dynamiques tournent ; un personnage cinématique avec un pas de 0,3, une montée de 45°, un ajustement de 0,2 ; le sommeil est compté en quanta ; l’instantané du solveur est haché | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| Fichiers de monde : corps, collisionneurs statiques orientés, champs de hauteur, zones en tant que partition, douze refus de chargement, dangers au chargement, un index auquel l’hôte fait confiance | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js` |
| Verbes acceptés au chargement avec effets `drive`, `climb`, `carry`, `release`, `episode`, chacun avec des scénarios de danger | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| Esprits : vision avec ligne de mire, croyances typées citant des épisodes, suppression de la tombe, refus des écritures obsolètes, objectifs en suspens avec un indicateur « atteint » | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| Relecture à partir de la graine et du journal ; une vue de débogage du cycle sur localhost | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json` est une personne qui joue à travers la limite de l’hôte |

Soixante-treize tests, sept ensembles de comportements qui rejouent image par image, et deux hachages de référence sous trois moteurs, à chaque validation.

## Installation

Prérequis : Node 20 ou version ultérieure, et la chaîne d’outils Rust avec la cible `wasm32-unknown-unknown` pour la construction du solveur. CI fixe Rust 1.98.1 ; `rustup target add wasm32-unknown-unknown` est l’étape supplémentaire après l’installation de rustup.

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, and both goldens under node
```

`npm test` construit d’abord le solveur. Sous Linux, la construction est comparée au hachage enregistré ; sur un autre hôte, elle signale son propre hachage, car la construction Linux est l’artefact enregistré.

## Utilisation

Chaque commande s’exécute à partir de n’importe quel répertoire, renvoie `--help`, se termine avec 0 en cas de succès, 1 avec une explication en cas de refus et 2 en cas d’erreur d’utilisation ou de défaillance inattendue. `--debug` permet à une trace de pile de passer.

```bash
npx play proposals.json --seed 7 --log out.json    # run proposals through the tick, print every committed frame
npx replay out.json                                 # rerun a log; fails on the first hash that differs
npx load world worlds/crate-and-door.json           # validate a world, run its hazards, write its load hash to the index
npx load admit fixtures/climb-draft.json            # compile a verb draft, run the hazards for its effect, add it to the catalog
npx load retire climb                               # take a verb out of the catalog
npx host --world worlds/crate-and-door.json         # serve the debug view at http://127.0.0.1:4173
npx write-golden                                    # rewrite fixtures/golden.txt from harness/sim.mjs, with a reason in the commit
```

La vue de débogage est une vue de débogage. Elle dessine les images validées sous forme de boîtes projetées le long de l’axe choisi avec `x`, `y` ou `z` ; un clic est une cible du plan de sol ; `M`, `C`, `G`, `D` et `U` choisissent les actions de déplacement, d’escalade, de ramassage, de dépose et d’utilisation ; la zone du personnage et les croyances de chaque esprit se trouvent à côté du cycle et du hachage. Elle n’affiche jamais rien que le cycle ne contient pas.

Un fichier de monde est au format JSON : `name`, `seed`, `bodies`, `colliders`, `zones` et éventuellement `heightfield` et `goal`. Un corps est `{ id, x, y, z, vx, vy, vz, hx, hy, hz }` avec un quaternion et une vitesse angulaire facultatifs ; un collisionneur statique est une boîte définie par ses limites avec un quaternion facultatif autour de son centre ; une zone est une boîte nommée. Les champs inconnus, les ID en double, les corps qui se chevauchent, un corps à l’intérieur d’un collisionneur, un quaternion non unitaire, une zone dégénérée ou inaccessible et un objectif qui ne nomme rien sont chacun refusés avec une explication.

## La loi, en un seul souffle

Un cycle avec graine est la loi. Le quantum est de 1/64 s, chaque quantum est haché, et une action du joueur s’étend sur plusieurs quanta. La relecture est la graine plus le journal de ce qui a été accepté. Le modèle propose des intentions, des croyances typées et des ébauches de corps ; le vérificateur de cette classe accepte ou refuse. Les ébauches de verbes et les fichiers de monde attendent jusqu’au moment du chargement et passent une suite de tests de danger. L’hôte reçoit les images validées et renvoie des intentions. La présentation n’a pas de chemin de retour vers le hachage.

## Modèle de confiance

Le moteur s’exécute localement et n’accède qu’aux fichiers situés dans son propre répertoire de validation : mondes, ébauches de verbes, ensembles de tests et tout journal que vous demandez à une commande d’écrire. `host` ne lie `127.0.0.1` que. Aucune commande n’ouvre un autre socket ; l’instrument `propose` gelé, une fois qu’une personne le débloque, communique avec un serveur Ollama local et nulle part ailleurs. Aucune information d’identification n’est lue, stockée ou envoyée. Aucune télémétrie n’est collectée. Le contenu créé est considéré comme non fiable et est validé au moment du chargement ; un fichier refusé ne change rien. Le fichier WebAssembly est construit à partir du code source dans CI et est enregistré par son SHA-256, et n’est jamais validé en tant qu’octets. Voir [SECURITY.md](SECURITY.md).

## État du support

Version antérieure à 1.0, publiée sous le nom `0.x` à partir de `main`. Il n’y a aucune garantie de compatibilité entre les versions ; chaque modification apportée à la règle hachée est enregistrée dans le fichier [CHANGELOG.md](CHANGELOG.md) avec le hachage correspondant. Testé sur Node 22 et Rust 1.98.1 sous Ubuntu dans un environnement CI, et compilé quotidiennement sur Windows 11.

## Licence

MIT. Développé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
