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

这是一个确定性的、哈希化的、可重放的 3D 模拟引擎。每个时间步都以固定的时间间隔运行，每个状态的量子都会被哈希，物理定律则使用 Rust 编译成一个 WebAssembly 二进制文件。重放是通过种子加上已接受的日志来实现的。一个语言模型可以向世界提出建议；一个手动编写的检查器决定哪些建议被接受。它是 [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 的对应物，其衡量标准是它模拟的内容。

## 它的本质以及它所追求的目标

三个 JavaScript 引擎，V8、SpiderMonkey 和 JavaScriptCore，在每次提交时，都会为同一个世界输出相同的哈希值。这就是整个引擎所基于的承诺：一个世界，两个机器可以就其内容达成一致，从种子和已接受的输入列表中开始，完全一致。在此基础上，存在着在三维空间中坠落、滑动、推动、倾斜和翻滚的物体；一个可以行走、攀爬斜坡、携带物品和放置物品的角色；当世界文件出现错误时，会附带原因而被拒绝；以及能够观察、记住所见事物并拒绝基于较旧证据的信念。

它所追求的目标是在宿主程序中作为模拟核心：浏览器、Godot 或 Unreal 绘制图像并发送意图，而物理定律、哈希值和记录则保留在此处。下一个阶段是正在发布的引擎的测试套件，其设计基于对当前工作室如何进行测试的研究；之后是来自网格的碰撞、宿主绑定以及将模型作为测试工具进行测试。计划可在 [docs/PHASE-0.md](docs/PHASE-0.md) 和 [docs/PHASE-1.md](docs/PHASE-1.md) 中找到，并且每个部分都是从 `docs/` 中的一份书面报告中构建而来。

## 已构建的内容

| 能力 | 位置 | 证明 |
|---|---|---|
| 固定时间步长，对每个 f64 进行两次 FNV-1a 哈希处理，拒绝 NaN，规范化符号零 | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` 自第一个测试套件以来，已读取 `0d38671370d12d1e` |
| 物理定律使用 Rust 在 `rapier3d-f64` 上进行编译，使用 `enhanced-determinism`，生成一个 WebAssembly 二进制文件，Linux 摘要已固定 | `solver/` | `fixtures/solver.sha256`；CI 会重建并进行比较 |
| 具有位置、速度、规范四元数、角速度和半轴的物体；动态盒子可以旋转；一个运动学角色，步长为 0.3，攀爬角度为 45°，快照为 0.2；睡眠时间以量子为单位；求解器快照被哈希 | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| 世界文件：物体、定向静态碰撞体、高度图、区域作为分区、十二个加载拒绝，加载时的危险，宿主信任的索引 | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js` |
| 在加载时接受的动词，并带有 `drive`、`climb`、`carry`、`release`、`episode` 效果，每个动词都有相应的危险场景 | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| 思维：具有视线的视觉，引用事件的类型化信念，墓碑替换，拒绝过时的写入，具有已满足标志的持续目标 | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| 从种子和日志中进行重放；在 localhost 上显示时间步长的调试视图 | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json` 是一个人通过宿主边界进行的游戏 |

七十三个测试，七个行为测试用例，这些测试用例逐帧进行重放，以及在每次提交时，在三个引擎下进行两个黄金哈希测试。

## 安装

要求：Node 20 或更高版本，以及带有 `wasm32-unknown-unknown` 目标的 Rust 工具链，用于构建求解器。CI 固定使用 Rust 1.98.1；安装 rustup 后，`rustup target add wasm32-unknown-unknown` 是额外的步骤。

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, and both goldens under node
```

`npm test` 首先构建求解器。在 Linux 上，构建结果会与固定的摘要进行比较；在其他宿主上，它会报告自己的摘要，因为 Linux 构建是固定的制品。

## 使用

每个命令都从任何目录运行，返回 `--help`，成功时退出代码为 0，拒绝时返回 1 并附带原因，出现用法错误或意外错误时返回 2。`--debug` 允许堆栈跟踪显示。

```bash
npx play proposals.json --seed 7 --log out.json    # run proposals through the tick, print every committed frame
npx replay out.json                                 # rerun a log; fails on the first hash that differs
npx load world worlds/crate-and-door.json           # validate a world, run its hazards, write its load hash to the index
npx load admit fixtures/climb-draft.json            # compile a verb draft, run the hazards for its effect, add it to the catalog
npx load retire climb                               # take a verb out of the catalog
npx host --world worlds/crate-and-door.json         # serve the debug view at http://127.0.0.1:4173
npx write-golden                                    # rewrite fixtures/golden.txt from harness/sim.mjs, with a reason in the commit
```

调试视图是一个调试视图。它将已提交的帧绘制为沿使用 `x`、`y` 或 `z` 选择的轴投影的盒子；单击表示地面平面目标；`M`、`C`、`G`、`D` 和 `U` 分别选择移动、攀爬、拾取、放下和使用；行者的区域和每个思维的信念都与时间步长和哈希值并列显示。它绝不会绘制时间步长未包含的任何内容。

世界文件是 JSON 格式：`name`、`seed`、`bodies`、`colliders`、`zones`，以及可选的 `heightfield` 和 `goal`。一个物体是 `{ id, x, y, z, vx, vy, vz, hx, hy, hz }`，可以选择性地包含四元数和角速度；一个静态碰撞体是一个盒子，其边界和可选的围绕其中心的四元数；一个区域是一个命名的盒子。未知的字段、重复的 ID、重叠的物体、物体位于碰撞体内部、非单位四元数、退化或无法到达的区域以及命名为空的目标，都会被拒绝并附带原因。

## 物理定律，一气呵成

一个带有种子的时间步长就是物理定律。量子为 1/64 秒，每个量子都会被哈希，并且一个玩家动作跨越多个量子。重放是通过种子加上已接受的日志来实现的。模型会提出意图、类型化的信念和物体草图；针对该类别的检查器会接受或拒绝。动词草图和世界文件会在加载时进行处理，并经过危险测试。宿主接收已提交的帧并返回意图。呈现过程不会返回哈希值。

## 信任模型

引擎在本地运行，并且仅访问其自身检出目录中的文件：世界、动词草图、测试用例以及您要求命令写入的任何日志。`host` 仅绑定 `127.0.0.1`。没有命令会打开任何其他套接字；冻结的 `propose` 仪器，一旦被解冻，就会与本地 Ollama 服务器进行通信，而不会与其他服务器进行通信。不会读取、存储或发送任何凭据。不会收集任何遥测数据。授权的内容是不受信任的，并且会在加载时进行验证；被拒绝的文件不会改变任何内容。WebAssembly 二进制文件是从源代码在 CI 中构建的，并使用其 SHA-256 进行固定，绝不会以字节形式提交。请参阅 [SECURITY.md](SECURITY.md)。

## 支持状态

1.0 版本之前的版本，以 `0.x` 的形式从 `main` 发布。不同版本之间不保证兼容性；对哈希算法的每一次更改都会记录在 [CHANGELOG.md](CHANGELOG.md) 中，并附带其生成的哈希值。在 CI 环境下的 Ubuntu 系统上，使用 Node 22 和 Rust 1.98.1 进行测试，并在 Windows 11 上每天进行构建。

## 许可证

MIT。由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
