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

si-rpg-engine 是一个 3D 世界的模拟核心，可以精确地重现游戏过程。它以固定的 64 步/秒的速度进行物理计算，并在每个步骤之后记录世界的“指纹”，可以从其起始种子和接受的输入中重建任何游戏过程，做到完全一致。物理引擎使用 Rust 编写，并编译成一个 WebAssembly 文件。一个语言模型可以预测接下来会发生什么；手工编写的规则决定了哪些内容会被纳入。它是 [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 的对应版本，其价值在于它所模拟的内容。

## 它的本质和目标

Chrome、Firefox 和 Safari 背后的 JavaScript 引擎（分别是 V8、SpiderMonkey 和 JavaScriptCore）在每次提交时，都会为同一个世界生成相同的“指纹”，并且相同的物理引擎构建也会在 x64 和 ARM64 架构上生成相同的“指纹”。所有其他内容都建立在这个承诺之上：在给定一个种子和一个接受的输入列表的情况下，两台机器对一个世界达成一致，字节对字节地完全相同。在此基础上，存在着在三维空间中坠落、滑动、推动、倾斜和翻滚的物体；一个可以行走、攀爬斜坡、携带物品并放下物品的角色；当世界文件出现错误时，会被拒绝并附带原因；以及拥有“思想”的角色，它们可以观察、记住所看到的内容，并拒绝基于比其将要替代的证据更旧的证据得出的结论。

它的目标是在一个宿主程序中作为模拟核心：浏览器、Godot 或 Unreal 绘制图像并发送输入，而物理引擎、指纹和记录则保留在此处。目前的工作是构建一个可供发布的引擎所需的测试套件，其中大部分内容包括：一个跟踪，用于标识两个游戏过程在哪个步骤和值处开始分歧；经过验证的精确保存和恢复功能；第二个 CPU 架构；对编译后的物理引擎进行的代码检查；以及测试，用于检查世界所做的事情，而不仅仅是其指纹。网格碰撞已经实现：一个场景可以指定一个固定的三角形网格，而生成的场景则不指定任何网格。宿主程序通过 [docs/host-binding.md](docs/host-binding.md) 中的套接字进行绑定。设计和计划分别在 [docs/PHASE-0.md](docs/PHASE-0.md)、[docs/PHASE-1.md](docs/PHASE-1.md) 和 [docs/PHASE-2.md](docs/PHASE-2.md) 中。

## 已构建的内容

| 能力 | 位置 | 证明 |
|---|---|---|
| 固定时间步长的计算；每个步骤的状态都使用 FNV-1a 算法进行哈希，该算法对每个 f64 值进行两次计算；拒绝 NaN 和无穷大；规范化符号零 | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` 自第一个测试套件以来，已经读取了 `0d38671370d12d1e` |
| Rust 编写的物理定律，在 `rapier3d-f64` 上使用 `enhanced-determinism`，一个 WebAssembly 二进制文件，其 Linux 摘要已固定；一个正在运行的物理世界，仅当几何形状发生变化时才重新构建，并在动作开始或结束时切换一个物体 | `solver/` | `fixtures/solver.sha256`，CI 会重新构建并进行比较；`harness/switch.test.js` |
| 具有位置、速度、规范四元数、角速度和半轴的物体；动态盒子可以旋转；一个运动学角色，具有 0.3 的自动步进、45° 的攀爬能力和 0.2 的快照；睡眠状态以步数计算 | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| 角色通过引擎的 Rapier 冲量例程进行推动，并回溯了 Rapier 自身的后续修复，因此物体仅在其自身的接触点处受到推动，并且每个接触点的冲量大小由物体在该处的有效质量决定，包括其旋转；物理引擎中的一个保护机制，如果推动导致物体的速度超过其推动者的速度的指定倍数，则物理引擎会失败 | `solver/src/impulses.rs` | `harness/push.test.js`、`fixtures/push/red-room-a.json`，以及一个本地测试，用于验证在没有修复的情况下，复制的物体会像 Rapier 的例程一样进行推动，做到完全一致 |
| 受驱动的物体不会与动态物体发生碰撞。受驱动的碰撞体属于碰撞组 3，并且排除碰撞组 2；动态碰撞体属于碰撞组 2，并且排除碰撞组 3。静态物体保持 Rapier 的默认设置。碰撞组保持不变，因此窄相仍然会找到配对。没有 JavaScript 开关。在阶梯房间中，两个盒子都保持在 1 米/秒以下。行者的 16 米/秒速度相当于在一个量子中移动 0.25 米，这就是一个步长 | `solver/src/rapier_law.rs` | `harness/step-up-121.test.js`、`harness/sweep.test.js`，以及一个本地测试，用于验证碰撞组相互排除，并且碰撞处理程序保持不变 |
| 一个固定的三角形网格。一个场景可以指定它，而生成的场景则不指定任何网格。构造函数会拒绝加载器会拒绝的网格，并且物理定律会拒绝超出范围的索引、重复的索引或在构建网格之前出现的非有限顶点。一个被捕获的物理模块将被丢弃。被拒绝的加载或步骤不会保留该世界或复制物体 | `solver/src/rapier_law.rs`, `packages/tick/scene.js`, `packages/tick/world.js` | `harness/mesh.test.js`, `harness/mesh-refusal.test.js` |
| 世界文件：物体、定向静态碰撞体、高度图、区域作为分区、十二个加载拒绝、加载时的危险，以及宿主信任的一个索引；动作位于与物理碰撞相同的两个三角形地形表面上 | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js`, `harness/surface.test.js` |
| 当一个世界被允许时，会进行一次可达性扫描：使用允许的动作，通过检查器，从时间步的自身保存中探索其可达状态。如果一个区域无法到达，或者一个物体被带出世界，或者一个投掷动作被拒绝，则该世界将被拒绝，并提供一个证明，证明 `replay` 可以重现 | `packages/load/sweep.js` | `harness/sweep.test.js`，封闭的测试房间在 `fixtures/sweep/` 中 |
| 在加载时允许的动作，具有 `drive`、`climb`、`carry`、`release` 和 `episode` 效果，每个动作都具有危险场景 | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| “思想”：具有视线的视野，引用其来源的类型化信念，通过墓碑进行替换，拒绝过时的写入，以及具有已满足标志的持续目标 | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| 每个步骤的精确比特跟踪，以及一个工具，用于标识两个游戏过程在哪个步骤、哪个物体和哪个字段处开始分歧 | `harness/trace.mjs`, `harness/first-difference.js` | `harness/trace.test.js`；CI 会在引擎偏离黄金标准时打印出第一个差异 |
| 行为编号与黄金标准进行比较：每个物体的睡眠步数和最终位置、行者的区域以及快照的长度和摘要 | `fixtures/golden-behaviour.json`, `harness/check.js` | `harness/check.test.js` |
| 三种方式的保存和恢复：通过重放一个步骤的输入，通过复制物理模块的内存，或者通过时间步自身的整个状态的保存，后者可以在不进行重放的情况下进行恢复；每种方式都经过验证，可以精确地继续进行 | `packages/tick/runs.js`, `packages/tick/tick.js`, `solver/build.mjs` | `harness/restore.test.js` |
| 软件包：一个失败的测试会记录其种子、世界、接受的输入和哈希值，然后 `replay` 会在一个命令中重现这些内容；每周的任务会重播每个软件包、测试用例和日志，时间比拉取请求长得多。 | `packages/tick/bundle.js`, `.github/workflows/corpus.yml` | `harness/bundle.test.js` |
| 在两种 CPU 架构上运行一个二进制文件，内存固定为 32 MiB，并且有一个代码检查工具，它会拒绝主机选择的指令、内存增长以及存储在内存之外的状态。 | `solver/build.rs`, `solver/src/arena.rs`, `solver/lint.mjs` | CI 的 ARM64 作业；`solver/lint.test.js`，`harness/caps.test.js` |
| 测试世界中的行为：一个角色在控制器设定的限制范围内进行移动，在一条长而平坦的道路上完成完整的步幅，并且没有一个脚踩空，一个纤细的身体靠着一面薄墙，地形接缝，以及整个场景移动了数百万个单位。 | `harness/course.test.js`, `harness/outcome.test.js` | `write-golden` 拒绝在其中任何一个测试失败时进行写入。 |
| 测试工具：一个更改及其之前的构建版本，每个测试用例都在自己的进程中运行。它会命名更改所涉及的代码和数据，在两个测试用例上运行每个候选输入，并报告哪些内容影响了更改，两个测试用例第一次出现差异的位置，以及哪些内容仅在更改时失败，以及来自引擎的每个结果，而不是来自模型的任何结果。通过覆盖构建读取法律的范围，该构建的运行必须与产品构建的每一帧相匹配，并且在更改处放置的变异体用于衡量测试工具。 | `packages/bench` | 86 tests in `packages/bench/` against changes planted with known effects; F2's law change, planted by hand, found at quantum 98 |
| 模型角色的作用：每个角色都有一个清单，从角色读取的内容中得出“二律法则”，在检查器中有一个角色门控，对每个接受的内容进行溯源，信任标签会与一个信念一起保留，并且每个模型调用都会被记录和检查，无需使用 GPU；两个声明的角色都已冻结。 | `predicates/roles/`, `packages/tick/roles.js`, `packages/tick/gate.js`, `packages/propose` | `packages/tick/gate.test.js`，`packages/propose/record.test.js` 在 `fixtures/sessions/` 中的各个会话中 |
| 从一个种子和一个日志中重播，以及主机绑定用于帧流、意图门和混合规则。 | `packages/tick/replay.js`, `packages/host`, `docs/host-binding.md` | `fixtures/first-scene-played.json` 是一个人通过主机边界进行的测试；`harness/binding.test.js` 通过套接字重播测试用例。 |

516 个测试，七个行为测试用例，这些测试用例会逐个步骤地重播，并且在每次提交时，三个引擎会在 x64 上打印两个黄金哈希值，而 node 会在 ARM64 上打印。

## 安装

要求：Node 20 或更高版本，以及带有 `wasm32-unknown-unknown` 目标的 Rust 工具链，用于物理构建。CI 将 Rust 固定在 1.98.1 版本；安装 rustup 后，`rustup target add wasm32-unknown-unknown` 是额外的步骤。

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, both goldens, and the behaviour numbers under node
```

`npm test` 首先构建物理引擎并检查二进制文件。在 Linux 上，构建会与固定的摘要进行比较；在另一个主机上，它会报告自己的摘要，因为 Linux 构建是固定的工件。

## 使用

每个命令都从任何目录运行，返回 `--help`，成功时退出代码为 0，拒绝时返回 1，并附带原因，如果出现用法错误或意外错误，则返回 2。`--debug` 允许堆栈跟踪显示。

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

当两个运行结果不一致时，跟踪会显示位置：

```bash
node harness/trace.mjs > a.trace                    # the product scene, one line per step in exact bits
node harness/first-difference.js a.trace b.trace    # identical, or the first step, body, and field that differ
node solver/lint.mjs                                # refuse a binary that could grow memory or let the host choose a result
```

可以将一个更改与之前的构建进行比较。测试工具由人工运行，并且没有工作流程运行它：

```bash
npx bench trees . main HEAD ../trees                # the base and the head as git worktrees, the head's binary built in its own tree
npx bench anchors --base ../trees/base --head ../trees/head    # the code and data the change touches, as JSON
npx bench run --base ../trees/base --head ../trees/head --out ../bench --product-scene    # reach, differences, and catches, with a report
```

报告会命名其种子，计算其预算（以量子和恢复次数为单位），并说明它没有测量的内容；使用一个种子进行的两次运行，在环境块之外会给出相同的报告。当 `solver/` 发生更改时，每个测试用例都会构建自己的二进制文件，并且法律的范围来自头部的一个覆盖构建，该构建必须完全按照产品构建的方式运行产品场景，否则测试工具会停止并显示原因。

一个世界以三种方式进行恢复，并且没有一个会写入物理引擎的内部状态，这就是为什么每个恢复都是精确的。您可以将接受的输入重播到某个步骤。您可以复制物理模块的整个内存，并使用 `imageSolver()` 将其放回，然后使用 `restoreImage()`。或者，您可以保存整个时间步，并使用 `save()` 将其放回，然后使用 `restore(saved)`，这不需要重播，并且是扫描返回到状态数千次的方式。来自另一个二进制文件的图像，长度不正确，或者字节发生更改，都会被拒绝，并且一个没有检查完整更改的保存操作不会改变任何内容。

调试视图是一个调试视图。它会绘制已提交的帧，并沿用 `x`、`y` 或 `z` 选择的轴绘制投影框；单击会选择一个地面平面目标；`M`、`C`、`G`、`D` 和 `U` 分别选择移动、攀爬、拾取、放下和使用；行人的区域和每个角色的信念都位于时间步和哈希值旁边。它绝不会绘制时间步中不包含的内容。

一个世界文件是 JSON 格式：`name`、`seed`、`bodies`、`colliders`、`zones`，以及可选的 `heightfield`、`mesh` 和 `goal`。一个网格是 `{ positions, indices }`。一个物体是 `{ id, x, y, z, vx, vy, vz, hx, hy, hz }`，可选地带有四元数和角速度；一个静态碰撞体是一个盒子，其边界带有可选的四元数，关于其中心；一个区域是一个命名的盒子。未知的字段、重复的 ID、重叠的物体、一个物体位于碰撞体内、一个非单位四元数、一个退化的或无法到达的区域，以及一个命名为空的目标，都会被拒绝，并附带原因。

## 法律，一气呵成

一个带有种子的时间步就是法律。一个受驱动的物体和一个动态物体不共享求解器接触，但窄相仍然会找到这对物体。一个步骤，一个量子，是 1/64 秒；每个步骤都会被哈希，并且一个角色的动作跨越多个步骤。重播是种子加上已接受内容的日志。模型会提出意图、类型的信念和物体草图；该类的检查器会接受或拒绝它们。动作草图和世界文件会等到加载时才进行处理，并经过一个危险套件。主机接收已提交的帧并返回意图。呈现没有返回到哈希值的路径。

## 信任模型

该引擎在本地运行，并且仅访问其自身检出目录中的文件：世界、动作草稿、测试用例以及您要求命令写入的任何日志。`host` 仅绑定 `127.0.0.1`。`bench` 是对检出目录的例外：它将树和报告写入您指定的位置，并在自身的子进程中运行每个树。没有命令会打开任何其他套接字，除了 `propose`，它仅与本地 Ollama 服务器通信，并且仅用于一个角色，该角色的清单已解冻，以便在临时世界中运行；引擎声明的两个角色都处于冻结状态，因此在任何模型客户端加载之前，它都会拒绝。模型的提案仅通过角色门进入世界，该门限制其行为符合其角色的清单。为了构建树的物理特性，`bench` 运行 `cargo build --locked`，就像求解器自身的构建一样，并且 cargo 仅在缓存中缺少时，从 crates.io 获取固定版本的 crate。不读取、存储或发送任何凭据。不收集任何遥测数据。授权内容不可信，并在加载时进行验证；被拒绝的文件不会产生任何影响。WebAssembly 二进制文件从源代码在 CI 中构建，并通过其 SHA-256 进行固定，绝不会以字节形式提交。其内存固定为 32 MiB，并且不能增长，因此，如果世界过于密集，以至于超出其限制，则会在每个主机上以相同的方式停止，而不是产生不同的结果。请参阅 [SECURITY.md](SECURITY.md)。

## 支持状态

1.0 之前的版本，以 `0.x` 的形式从 `main` 发布。不同版本之间没有兼容性保证；对哈希规则的每次更改都会在 [CHANGELOG.md](CHANGELOG.md) 中记录，并附带其生成的黄金哈希值。在 CI 中，在 Ubuntu x64 和 ARM64 上的 Node 22 和 Rust 1.98.1 上进行了测试，并且每天在 Windows 11 上进行构建。

## 许可

MIT 许可，除了 `solver/src/kcc.rs` 和 `solver/src/impulses.rs`，它们是 Rapier 角色控制器的部分修改副本，受 Apache License 2.0 许可（`solver/LICENSE-APACHE-2.0`、`solver/NOTICE`）。由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
