<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.md">English</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/si-rpg-engine/readme.png" width="400" alt="SI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/si-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/si-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/si-rpg-engine/"><img src="https://img.shields.io/badge/Landing-Page-blue" alt="Landing Page"></a>
</p>

si-rpg-engine é um núcleo de simulação para mundos 3D que reproduz exatamente os eventos. Ele executa a física em 64 passos fixos por segundo, registra uma impressão digital do mundo após cada passo e pode reconstruir qualquer execução a partir de sua semente inicial e das entradas que recebeu, bit a bit. A física é compilada em Rust para um único arquivo WebAssembly. Um modelo de linguagem pode sugerir o que acontece em seguida; regras escritas manualmente decidem o que é incluído. É o equivalente a [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine), e é medido pelo que simula.

## O que é e o que pretende ser

Os mecanismos JavaScript por trás do Chrome, Firefox e Safari, que são V8, SpiderMonkey e JavaScriptCore, imprimem a mesma impressão digital para o mesmo mundo em cada commit, e a mesma construção da física a imprime em x64 e ARM64. Tudo o mais se baseia nessa premissa: duas máquinas concordam sobre um mundo, byte a byte, dada uma semente e uma lista de entradas aceitas. Acima disso, existem corpos que caem, deslizam, empurram, inclinam e giram em três dimensões; um personagem que anda, escala encostas, carrega coisas e as coloca; arquivos de mundo que são rejeitados com uma razão quando estão incorretos; e personagens com mentes que veem, lembram o que viram e rejeitam uma crença com base em evidências mais antigas do que aquelas que substituiriam.

O que se pretende é o núcleo de simulação dentro de um host: um navegador, Godot ou Unreal desenha a imagem e envia entradas, enquanto a física, a impressão digital e o registro permanecem aqui. O trabalho atual é o conjunto de testes que um mecanismo de lançamento precisa, e a maior parte está em: um rastreamento que nomeia o primeiro passo e valor onde duas execuções divergem, salvamento e restauração que são comprovadamente exatos, uma segunda arquitetura de CPU, uma verificação na física compilada e testes que verificam o que o mundo fez, em vez de apenas sua impressão digital. Após o conjunto de testes, vêm as colisões de malhas e um binding de host. O design e os planos estão em [docs/PHASE-0.md](docs/PHASE-0.md), [docs/PHASE-1.md](docs/PHASE-1.md) e [docs/PHASE-2.md](docs/PHASE-2.md).

## O que está sendo construído

| Capacidade. | Onde. | Prova. |
|---|---|---|
| Um tick de passo fixo; o estado de cada passo é calculado com um FNV-1a de dois canais sobre cada f64; NaN e infinitos são rejeitados; zero com sinal é normalizado. | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` leu `0d38671370d12d1e` desde o primeiro conjunto de testes. |
| A lei da física em Rust em `rapier3d-f64` com `enhanced-determinism`, um único binário WebAssembly com seu hash Linux fixo; um mundo de física em execução, reconstruído apenas quando a geometria muda, com um corpo trocado no lugar quando uma ação começa ou termina. | `solver/` | `fixtures/solver.sha256`, que o CI reconstrói e compara; `harness/switch.test.js`. |
| Corpos com posição, velocidade, um quatérnio canônico, velocidade angular e meio-extensões; caixas dinâmicas giram; um personagem cinemático com um autostep de 0,3, uma escalada de 45° e um snap de 0,2; o sono é contado em passos. | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| O empurrão do personagem através da cópia do mecanismo da rotina de impulso do Rapier, com a correção posterior do próprio Rapier retroportada, para que um corpo seja empurrado apenas em seus próprios pontos de contato; uma proteção na física falha qualquer empurrão que deixe um corpo mais rápido do que um múltiplo declarado de sua velocidade de empurrador. | `solver/src/impulses.rs` | `harness/push.test.js`, `fixtures/push/red-room-a.json` e um teste nativo que a cópia sem a correção empurra como a rotina do Rapier, bit a bit. |
| Arquivos de mundo: corpos, colisionadores estáticos orientados, heightfields, zonas como uma partição, doze recusas de carregamento, perigos no carregamento e um índice em que o host confia; as ações estão na mesma superfície de terreno de dois triângulos com a qual a física colide. | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js`, `harness/surface.test.js` |
| Uma varredura de alcance quando um mundo é admitido: seus estados alcançáveis são explorados com as ações admitidas, através do verificador, a partir dos salvamentos do próprio tick. Uma zona que nada alcança, um corpo carregado para fora do mundo ou um lançamento rejeita o mundo, com uma testemunha que `replay` reproduz. | `packages/load/sweep.js` | `harness/sweep.test.js`, as salas de teste fechadas em `fixtures/sweep/`. |
| Ações admitidas no carregamento com os efeitos `drive`, `climb`, `carry`, `release` e `episode`, cada uma com cenários de perigo. | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| Mentes: visão com linha de visão, crenças tipadas citando o episódio de onde vieram, substituição por lápide, gravações obsoletas rejeitadas e objetivos permanentes com uma flag "concluído". | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| Um rastreamento de cada passo em bits exatos e uma ferramenta que nomeia o primeiro passo, corpo e campo onde duas execuções divergem. | `harness/trace.mjs`, `harness/first-difference.js` | `harness/trace.test.js`; o CI imprime a primeira diferença quando um mecanismo se desvia do padrão. |
| Números de comportamento ao lado do padrão: o passo de sono e a posição final de cada corpo, a zona do caminhante e o comprimento e o hash do snapshot. | `fixtures/golden-behaviour.json`, `harness/check.js` | `harness/check.test.js` |
| Salvamento e restauração de três maneiras: reproduzindo as entradas para um passo, copiando a memória do módulo de física ou usando o próprio salvamento do tick de todo o seu estado, que restaura sem reprodução; cada um comprovadamente continua exatamente. | `packages/tick/runs.js`, `packages/tick/tick.js`, `solver/build.mjs` | `harness/restore.test.js` |
| Pacotes: um teste com falha grava sua semente, mundo, entradas aceitas e hashes, que `replay` reproduz em um único comando; um trabalho semanal reproduz cada pacote, fixture e log por muito mais tempo do que um pull request pode. | `packages/tick/bundle.js`, `.github/workflows/corpus.yml` | `harness/bundle.test.js` |
| Um binário em duas arquiteturas de CPU, com memória fixa em 32 MiB e uma verificação que rejeita instruções escolhidas pelo host, crescimento de memória e estado mantido fora da memória. | `solver/build.rs`, `solver/src/arena.rs`, `solver/lint.mjs` | O trabalho ARM64 do CI; `solver/lint.test.js`, `harness/caps.test.js`. |
| Testes do que o mundo fez: um curso de personagem nos limites medidos do controlador, um passo completo em cada passo de uma longa caminhada plana, um corpo fino e rápido contra uma parede fina, costuras de terreno e toda a cena movida um milhão de unidades. | `harness/course.test.js`, `harness/outcome.test.js` | `write-golden` se recusa a gravar enquanto algum deles falhar. |
| Funções para assentos de modelo: um manifesto por função, a Regra dos Dois derivada do que a função lê, um portão de função no verificador, proveniência em cada admissão, rótulos de confiança que permanecem com uma crença e cada chamada de modelo registrada e verificada sem uma GPU; ambas as funções declaradas congeladas. | `predicates/roles/`, `packages/tick/roles.js`, `packages/tick/gate.js`, `packages/propose` | `packages/tick/gate.test.js`, `packages/propose/record.test.js` ao longo das sessões em `fixtures/sessions/`. |
| Reproduza a partir de uma semente e de um registo, e visualize o estado de depuração do ciclo no localhost. | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json` é a execução de uma pessoa através da fronteira do host. |

375 testes, sete conjuntos de testes de comportamento que reproduzem passo a passo, e dois hashes de referência impressos por três motores em x64 e por node em ARM64, em cada commit.

## Instalar

Requisitos: Node 20 ou mais recente, e a cadeia de ferramentas Rust com o alvo `wasm32-unknown-unknown` para a construção da física. O CI fixa o Rust na versão 1.98.1; `rustup target add wasm32-unknown-unknown` é o passo extra após a instalação do rustup.

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, both goldens, and the behaviour numbers under node
```

`npm test` compila a física e verifica o código binário primeiro. No Linux, a construção é comparada com o hash fixo; em outro host, relata o seu próprio hash, porque a construção do Linux é o artefato fixo.

## Utilização

Cada comando é executado a partir de qualquer diretório, responde `--help`, sai com código 0 em caso de sucesso, 1 com uma razão em caso de recusa e 2 em caso de erro de utilização ou falha inesperada. `--debug` permite que um rastreamento da pilha seja exibido.

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

Quando duas execuções divergem, o rastreamento indica onde:

```bash
node harness/trace.mjs > a.trace                    # the product scene, one line per step in exact bits
node harness/first-difference.js a.trace b.trace    # identical, or the first step, body, and field that differ
node solver/lint.mjs                                # refuse a binary that could grow memory or let the host choose a result
```

Um mundo é restaurado de três maneiras, e nenhum escreve no estado interno do motor de física, razão pela qual cada um é exato. Pode reproduzir as suas entradas aceitas para um determinado passo. Pode copiar toda a memória do módulo de física com `imageSolver()` e restaurá-la com `restoreImage()`. Ou pode guardar todo o ciclo com `save()` e restaurá-lo com `restore(saved)`, o que não requer reprodução e é a forma como a simulação retorna a um estado milhares de vezes. Uma imagem de um binário diferente, com o comprimento errado ou com um byte alterado, é recusada, e uma cópia de segurança que não verifica todas as alterações não altera nada.

A visualização de depuração é uma visualização de depuração. Desenha os quadros confirmados como caixas projetadas ao longo do eixo escolhido com `x`, `y` ou `z`; um clique é um alvo no plano do solo; `M`, `C`, `G`, `D` e `U` selecionam mover, escalar, pegar, largar e usar; a zona do personagem e as crenças de cada agente estão ao lado do ciclo e do hash. Nunca desenha nada que o ciclo não contenha.

Um ficheiro de mundo é JSON: `name`, `seed`, `bodies`, `colliders`, `zones` e, opcionalmente, `heightfield` e `goal`. Um corpo é `{ id, x, y, z, vx, vy, vz, hx, hy, hz }` com um quatérnio e uma velocidade angular opcionais; um colisor estático é uma caixa pelas suas dimensões com um quatérnio opcional em relação ao seu centro; uma zona é uma caixa com nome. Campos desconhecidos, IDs duplicados, corpos sobrepostos, um corpo dentro de um colisor, um quatérnio não unitário, uma zona degenerada ou inatingível e um objetivo que não nomeia nada são recusados com uma razão.

## A lei, num único suspiro

Um ciclo com semente é a lei. Um passo, um quantum, é 1/64 s; cada passo é calculado com hash, e a ação de um personagem abrange muitos passos. A reprodução é a semente mais o registo do que foi admitido. O modelo propõe intenções, crenças tipificadas e rascunhos de corpos; o verificador para essa classe admite ou recusa-os. Os rascunhos de ação e os ficheiros de mundo aguardam até ao momento do carregamento e passam por um conjunto de testes de segurança. O host recebe os quadros confirmados e retorna as intenções. A apresentação não tem um caminho de volta para o hash.

## Modelo de confiança

O motor é executado localmente e acessa apenas ficheiros dentro do seu próprio diretório de checkout: mundos, rascunhos de ação, conjuntos de testes e qualquer registo que solicite que um comando escreva. `host` vincula apenas `127.0.0.1`. Nenhum comando abre qualquer outro socket além de `propose`, que se comunica com um servidor Ollama local e em nenhum outro lugar, e apenas para um papel cujo manifesto está desbloqueado para atuar num mundo de teste; ambos os papéis que o motor declara estão bloqueados, por isso ele recusa antes que qualquer cliente de modelo seja carregado. A proposta de um modelo entra no mundo apenas através do portão de papel, que o mantém fiel ao manifesto do seu papel. Nenhuma credencial é lida, armazenada ou enviada. Nenhum telemetria é coletado. O conteúdo criado é não confiável e é validado no momento do carregamento; um ficheiro recusado não altera nada. O binário WebAssembly é construído a partir do código fonte no CI e fixado pelo seu SHA-256, nunca confirmado como bytes. A sua memória é fixa em 32 MiB e não pode aumentar, portanto, um mundo muito denso para ele interrompe da mesma forma em cada host, em vez de divergir. Consulte [SECURITY.md](SECURITY.md).

## Estado de suporte

Pré-1.0, lançado como `0.x` a partir de `main`. Não há promessa de compatibilidade entre as versões; cada alteração na lei calculada com hash é registada em [CHANGELOG.md](CHANGELOG.md) com o hash de referência que produziu. Testado no Node 22 e no Rust 1.98.1 no Ubuntu x64 e ARM64 no CI, e construído diariamente no Windows 11.

## Licença

MIT, exceto `solver/src/kcc.rs` e `solver/src/impulses.rs`, cópias modificadas de partes do controlador de personagem do Rapier, que estão sob a Licença Apache 2.0 (`solver/LICENSE-APACHE-2.0`, `solver/NOTICE`). Construído por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
