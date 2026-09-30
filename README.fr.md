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

si-rpg-engine est un moteur de simulation pour les mondes 3D qui permet de rejouer exactement les mêmes séquences. Il effectue les calculs physiques à un rythme fixe de 64 étapes par seconde, enregistre une empreinte du monde après chaque étape et peut reconstruire n'importe quelle séquence à partir de sa graine de départ et des entrées qu'elle a reçues, bit par bit. Les calculs physiques sont réalisés en Rust et compilés en un seul fichier WebAssembly. Un modèle de langage peut suggérer ce qui se passe ensuite ; des règles écrites à la main décident de ce qui est pris en compte. Il s'agit de la contrepartie de [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine), et il est évalué en fonction de ce qu'il simule.

## Ce que c'est et ce que cela vise à être

Les moteurs JavaScript utilisés par Chrome, Firefox et Safari, à savoir V8, SpiderMonkey et JavaScriptCore, affichent la même empreinte pour le même monde à chaque validation, et la même construction physique l'affiche sur x64 et ARM64. Tout le reste repose sur cette promesse : deux machines s'accordent sur un monde, octet par octet, en se basant sur une graine et une liste d'entrées acceptées. Au-dessus de cela, on trouve des objets qui tombent, glissent, poussent, basculent et roulent dans trois dimensions ; un personnage qui marche, escalade des pentes, transporte des objets et les pose ; des fichiers de monde qui sont rejetés avec une explication lorsqu'ils sont incorrects ; et des personnages dotés d'une intelligence qui voit, se souvient de ce qu'ils ont vu et refusent une croyance basée sur des preuves plus anciennes que celles qu'ils remplaceraient.

Ce que cela vise à être est le moteur de simulation à l'intérieur d'un hôte : un navigateur, Godot ou Unreal dessine l'image et envoie des entrées, tandis que les calculs physiques, l'empreinte et l'enregistrement restent ici. Le travail actuel consiste en la suite de tests dont un moteur de jeu a besoin, et la plupart de ces tests sont les suivants : un enregistrement qui indique la première étape et la valeur où deux exécutions divergent, une sauvegarde et une restauration dont il est prouvé qu'elles sont exactes, une deuxième architecture de CPU, une vérification du code physique compilé et des tests qui vérifient ce que le monde a fait plutôt que seulement son empreinte. La collision à partir de maillages est incluse : une scène peut nommer un seul maillage triangulaire fixe, et la scène produite n'en nomme aucun. L'hôte se connecte au socket dans [docs/host-binding.md](docs/host-binding.md). La conception et les plans se trouvent dans [docs/PHASE-0.md](docs/PHASE-0.md), [docs/PHASE-1.md](docs/PHASE-1.md) et [docs/PHASE-2.md](docs/PHASE-2.md).

## Ce qui est construit

| Capacité | Où | Preuve |
|---|---|---|
| Un pas à intervalle fixe ; l'état de chaque pas est haché avec un FNV-1a à deux voies sur chaque f64 ; les NaN et les infinis sont refusés ; le zéro signé est normalisé | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` a lu `0d38671370d12d1e` depuis le premier ensemble de tests |
| La loi physique en Rust sur `rapier3d-f64` avec `enhanced-determinism`, un seul fichier binaire WebAssembly avec son hachage Linux enregistré ; un monde physique en cours d'exécution, reconstruit uniquement lorsque la géométrie change, avec un objet remplacé à sa place lorsqu'une action commence ou se termine | `solver/` | `fixtures/solver.sha256`, qui est reconstruit et comparé par l'intégration continue ; `harness/switch.test.js` |
| Objets avec position, vitesse, un quaternion canonique, vitesse angulaire et demi-étendues ; les boîtes dynamiques tournent ; un personnage cinématique avec un pas automatique de 0,3, une montée de 45° et un ajustement de 0,2 ; le sommeil est compté en pas | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| La poussée du personnage à travers la copie du moteur de la routine d'impulsion de Rapier, avec la correction ultérieure de Rapier réintégrée, de sorte qu'un objet est poussé uniquement à ses propres points de contact, et que l'impulsion de chaque point est dimensionnée en fonction de la masse effective de l'objet à cet endroit, y compris sa rotation ; une protection dans la physique annule toute poussée qui laisserait un objet plus rapide qu'un multiple déclaré de la vitesse de son propulseur | `solver/src/impulses.rs` | `harness/push.test.js`, `fixtures/push/red-room-a.json` et un test natif qui montre que la copie sans la correction pousse comme le fait la routine de Rapier, bit par bit |
| Un objet entraîné ne résout pas les collisions avec un objet dynamique. Un collisionneur entraîné est dans le groupe de résolution 3 et exclut le groupe 2 ; un collisionneur dynamique est dans le groupe 2 et exclut le groupe 3. Les objets statiques conservent la valeur par défaut de Rapier. Les groupes de collision ne sont pas modifiés, de sorte que la phase étroite trouve toujours la paire. Il n'y a pas de commutateur JavaScript. Dans la pièce d'escalier, les deux boîtes restent en dessous de 1 m/s. La vitesse de 16 m/s du personnage est un pas de 0,25 m en un seul quantum, qui est le pas | `solver/src/rapier_law.rs` | `harness/step-up-121.test.js`, `harness/sweep.test.js` et un test natif qui montre que les groupes s'excluent mutuellement et que le gestionnaire de collision reste en place |
| Un seul maillage triangulaire fixe. Une scène peut le nommer, et la scène produite n'en nomme aucun. Le constructeur refuse un maillage que le chargeur refuserait, et la loi refuse un index hors limites, un index répété ou un sommet non fini avant que le maillage ne soit construit. Un module physique piégé est supprimé. Un chargement ou un pas refusé ne conserve pas ce monde ni ne recopie les objets | `solver/src/rapier_law.rs`, `packages/tick/scene.js`, `packages/tick/world.js` | `harness/mesh.test.js`, `harness/mesh-refusal.test.js` |
| Fichiers de monde : objets, collisionneurs statiques orientés, champs de hauteur, zones en tant que partition, douze refus de chargement, dangers au chargement et un index auquel l'hôte fait confiance ; les actions se déroulent sur la même surface de terrain à deux triangles avec laquelle la physique entre en collision | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js`, `harness/surface.test.js` |
| Une analyse de la portée lorsqu'un monde est admis : ses états accessibles sont explorés avec les actions admises, à travers le vérificateur, à partir des enregistrements du pas lui-même. Une zone que rien n'atteint, un objet transporté hors du monde ou un lancer refuse le monde, avec un témoin qui prouve que `replay` reproduit le résultat | `packages/load/sweep.js` | `harness/sweep.test.js`, les pièces de test fermées dans `fixtures/sweep/` |
| Actions admises au chargement avec les effets `drive`, `climb`, `carry`, `release` et `episode`, chacune avec des scénarios de danger | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| Esprits : vision avec ligne de mire, croyances typées citant l'épisode dont elles proviennent, suppression par tombe, refus des écritures obsolètes et objectifs permanents avec un indicateur "réalisé" | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| Un enregistrement de chaque pas en bits exacts, et un outil qui nomme le premier pas, l'objet et le champ où deux exécutions divergent | `harness/trace.mjs`, `harness/first-difference.js` | `harness/trace.test.js` ; l'intégration continue affiche la première différence lorsqu'un moteur s'écarte de la version de référence |
| Nombres de comportement à côté de la version de référence : le pas de sommeil et la position finale de chaque objet, la zone du personnage et la longueur et le hachage de l'instantané | `fixtures/golden-behaviour.json`, `harness/check.js` | `harness/check.test.js` |
| Sauvegarde et restauration de trois manières : en rejouant les entrées jusqu'à un pas, en copiant la mémoire du module physique ou en utilisant la propre sauvegarde du pas de son état complet, ce qui permet une restauration sans relecture ; chacune de ces méthodes est prouvée pour continuer exactement. | `packages/tick/runs.js`, `packages/tick/tick.js`, `solver/build.mjs` | `harness/restore.test.js` |
| Ensembles : un test échoué enregistre sa graine, son monde, les entrées acceptées et les hachages, ce que `replay` reproduit en une seule commande ; une tâche hebdomadaire rejoue chaque ensemble, chaque configuration et chaque journal pendant une période beaucoup plus longue que ce qu’une demande de fusion peut permettre. | `packages/tick/bundle.js`, `.github/workflows/corpus.yml` | `harness/bundle.test.js` |
| Un seul fichier binaire sur deux architectures de CPU, avec une mémoire fixée à 32 MiB et un outil de vérification qui refuse les instructions choisies par l’hôte, l’augmentation de la mémoire et l’état conservé en dehors de la mémoire. | `solver/build.rs`, `solver/src/arena.rs`, `solver/lint.mjs` | Tâche ARM64 de CI ; `solver/lint.test.js`, `harness/caps.test.js` |
| Tests de ce que le monde a fait : un parcours de personnage aux limites mesurées du contrôleur, une foulée complète à chaque étape d’une longue marche sur une surface plane et aucune foulée ne s’enfonce dans le sol, un corps fin et rapide contre un mur fin, les jonctions du terrain et l’ensemble de la scène se déplace d’un million d’unités. | `harness/course.test.js`, `harness/outcome.test.js` | `write-golden` refuse d’écrire tant que l’un d’eux échoue. |
| Le banc d’essai de l’instrument : un changement et la version qui le précède, chaque arbre exécuté dans son propre processus. Il nomme le code et les données que le changement affecte, exécute chaque entrée candidate sur les deux arbres et signale ce qui a atteint le changement, où les deux exécutions divergent pour la première fois et ce qui échoue uniquement lors du changement, chaque verdict provenant du moteur et aucun provenant d’un modèle. La portée de la loi est lue à partir d’une version de couverture dont l’exécution doit correspondre image par image à la version du produit, et les mutations implantées lors du changement mesurent le banc d’essai. | `packages/bench` | 86 tests dans `packages/bench/` par rapport aux changements implantés avec des effets connus ; le changement de la loi F2, implanté manuellement, trouvé au quantum 98. |
| Rôles pour les modèles : un manifeste par rôle, la règle des deux, dérivée de ce que le rôle lit, une porte de rôle dans le vérificateur, une provenance pour chaque admission, des étiquettes de confiance qui restent associées à une croyance, et chaque appel de modèle enregistré et vérifié sans GPU ; les deux rôles déclarés sont figés. | `predicates/roles/`, `packages/tick/roles.js`, `packages/tick/gate.js`, `packages/propose` | `packages/tick/gate.test.js`, `packages/propose/record.test.js` sur les sessions dans `fixtures/sessions/` |
| Relecture à partir d’une graine et d’un journal, et d’une liaison hôte pour le flux d’images, la porte d’intention et la règle de mélange. | `packages/tick/replay.js`, `packages/host`, `docs/host-binding.md` | `fixtures/first-scene-played.json` est le jeu d’une personne à travers la limite de l’hôte ; `harness/binding.test.js` joue la configuration à travers la prise. |

516 tests, sept configurations de comportement qui rejouent étape par étape, et deux hachages de référence imprimés par trois moteurs sur x64 et par node sur ARM64, à chaque validation.

## Installation

Prérequis : Node 20 ou version ultérieure, et la chaîne d’outils Rust avec la cible `wasm32-unknown-unknown` pour la version physique. CI fixe Rust à la version 1.98.1 ; `rustup target add wasm32-unknown-unknown` est l’étape supplémentaire après l’installation de rustup.

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, both goldens, and the behaviour numbers under node
```

`npm test` construit la physique et vérifie d’abord le fichier binaire. Sous Linux, la version est comparée au hachage fixe ; sur un autre hôte, elle signale son propre hachage, car la version Linux est l’artefact fixe.

## Utilisation

Chaque commande s’exécute à partir de n’importe quel répertoire, répond à `--help`, se termine avec le code 0 en cas de succès, 1 avec une raison en cas de refus et 2 en cas d’erreur d’utilisation ou d’échec inattendu. `--debug` permet à une trace de pile de s’afficher.

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

Lorsque deux exécutions sont en désaccord, la trace indique où :

```bash
node harness/trace.mjs > a.trace                    # the product scene, one line per step in exact bits
node harness/first-difference.js a.trace b.trace    # identical, or the first step, body, and field that differ
node solver/lint.mjs                                # refuse a binary that could grow memory or let the host choose a result
```

Un changement peut être mesuré par rapport à la version qui le précède. Le banc d’essai s’exécute manuellement, et aucun flux de travail ne l’exécute :

```bash
npx bench trees . main HEAD ../trees                # the base and the head as git worktrees, the head's binary built in its own tree
npx bench anchors --base ../trees/base --head ../trees/head    # the code and data the change touches, as JSON
npx bench run --base ../trees/base --head ../trees/head --out ../bench --product-scene    # reach, differences, and catches, with a report
```

Le rapport nomme sa graine, compte ses budgets en quanta et en restaurations, et indique ce qu’il n’a pas mesuré ; deux exécutions avec une seule graine donnent le même rapport en dehors de leur bloc d’environnement. Lorsque `solver/` change, chaque arbre construit son propre fichier binaire, et la portée de la loi provient d’une version de couverture de la branche principale qui doit exécuter la scène du produit exactement comme le fait la version du produit, sinon le banc d’essai s’arrête avec la raison.

Un monde se restaure de trois manières, et aucun ne s’écrit dans l’état interne du moteur physique, ce qui explique pourquoi chacun est exact. Vous pouvez rejouer ses entrées acceptées jusqu’à une étape. Vous pouvez copier toute la mémoire du module physique avec `imageSolver()` et la remettre en place avec `restoreImage()`. Ou vous pouvez enregistrer tout le cycle avec `save()` et le remettre en place avec `restore(saved)`, ce qui ne nécessite pas de relecture et c’est ainsi que la boucle revient à un état des milliers de fois. Une image provenant d’un autre fichier binaire, de la mauvaise longueur ou avec un octet modifié, est refusée, et une sauvegarde qui ne vérifie pas tout ne change rien.

La vue de débogage est une vue de débogage. Elle dessine les images validées sous forme de boîtes projetées le long de l’axe choisi avec `x`, `y` ou `z` ; un clic est une cible du plan de sol ; `M`, `C`, `G`, `D` et `U` choisissent les actions de déplacement, d’escalade, de ramassage, de dépôt et d’utilisation ; la zone du marcheur et les croyances de chaque esprit sont placées à côté du cycle et du hachage. Elle ne dessine jamais rien que le cycle ne contienne pas.

Un fichier de monde est au format JSON : `name`, `seed`, `bodies`, `colliders`, `zones` et éventuellement `heightfield`, `mesh` et `goal`. Un maillage est `{ positions, indices }`. Un corps est `{ id, x, y, z, vx, vy, vz, hx, hy, hz }` avec un quaternion et une vitesse angulaire facultatifs ; un collisionneur statique est une boîte définie par ses limites avec un quaternion facultatif autour de son centre ; une zone est une boîte nommée. Les champs inconnus, les ID dupliqués, les corps qui se chevauchent, un corps à l’intérieur d’un collisionneur, un quaternion non unitaire, une zone dégénérée ou inaccessible et un objectif qui ne nomme rien sont tous refusés avec une raison.

## La loi, en un seul souffle

Un cycle avec une graine est la loi. Un corps entraîné et un corps dynamique ne partagent pas de contact de solveur, et la phase étroite trouve quand même la paire. Une étape, un quantum, est de 1/64 s ; chaque étape est hachée, et l’action d’un personnage s’étend sur de nombreuses étapes. La relecture est la graine plus le journal de ce qui a été admis. Le modèle propose des intentions, des croyances typées et des ébauches de corps ; le vérificateur de cette classe les admet ou les refuse. Les ébauches d’action et les fichiers de monde attendent jusqu’au moment du chargement et passent une suite de tests de sécurité. L’hôte reçoit les images validées et renvoie les intentions. La présentation n’a pas de chemin de retour vers le hachage.

## Modèle de confiance

Le moteur s’exécute localement et n’accède qu’aux fichiers situés dans son propre répertoire de travail : les mondes, les ébauches d’actions, les éléments de test et tous les journaux que vous demandez à une commande d’écrire. `host` ne lie que `127.0.0.1`. `bench` est l’exception à la règle du répertoire de travail : il écrit ses arbres et son rapport à l’endroit que vous spécifiez, et exécute chaque arbre dans un processus enfant distinct. Aucune commande n’ouvre d’autre socket que `propose`, qui communique avec un serveur Ollama local et nulle part ailleurs, et uniquement pour un rôle dont le manifeste a été déverrouillé afin d’agir dans un monde vierge ; les deux rôles que le moteur déclare sont figés, il refuse donc toute demande avant que tout client de modèle ne soit chargé. Une proposition de modèle n’entre dans le monde que par le biais du rôle, qui la maintient dans le cadre de son manifeste. Pour construire la physique d’un arbre, `bench` exécute `cargo build --locked`, comme le fait le propre processus de construction du solveur, et cargo récupère un paquet spécifique depuis crates.io uniquement lorsque sa mémoire cache ne le contient pas. Aucune information d’identification n’est lue, stockée ou envoyée. Aucune télémétrie n’est collectée. Le contenu créé n’est pas considéré comme fiable et est validé lors du chargement ; un fichier refusé ne change rien. Le fichier binaire WebAssembly est construit à partir du code source dans l’environnement CI et est verrouillé par son hachage SHA-256, et n’est jamais enregistré sous forme de données brutes. Sa mémoire est fixée à 32 MiB et ne peut pas augmenter, de sorte qu’un monde trop dense pour lui s’arrête de la même manière sur chaque hôte au lieu de diverger. Voir [SECURITY.md](SECURITY.md).

## État du support

Version antérieure à 1.0, publiée sous le nom de `0.x` à partir de `main`. Il n’y a aucune garantie de compatibilité entre les versions ; chaque modification de la règle hachée est enregistrée dans [CHANGELOG.md](CHANGELOG.md) avec le hachage correspondant. Testé sur Node 22 et Rust 1.98.1 sur Ubuntu x64 et ARM64 dans l’environnement CI, et construit quotidiennement sur Windows 11.

## Licence

MIT, à l’exception de `solver/src/kcc.rs` et `solver/src/impulses.rs`, qui sont des copies modifiées de parties du contrôleur de personnage de Rapier, et qui sont soumises à la licence Apache 2.0 (`solver/LICENSE-APACHE-2.0`, `solver/NOTICE`). Créé par <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
