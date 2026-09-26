<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/si-rpg-engine/readme.png" width="400" alt="SI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/si-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/si-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/si-rpg-engine/"><img src="https://img.shields.io/badge/Landing-Page-blue" alt="Landing Page"></a>
</p>

si-rpg-engine 是一个 3D 世界的模拟核心，可以精确地重现游戏过程。它以固定的 64 步/秒的速度进行物理计算，并在每一步之后记录世界的“指纹”，可以从其起始种子和接受的输入中重建任何游戏过程，做到完全一致。物理引擎使用 Rust 编写，并编译成一个 WebAssembly 文件。一个语言模型可以预测接下来会发生什么；手工编写的规则决定了哪些内容会被纳入。它是 [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 的对应物，其价值在于它所模拟的内容。

## 它的本质和目标

Chrome、Firefox 和 Safari 背后的 JavaScript 引擎（V8、SpiderMonkey 和 JavaScriptCore）在每次提交时，都会为相同的世界打印出相同的“指纹”，并且相同的物理引擎构建也会在 x64 和 ARM64 架构上打印出相同的“指纹”。所有其他内容都建立在这个承诺之上：在给定一个种子和一个接受的输入列表的情况下，两台机器对一个世界达成一致，字节对字节地完全一致。在此基础上，存在着在三维空间中坠落、滑动、推动、倾斜和翻滚的物体；一个可以行走、攀爬斜坡、携带物品并放下物品的角色；当世界文件出现错误时，会被拒绝并附带原因；以及拥有“思想”的角色，它们可以观察、记住它们所看到的内容，并拒绝基于比其将要替代的证据更旧的证据所做出的推断。

它的目标是在宿主程序中作为模拟核心：浏览器、Godot 或 Unreal 绘制图像并发送输入，而物理引擎、指纹和记录则保留在此处。当前的工作是构建一个完整的引擎所需的测试套件，其中大部分内容包括：一个跟踪，用于标识两个游戏过程开始分歧的第一个步骤和值；经过验证的保存和恢复功能；第二个 CPU 架构；对编译后的物理引擎进行的代码检查；以及测试，用于检查世界所做的事情，而不仅仅是其“指纹”。在完成测试套件之后，将添加基于网格的碰撞和宿主程序绑定。设计和计划可以在 [docs/PHASE-0.md](docs/PHASE-0.md)、[docs/PHASE-1.md](docs/PHASE-1.md) 和 [docs/PHASE-2.md](docs/PHASE-2.md) 中找到。

## 已构建的内容

| 能力 | 位置 | 证明 |
|---|---|---|
| 固定时间步长的循环；每一步的状态都使用 FNV-1a 哈希算法（使用两个通道）对每个 f64 值进行哈希；拒绝 NaN 和无穷大；规范化符号零。 | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` 自第一个测试套件以来，已经读取了 `0d38671370d12d1e`。 |
| Rust 编写的物理定律，在 `rapier3d-f64` 上使用 `enhanced-determinism`，一个 WebAssembly 二进制文件，其 Linux 摘要已固定；一个正在运行的物理世界，仅当几何形状发生变化时才重新构建，并在动作开始或结束时切换一个物体。 | `solver/` | `fixtures/solver.sha256`，CI 会重新构建并进行比较；`harness/switch.test.js`。 |
| 具有位置、速度、规范四元数、角速度和半轴的物体；动态盒子可以旋转；一个运动学角色，具有 0.3 的自动步长、45° 的攀爬能力和 0.2 的快速移动能力；睡眠状态以步数计算。 | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| 角色通过引擎的 Rapier 冲量例程进行推动，并回溯了 Rapier 自身的后续修复，因此物体仅在其自身的接触点处受到推动，并且每个接触点的冲量大小由物体在该处的有效质量决定，包括其旋转；物理引擎中的一个保护机制，如果推动导致物体的速度超过其推动者的速度的指定倍数，则物理引擎会失败。 | `solver/src/impulses.rs` | `harness/push.test.js`、`fixtures/push/red-room-a.json`，以及一个本地测试，用于验证在没有修复的情况下，复制的程序是否与 Rapier 的例程一样，字节对字节地进行推动。 |
| 世界文件：物体、定向静态碰撞体、高度图、区域作为分区、十二个加载拒绝条件、加载时的危险因素以及宿主信任的索引；动作位于与物理碰撞相同的两个三角形地形表面上。 | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js`, `harness/surface.test.js` |
| 当世界被接受时，会进行一次可达性扫描：使用已接受的动作，通过检查器，从时间步的自身保存中探索其可达状态。如果某个区域无法到达，或者一个物体被带出世界，或者一个抛掷动作被拒绝，则世界将被拒绝，并提供一个证明，证明 `replay` 可以重现。 | `packages/load/sweep.js` | `harness/sweep.test.js`，封闭的测试房间在 `fixtures/sweep/` 中。 |
| 在加载时接受的动作，具有 `drive`、`climb`、`carry`、`release` 和 `episode` 的效果，每个动作都有相应的危险场景。 | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| 思想：具有视线范围的视觉；带有引用其来源的类型化信念；通过墓碑进行替换；拒绝过时的写入；以及带有已满足标志的持续目标。 | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| 对每个步骤进行精确的比特跟踪，并提供一个工具，用于标识两个游戏过程开始分歧的第一个步骤、物体和字段。 | `harness/trace.mjs`, `harness/first-difference.js` | `harness/trace.test.js`；CI 在引擎偏离黄金标准时，会打印出第一个差异。 |
| 行为编号与黄金标准进行比较：每个物体的睡眠步数和最终位置、行走的区域以及快照的长度和摘要。 | `fixtures/golden-behaviour.json`, `harness/check.js` | `harness/check.test.js` |
| 三种保存和恢复方式：通过重放一个步骤的输入，通过复制物理模块的内存，或者通过时间步自身的整个状态的保存，后者可以在不进行重放的情况下进行恢复；每种方式都经过验证，可以确保完全一致地继续。 | `packages/tick/runs.js`, `packages/tick/tick.js`, `solver/build.mjs` | `harness/restore.test.js` |
| 包：一个失败的测试会写入其种子、世界、接受的输入和哈希值，然后 `replay` 会在一个命令中重现。一个每周运行的任务会重放每个包、测试用例和日志，时间比拉取请求可以运行的时间长得多。 | `packages/tick/bundle.js`, `.github/workflows/corpus.yml` | `harness/bundle.test.js` |
| 在两个 CPU 架构上运行一个二进制文件，内存固定为 32 MiB，并且有一个代码检查器，用于拒绝宿主选择的指令、内存增长以及存储在内存之外的状态。 | `solver/build.rs`, `solver/src/arena.rs`, `solver/lint.mjs` | CI 的 ARM64 作业；`solver/lint.test.js`、`harness/caps.test.js`。 |
| 对世界所做事情的测试：一个角色在控制器测量的限制范围内进行移动，在一条长而平坦的道路上完成完整的步幅，并且没有一个步点陷入地面，一个薄而快速的物体与薄墙碰撞，地形接缝，以及整个场景移动了一百万个单位。 | `harness/course.test.js`, `harness/outcome.test.js` | `write-golden` 会拒绝在任何测试失败时进行写入。 |
| 该工具的基准测试：一次更改以及之前的构建，每个树都以自己的方式运行。它命名了更改所涉及的代码和数据，在两个树上运行每个候选输入，并报告哪些内容影响了更改、两个运行首次分离的位置，以及哪些内容仅在更改时失败，以及来自引擎的每个结果，而不是来自模型的任何结果。从覆盖构建中读取法律的范围，该构建的运行必须与产品构建的每一帧相匹配，并且在更改处放置的变异体用于衡量基准测试。 | `packages/bench` | 86 个测试在 `packages/bench/` 中针对具有已知效果的更改进行测试；F2 的法律更改，由人工放置，在量子 98 处发现。 |
| 模型角色的作用：每个角色都有一个清单，从角色读取的内容中得出“双重规则”，检查器中有一个角色门，对每个接受的内容进行来源跟踪，信任标签会与信念一起保留，并且记录并检查每个模型调用，无需使用 GPU；声明的两个角色都是固定的。 | `predicates/roles/`, `packages/tick/roles.js`, `packages/tick/gate.js`, `packages/propose` | `packages/tick/gate.test.js`，在 `fixtures/sessions/` 中，跨会话进行 `packages/propose/record.test.js` |
| 从种子和日志中重播，并查看 localhost 上的调试视图。 | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json` 是一个人通过主机边界进行的测试。 |

479 个测试，七个行为测试用例，这些测试用例会逐步重播，并且三个引擎在 x64 上以及节点在 ARM64 上，在每次提交时打印两个黄金哈希值。

## 安装

要求：Node 20 或更高版本，以及带有 `wasm32-unknown-unknown` 目标的 Rust 工具链，用于物理构建。CI 将 Rust 固定在 1.98.1；安装 rustup 后，`rustup target add wasm32-unknown-unknown` 是额外的步骤。

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, both goldens, and the behaviour numbers under node
```

`npm test` 首先构建物理引擎并检查二进制文件。在 Linux 上，构建会与固定的摘要进行比较；在其他主机上，它会报告自己的摘要，因为 Linux 构建是固定的工件。

## 使用

每个命令都从任何目录运行，返回 `--help`，成功时退出代码为 0，拒绝时返回 1，并在出现用法错误或意外错误时返回 2。`--debug` 允许堆栈跟踪显示。

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

当两次运行不一致时，跟踪会显示位置：

```bash
node harness/trace.mjs > a.trace                    # the product scene, one line per step in exact bits
node harness/first-difference.js a.trace b.trace    # identical, or the first step, body, and field that differ
node solver/lint.mjs                                # refuse a binary that could grow memory or let the host choose a result
```

可以测量一次更改与之前的构建之间的差异。基准测试由人工运行，没有工作流运行它：

```bash
npx bench trees . main HEAD ../trees                # the base and the head as git worktrees, the head's binary built in its own tree
npx bench anchors --base ../trees/base --head ../trees/head    # the code and data the change touches, as JSON
npx bench run --base ../trees/base --head ../trees/head --out ../bench --product-scene    # reach, differences, and catches, with a report
```

该报告会命名其种子，以量子和恢复为单位计算其预算，并说明它没有测量什么；使用一个种子进行的两次运行，在环境块之外会生成相同的报告。当 `solver/` 更改时，每个树都会构建自己的二进制文件，并且法律的范围来自头部的一个覆盖构建，该构建必须完全按照产品构建的方式运行产品场景，否则基准测试会因原因而停止。

一个世界以三种方式恢复，并且没有写入物理引擎的内部状态，这就是为什么每个状态都是精确的。您可以将其接受的输入重播到某个步骤。您可以使用 `imageSolver()` 复制物理模块的整个内存，并使用 `restoreImage()` 将其放回。或者，您可以使用 `save()` 保存整个刻度，并使用 `restore(saved)` 将其放回，这不需要重播，并且是扫描返回到状态数千次的方式。来自另一个二进制文件的图像，长度不正确，或者字节已更改，将被拒绝，并且不检查的保存不会更改任何内容。

调试视图是一个调试视图。它将提交的帧绘制为沿使用 `x`、`y` 或 `z` 选择的轴投影的框；单击是地面平面目标；`M`、`C`、`G`、`D` 和 `U` 选择移动、攀爬、拾取、放下和使用；行人的区域和每个角色的信念都位于刻度和哈希旁边。它永远不会绘制刻度不包含的任何内容。

一个世界文件是 JSON：`name`、`seed`、`bodies`、`colliders`、`zones`，以及可选的 `heightfield` 和 `goal`。一个主体是 `{ id, x, y, z, vx, vy, vz, hx, hy, hz }`，带有可选的四元数和角速度；一个静态碰撞体是一个盒子，其边界带有可选的四元数，关于其中心；一个区域是一个命名的盒子。未知的字段、重复的 ID、重叠的主体、主体位于碰撞体内部、非单位四元数、退化或无法到达的区域，以及命名为空的目标，每个都会因原因而被拒绝。

## 法律，一气呵成

一个带有种子的刻度就是法律。一个步骤，一个量子，是 1/64 秒；每个步骤都会被哈希，并且角色的动作跨越多个步骤。重播是种子加上已接受内容的日志。模型会提出意图、类型的信念和主体草案；该类的检查器会接受或拒绝它们。动作草案和世界文件会在加载时等待，并经过危险套件。主机接收已提交的帧并返回意图。呈现没有返回到哈希的路径。

## 信任模型

引擎在本地运行，并且仅访问其自身检出目录中的文件：世界、动作草案、测试用例以及您要求命令写入的任何日志。`host` 仅绑定 `127.0.0.1`。`bench` 是对检出目录的例外：它将树和报告写入您指定的位置，并在自己的子进程中运行每个树。没有命令会打开任何其他套接字，除了 `propose`，它与本地 Ollama 服务器进行通信，并且不会与其他任何服务器进行通信，并且仅用于其清单被解冻以在临时世界中运行的角色；引擎声明的两个角色都是固定的，因此它会在任何模型客户端加载之前进行拒绝。模型的提案仅通过角色门进入世界，该门会将其限制在其角色的清单中。要构建树的物理引擎，`bench` 运行 `cargo build --locked`，就像求解器自己的构建一样，并且 cargo 仅在缓存中缺少时，从 crates.io 获取固定的 crate。不读取、存储或发送任何凭据。不收集任何遥测数据。授权内容不可信，并在加载时进行验证；拒绝的文件不会更改任何内容。WebAssembly 二进制文件是从源代码在 CI 中构建的，并由其 SHA-256 固定，绝不会作为字节提交。其内存固定为 32 MiB，并且无法增长，因此对于它来说太密集的某个世界，会在每个主机上以相同的方式停止，而不是发生偏差。请参阅 [SECURITY.md](SECURITY.md)。

## 支持状态

1.0 版本之前的版本，最初以 `0.x` 的形式从 `main` 发布。不同版本之间不保证兼容性；对哈希算法的每一次更改都会记录在 [CHANGELOG.md](CHANGELOG.md) 中，并附带其生成的哈希值。在 CI 环境中，已在 Ubuntu x64 和 ARM64 上的 Node 22 以及 Rust 1.98.1 上进行了测试，并且每天在 Windows 11 上进行构建。

## 许可证

MIT 许可证，但 `solver/src/kcc.rs` 和 `solver/src/impulses.rs` 除外，它们是 Rapier 角色控制器的部分修改副本，受 Apache License 2.0（`solver/LICENSE-APACHE-2.0`，`solver/NOTICE`）约束。由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
