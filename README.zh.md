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

si-rpg-engine 是一个用于 3D 世界的模拟核心，可以精确地重现游戏过程。它以固定的每秒 64 步的速度进行物理计算，并在每一步之后记录世界的“指纹”，并且可以从其起始种子和它接受的输入中重建任何游戏过程，精确到每一位。物理引擎使用 Rust 编译成一个 WebAssembly 文件。一个语言模型可以建议接下来会发生什么；手工编写的规则决定了哪些内容会被纳入。它是 [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 的对应物，其性能由它模拟的内容来衡量。

## 它的本质以及它所追求的目标

Chrome、Firefox 和 Safari 背后的 JavaScript 引擎（分别是 V8、SpiderMonkey 和 JavaScriptCore）在每次提交时，都会为相同的世界打印相同的“指纹”，并且相同的物理引擎构建在 x64 和 ARM64 架构上也会打印相同的“指纹”。所有其他内容都依赖于这个承诺：在给定一个种子和一个接受的输入列表的情况下，两台机器对一个世界达成一致，精确到每一个字节。在此基础上，存在着在三维空间中坠落、滑动、推动、倾斜和翻滚的物体；一个可以行走、攀爬斜坡、携带物品并放下物品的角色；当世界文件出现错误时，会被拒绝并附带原因；以及具有“意识”的角色，它们可以观察、记住它们所看到的内容，并拒绝基于比其将要替代的证据更旧的证据得出的结论。

它的目标是成为宿主程序内部的模拟核心：浏览器、Godot 或 Unreal 绘制图像并发送输入，而物理引擎、指纹和记录则保留在此处。当前的工作是正在构建的引擎所需的一套测试，其中大部分内容包括：一个跟踪，用于标识两个游戏过程开始分歧的第一个步骤和值；经过验证的保存和恢复功能；第二个 CPU 架构；对编译后的物理引擎进行的代码检查；以及测试，用于检查世界实际执行的操作，而不仅仅是其“指纹”。在完成测试之后，将添加基于网格的碰撞和宿主程序绑定。设计和计划可以在 [docs/PHASE-0.md](docs/PHASE-0.md)、[docs/PHASE-1.md](docs/PHASE-1.md) 和 [docs/PHASE-2.md](docs/PHASE-2.md) 中找到。

## 已构建的内容

| 能力 | 位置 | 证明 |
|---|---|---|
| 固定时间步长的循环；每一步的状态都使用 FNV-1a 哈希算法进行哈希处理，该算法对每个 f64 值进行两次计算；拒绝使用 NaN；规范化符号零。 | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` 自第一个测试套件以来，已读取 `0d38671370d12d1e` |
| 物理定律使用 Rust 在 `rapier3d-f64` 上进行编译，使用 `enhanced-determinism`，生成一个 WebAssembly 二进制文件，Linux 摘要已固定 | `solver/` | `fixtures/solver.sha256`；CI 会重建并进行比较 |
| 具有位置、速度、规范四元数、角速度和半轴长度的物体；动态盒子可以旋转；一个运动学角色，具有 0.3 的自动步进、45° 的攀爬能力和 0.2 的快速移动能力；睡眠状态以步数为单位进行计算。 | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| 世界文件：物体、定向静态碰撞体、高度图、区域作为分区、十二种加载拒绝情况、加载时的危险因素以及宿主程序信任的索引；动作发生在与物理引擎碰撞的相同的双三角形地形表面上。 | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js`, `harness/surface.test.js` |
| 在加载时接受的动词，并带有 `drive`、`climb`、`carry`、`release`、`episode` 效果，每个动词都有相应的危险场景 | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| “意识”：具有视线范围的视觉；引用其来源的类型化信念；通过“墓碑”进行替代；拒绝过时的写入；具有已满足标志的持续目标。 | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| 对每一步进行精确的比特跟踪，并提供一个工具，用于标识两个游戏过程开始分歧的第一个步骤、物体和字段。 | `harness/trace.mjs`, `harness/first-difference.js` | `harness/trace.test.js`；CI 在引擎偏离“黄金标准”时打印出第一个差异。 |
| 与“黄金标准”相比的行为数字：每个物体的睡眠步数和最终位置、行走的角色的区域以及快照的长度和摘要。 | `fixtures/golden-behaviour.json`, `harness/check.js` | `harness/check.test.js` |
| 两种保存和恢复方式，通过重放某个步骤的输入或通过复制物理模块的内存，每种方式都经过验证，可以精确地继续。 | `harness/replay-to.mjs`, `solver/build.mjs` | `harness/restore.test.js` |
| 在两个 CPU 架构上运行的单个二进制文件，内存固定为 32 MiB，并且有一个代码检查器，用于拒绝宿主程序选择的指令、内存增长以及存储在内存之外的状态。 | `solver/build.rs`, `solver/src/arena.rs`, `solver/lint.mjs` | CI 的 ARM64 作业；`solver/lint.test.js`，`harness/caps.test.js` |
| 对世界实际执行的操作进行测试：角色在控制器测量的限制范围内进行移动、一个薄而快速的物体与薄墙碰撞以及地形接缝。 | `harness/course.test.js`, `harness/outcome.test.js` | `write-golden` 拒绝在其中任何一个测试失败时进行写入。 |
| 从种子和日志中进行重放；在 localhost 上显示时间步长的调试视图 | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json` 是一个人通过宿主边界进行的游戏 |

174 个测试，七个行为测试用例，这些测试用例会逐个步骤地重放，以及在每次提交时，三个引擎在 x64 架构上以及 node 在 ARM64 架构上打印的两个“黄金哈希”。

## 安装

要求：Node 20 或更高版本，以及带有 `wasm32-unknown-unknown` 目标的 Rust 工具链，用于构建求解器。CI 固定使用 Rust 1.98.1；安装 rustup 后，`rustup target add wasm32-unknown-unknown` 是额外的步骤。

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, both goldens, and the behaviour numbers under node
```

`npm test` 首先构建求解器。在 Linux 上，构建结果会与固定的摘要进行比较；在其他宿主上，它会报告自己的摘要，因为 Linux 构建是固定的制品。

## 使用

每个命令都从任何目录运行，返回 `--help`，成功时退出代码为 0，拒绝时返回 1 并附带原因，出现用法错误或意外错误时返回 2。`--debug` 允许堆栈跟踪显示。

```bash
npx play proposals.json --seed 7 --log out.json    # run proposals through the tick and print every committed frame
npx replay out.json                                 # rerun a log; fails on the first hash that differs
npx load world worlds/crate-and-door.json           # validate a world, run its hazards, and write its load hash to the index
npx load admit fixtures/climb-draft.json            # compile an action draft, run the hazards for its effect, and add it to the catalog
npx load retire climb                               # take an action out of the catalog
npx host --world worlds/crate-and-door.json         # serve the debug view at http://127.0.0.1:4173
npx write-golden                                    # run the course and outcome tests, then rewrite the goldens and name what moved
```

当两个游戏过程不一致时，跟踪会显示在哪里：

```bash
node harness/trace.mjs > a.trace                    # the product scene, one line per step in exact bits
node harness/first-difference.js a.trace b.trace    # identical, or the first step, body, and field that differ
node solver/lint.mjs                                # refuse a binary that could grow memory or let the host choose a result
```

世界可以以两种方式进行恢复，并且都不会写入物理引擎的内部状态，这就是为什么这两种方式都是精确的：重放其接受的输入到某个步骤，或者使用 `imageSolver()` 复制物理模块的整个内存，然后使用 `restoreImage()` 将其放回。来自另一个二进制文件的图像，如果长度不正确或字节发生更改，将被拒绝。

调试视图是一个调试视图。它将已提交的帧绘制为沿使用 `x`、`y` 或 `z` 选择的轴投影的盒子；单击表示地面平面目标；`M`、`C`、`G`、`D` 和 `U` 分别选择移动、攀爬、拾取、放下和使用；行者的区域和每个思维的信念都与时间步长和哈希值并列显示。它绝不会绘制时间步长未包含的任何内容。

世界文件是 JSON 格式：`name`、`seed`、`bodies`、`colliders`、`zones`，以及可选的 `heightfield` 和 `goal`。一个物体是 `{ id, x, y, z, vx, vy, vz, hx, hy, hz }`，可以选择性地包含四元数和角速度；一个静态碰撞体是一个盒子，其边界和可选的围绕其中心的四元数；一个区域是一个命名的盒子。未知的字段、重复的 ID、重叠的物体、物体位于碰撞体内部、非单位四元数、退化或无法到达的区域以及命名为空的目标，都会被拒绝并附带原因。

## 物理定律，一气呵成

一个带有种子的时间步长就是物理定律。量子为 1/64 秒，每个量子都会被哈希，并且一个玩家动作跨越多个量子。重放是通过种子加上已接受的日志来实现的。模型会提出意图、类型化的信念和物体草图；针对该类别的检查器会接受或拒绝。动词草图和世界文件会在加载时进行处理，并经过危险测试。宿主接收已提交的帧并返回意图。呈现过程不会返回哈希值。

## 信任模型

引擎在本地运行，并且仅访问其自身检出目录中的文件：世界、动作草稿、测试用例以及您要求命令写入的任何日志。`host` 仅绑定 `127.0.0.1`。没有命令会打开任何其他套接字；冻结的 `propose` 仪器，一旦有人将其解冻，就会与本地 Ollama 服务器进行通信，而不会与其他服务器进行通信。不会读取、存储或发送任何凭据。不会收集任何遥测数据。授权内容不可信，并且会在加载时进行验证；被拒绝的文件不会改变任何内容。WebAssembly 二进制文件是从源代码在 CI 中构建的，并使用其 SHA-256 进行固定，绝不会以字节的形式提交。其内存固定为 32 MiB，并且不能增长，因此，如果世界对于其来说过于密集，则会在每个宿主程序上以相同的方式停止，而不是发生偏差。请参阅 [SECURITY.md](SECURITY.md)。

## 支持状态

1.0 版本之前的版本，以 `0.x` 的形式从 `main` 发布。不同版本之间不保证兼容性；对哈希算法的每一次更改都会记录在 [CHANGELOG.md](CHANGELOG.md) 中，并附带其生成的哈希值。在 CI 环境下的 Ubuntu 系统上，使用 Node 22 和 Rust 1.98.1 进行测试，并在 Windows 11 上每天进行构建。

## 许可证

MIT。由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
