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

Os mecanismos JavaScript por trás do Chrome, Firefox e Safari, que são V8, SpiderMonkey e JavaScriptCore, imprimem a mesma impressão digital para o mesmo mundo em cada commit, e a mesma construção da física a imprime em x64 e ARM64. Tudo o mais se baseia nessa premissa: duas máquinas concordam sobre um mundo, byte a byte, dada uma semente e uma lista de entradas aceitas. Acima disso, existem corpos que caem, deslizam, empurram, inclinam e tombam em três dimensões; um personagem que anda, escala encostas, carrega coisas e as coloca; arquivos de mundo que são rejeitados com um motivo quando estão incorretos; e personagens com mentes que veem, lembram o que viram e rejeitam uma crença com base em evidências mais antigas do que aquelas que substituiriam.

O que se pretende é o núcleo de simulação dentro de um host: um navegador, Godot ou Unreal desenha a imagem e envia entradas, enquanto a física, a impressão digital e o registro permanecem aqui. O trabalho atual é o conjunto de testes que um mecanismo de lançamento precisa, e a maior parte está em: um rastreamento que nomeia o primeiro passo e valor onde duas execuções divergem, salvamento e restauração que são comprovadamente exatos, uma segunda arquitetura de CPU, uma verificação na física compilada e testes que verificam o que o mundo fez, em vez de apenas sua impressão digital. Após o conjunto de testes, vêm as colisões de malhas e um vínculo com o host. O design e os planos estão em [docs/PHASE-0.md](docs/PHASE-0.md), [docs/PHASE-1.md](docs/PHASE-1.md) e [docs/PHASE-2.md](docs/PHASE-2.md).

## O que está sendo construído

| Capacidade. | Onde. | Prova. |
|---|---|---|
| Um passo de tempo fixo; o estado de cada passo é calculado com um FNV-1a de dois canais sobre cada f64; NaN e infinitos são rejeitados; zero com sinal é normalizado. | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` leu `0d38671370d12d1e` desde o primeiro conjunto de testes. |
| A lei da física em Rust em `rapier3d-f64` com `enhanced-determinism`, um único binário WebAssembly com seu hash Linux fixo; um mundo de física em execução, reconstruído apenas quando a geometria muda, com um corpo substituído no lugar quando uma ação começa ou termina. | `solver/` | `fixtures/solver.sha256`, que o CI reconstrói e compara; `harness/switch.test.js`. |
| Corpos com posição, velocidade, um quatérnio canônico, velocidade angular e meio-extensões; caixas dinâmicas giram; um personagem cinemático com um autostep de 0,3, uma escalada de 45° e um snap de 0,2; o sono é contado em passos. | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| Arquivos de mundo: corpos, colisão estática orientada, campos de altura, zonas como uma partição, doze recusas de carregamento, perigos no carregamento e um índice no qual o host confia; as ações se apoiam na mesma superfície de terreno de dois triângulos com a qual a física colide. | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js`, `harness/surface.test.js` |
| Ações admitidas no carregamento com os efeitos `drive`, `climb`, `carry`, `release` e `episode`, cada uma com cenários de perigo. | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| Mentes: visão com linha de visão, crenças tipadas citando o episódio de onde vieram, substituição por lápide, rejeição de gravações desatualizadas e objetivos permanentes com uma flag "concluído". | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| Um rastreamento de cada passo em bits exatos e uma ferramenta que nomeia o primeiro passo, corpo e campo onde duas execuções divergem. | `harness/trace.mjs`, `harness/first-difference.js` | `harness/trace.test.js`; o CI imprime a primeira diferença quando um mecanismo sai do padrão. |
| Números de comportamento ao lado do padrão: o passo de sono e a posição final de cada corpo, a zona do andarilho e o comprimento e o hash do snapshot. | `fixtures/golden-behaviour.json`, `harness/check.js` | `harness/check.test.js` |
| Salvamento e restauração de duas maneiras, reproduzindo as entradas para um passo ou copiando a memória do módulo de física, cada uma comprovadamente continuando exatamente. | `packages/tick/runs.js`, `solver/build.mjs` | `harness/restore.test.js` |
| Pacotes: um teste com falha grava sua semente, mundo, entradas aceitas e hashes, que `replay` reproduz em um único comando; um trabalho semanal reproduz cada pacote, configuração e log por muito mais tempo do que um pedido de pull pode. | `packages/tick/bundle.js`, `.github/workflows/corpus.yml` | `harness/bundle.test.js` |
| Um binário em duas arquiteturas de CPU, com memória fixa em 32 MiB e uma verificação que rejeita instruções escolhidas pelo host, crescimento de memória e estado mantido fora da memória. | `solver/build.rs`, `solver/src/arena.rs`, `solver/lint.mjs` | O trabalho ARM64 do CI; `solver/lint.test.js`, `harness/caps.test.js`. |
| Testes do que o mundo fez: um curso de personagem nos limites medidos do controlador, um passo completo em cada passo de uma longa caminhada plana, um corpo fino e rápido contra uma parede fina, costuras de terreno e toda a cena movida um milhão de unidades. | `harness/course.test.js`, `harness/outcome.test.js` | `write-golden` se recusa a gravar enquanto algum deles falhar. |
| Reprodução a partir de uma semente e um log, e uma visualização de depuração do passo no localhost. | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json` é a reprodução de uma pessoa através da fronteira do host. |

243 testes, sete configurações de comportamento que reproduzem passo a passo e dois hashes padrão impressos por três mecanismos em x64 e por node em ARM64, em cada commit.

## Instalação

Requisitos: Node 20 ou mais recente e a cadeia de ferramentas Rust com o alvo `wasm32-unknown-unknown` para a construção da física. O CI fixa o Rust 1.98.1; `rustup target add wasm32-unknown-unknown` é o único passo extra após a instalação do rustup.

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, both goldens, and the behaviour numbers under node
```

`npm test` constrói a física e verifica o binário primeiro. No Linux, a construção é comparada ao hash fixo; em outro host, ele relata seu próprio hash, porque a construção do Linux é o artefato fixo.

## Uso

Cada comando é executado a partir de qualquer diretório, responde `--help`, sai com 0 em caso de sucesso, 1 com um motivo em caso de recusa e 2 em caso de erro de uso ou falha inesperada. `--debug` permite que um rastreamento de pilha seja exibido.

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

Quando duas execuções discordam, o rastreamento diz onde:

```bash
node harness/trace.mjs > a.trace                    # the product scene, one line per step in exact bits
node harness/first-difference.js a.trace b.trace    # identical, or the first step, body, and field that differ
node solver/lint.mjs                                # refuse a binary that could grow memory or let the host choose a result
```

Um mundo restaura de duas maneiras, e nenhuma delas altera o estado interno do motor de física, e é por isso que ambas são exatas: reproduza as entradas aceitas para um determinado passo ou copie toda a memória do módulo de física com `imageSolver()` e restaure-a com `restoreImage()`. Uma imagem de outro arquivo binário, com o comprimento incorreto ou com um byte alterado, é rejeitada.

A visualização de depuração é uma visualização de depuração. Ela desenha os quadros confirmados como caixas projetadas ao longo do eixo escolhido com `x`, `y` ou `z`; um clique é um alvo no plano do solo; `M`, `C`, `G`, `D` e `U` selecionam mover, escalar, pegar, soltar e usar; a zona do personagem e as crenças de cada entidade ficam ao lado do contador e do hash. Ela nunca desenha nada que o contador não contenha.

Um arquivo de mundo é JSON: `name`, `seed`, `bodies`, `colliders`, `zones` e, opcionalmente, `heightfield` e `goal`. Um corpo é `{ id, x, y, z, vx, vy, vz, hx, hy, hz }` com um quatérnio e velocidade angular opcionais; um colisor estático é uma caixa definida por seus limites, com um quatérnio opcional em relação ao seu centro; uma zona é uma caixa com nome. Campos desconhecidos, IDs duplicados, corpos sobrepostos, um corpo dentro de um colisor, um quatérnio não unitário, uma zona degenerada ou inatingível e um objetivo que não nomeia nada são rejeitados, cada um com uma razão.

## A lei, em uma única frase

Um contador com semente é a lei. Um passo, um quantum, é 1/64 s; cada passo é calculado com hash, e a ação de um personagem se estende por vários passos. A reprodução é a semente mais o registro do que foi aceito. O modelo propõe intenções, crenças tipadas e esboços de corpos; o verificador para essa classe aceita ou rejeita. Os esboços de ação e os arquivos de mundo aguardam até o momento do carregamento e passam por um conjunto de testes. O host recebe os quadros confirmados e retorna as intenções. A apresentação não tem um caminho de volta para o hash.

## Modelo de confiança

O motor é executado localmente e acessa apenas arquivos dentro de seu próprio diretório: mundos, esboços de ação, elementos e qualquer registro que você peça para um comando gravar. `host` vincula apenas `127.0.0.1`. Nenhum comando abre qualquer outro socket; o instrumento `propose` congelado, quando uma pessoa o descongelar, se comunica com um servidor Ollama local e em nenhum outro lugar. Nenhuma credencial é lida, armazenada ou enviada. Nenhum dado de telemetria é coletado. O conteúdo criado é não confiável e é validado no momento do carregamento; um arquivo rejeitado não altera nada. O arquivo binário WebAssembly é construído a partir do código-fonte no CI e é fixado pelo seu SHA-256, nunca sendo enviado como bytes. Sua memória é fixa em 32 MiB e não pode aumentar, portanto, um mundo muito denso para ele interrompe da mesma forma em cada host, em vez de divergir. Consulte [SECURITY.md](SECURITY.md).

## Status de suporte

Pré-1.0, lançado como `0.x` a partir de `main`. Não há promessa de compatibilidade entre as versões; cada alteração na lei com hash é registrada em [CHANGELOG.md](CHANGELOG.md) com o hash dourado que ela produziu. Testado no Node 22 e Rust 1.98.1 no Ubuntu x64 e ARM64 no CI, e construído diariamente no Windows 11.

## Licença

MIT, exceto `solver/src/kcc.rs`, uma cópia modificada de parte do controlador de personagem do Rapier, que está sob a Licença Apache 2.0 (`solver/LICENSE-APACHE-2.0`, `solver/NOTICE`). Criado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
