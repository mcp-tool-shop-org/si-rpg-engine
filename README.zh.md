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

si-rpg-engine 是一个 3D 世界的模拟核心，可以精确地重现游戏过程。它以固定的每秒 64 步的速度进行物理计算，并在每一步之后记录世界的“指纹”，可以从其起始种子和接受的输入中重建任何游戏过程，精确到每一位。物理引擎使用 Rust 编写，并编译成一个 WebAssembly 文件。一个语言模型可以建议接下来会发生什么；手工编写的规则决定了哪些内容会被纳入。它是 [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 的对应物，其价值在于它所模拟的内容。

## 它的本质和目标

Chrome、Firefox 和 Safari 背后的 JavaScript 引擎（分别是 V8、SpiderMonkey 和 JavaScriptCore），对于相同的世界，每次提交都会打印出相同的“指纹”，并且相同的物理引擎构建在 x64 和 ARM64 架构上也会打印出相同的“指纹”。所有其他内容都建立在这个承诺之上：在给定一个种子和一个接受的输入列表的情况下，两台机器对一个世界达成一致，精确到每一个字节。在此基础上，存在着在三维空间中坠落、滑动、推动、倾斜和翻滚的物体；一个可以行走、攀爬斜坡、携带物品并放下物品的角色；当世界文件出现错误时，会被拒绝并附带原因；以及拥有“思想”的角色，它们可以观察、记住所看到的内容，并拒绝基于比其将要替代的证据更旧的证据得出的结论。

它的目标是在宿主程序中成为模拟核心：浏览器、Godot 或 Unreal 绘制图像并发送输入，而物理引擎、指纹和记录则保留在此处。当前的工作是构建一个完整的引擎所需的测试套件，其中大部分内容包括：一个跟踪，用于标识两个游戏过程开始分歧的第一个步骤和值；经过验证的保存和恢复功能；第二个 CPU 架构；对编译后的物理引擎进行代码检查；以及测试，用于检查世界所做的事情，而不仅仅是其指纹。在完成测试套件之后，将添加基于网格的碰撞和宿主程序绑定。设计和计划可以在 [docs/PHASE-0.md](docs/PHASE-0.md)、[docs/PHASE-1.md](docs/PHASE-1.md) 和 [docs/PHASE-2.md](docs/PHASE-2.md) 中找到。

## 已构建的内容

| 能力 | 位置 | 证明 |
|---|---|---|
| 固定时间步长的循环；每一步的状态都使用 FNV-1a 哈希算法进行哈希处理，该算法对每个 f64 值进行两次计算；拒绝 NaN 和无穷大；规范化符号零 | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` 自第一个测试套件以来，已经读取了 `0d38671370d12d1e` |
| Rust 编写的物理定律，在 `rapier3d-f64` 上使用 `enhanced-determinism`，一个 WebAssembly 二进制文件，其 Linux 摘要已固定；一个正在运行的物理世界，仅当几何形状发生变化时才重新构建，并在动作开始或结束时切换一个物体 | `solver/` | `fixtures/solver.sha256`，CI 会重新构建并进行比较；`harness/switch.test.js` |
| 具有位置、速度、规范四元数、角速度和半轴的物体；动态盒子可以旋转；一个运动学角色，具有 0.3 的自动步长、45° 的攀爬能力和 0.2 的快照；睡眠时间以步数计算 | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| 角色通过引擎的 Rapier 冲量例程进行推动，并回溯了 Rapier 自身的后续修复，因此物体仅在其自身的接触点处受到推动，并且每个接触点的冲量大小由物体在该处的有效质量决定，包括其旋转；物理引擎中的一个保护机制，如果推动导致物体的速度超过其推动者的速度的指定倍数，则该推动将失败 | `solver/src/impulses.rs` | `harness/push.test.js`、`fixtures/push/red-room-a.json`，以及一个本机测试，该测试表明，不进行修复的副本与 Rapier 的例程一样，精确到每一位 |
| 世界文件：物体、定向静态碰撞体、高度图、区域作为分区、十二个加载拒绝规则、加载时的危险因素以及宿主信任的索引；动作位于与物理碰撞相同的两个三角形地形表面上 | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js`, `harness/surface.test.js` |
| 当世界被接受时，进行一次可达性扫描：使用已接受的动作，通过检查器，从时间步的自己的保存数据中，探索其可达状态。如果一个区域无法到达，或者一个物体被带出世界，或者一个投掷动作被拒绝，则该世界将被拒绝，并提供一个证明，证明 `replay` 可以重现该情况 | `packages/load/sweep.js` | `harness/sweep.test.js`，封闭的测试房间在 `fixtures/sweep/` 中 |
| 在加载时接受的动作，具有 `drive`、`climb`、`carry`、`release` 和 `episode` 效果，每个动作都具有危险场景 | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| 思想：具有视线的视觉；带有类型化的信念，引用其来源；通过墓碑进行替换；拒绝过时的写入；以及具有已满足标志的持续目标 | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| 每一步的精确比特跟踪，以及一个工具，用于标识两个游戏过程开始分歧的第一个步骤、物体和字段 | `harness/trace.mjs`, `harness/first-difference.js` | `harness/trace.test.js`；CI 在引擎偏离黄金标准时打印出第一个差异 |
| 行为数字与黄金标准进行比较：每个物体的睡眠步数和最终位置、行走的区域以及快照的长度和摘要 | `fixtures/golden-behaviour.json`, `harness/check.js` | `harness/check.test.js` |
| 三种保存和恢复方式：通过重放一个步骤的输入，通过复制物理模块的内存，或者通过时间步自身对其整个状态的保存，后者可以在不进行重放的情况下进行恢复；每种方式都经过验证，可以精确地继续 | `packages/tick/runs.js`, `packages/tick/tick.js`, `solver/build.mjs` | `harness/restore.test.js` |
| 包：一个失败的测试会写入其种子、世界、接受的输入和哈希值，然后 `replay` 会使用一个命令重现该情况；每周都会重放所有包、测试用例和日志，时间比拉取请求长得多 | `packages/tick/bundle.js`, `.github/workflows/corpus.yml` | `harness/bundle.test.js` |
| 在两个 CPU 架构上的一个二进制文件，内存固定为 32 MiB，并且有一个代码检查器，该检查器会拒绝宿主选择的指令、内存增长以及存储在内存之外的状态 | `solver/build.rs`, `solver/src/arena.rs`, `solver/lint.mjs` | CI 的 ARM64 作业；`solver/lint.test.js`、`harness/caps.test.js` |
| 对世界所做事情的测试：一个角色在控制器测量的限制范围内进行移动，在漫长平坦的行走中，每一步都进行完整的步幅，一个薄而快的物体与薄墙碰撞，地形接缝，以及整个场景移动了一百万个单位 | `harness/course.test.js`, `harness/outcome.test.js` | `write-golden` 会拒绝在其中任何一个测试失败时进行写入 |
| 模型座位的角色：每个角色都有一个清单，从角色读取的内容中推导出“双重规则”，在检查器中有一个角色门控，在每次接受时都有来源，并且具有信任标签，这些标签会与一个信念一起保留，并且每次模型调用都会被记录和检查，而无需使用 GPU；所有声明的角色都已冻结 | `predicates/roles/`, `packages/tick/roles.js`, `packages/tick/gate.js`, `packages/propose` | `packages/tick/gate.test.js`，在 `fixtures/sessions/` 中，跨多个会话进行 `packages/propose/record.test.js` |
| 从一个种子和一个日志中重放，并在本地主机上查看调试信息。 | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json` 是一个人在主机边界上的游戏过程。 |

378 个测试，七个行为测试用例，这些用例会逐个步骤地重放，以及两个黄金哈希值，由三个引擎在 x64 上以及由 Node 在 ARM64 上打印，每次提交都会进行。

## 安装

要求：Node 20 或更高版本，以及带有 `wasm32-unknown-unknown` 目标的 Rust 工具链，用于物理引擎的构建。CI 固定使用 Rust 1.98.1；安装 rustup 后，`rustup target add wasm32-unknown-unknown` 是额外的步骤。

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, both goldens, and the behaviour numbers under node
```

`npm test` 首先构建物理引擎并检查二进制文件。在 Linux 上，构建会与固定的摘要进行比较；在其他主机上，它会报告自己的摘要，因为 Linux 构建是固定的制品。

## 使用方法

每个命令都从任何目录运行，返回 `--help`，成功时退出代码为 0，拒绝时返回 1，并附带原因，发生用法错误或意外错误时返回 2。`--debug` 允许堆栈跟踪输出。

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

当两次运行的结果不一致时，跟踪信息会显示具体位置：

```bash
node harness/trace.mjs > a.trace                    # the product scene, one line per step in exact bits
node harness/first-difference.js a.trace b.trace    # identical, or the first step, body, and field that differ
node solver/lint.mjs                                # refuse a binary that could grow memory or let the host choose a result
```

一个世界以三种方式进行恢复，并且没有一个会写入物理引擎的内部状态，这就是为什么每次恢复都是精确的。您可以将接受的输入重放到一个步骤。您可以使用 `imageSolver()` 复制物理模块的整个内存，并使用 `restoreImage()` 将其放回。或者，您可以使用 `save()` 保存整个时间步，并使用 `restore(saved)` 将其放回，这不需要重放，并且是循环返回到状态数千次的方式。来自另一个二进制文件、长度不正确或字节发生更改的图像都会被拒绝，并且一个未检查完整更改的保存操作不会改变任何内容。

调试视图是一个调试视图。它将提交的帧绘制为沿 `x`、`y` 或 `z` 选择的轴投影的盒子；单击是地面平面的目标；`M`、`C`、`G`、`D` 和 `U` 分别选择移动、攀爬、拾取、放下和使用；行人的区域和每个角色的信念都位于时间步和哈希值的旁边。它绝不会绘制任何时间步中未包含的内容。

一个世界文件是 JSON 格式：`name`、`seed`、`bodies`、`colliders`、`zones`，以及可选的 `heightfield` 和 `goal`。一个物体是 `{ id, x, y, z, vx, vy, vz, hx, hy, hz }`，带有可选的四元数和角速度；一个静态碰撞体是一个盒子，由其边界和可选的围绕其中心的四元数定义；一个区域是一个命名的盒子。未知的字段、重复的 ID、重叠的物体、物体位于碰撞体内、非单位四元数、退化或无法到达的区域，以及目标未命名任何内容，都会被拒绝，并附带原因。

## 法则，一气呵成

一个带有种子的时间步就是法则。一个步骤，一个量子，是 1/64 秒；每个步骤都会被哈希，并且角色的动作跨越多个步骤。重放是种子加上被允许的内容的日志。模型会提出意图、类型的信念和物体草图；该类的检查器会允许或拒绝它们。动作草图和世界文件会在加载时等待，并经过一系列测试。主机接收已提交的帧并返回意图。呈现过程没有返回到哈希值的路径。

## 信任模型

引擎在本地运行，并且只访问其自身检出目录内的文件：世界、动作草图、测试用例以及您要求命令写入的任何日志。`host` 仅绑定 `127.0.0.1`。没有命令会打开任何其他套接字，除了 `propose`，它与本地 Ollama 服务器通信，并且不会与其他服务器通信，并且仅用于一个其清单已被解冻以在临时世界中运行的角色；引擎声明的两个角色都是冻结的，因此它会在任何模型客户端加载之前拒绝。模型的提案仅通过角色门进入世界，并且它会将其限制在其角色的清单范围内。不会读取、存储或发送任何凭据。不会收集任何遥测数据。授权的内容是不受信任的，并且会在加载时进行验证；一个被拒绝的文件不会改变任何内容。WebAssembly 二进制文件是从源代码在 CI 中构建的，并由其 SHA-256 固定，绝不会以字节的形式提交。其内存固定为 32 MiB，并且不能增长，因此，如果世界对于其来说过于密集，则会在每个主机上以相同的方式停止，而不是产生不同的结果。请参阅 [SECURITY.md](SECURITY.md)。

## 支持状态

预 1.0 版本，发布为 `0.x`，来自 `main`。不同版本之间没有兼容性保证；对哈希法则的每次更改都会在 [CHANGELOG.md](CHANGELOG.md) 中记录，并附带它生成的黄金哈希值。在 CI 中，在 Ubuntu x64 和 ARM64 上使用 Node 22 和 Rust 1.98.1 进行测试，并且每天在 Windows 11 上进行构建。

## 许可证

MIT 许可证，除了 `solver/src/kcc.rs` 和 `solver/src/impulses.rs`，它们是 Rapier 角色控制器的修改副本，并且受 Apache License 2.0 许可（`solver/LICENSE-APACHE-2.0`、`solver/NOTICE`）。由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
