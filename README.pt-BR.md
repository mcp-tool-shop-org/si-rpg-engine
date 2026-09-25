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

Um motor de simulação 3D determinístico, com hash e reproduzível. O ciclo é executado em um intervalo de tempo fixo, cada estado é calculado em hash e a lei da física é compilada em Rust para um único binário WebAssembly. A reprodução é a semente mais o registro do que foi admitido. Um modelo de linguagem pode propor elementos para o mundo; um verificador criado manualmente decide o que entra nele. É o equivalente a [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine), e é medido pelo que ele simula.

## O que é e o que pretende ser

Três motores JavaScript, V8, SpiderMonkey e JavaScriptCore, imprimem o mesmo hash para o mesmo mundo em cada commit. Essa é a promessa em que o restante do motor é construído: um mundo sobre o qual duas máquinas podem concordar, byte a byte, a partir de uma semente e uma lista de entradas admitidas. Acima disso, existem corpos que caem, deslizam, empurram, inclinam e tombam em três dimensões; um personagem que anda, escala encostas, carrega e coloca; arquivos de mundo que são rejeitados com um motivo quando estão incorretos; e mentes que veem, lembram o que viram e rejeitam uma crença que se baseia em evidências mais antigas do que aquelas que substituiria.

O que pretende ser é o núcleo de simulação dentro de um host: um navegador, Godot ou Unreal desenha a imagem e envia intenções, enquanto a lei, o hash e o registro permanecem aqui. A próxima fase é o conjunto de testes de um motor em produção, decidido por um estudo de como os estúdios testam hoje; depois disso, vêm as colisões de malhas, um vínculo com o host e o "descongelamento" do modelo como um instrumento de teste. Os planos são [docs/PHASE-0.md](docs/PHASE-0.md) e [docs/PHASE-1.md](docs/PHASE-1.md), e cada etapa foi construída a partir de um relatório escrito em `docs/`.

## O que é construído

| Capacidade | Onde | Prova |
|---|---|---|
| Ciclo de intervalo de tempo fixo, hash FNV-1a de dois canais sobre cada f64, NaN rejeitado, zero com sinal normalizado | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` leu `0d38671370d12d1e` desde o primeiro conjunto de testes |
| Lei da física em Rust em `rapier3d-f64` com `enhanced-determinism`, um único binário WebAssembly, hash do Linux fixado | `solver/` | `fixtures/solver.sha256`; CI reconstrói e compara |
| Corpos com posição, velocidade, um quatérnio canônico, velocidade angular e meio-extensões; caixas dinâmicas giram; um personagem cinemático com um passo de 0,3, escalada de 45°, ajuste de 0,2; sono contado em quanta; o instantâneo do solucionador é calculado em hash | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| Arquivos de mundo: corpos, colisão estática orientada, campos de altura, zonas como uma partição, doze rejeições de carregamento, perigos no carregamento, um índice no qual o host confia | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js` |
| Verbos admitidos no carregamento com efeitos `drive`, `climb`, `carry`, `release`, `episode`, cada um com cenários de perigo | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| Mentes: visão com linha de visão, crenças tipadas citando episódios, substituição de lápide, gravações antigas rejeitadas, objetivos permanentes com uma flag "concluído" | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| Reprodução a partir da semente e do registro; uma visualização de depuração do ciclo no localhost | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json` é a reprodução de uma pessoa através da fronteira do host |

Setenta e três testes, sete conjuntos de testes de comportamento que reproduzem quadro a quadro e dois hashes de referência em três motores, em cada commit.

## Instalação

Requisitos: Node 20 ou mais recente e a cadeia de ferramentas Rust com o alvo `wasm32-unknown-unknown` para a construção do solucionador. O CI fixa o Rust 1.98.1; `rustup target add wasm32-unknown-unknown` é o passo extra após a instalação do rustup.

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, and both goldens under node
```

`npm test` constrói o solucionador primeiro. No Linux, a construção é comparada com o hash fixado; em outro host, ele relata seu próprio hash, porque a construção do Linux é o artefato fixado.

## Uso

Cada comando é executado a partir de qualquer diretório, retorna `--help`, sai com 0 em caso de sucesso, 1 com um motivo em caso de rejeição e 2 em caso de erro de uso ou falha inesperada. `--debug` permite que um rastreamento de pilha seja exibido.

```bash
npx play proposals.json --seed 7 --log out.json    # run proposals through the tick, print every committed frame
npx replay out.json                                 # rerun a log; fails on the first hash that differs
npx load world worlds/crate-and-door.json           # validate a world, run its hazards, write its load hash to the index
npx load admit fixtures/climb-draft.json            # compile a verb draft, run the hazards for its effect, add it to the catalog
npx load retire climb                               # take a verb out of the catalog
npx host --world worlds/crate-and-door.json         # serve the debug view at http://127.0.0.1:4173
npx write-golden                                    # rewrite fixtures/golden.txt from harness/sim.mjs, with a reason in the commit
```

A visualização de depuração é uma visualização de depuração. Ele desenha os quadros confirmados como caixas projetadas ao longo do eixo escolhido com `x`, `y` ou `z`; um clique é um alvo do plano de solo; `M`, `C`, `G`, `D` e `U` escolhem mover, escalar, pegar, soltar e usar; a zona do caminhante e as crenças de cada mente ficam ao lado do ciclo e do hash. Ele nunca desenha nada que o ciclo não contenha.

Um arquivo de mundo é JSON: `name`, `seed`, `bodies`, `colliders`, `zones` e, opcionalmente, `heightfield` e `goal`. Um corpo é `{ id, x, y, z, vx, vy, vz, hx, hy, hz }` com um quatérnio e velocidade angular opcionais; uma colisão estática é uma caixa por seus limites com um quatérnio opcional sobre seu centro; uma zona é uma caixa nomeada. Campos desconhecidos, IDs duplicados, corpos sobrepostos, um corpo dentro de uma colisão, um quatérnio não unitário, uma zona degenerada ou inatingível e um objetivo que não nomeia nada são rejeitados com um motivo.

## A lei, em uma única frase

Um ciclo com semente é a lei. O quantum é 1/64 s, cada quantum é calculado em hash e uma ação do jogador abrange muitos quanta. A reprodução é a semente mais o registro do que foi admitido. O modelo propõe intenções, crenças tipadas e rascunhos de corpos; o verificador para essa classe admite ou rejeita. Rascunhos de verbos e arquivos de mundo aguardam até o tempo de carregamento e passam por um conjunto de testes de perigo. O host recebe os quadros confirmados e retorna as intenções. A apresentação não tem caminho de volta para o hash.

## Modelo de confiança

O motor é executado localmente e acessa apenas arquivos dentro de seu próprio checkout: mundos, rascunhos de verbos, conjuntos de testes e qualquer registro que você peça a um comando para gravar. `host` vincula `127.0.0.1` apenas. Nenhum comando abre nenhum outro socket; o instrumento `propose` congelado, uma vez que uma pessoa o descongele, se comunica com um servidor Ollama local e em nenhum outro lugar. Nenhuma credencial é lida, armazenada ou enviada. Nenhum telemetria é coletado. O conteúdo criado é não confiável e é validado no carregamento; um arquivo rejeitado não altera nada. O binário WebAssembly é construído a partir do código-fonte no CI e fixado por seu SHA-256, nunca confirmado como bytes. Consulte [SECURITY.md](SECURITY.md).

## Status de suporte

Anterior à versão 1.0, lançado como `0.x` a partir de `main`. Não há garantia de compatibilidade entre as versões; todas as alterações na lei com hash são registadas em [CHANGELOG.md](CHANGELOG.md) juntamente com o hash correspondente. Testado no Node 22 e no Rust 1.98.1 no Ubuntu, no ambiente de CI, e compilado diariamente no Windows 11.

## Licença

MIT. Criado por <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>.
