<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/si-rpg-engine/readme.png" width="400" alt="SI RPG Engine">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/si-rpg-engine/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/si-rpg-engine/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/si-rpg-engine/"><img src="https://img.shields.io/badge/Landing-Page-blue" alt="Landing Page"></a>
</p>

si-rpg-engineは、正確に再現される3D世界のシミュレーションコアです。物理演算を1秒間に64ステップで固定し、各ステップの後に世界のフィンガープリントを記録し、開始時のシードと受け入れた入力に基づいて、ビット単位で任意の実行を再構築できます。物理演算はRustで記述され、単一のWebAssemblyファイルにコンパイルされます。言語モデルが次に何が起こるかを提案し、手書きのルールが何を取り入れるかを決定します。これは[ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)の対となるものであり、シミュレーションによって何が実現されるかによって評価されます。

## その概要と目指すところ

Chrome、Firefox、Safariで使用されているJavaScriptエンジン（V8、SpiderMonkey、JavaScriptCore）は、同じ世界に対して、すべてのコミットで同じフィンガープリントを出力し、同じ物理演算ビルドはx64とARM64で同じフィンガープリントを出力します。それ以外のすべては、この約束の上に成り立っています。つまり、2つのマシンが、シードと受け入れた入力のリストに基づいて、世界についてバイト単位で合意します。その上に、3次元空間で落下、滑り、押し、傾き、転がるオブジェクト、歩き、斜面を登り、物を持ち運び、置くキャラクター、誤っている場合に理由とともに拒否されるワールドファイル、そして、見たものを認識し、記憶し、より古い証拠よりも新しい証拠に基づいて信念を拒否する知性を持つキャラクターが存在します。

目指すところは、ホスト（ブラウザ、Godot、Unreal）内に存在するシミュレーションコアです。ホストが画像をレンダリングし、入力を送信し、物理演算、フィンガープリント、および記録はここに保持されます。現在の作業は、出荷されるエンジンに必要なテストスイートであり、その大部分は次のとおりです。2つの実行が分岐する最初のステップと値を特定するトレース、正確であることが証明された保存と復元、2番目のCPUアーキテクチャ、コンパイルされた物理演算に対するリンター、および世界の動作（単にそのフィンガープリントではなく）をチェックするテストです。スイートの後には、メッシュからの衝突とホストバインディングが続きます。設計と計画は、[docs/PHASE-0.md](docs/PHASE-0.md)、[docs/PHASE-1.md](docs/PHASE-1.md)、および[docs/PHASE-2.md](docs/PHASE-2.md)にあります。

## 構築するもの

| 機能 | 場所 | 証明 |
|---|---|---|
| 固定タイムステップのティック。各ステップの状態は、すべてのf64に対して2レーンのFNV-1aを使用してハッシュ化されます。NaNと無限大は拒否され、符号付きゼロは正規化されます。 | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt`は、最初のハーネス以降、`0d38671370d12d1e`を読み込みました。 |
| Rustで記述された物理法則は、`rapier3d-f64`にあり、`enhanced-determinism`とともに、Linuxダイジェストが固定された単一のWebAssemblyバイナリです。1つの実行中の物理世界があり、ジオメトリが変更された場合にのみ再構築され、アクションが開始または終了するときに、オブジェクトがその場で切り替えられます。 | `solver/` | `fixtures/solver.sha256`は、CIによって再構築および比較されます。`harness/switch.test.js` |
| 位置、速度、カノニカルな四元数、角速度、および半軸を持つオブジェクト。動的なボックスは回転します。0.3の自動ステップ、45度の登坂、および0.2のスナップを持つキネマティックなキャラクター。ステップ数でカウントされるスリープ。 | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| キャラクターが、エンジンのRapierのインパルスルーチンのコピーを通じて押し出す。Rapier自身の後続の修正がバックポートされているため、オブジェクトは自身の接触点でのみ押し出され、各点のインパルスは、その場所でのオブジェクトの有効質量と回転によってサイズ調整されます。物理演算に、オブジェクトが指定されたプッシャーの速度の倍数よりも速くなるような押し出しを発生させると、物理演算が失敗するガードが含まれます。 | `solver/src/impulses.rs` | `harness/push.test.js`、`fixtures/push/red-room-a.json`、および修正がないコピーが、Rapierのルーチンと同じように、ビット単位で押し出すことを確認するネイティブテスト。 |
| ワールドファイル：オブジェクト、方向付けられた静的なコリダー、高さマップ、パーティションとしてのゾーン、12個のロード拒否、ロード時のハザード、およびホストが信頼するインデックス。アクションは、物理演算が衝突するのと同じ2つの三角形の地形面に立っています。 | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js`, `harness/surface.test.js` |
| ワールドが承認されたときに実行される到達可能性スウィープ：承認されたアクションを通じて、チェッカーを使用して、ティック自身の保存から、その到達可能な状態を探索します。ゾーンに到達できない、オブジェクトがワールドの外に運ばれる、またはスローは、その証拠（`replay`が再現する）とともにワールドを拒否します。 | `packages/load/sweep.js` | `harness/sweep.test.js`、閉じたテストルームは`fixtures/sweep/`にあります。 |
| ロード時に、効果`drive`、`climb`、`carry`、`release`、および`episode`を持つアクションが承認され、それぞれにハザードシナリオがあります。 | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| 知性：視線と視線、エピソードを引用する型付きの信念、墓石による上書き、古い書き込みの拒否、および満たされたフラグを持つ永続的な目標。 | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| すべてのステップの正確なビットのトレースと、2つの実行が分岐する最初のステップ、オブジェクト、およびフィールドを特定するツール。 | `harness/trace.mjs`, `harness/first-difference.js` | `harness/trace.test.js`。CIは、エンジンがゴールデンから逸脱した場合に、最初の違いを出力します。 |
| ゴールデンと比較した動作の数値：すべてのオブジェクトのスリープステップと最終位置、ウォーカーのゾーン、およびスナップショットの長さとダイジェスト。 | `fixtures/golden-behaviour.json`, `harness/check.js` | `harness/check.test.js` |
| 3つの方法で保存および復元：ステップへの入力を再実行すること、物理モジュールのメモリをコピーすること、またはティック自身の状態全体を保存すること（これにより、再実行なしで復元されます）。それぞれが正確に継続することが証明されています。 | `packages/tick/runs.js`, `packages/tick/tick.js`, `solver/build.mjs` | `harness/restore.test.js` |
| バンドル：失敗したテストは、そのシード、ワールド、受け入れられた入力、およびハッシュを書き込み、`replay`が1つのコマンドでそれを再現します。毎週のジョブは、すべてのバンドル、フィクスチャ、およびログを、プルリクエストよりもはるかに長い時間再実行します。 | `packages/tick/bundle.js`, `.github/workflows/corpus.yml` | `harness/bundle.test.js` |
| 2つのCPUアーキテクチャで、メモリを32MiBに固定し、ホストが選択した命令、メモリの増加、およびメモリ外に保持された状態を拒否するリンターを備えた1つのバイナリ。 | `solver/build.rs`, `solver/src/arena.rs`, `solver/lint.mjs` | CIのARM64ジョブ。`solver/lint.test.js`、`harness/caps.test.js` |
| ワールドの動作のテスト：コントローラーで測定された制限でキャラクターのコース、長い平坦な歩行のすべてのステップで完全な歩幅、床に沈み込むステップなし、薄くて速いオブジェクトと薄い壁、地形の継ぎ目、およびシーン全体が100万ユニット移動します。 | `harness/course.test.js`, `harness/outcome.test.js` | `write-golden`は、それらのいずれかが失敗すると書き込みを拒否します。 |
| モデルシートの役割：役割ごとのマニフェスト、役割が示す内容から派生した「二律の法則」、チェッカー内の役割ゲート、すべての承認における出所、信念に付随する信頼ラベル、およびすべてのモデル呼び出しが記録およびチェックされ、GPUなしで実行される。両方の宣言された役割は固定される。 | `predicates/roles/`, `packages/tick/roles.js`, `packages/tick/gate.js`, `packages/propose` | `packages/tick/gate.test.js`、`packages/propose/record.test.js`（セッション内）から`fixtures/sessions/`へ |
| シードとログからリプレイを実行し、localhostでのティックのデバッグビューを表示する。 | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json`は、ホスト境界を越えた人物のプレイである。 |

380件のテスト、ステップごとにリプレイする7つの動作フィクスチャ、およびx64とARM64で3つのエンジンによって出力される2つのゴールデンハッシュ。これらは、すべてのコミット時に実行される。

## インストール

要件：Node 20以降、および物理演算のビルドに使用するRustツールチェーンの`wasm32-unknown-unknown`ターゲット。CIではRust 1.98.1が固定されており、`rustup target add wasm32-unknown-unknown`はrustupのインストール後の追加ステップである。

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, both goldens, and the behaviour numbers under node
```

`npm test`は、まず物理演算をビルドし、バイナリをLintする。Linuxでは、ビルドが固定されたダイジェストと比較される。別のホストでは、独自のダイジェストを報告する。これは、Linuxビルドが固定された成果物であるためである。

## 使用方法

すべてのコマンドは、任意のディレクトリから実行され、`--help`を返し、成功時には0、拒否時には理由とともに1、および使用方法のエラーまたは予期しないエラーが発生した場合には2を返して終了する。`--debug`は、スタックトレースを表示する。

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

2つの実行結果が一致しない場合、トレースはどこで一致しなかったかを示す。

```bash
node harness/trace.mjs > a.trace                    # the product scene, one line per step in exact bits
node harness/first-difference.js a.trace b.trace    # identical, or the first step, body, and field that differ
node solver/lint.mjs                                # refuse a binary that could grow memory or let the host choose a result
```

ワールドは3つの方法で復元され、いずれも物理エンジン内部の状態に書き込まない。そのため、それぞれが正確である。受け入れられた入力をステップごとにリプレイできる。物理モジュールのメモリ全体を`imageSolver()`でコピーし、`restoreImage()`で戻すことができる。または、ティック全体を`save()`で保存し、`restore(saved)`で戻すこともできる。これはリプレイを必要とせず、スウィープが数千回にわたって状態に戻る方法である。別のバイナリからの、長さが異なる、またはバイトが変更された画像は拒否され、チェックアウトされていない保存は何も変更しない。

デバッグビューはデバッグビューである。これは、コミットされたフレームを、`x`、`y`、または`z`で選択された軸に沿って投影されたボックスとして描画する。クリックは、地面平面のターゲットである。`M`、`C`、`G`、`D`、および`U`は、移動、登る、拾う、落とす、および使用を選択する。ウォーカーのゾーンと各個体の信念は、ティックとハッシュの横に表示される。ティックが保持していないものは何も描画されない。

ワールドファイルはJSONである：`name`、`seed`、`bodies`、`colliders`、`zones`、およびオプションで`heightfield`と`goal`。ボディは、オプションの四元数と角速度を持つ`{ id, x, y, z, vx, vy, vz, hx, hy, hz }`である。静的なコライダーは、オプションの四元数を持つ中心点に関する境界を持つボックスである。ゾーンは、名前付きのボックスである。不明なフィールド、重複するID、重なり合うボディ、コライダー内のボディ、単位ではない四元数、退化または到達不能なゾーン、および何も名前が付けられていない目標は、それぞれ理由とともに拒否される。

## 法則は、一息で語られる

シードされたティックは法則である。1ステップ、量子は1/64秒である。すべてのステップはハッシュ化され、キャラクターのアクションは多くのステップに及ぶ。リプレイは、シードと承認されたもののログである。モデルは、意図、型付きの信念、およびボディのドラフトを提案する。そのクラスのチェッカーが、それらを承認または拒否する。アクションのドラフトとワールドファイルは、ロード時に待機し、ハザードスイートを通過する。ホストは、コミットされたフレームを受信し、意図を返す。プレゼンテーションは、ハッシュに逆行するパスを持たない。

## 信頼モデル

The engine runs locally and touches only files inside its own checkout: worlds, action drafts, fixtures, and any log you ask a command to write. `host` binds `127.0.0.1` only. No command opens any other socket but `propose`, which talks to a local Ollama server and nowhere else, and only for a role whose manifest is thawed to act in a scratch world; both roles the engine declares are frozen, so it refuses before any model client loads. A model's proposal enters the world only through the role gate, which holds it to its role's manifest. No credentials are read, stored, or sent. No telemetry is collected. Authored content is untrusted and is validated at load; a refused file changes nothing. The WebAssembly binary is built from source in CI and pinned by its SHA-256, never committed as bytes. Its memory is fixed at 32 MiB and cannot grow, so a world too dense for it stops the same way on every host instead of diverging. See [SECURITY.md](SECURITY.md).

## サポート状況

1.0より前のバージョンは、`0.x`として`main`からリリースされた。リリース間で互換性の保証はない。ハッシュ化された法則へのすべての変更は、[CHANGELOG.md](CHANGELOG.md)に、生成されたゴールデンハッシュとともに記録される。Ubuntu x64およびARM64のCIで、Node 22およびRust 1.98.1でテストされ、Windows 11で毎日ビルドされる。

## ライセンス

MITライセンス。ただし、Rapierのキャラクターコントローラーの一部を修正した`solver/src/kcc.rs`および`solver/src/impulses.rs`は、Apache License 2.0（`solver/LICENSE-APACHE-2.0`、`solver/NOTICE`）の下にある。<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>によって構築された。
