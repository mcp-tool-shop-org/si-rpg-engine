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

si-rpg-engine 是一个 3D 世界的模拟核心，可以精确地重现。它以固定的每秒 64 步的速度进行物理计算，在每个步骤之后记录世界的“指纹”，并且可以从其起始种子和它接受的输入中重建任何运行过程，精确到每一位。物理引擎使用 Rust 编译成一个 WebAssembly 文件。一个语言模型可以建议接下来会发生什么；手工编写的规则决定了哪些内容会被纳入。它是 [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 的对应物，其衡量标准是它模拟的内容。

## 它的本质以及它所追求的目标

Chrome、Firefox 和 Safari 背后的 JavaScript 引擎（分别是 V8、SpiderMonkey 和 JavaScriptCore），对于相同的世界，在每次提交时都会打印出相同的“指纹”，并且相同的物理引擎构建也会在 x64 和 ARM64 上打印出相同的“指纹”。所有其他内容都建立在这个承诺之上：在给定一个种子和一个接受的输入列表的情况下，两台机器对一个世界达成一致，字节对字节。在此基础上，存在着在三维空间中坠落、滑动、推动、倾斜和翻滚的物体；一个可以行走、攀爬斜坡、携带物品并放下物品的角色；当世界文件出现错误时，会附带原因而被拒绝；以及具有思维的角色，它们可以观察、记住它们所看到的内容，并拒绝基于比其将要替代的证据更旧的证据所做出的推断。

它所追求的目标是在一个宿主程序中作为模拟核心：浏览器、Godot 或 Unreal 绘制图像并发送输入，而物理引擎、指纹和记录则保留在此处。当前的工作是正在构建的引擎所需的测试套件，其中大部分内容包括：一个跟踪，它命名了两个运行过程开始分歧的第一个步骤和值；经过验证的保存和恢复；第二个 CPU 架构；对编译后的物理引擎进行的代码风格检查；以及测试，它检查世界所做的事情，而不仅仅是它的指纹。在完成测试套件之后，将进行网格碰撞和宿主绑定。设计和计划可以在 [docs/PHASE-0.md](docs/PHASE-0.md)、[docs/PHASE-1.md](docs/PHASE-1.md) 和 [docs/PHASE-2.md](docs/PHASE-2.md) 中找到。

## 已构建的内容

| 能力 | 位置 | 证明 |
|---|---|---|
| 固定时间步长的循环；每个步骤的状态都使用 FNV-1a 算法对所有 f64 值进行哈希处理；拒绝 NaN 和无穷大；规范化符号零 | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` 自第一个测试套件以来，已经读取了 `0d38671370d12d1e` |
| Rust 中编写的物理定律，在 `rapier3d-f64` 上使用 `enhanced-determinism`，一个 WebAssembly 二进制文件，其 Linux 摘要已固定；一个正在运行的物理世界，仅当几何形状发生变化时才重新构建，并且在动作开始或结束时，会原地切换一个物体 | `solver/` | `fixtures/solver.sha256`，CI 会重新构建并进行比较；`harness/switch.test.js` |
| 具有位置、速度、规范四元数、角速度和半轴的物体；动态盒子可以旋转；一个运动学角色，具有 0.3 的自动步进、45° 的攀爬能力和 0.2 的快照；睡眠计数以步骤为单位 | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| 世界文件：物体、定向静态碰撞体、高度图、区域作为分区、十二个加载拒绝、加载时的危险，以及宿主信任的索引；动作位于与物理碰撞相同的两个三角形地形表面上 | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js`, `harness/surface.test.js` |
| 当一个世界被允许时，进行一次可达性扫描：使用允许的动作，通过检查器，从时间步的自己的保存中，探索其可达状态。如果一个区域无法到达，或者一个物体被带出世界，或者一个投掷动作拒绝该世界，则会提供一个证据，证明 `replay` 可以重现 | `packages/load/sweep.js` | `harness/sweep.test.js`，封闭的测试房间在 `fixtures/sweep/` 中 |
| 在加载时允许的动作，具有 `drive`、`climb`、`carry`、`release` 和 `episode` 效果，每个动作都具有危险场景 | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| 思维：具有视线的视觉，引用其来源的类型化信念，通过墓碑进行替换，拒绝过时的写入，以及具有已满足标志的持续目标 | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| 每个步骤的精确比特跟踪，以及一个工具，可以命名两个运行过程开始分歧的第一个步骤、物体和字段 | `harness/trace.mjs`, `harness/first-difference.js` | `harness/trace.test.js`；CI 在引擎偏离黄金标准时打印出第一个差异 |
| 行为数字与黄金标准并列：每个物体的睡眠步骤和最终位置、行走的区域以及快照的长度和摘要 | `fixtures/golden-behaviour.json`, `harness/check.js` | `harness/check.test.js` |
| 三种保存和恢复方式：通过重放一个步骤的输入，通过复制物理模块的内存，或者通过时间步的自己的状态保存，后者可以在不进行重放的情况下进行恢复；每种方式都经过验证，可以精确地继续 | `packages/tick/runs.js`, `packages/tick/tick.js`, `solver/build.mjs` | `harness/restore.test.js` |
| 包：一个失败的测试会写入其种子、世界、接受的输入和哈希值，然后 `replay` 会在一个命令中重现；每周都会重放每个包、测试用例和日志，时间比一次拉取请求要长得多 | `packages/tick/bundle.js`, `.github/workflows/corpus.yml` | `harness/bundle.test.js` |
| 在两个 CPU 架构上的一个二进制文件，内存固定为 32 MiB，并且有一个代码风格检查器，它会拒绝宿主选择的指令、内存增长以及存储在内存之外的状态 | `solver/build.rs`, `solver/src/arena.rs`, `solver/lint.mjs` | CI 的 ARM64 作业；`solver/lint.test.js`，`harness/caps.test.js` |
| 对世界所做事情的测试：一个角色在控制器测量的限制范围内进行移动，在漫长平坦的行走中，每一步都进行完整的步幅，一个薄而快的物体与薄墙碰撞，地形接缝，以及整个场景移动了一百万个单位 | `harness/course.test.js`, `harness/outcome.test.js` | `write-golden` 拒绝在其中任何一个测试失败时进行写入 |
| 模型座位的角色：每个角色都有一个清单，从角色读取的内容中推导出“双重规则”，在检查器中有一个角色门控，在每次允许时都有来源，并且具有信任标签，这些标签会与一个信念一起保留，并且每个模型调用都会被记录和检查，而无需使用 GPU；所有声明的角色都已冻结 | `predicates/roles/`, `packages/tick/roles.js`, `packages/tick/gate.js`, `packages/propose` | `packages/tick/gate.test.js`，`packages/propose/record.test.js` 在 `fixtures/sessions/` 中的会话中 |
| 从一个种子和一个日志中重放，以及在本地主机上对时间步进行调试 | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json` 是一个人通过宿主边界进行的游戏 |

352 个测试，七个行为测试用例，这些测试用例会逐个步骤地重放，以及两个黄金哈希值，这些哈希值由三个引擎在 x64 上以及由 node 在 ARM64 上打印，每次提交都会进行打印。

## 安装

要求：Node 20 或更高版本，以及带有用于物理构建的 `wasm32-unknown-unknown` 目标的 Rust 工具链。CI 固定使用 Rust 1.98.1；安装 rustup 后，`rustup target add wasm32-unknown-unknown` 是额外的步骤。

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, both goldens, and the behaviour numbers under node
```

`npm test` 首先构建物理引擎并检查二进制文件。在 Linux 上，构建会与固定的摘要进行比较；在其他主机上，它会报告自己的摘要，因为 Linux 构建是固定的制品。

## 使用方法

每个命令都从任何目录运行，返回 `--help`，成功时退出代码为 0，拒绝时返回 1 并附带原因，发生用法错误或意外错误时返回 2。`--debug` 允许堆栈跟踪输出。

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

当两次运行结果不一致时，跟踪信息会显示位置：

```bash
node harness/trace.mjs > a.trace                    # the product scene, one line per step in exact bits
node harness/first-difference.js a.trace b.trace    # identical, or the first step, body, and field that differ
node solver/lint.mjs                                # refuse a binary that could grow memory or let the host choose a result
```

一个世界可以通过三种方式进行恢复，并且都不会写入物理引擎的内部状态，这就是为什么每次恢复都是精确的。您可以将已接受的输入重新播放到某个步骤。您可以使用 `imageSolver()` 复制物理模块的整个内存，并使用 `restoreImage()` 将其放回。或者，您可以使用 `save()` 保存整个时间步，并使用 `restore(saved)` 将其放回，这不需要重新播放，并且是循环返回到状态数千次的方式。来自另一个二进制文件、长度不正确或字节发生更改的图像将被拒绝，并且不检查完整性的保存将不会改变任何内容。

调试视图是一个调试视图。它将提交的帧绘制为沿 `x`、`y` 或 `z` 选择的轴投影的盒子；单击表示地面平面目标；`M`、`C`、`G`、`D` 和 `U` 分别选择移动、攀爬、拾取、放下和使用；行人的区域和每个角色的信念都位于时间步和哈希旁边。它绝不会绘制时间步中未包含的任何内容。

一个世界文件是 JSON 格式：`name`、`seed`、`bodies`、`colliders`、`zones`，以及可选的 `heightfield` 和 `goal`。一个物体是 `{ id, x, y, z, vx, vy, vz, hx, hy, hz }`，带有可选的四元数和角速度；一个静态碰撞体是一个盒子，其边界带有可选的围绕其中心的四元数；一个区域是一个命名的盒子。未知的字段、重复的 ID、重叠的物体、物体位于碰撞体内、非单位四元数、退化或无法访问的区域，以及命名为空的目标，都会被拒绝，并附带原因。

## 法则，一气呵成

一个带有种子的时间步就是法则。一个步骤，一个量子，是 1/64 秒；每个步骤都会被哈希，并且角色的动作跨越多个步骤。重新播放是种子加上已接受内容的日志。模型会提出意图、类型的信念和物体草图；该类别的检查器会接受或拒绝它们。动作草图和世界文件将在加载时进行处理，并经过一系列测试。主机接收已提交的帧并返回意图。呈现过程不会返回到哈希中。

## 信任模型

引擎在本地运行，并且仅访问其自身检出目录中的文件：世界、动作草图、固定装置以及您要求命令写入的任何日志。`host` 仅绑定 `127.0.0.1`。没有命令会打开任何其他套接字，除了 `propose`，它与本地 Ollama 服务器进行通信，并且不会与其他服务器进行通信，并且仅用于一个其清单已解冻以在临时世界中运行的角色；引擎声明的两个角色都是冻结的，因此它会在任何模型客户端加载之前拒绝。模型的提案仅通过角色门进入世界，并且它会将其限制在其角色的清单范围内。不会读取、存储或发送任何凭据。不会收集任何遥测数据。授权内容不可信，并且会在加载时进行验证；被拒绝的文件不会改变任何内容。WebAssembly 二进制文件是从 CI 中的源代码构建的，并使用其 SHA-256 进行固定，绝不会以字节形式提交。其内存固定为 32 MiB，并且无法增长，因此对于它来说过于密集的某个世界，将在每个主机上以相同的方式停止，而不是产生不同的结果。请参阅 [SECURITY.md](SECURITY.md)。

## 支持状态

1.0 之前的版本，作为 `0.x` 从 `main` 发布。不同版本之间没有兼容性保证；对哈希法则的每个更改都记录在 [CHANGELOG.md](CHANGELOG.md) 中，并附带它生成的黄金哈希。在 CI 中，在 Ubuntu x64 和 ARM64 上使用 Node 22 和 Rust 1.98.1 进行测试，并且每天在 Windows 11 上进行构建。

## 许可证

MIT，除了 `solver/src/kcc.rs`，它是 Rapier 角色控制器的部分修改版本，该版本使用 Apache License 2.0（`solver/LICENSE-APACHE-2.0`、`solver/NOTICE`）。由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
