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

si-rpg-engine 是一个 3D 世界的模拟核心，可以完全重现。它以固定的每秒 64 步的速度进行物理计算，在每个步骤之后记录世界的“指纹”，并且可以从其起始种子和它接受的输入中重建任何运行过程，精确到每一位。物理引擎使用 Rust 编译成一个 WebAssembly 文件。一个语言模型可以建议接下来会发生什么；手工编写的规则决定了哪些内容会被纳入。它是 [ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine) 的对应物，其衡量标准在于它模拟的内容。

## 它的本质以及它想要成为的样子

Chrome、Firefox 和 Safari 背后的 JavaScript 引擎（分别是 V8、SpiderMonkey 和 JavaScriptCore），对于相同的世界，每次提交都会打印出相同的“指纹”，并且相同的物理引擎构建也会在 x64 和 ARM64 上打印出相同的“指纹”。所有其他内容都建立在这个承诺之上：在给定一个种子和一个接受的输入列表的情况下，两台机器对一个世界达成一致，精确到每一个字节。在此基础上，存在着在三维空间中坠落、滑动、推动、倾斜和翻滚的物体；一个可以行走、攀爬斜坡、携带物品并放下物品的角色；当世界文件出现错误时，会附带原因而被拒绝；以及拥有“思想”的角色，它们可以观察、记住它们所看到的内容，并拒绝基于比其将要替代的证据更旧的证据得出的结论。

它想要成为的是宿主内部的模拟核心：浏览器、Godot 或 Unreal 绘制图像并发送输入，而物理、指纹和记录则保留在此处。当前的工作是正在发布的引擎所需的测试套件，其中大部分内容如下：一个跟踪，用于命名两个运行过程开始分歧的第一个步骤和值；经过验证的保存和恢复；第二个 CPU 架构；对编译后的物理引擎进行的代码风格检查；以及测试，用于检查世界实际执行的操作，而不仅仅是其指纹。基于网格的碰撞已经落地：一个场景可以命名一张固定的三角形网格，产品场景不命名任何网格。宿主绑定仍是未完成的一行。设计和计划可以在 [docs/PHASE-0.md](docs/PHASE-0.md)、[docs/PHASE-1.md](docs/PHASE-1.md) 和 [docs/PHASE-2.md](docs/PHASE-2.md) 中找到。

## 已构建的内容

| 能力 | 位置 | 证明 |
|---|---|---|
| 固定时间步长的计算；每个步骤的状态都使用 FNV-1a 哈希算法，对每个 f64 值进行哈希处理；拒绝 NaN 和无穷大；规范化符号零 | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt` 自第一个测试套件以来，已经读取了 `0d38671370d12d1e` |
| Rust 中使用 `rapier3d-f64` 和 `enhanced-determinism` 的物理定律，一个 WebAssembly 二进制文件，其 Linux 摘要已固定；一个正在运行的物理世界，仅当几何形状发生变化时才重新构建，并且在动作开始或结束时，会原地切换一个物体 | `solver/` | `fixtures/solver.sha256`，CI 会重新构建并进行比较；`harness/switch.test.js` |
| 具有位置、速度、规范四元数、角速度和半轴的物体；动态盒子可以旋转；一个运动学角色，具有 0.3 的自动步进、45° 的攀爬能力和 0.2 的快照；睡眠以步数计算 | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| 角色通过引擎的 Rapier 冲量例程进行推动，其中 Rapier 自身的后续修复已回溯，因此物体仅在其自身的接触点处受到推动，并且每个接触点的冲量大小由物体在该处的有效质量决定，包括其旋转；物理引擎中的一个保护机制，如果推动导致物体的速度超过其推动者的速度的指定倍数，则物理引擎会失败 | `solver/src/impulses.rs` | `harness/push.test.js`、`fixtures/push/red-room-a.json` 和一个本地测试，该测试表明，不进行修复的副本与 Rapier 的例程一样，精确到每一位 |
| 受驱动的物体不会与动态物体发生碰撞。受驱动的碰撞体是求解器组 3，并且排除组 2；动态碰撞体是组 2，并且排除组 3。静态物体保持 Rapier 的默认设置。碰撞组保持不变，因此窄相仍然会找到该对。没有 JavaScript 切换。在阶梯状房间中，两个盒子都保持在 1 米/秒以下。行人的 16 米/秒速度是 0.25 米的步长，在一个量子中完成，这就是步长 | `solver/src/rapier_law.rs` | `harness/step-up-121.test.js`、`harness/sweep.test.js` 和一个本地测试，该测试表明，各个组相互排除，并且碰撞处理程序保持不变 |
| 一张固定的三角形网格。场景可以命名它，产品场景不命名任何网格。构造器拒绝加载器会拒绝的网格，物理定律在构建网格之前拒绝越界索引、重复索引或非有限顶点。陷入陷阱的物理模块会被丢弃。被拒绝的加载或步进不会保留那个世界，也不会把刚体复制回来 | `solver/src/rapier_law.rs`, `packages/tick/scene.js`, `packages/tick/world.js` | `harness/mesh.test.js`, `harness/mesh-refusal.test.js` |
| 世界文件：物体、定向静态碰撞体、高度图、区域作为分区、十二个加载拒绝、加载时的危险，以及宿主信任的索引；动作位于与物理碰撞相同的两个三角形地形表面上 | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js`, `harness/surface.test.js` |
| 当世界被允许时，会进行一次可达性扫描：使用允许的动作，通过检查器，从刻度本身的保存中，探索其可达状态。如果一个区域无法到达，或者一个物体被带出世界，或者一个投掷动作被拒绝，则该世界将被拒绝，并提供一个证明，即 `replay` 可以重现 | `packages/load/sweep.js` | `harness/sweep.test.js`，封闭的测试房间在 `fixtures/sweep/` 中 |
| 在加载时允许的动作，具有 `drive`、`climb`、`carry`、`release` 和 `episode` 的效果，每个动作都有危险场景 | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| 思想：具有视线的视觉，引用其来源的类型化信念，通过墓碑进行替换，拒绝过时的写入，以及具有已满足标志的持续目标 | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| 对每个步骤进行精确的比特跟踪，并提供一个工具，用于命名两个运行过程开始分歧的第一个步骤、物体和字段 | `harness/trace.mjs`, `harness/first-difference.js` | `harness/trace.test.js`；CI 在引擎偏离黄金标准时打印出第一个差异 |
| 行为编号与黄金标准进行比较：每个物体的睡眠步骤和最终位置、行人的区域以及快照的长度和摘要 | `fixtures/golden-behaviour.json`, `harness/check.js` | `harness/check.test.js` |
| 三种方式的保存和恢复：通过重放一个步骤的输入，通过复制物理模块的内存，或者通过刻度本身对其整个状态进行保存，然后进行恢复，而无需重放；每种方式都经过验证，可以继续执行 | `packages/tick/runs.js`, `packages/tick/tick.js`, `solver/build.mjs` | `harness/restore.test.js` |
| 包：一个失败的测试会写入其种子、世界、接受的输入和哈希值，然后 `replay` 会在一个命令中重现；每周都会重放每个包、测试用例和日志，时间远长于拉取请求 | `packages/tick/bundle.js`, `.github/workflows/corpus.yml` | `harness/bundle.test.js` |
| 在两个 CPU 架构上的一个二进制文件，内存固定为 32 MiB，并且有一个代码风格检查器，该检查器会拒绝宿主选择的指令、内存增长以及存储在内存之外的状态 | `solver/build.rs`, `solver/src/arena.rs`, `solver/lint.mjs` | CI 的 ARM64 作业；`solver/lint.test.js`、`harness/caps.test.js` |
| 测试世界所做的事情：控制器在测量极限时的角色表现，在长而平坦的行走中，每一步都稳健地迈出，没有一步陷入地面，纤细而快速的身体抵着薄薄的墙壁，地形缝隙，整个场景移动了数百万个单位。 | `harness/course.test.js`, `harness/outcome.test.js` | `write-golden` 在其中任何一个测试失败时，将拒绝写入。 |
| 仪器的基准：一次改变以及之前的构建，每棵树都在自己的过程中运行。它命名了改变所涉及的代码和数据，在两棵树上运行每个候选输入，并报告哪些内容达到了改变，两棵树第一次分离的位置，以及哪些内容仅在改变时失败，来自引擎的每个结果，以及来自模型的任何结果。法律的范围是从一个覆盖构建中读取的，该构建的运行必须与产品构建的每一帧相匹配，并且在改变处放置的变异体用于衡量基准。 | `packages/bench` | 在 `packages/bench/` 中，针对具有已知效果的改变进行了 86 个测试；F2 的法律改变，由人工放置，在量子 98 处被发现。 |
| 模型角色的作用：每个角色都有一个清单，从角色读取的内容中推导出“二律法则”，检查器中有一个角色门控，对每次提交都有来源记录，信任标签会与一个信念一起保留，并且每个模型调用都会被记录和检查，无需使用 GPU；声明的角色都被冻结。 | `predicates/roles/`, `packages/tick/roles.js`, `packages/tick/gate.js`, `packages/propose` | `packages/tick/gate.test.js`，在 `fixtures/sessions/` 中，跨越各个会话的 `packages/propose/record.test.js`。 |
| 从一个种子和一个日志中重放，并查看在 localhost 上的刻度。 | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json` 是一个人通过主机边界的游玩。 |

510 个测试，七个行为测试用例，这些测试用例会逐步重放，并且在每次提交时，三个引擎会在 x64 上打印两个黄金哈希值，以及在 ARM64 上的节点打印。

## 安装

要求：Node 20 或更高版本，以及带有 `wasm32-unknown-unknown` 目标的 Rust 工具链，用于物理构建。CI 将 Rust 固定在 1.98.1；安装 rustup 后，`rustup target add wasm32-unknown-unknown` 是额外的步骤。

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, both goldens, and the behaviour numbers under node
```

`npm test` 首先构建物理引擎并检查二进制文件。在 Linux 上，构建会与固定的摘要进行比较；在另一个主机上，它会报告自己的摘要，因为 Linux 构建是固定的工件。

## 使用

每个命令都从任何目录运行，返回 `--help`，成功时退出代码为 0，拒绝时返回 1，并附带原因，出现用法错误或意外错误时返回 2。`--debug` 允许堆栈跟踪显示。

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

可以将一次改变与之前的构建进行比较。基准测试由人工运行，并且没有工作流程运行它：

```bash
npx bench trees . main HEAD ../trees                # the base and the head as git worktrees, the head's binary built in its own tree
npx bench anchors --base ../trees/base --head ../trees/head    # the code and data the change touches, as JSON
npx bench run --base ../trees/base --head ../trees/head --out ../bench --product-scene    # reach, differences, and catches, with a report
```

报告会命名其种子，以量子和恢复为单位计算其预算，并说明它没有测量什么；使用一个种子进行的两次运行，在环境块之外会给出相同的报告。当 `solver/` 改变时，每棵树都会构建自己的二进制文件，并且法律的范围来自头部的一个覆盖构建，该构建必须完全按照产品构建的方式运行产品场景，否则基准测试将停止并显示原因。

世界以三种方式进行恢复，并且没有写入物理引擎的内部状态，这就是为什么每次恢复都是精确的。您可以将接受的输入重放到一个步骤。您可以使用 `imageSolver()` 复制物理模块的整个内存，并使用 `restoreImage()` 将其放回。或者，您可以使用 `save()` 保存整个刻度，并使用 `restore(saved)` 将其放回，这不需要重放，并且是扫描返回到状态数千次的方式。来自另一个二进制文件的图像，长度不正确，或者字节发生改变，都会被拒绝，并且一个没有检查完整性的保存不会改变任何内容。

调试视图是一个调试视图。它将提交的帧绘制为沿使用 `x`、`y` 或 `z` 选择的轴投影的框；单击是地面平面目标；`M`、`C`、`G`、`D` 和 `U` 选择移动、攀爬、拾取、放下和使用；行者的区域和每个角色的信念都位于刻度和哈希旁边。它永远不会绘制刻度不包含的任何内容。

世界文件是 JSON：`name`、`seed`、`bodies`、`colliders`、`zones`，以及可选的 `heightfield`、`mesh` 和 `goal`。网格是 `{ positions, indices }`。一个身体是 `{ id, x, y, z, vx, vy, vz, hx, hy, hz }`，并带有可选的四元数和角速度；一个静态碰撞体是一个盒子，其边界带有可选的四元数，关于其中心；一个区域是一个命名的盒子。未知的字段、重复的 ID、重叠的身体、身体位于碰撞体内部、非单位四元数、退化的或无法到达的区域，以及命名为空的目标，每个都会被拒绝，并附带原因。

## 法律，一气呵成

带有种子的刻度就是法律。一个驱动的身体和一个动态的身体不共享一个求解器接触，但窄相仍然会找到这对。一个步骤，一个量子，是 1/64 秒；每个步骤都会被哈希，并且一个角色的动作跨越多个步骤。重放是种子加上已提交内容的日志。模型会提出意图、类型的信念和身体草案；该类的检查器会接受或拒绝它们。动作草案和世界文件会等到加载时才进行处理，并会通过一个危险套件。主机接收已提交的帧并返回意图。呈现没有返回到哈希的路径。

## 信任模型

该引擎在本地运行，并且仅访问其自身检出目录中的文件：世界、动作草稿、测试用例以及您要求命令写入的任何日志。`host` 仅绑定 `127.0.0.1`。`bench` 是对检出目录的例外：它将树和报告写入您指定的位置，并在自身的子进程中运行每个树。没有命令会打开除 `propose` 之外的任何套接字，该套接字仅与本地 Ollama 服务器通信，且仅用于一个角色，该角色的清单已解冻，以便在临时世界中运行；引擎声明的两个角色都处于冻结状态，因此在任何模型客户端加载之前，它都会拒绝。模型的提案仅通过角色门进入世界，该门限制其行为符合其角色的清单。为了构建树的物理特性，`bench` 运行 `cargo build --locked`，就像求解器自身的构建一样，并且 cargo 仅在缓存中缺少时，从 crates.io 获取固定版本的 crate。不读取、存储或发送任何凭据。不收集任何遥测数据。授权内容不可信，并在加载时进行验证；被拒绝的文件不会产生任何影响。WebAssembly 二进制文件从源代码在 CI 中构建，并通过其 SHA-256 进行固定，绝不会以字节形式提交。其内存固定为 32 MiB，并且不能增长，因此，如果世界过于密集，无法在该引擎中运行，则会在每个主机上以相同的方式停止，而不是产生不同的结果。请参阅 [SECURITY.md](SECURITY.md)。

## 支持状态

1.0 之前的版本，以 `0.x` 的形式从 `main` 发布。不同版本之间没有兼容性保证；对哈希规则的每次更改都会在 [CHANGELOG.md](CHANGELOG.md) 中记录，并附带其生成的黄金哈希值。在 CI 中，在 Ubuntu x64 和 ARM64 上的 Node 22 和 Rust 1.98.1 上进行了测试，并且每天在 Windows 11 上进行构建。

## 许可证

MIT 许可证，但 `solver/src/kcc.rs` 和 `solver/src/impulses.rs` 除外，它们是 Rapier 角色控制器的部分修改副本，受 Apache License 2.0 许可（`solver/LICENSE-APACHE-2.0`、`solver/NOTICE`）。由 <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a> 构建。
