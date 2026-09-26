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

si-rpg-engine est un moteur de simulation pour les mondes 3D qui permet de rejouer exactement les mêmes séquences. Il effectue les calculs physiques à un rythme fixe de 64 étapes par seconde, enregistre une empreinte du monde après chaque étape et peut reconstruire n'importe quelle séquence à partir de sa graine de départ et des entrées qu'elle a reçues, bit par bit. Les calculs physiques sont effectués en Rust et compilés en un seul fichier WebAssembly. Un modèle de langage peut suggérer ce qui se passe ensuite ; des règles écrites à la main décident de ce qui est pris en compte. Il s'agit de la contrepartie de [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine), et il est évalué en fonction de ce qu'il simule.

## Ce que c'est et ce que cela vise à être

Les moteurs JavaScript utilisés par Chrome, Firefox et Safari, à savoir V8, SpiderMonkey et JavaScriptCore, affichent la même empreinte pour le même monde à chaque validation, et la même construction physique l'affiche sur x64 et ARM64. Tout le reste repose sur cette promesse : deux machines s'accordent sur un monde, octet par octet, en fonction d'une graine et d'une liste d'entrées acceptées. Au-dessus de cela, on trouve des objets qui tombent, glissent, poussent, basculent et roulent dans trois dimensions ; un personnage qui marche, escalade des pentes, transporte des objets et les pose ; des fichiers de monde qui sont rejetés avec une explication lorsqu'ils sont incorrects ; et des personnages dotés d'un esprit qui voit, se souvient de ce qu'il a vu et refuse une croyance basée sur des preuves plus anciennes que celles qu'il remplacerait.

Ce que cela vise à être est le moteur de simulation à l'intérieur d'un hôte : un navigateur, Godot ou Unreal dessine l'image et envoie des entrées, tandis que les calculs physiques, l'empreinte et l'enregistrement restent ici. Le travail actuel consiste en la suite de tests dont un moteur de production a besoin, et la plupart de ces tests sont les suivants : une trace qui indique la première étape et la valeur où deux exécutions divergent, une sauvegarde et une restauration dont il est prouvé qu'elles sont exactes, une deuxième architecture de CPU, une analyse du code physique compilé et des tests qui vérifient ce que le monde a fait plutôt que seulement son empreinte. Après la suite de tests, il y aura des collisions à partir de maillages et une liaison avec l'hôte. La conception et les plans se trouvent dans [docs/PHASE-0.md](docs/PHASE-0.md), [docs/PHASE-1.md](docs/PHASE-1.md) et [docs/PHASE-2.md](docs/PHASE-2.md).

## Ce qui est construit

| Capacité. | Où. | Preuve. |
|---|---|---|
| Un pas à temps fixe ; l'état de chaque pas est haché avec un FNV-1a à deux voies sur chaque f64 ; les NaN et les infinis sont refusés ; le zéro signé est normalisé. | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` a lu `0d38671370d12d1e` depuis le premier ensemble de tests. |
| La loi physique en Rust sur `rapier3d-f64` avec `enhanced-determinism`, un seul fichier binaire WebAssembly avec son hachage Linux enregistré ; un monde physique en cours d'exécution, reconstruit uniquement lorsque la géométrie change, avec un objet remplacé à sa place lorsqu'une action commence ou se termine. | `solver/` | `fixtures/solver.sha256`, qui est reconstruit et comparé par CI ; `harness/switch.test.js`. |
| Objets avec position, vitesse, un quaternion canonique, vitesse angulaire et demi-étendues ; les boîtes dynamiques tournent ; un personnage cinématique avec un pas automatique de 0,3, une montée de 45° et un ajustement de 0,2 ; le sommeil est compté en pas. | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| La poussée du personnage à travers la copie du moteur de la routine d'impulsion de Rapier, avec la correction ultérieure de Rapier réintégrée, de sorte qu'un objet n'est poussé qu'à ses propres points de contact ; une protection dans la physique empêche toute poussée qui laisserait un objet plus rapide qu'un multiple spécifié de la vitesse de son propulseur. | `solver/src/impulses.rs` | `harness/push.test.js`, `fixtures/push/red-room-a.json` et un test natif qui montre que la copie sans la correction pousse comme le fait la routine de Rapier, bit par bit. |
| Fichiers de monde : objets, collisionneurs statiques orientés, champs de hauteur, zones en tant que partition, douze refus de chargement, dangers au chargement et un index auquel l'hôte fait confiance ; les actions se déroulent sur la même surface de terrain à deux triangles avec laquelle la physique entre en collision. | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js`, `harness/surface.test.js` |
| Une analyse de la portée lorsqu'un monde est admis : ses états accessibles sont explorés avec les actions admises, à travers le vérificateur, à partir des sauvegardes du pas. Une zone que rien n'atteint, un objet transporté hors du monde ou un lancer refusent le monde, avec un témoin qui prouve que `replay` reproduit le résultat. | `packages/load/sweep.js` | `harness/sweep.test.js`, les salles de test fermées dans `fixtures/sweep/`. |
| Actions admises au chargement avec les effets `drive`, `climb`, `carry`, `release` et `episode`, chacune avec des scénarios de danger. | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| Esprits : vision avec ligne de mire, croyances typées citant l'épisode dont elles proviennent, suppression par pierre tombale, refus des écritures obsolètes et objectifs permanents avec un indicateur "atteint". | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| Une trace de chaque pas en bits exacts, et un outil qui indique le premier pas, l'objet et le champ où deux exécutions divergent. | `harness/trace.mjs`, `harness/first-difference.js` | `harness/trace.test.js` ; CI affiche la première différence lorsqu'un moteur s'écarte de la version de référence. |
| Nombres de comportement à côté de la version de référence : le pas de sommeil et la position finale de chaque objet, la zone du marcheur et la longueur et le hachage de l'instantané. | `fixtures/golden-behaviour.json`, `harness/check.js` | `harness/check.test.js` |
| Sauvegarde et restauration de trois manières : en rejouant les entrées jusqu'à un pas, en copiant la mémoire du module physique ou en utilisant la propre sauvegarde du pas de son état complet, ce qui permet une restauration sans relecture ; chacune d'elles est prouvée pour continuer exactement. | `packages/tick/runs.js`, `packages/tick/tick.js`, `solver/build.mjs` | `harness/restore.test.js` |
| Ensembles : un test échoué écrit sa graine, son monde, ses entrées acceptées et ses hachages, ce que `replay` reproduit en une seule commande ; un travail hebdomadaire rejoue tous les ensembles, tous les éléments et tous les journaux pendant une période beaucoup plus longue qu'une demande de fusion. | `packages/tick/bundle.js`, `.github/workflows/corpus.yml` | `harness/bundle.test.js` |
| Un seul fichier binaire sur deux architectures de CPU, avec une mémoire fixée à 32 Mio et une analyse qui refuse les instructions choisies par l'hôte, la croissance de la mémoire et l'état conservé en dehors de la mémoire. | `solver/build.rs`, `solver/src/arena.rs`, `solver/lint.mjs` | Le travail ARM64 de CI ; `solver/lint.test.js`, `harness/caps.test.js`. |
| Tests de ce que le monde a fait : un parcours de personnage aux limites mesurées du contrôleur, un pas complet à chaque pas d'une longue marche sur une surface plane, un objet mince et rapide contre un mur mince, des joints de terrain et l'ensemble de la scène déplacée d'un million d'unités. | `harness/course.test.js`, `harness/outcome.test.js` | `write-golden` refuse d'écrire tant que l'un d'eux échoue. |
| Rôles pour les sièges de modèle : un manifeste par rôle, la règle des deux dérivée de ce que le rôle lit, une porte de rôle dans le vérificateur, une provenance sur chaque admission, des étiquettes de confiance qui restent attachées à une croyance et chaque appel de modèle enregistré et vérifié sans GPU ; les deux rôles déclarés sont figés. | `predicates/roles/`, `packages/tick/roles.js`, `packages/tick/gate.js`, `packages/propose` | `packages/tick/gate.test.js`, `packages/propose/record.test.js` sur les sessions dans `fixtures/sessions/`. |
| Relancer à partir d’une graine et d’un journal, et afficher une vue de débogage de l’itération sur localhost. | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json` est la simulation d’une personne dans le cadre de l’hôte. |

356 tests, sept scénarios de comportement qui relancent étape par étape, et deux hachages de référence imprimés par trois moteurs sur x64 et par Node sur ARM64, à chaque validation.

## Installation

Prérequis : Node 20 ou version ultérieure, et la chaîne d’outils Rust avec la cible `wasm32-unknown-unknown` pour la compilation physique. CI fixe Rust à la version 1.98.1 ; `rustup target add wasm32-unknown-unknown` est l’étape supplémentaire après l’installation de rustup.

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, both goldens, and the behaviour numbers under node
```

`npm test` compile la physique et effectue une analyse statique du binaire en premier. Sous Linux, la compilation est comparée au hachage fixe ; sur un autre hôte, elle signale son propre hachage, car la compilation Linux est l’artefact fixe.

## Utilisation

Chaque commande s’exécute à partir de n’importe quel répertoire, répond à `--help`, se termine avec le code 0 en cas de succès, 1 avec une raison en cas de refus, et 2 en cas d’erreur d’utilisation ou de défaillance inattendue. `--debug` permet d’afficher une trace de la pile.

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

Lorsque deux exécutions ne sont pas d’accord, le message indique où :

```bash
node harness/trace.mjs > a.trace                    # the product scene, one line per step in exact bits
node harness/first-difference.js a.trace b.trace    # identical, or the first step, body, and field that differ
node solver/lint.mjs                                # refuse a binary that could grow memory or let the host choose a result
```

Un monde est restauré de trois manières, et aucune ne modifie l’état interne du moteur physique, ce qui explique pourquoi chacune est exacte. Vous pouvez relancer ses entrées acceptées jusqu’à une étape. Vous pouvez copier toute la mémoire du module physique avec `imageSolver()` et la remettre en place avec `restoreImage()`. Ou vous pouvez enregistrer toute l’itération avec `save()` et la remettre en place avec `restore(saved)`, ce qui ne nécessite pas de relance et permet de revenir à un état des milliers de fois. Une image provenant d’un autre binaire, de la mauvaise longueur ou avec un octet modifié, est refusée, et une sauvegarde qui ne vérifie pas l’ensemble des modifications ne change rien.

La vue de débogage est une vue de débogage. Elle affiche les images validées sous forme de boîtes projetées le long de l’axe choisi avec `x`, `y` ou `z` ; un clic est une cible du plan de sol ; `M`, `C`, `G`, `D` et `U` permettent de choisir les actions de déplacement, d’escalade, de ramassage, de dépôt et d’utilisation ; la zone du personnage et les croyances de chaque esprit se trouvent à côté de l’itération et du hachage. Elle n’affiche jamais rien que l’itération ne contienne pas.

Un fichier de monde est au format JSON : `name`, `seed`, `bodies`, `colliders`, `zones`, et éventuellement `heightfield` et `goal`. Un corps est `{ id, x, y, z, vx, vy, vz, hx, hy, hz }` avec un quaternion et une vitesse angulaire facultatifs ; un collisionneur statique est une boîte définie par ses limites avec un quaternion facultatif autour de son centre ; une zone est une boîte nommée. Les champs inconnus, les ID dupliqués, les corps qui se chevauchent, un corps à l’intérieur d’un collisionneur, un quaternion non unitaire, une zone dégénérée ou inaccessible, et un objectif qui ne nomme rien sont tous refusés avec une raison.

## La loi, en un seul souffle

Une itération basée sur une graine est la loi. Une étape, un quantum, est de 1/64 s ; chaque étape est hachée, et l’action d’un personnage s’étend sur plusieurs étapes. La relance est la graine plus le journal de ce qui a été admis. Le modèle propose des intentions, des croyances typées et des ébauches de corps ; le vérificateur de cette classe les admet ou les refuse. Les ébauches d’actions et les fichiers de monde attendent jusqu’au moment du chargement et passent une suite de tests. L’hôte reçoit les images validées et renvoie les intentions. La présentation n’a pas de chemin de retour vers le hachage.

## Modèle de confiance

Le moteur s’exécute localement et n’accède qu’aux fichiers situés dans son propre répertoire de validation : mondes, ébauches d’actions, scénarios et tout journal que vous demandez à une commande d’écrire. `host` lie `127.0.0.1` uniquement. Aucune commande n’ouvre d’autre socket que `propose`, qui communique avec un serveur Ollama local et nulle part ailleurs, et uniquement pour un rôle dont le manifeste est dégelé pour agir dans un monde de test ; les deux rôles que le moteur déclare sont gelés, il refuse donc avant que tout client de modèle ne soit chargé. La proposition d’un modèle n’entre dans le monde que par le biais de la porte du rôle, qui la limite au manifeste de son rôle. Aucun identifiant n’est lu, stocké ou envoyé. Aucune télémétrie n’est collectée. Le contenu créé est considéré comme non fiable et est validé au moment du chargement ; un fichier refusé ne change rien. Le binaire WebAssembly est compilé à partir du code source dans CI et est fixé par son SHA-256, et n’est jamais validé en tant qu’octets. Sa mémoire est fixée à 32 MiB et ne peut pas augmenter, de sorte qu’un monde trop dense pour lui s’arrête de la même manière sur chaque hôte au lieu de diverger. Voir [SECURITY.md](SECURITY.md).

## État du support

Pré-1.0, publié sous le nom de `0.x` à partir de `main`. Il n’y a aucune promesse de compatibilité entre les versions ; chaque modification de la loi hachée est enregistrée dans [CHANGELOG.md](CHANGELOG.md) avec le hachage de référence qu’elle a produit. Testé sur Node 22 et Rust 1.98.1 sur Ubuntu x64 et ARM64 dans CI, et compilé quotidiennement sur Windows 11.

## Licence

MIT, à l’exception de `solver/src/kcc.rs` et `solver/src/impulses.rs`, copies modifiées de parties du contrôleur de personnage de Rapier, qui sont sous licence Apache 2.0 (`solver/LICENSE-APACHE-2.0`, `solver/NOTICE`). Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
