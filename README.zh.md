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

si-rpg-engine 是一个 3D 世界的模拟核心，可以精确地重现游戏过程。它以固定的每秒 64 步的速度进行物理计算，并在每一步之后记录世界的“指纹”，可以根据起始种子和接受的输入，逐比特地重建任何游戏过程。物理引擎使用 Rust 编译成一个 WebAssembly 文件。一个语言模型可以预测接下来会发生什么；手工编写的规则决定了哪些内容会被加入。它是 [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 的对应物，其价值在于它所模拟的内容。

## 它的本质和目标

Chrome、Firefox 和 Safari 背后的 JavaScript 引擎（分别是 V8、SpiderMonkey 和 JavaScriptCore），对于相同的世界，每次提交都会打印出相同的“指纹”，并且相同的物理引擎构建在 x64 和 ARM64 架构上也会打印出相同的“指纹”。所有其他内容都建立在这个承诺之上：在给定种子和接受的输入列表的情况下，两台机器对一个世界达成一致，字节对字节。在此基础上，存在着在三维空间中坠落、滑动、推动、倾斜和翻滚的物体；一个可以行走、攀爬斜坡、携带物品并放下物品的角色；当世界文件出现错误时，会给出理由并被拒绝；以及具有“心智”的角色，它们可以观察、记住所看到的内容，并拒绝基于比其将要替代的证据更旧的证据得出的结论。

它的目标是在宿主程序中作为模拟核心：浏览器、Godot 或 Unreal 绘制图像并发送输入，而物理引擎、指纹和记录则保留在此处。当前的工作是构建一个可供发布的引擎所需的测试套件，其中大部分内容包括：一个轨迹，用于标识两个游戏过程开始分歧的第一个步骤和值；经过验证的保存和恢复功能；第二个 CPU 架构；对编译后的物理引擎进行代码风格检查；以及测试，用于检查世界所做的事情，而不仅仅是其指纹。在完成测试套件之后，将添加基于网格的碰撞和宿主程序绑定。设计和计划可以在 [docs/PHASE-0.md](docs/PHASE-0.md)、[docs/PHASE-1.md](docs/PHASE-1.md) 和 [docs/PHASE-2.md](docs/PHASE-2.md) 中找到。

## 已构建的内容

| 能力 | 位置 | 证明 |
|---|---|---|
| 固定时间步长的循环；每一步的状态都使用 FNV-1a 算法（使用两个通道）进行哈希，哈希对象为每个 f64 值；拒绝 NaN 和无穷大；规范化符号零。 | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` 自第一个测试套件以来，已经读取了 `0d38671370d12d1e`。 |
| Rust 中编写的物理定律，在 `rapier3d-f64` 上使用 `enhanced-determinism`，一个 WebAssembly 二进制文件，其 Linux 摘要已固定；一个正在运行的物理世界，仅当几何形状发生变化时才重建，并在动作开始或结束时切换一个物体。 | `solver/` | `fixtures/solver.sha256`，CI 会重建并进行比较；`harness/switch.test.js`。 |
| 具有位置、速度、规范四元数、角速度和半轴的物体；动态盒子可以旋转；一个运动学角色，具有 0.3 的自动步进、45° 的攀爬能力和 0.2 的快照；睡眠时间以步数计算。 | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| 世界文件：物体、定向静态碰撞体、高度图、区域作为分区、十二个加载拒绝条件、加载时的危险因素以及宿主程序信任的索引；动作在与物理碰撞相同的两个三角形地形表面上。 | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js`, `harness/surface.test.js` |
| 在加载时允许的动作及其效果 `drive`、`climb`、`carry`、`release` 和 `episode`，每个动作都有相应的危险场景。 | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| 心智：具有视线范围的视觉；带有引用其来源的类型化信念；通过墓碑进行替换；拒绝过时的写入；以及具有“已满足”标志的持续目标。 | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| 每个步骤的精确比特轨迹，以及一个工具，用于标识两个游戏过程开始分歧的第一个步骤、物体和字段。 | `harness/trace.mjs`, `harness/first-difference.js` | `harness/trace.test.js`；CI 在引擎偏离黄金标准时会打印出第一个差异。 |
| 与黄金标准相比的行为数字：每个物体的睡眠步数和最终位置、行走的区域以及快照的长度和摘要。 | `fixtures/golden-behaviour.json`, `harness/check.js` | `harness/check.test.js` |
| 两种保存和恢复方式：通过重放步骤的输入，或通过复制物理模块的内存，每种方式都经过验证，可以确保继续执行。 | `packages/tick/runs.js`, `solver/build.mjs` | `harness/restore.test.js` |
| 包：一个失败的测试会写入其种子、世界、接受的输入和哈希值，然后 `replay` 会使用一个命令来重现。每周都会重放所有包、测试用例和日志，时间比拉取请求长得多。 | `packages/tick/bundle.js`, `.github/workflows/corpus.yml` | `harness/bundle.test.js` |
| 在两个 CPU 架构上运行一个二进制文件，内存固定为 32 MiB，并且有一个代码风格检查器，它会拒绝宿主程序选择的指令、内存增长以及存储在内存之外的状态。 | `solver/build.rs`, `solver/src/arena.rs`, `solver/lint.mjs` | CI 的 ARM64 作业；`solver/lint.test.js`、`harness/caps.test.js`。 |
| 对世界所做事情的测试：角色在控制器测量的限制范围内进行移动，在漫长平坦的行走中完成每个步骤，一个薄而快的物体与薄墙碰撞，地形接缝，以及整个场景移动了一百万个单位。 | `harness/course.test.js`, `harness/outcome.test.js` | `write-golden` 会拒绝在其中任何一个测试失败时进行写入。 |
| 从种子和日志中重放，并在本地主机上提供调试视图。 | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json` 是一个人通过宿主边界进行的游戏过程。 |

243 个测试，七个行为测试用例，这些测试用例会逐个步骤地重放，以及两个黄金哈希值，这些哈希值由三个引擎在 x64 上以及由 node 在 ARM64 上在每次提交时打印。

## 安装

要求：Node 20 或更高版本，以及 Rust 工具链，其中包含用于物理引擎构建的 `wasm32-unknown-unknown` 目标。CI 将 Rust 固定为 1.98.1；安装 rustup 之后，`rustup target add wasm32-unknown-unknown` 是额外的步骤。

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, both goldens, and the behaviour numbers under node
```

`npm test` 首先构建物理引擎并进行代码风格检查。在 Linux 上，构建结果会与固定的摘要进行比较；在其他宿主程序上，它会报告自己的摘要，因为 Linux 构建是固定的工件。

## 使用

每个命令都从任何目录运行，返回 `--help`，成功时退出代码为 0，拒绝时返回 1（并附带理由），发生用法错误或意外错误时返回 2。`--debug` 允许堆栈跟踪显示。

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

当两个游戏过程不一致时，轨迹会显示在哪里：

```bash
node harness/trace.mjs > a.trace                    # the product scene, one line per step in exact bits
node harness/first-difference.js a.trace b.trace    # identical, or the first step, body, and field that differ
node solver/lint.mjs                                # refuse a binary that could grow memory or let the host choose a result
```

一个世界可以通过两种方式进行恢复，并且这两种方式都不会写入物理引擎的内部状态，这就是为什么它们都能够精确地进行恢复：重放其在某个步骤中接受的输入，或者使用 `imageSolver()` 复制物理模块的整个内存，然后使用 `restoreImage()` 将其放回。如果来自另一个二进制文件的图像长度不正确，或者包含已更改的字节，则会被拒绝。

调试视图就是一个调试视图。它会根据 `x`、`y` 或 `z` 选择的轴，将已提交的帧绘制为投影框；单击表示地面平面目标；`M`、`C`、`G`、`D` 和 `U` 分别选择移动、攀爬、拾取、放下和使用；行人的区域和每个角色的信念都位于刻度和哈希值旁边。它绝不会绘制刻度未包含的任何内容。

世界文件是 JSON 格式：`name`、`seed`、`bodies`、`colliders`、`zones`，以及可选的 `heightfield` 和 `goal`。一个物体是 `{ id, x, y, z, vx, vy, vz, hx, hy, hz }`，可以包含一个可选的四元数和角速度；一个静态碰撞体是一个盒子，其边界定义了盒子的大小，可以包含一个可选的四元数，该四元数相对于其中心进行旋转；一个区域是一个命名的盒子。未知的字段、重复的 ID、重叠的物体、物体位于碰撞体内、非单位四元数、退化的或无法访问的区域，以及目标没有命名任何内容，这些都会被拒绝，并附带相应的理由。

## 法律，一气呵成

一个带有种子的刻度就是法律。一个步骤，一个量子，是 1/64 秒；每个步骤都会进行哈希处理，并且角色的动作跨越多个步骤。重放就是种子加上已接受内容的日志。模型会提出意图、类型的信念和物体草图；针对该类别的检查器会接受或拒绝这些内容。动作草图和世界文件会等到加载时才进行处理，并经过一系列测试。主机接收已提交的帧并返回意图。呈现过程不会返回到哈希值。

## 信任模型

引擎在本地运行，并且仅访问其自身检出目录中的文件：世界、动作草图、固定装置以及您要求命令写入的任何日志。`host` 仅绑定 `127.0.0.1`。没有命令会打开任何其他套接字；一旦用户取消冻结，冻结的 `propose` 仪器就会与本地 Ollama 服务器进行通信，而不会与其他服务器进行通信。不会读取、存储或发送任何凭据。不会收集任何遥测数据。授权的内容是不受信任的，并且会在加载时进行验证；如果拒绝某个文件，则不会更改任何内容。WebAssembly 二进制文件是从源代码在 CI 中构建的，并使用其 SHA-256 进行固定，绝不会以字节形式提交。其内存固定为 32 MiB，并且无法增长，因此，如果某个世界对于该内存来说过于密集，则会在每个主机上以相同的方式停止运行，而不是产生不同的结果。请参阅 [SECURITY.md](SECURITY.md)。

## 支持状态

1.0 之前的版本，以 `0.x` 的形式发布，来自 `main`。不同版本之间没有兼容性保证；对哈希法律的每次更改都会在 [CHANGELOG.md](CHANGELOG.md) 中记录，并附带生成的黄金哈希值。在 Ubuntu x64 和 ARM64 上的 CI 中，以及在 Windows 11 上进行每日构建，并在 Node 22 和 Rust 1.98.1 上进行了测试。

## 许可证

MIT 许可证，除了 `solver/src/kcc.rs`，它是 Rapier 角色控制器的部分修改副本，该副本受 Apache License 2.0 许可（`solver/LICENSE-APACHE-2.0`、`solver/NOTICE`）。由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
