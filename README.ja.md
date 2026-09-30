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

si-rpg-engineは、正確に再現される3D世界のシミュレーションコアです。物理演算を1秒間に64ステップで固定し、各ステップの後に世界のフィンガープリントを記録し、開始時のシードと受け取った入力に基づいて、ビット単位で任意の実行を再構築できます。物理演算はRustで記述され、単一のWebAssemblyファイルにコンパイルされます。言語モデルは次に何が起こるかを提案する可能性があり、手書きのルールが何を取り入れるかを決定します。これは[ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)の対となるものであり、シミュレーションによって何が実現されるかによって評価されます。

## その概要と目指すところ

Chrome、Firefox、Safariで使用されているJavaScriptエンジン（V8、SpiderMonkey、JavaScriptCore）は、同じ世界に対して、各コミットで同じフィンガープリントを出力し、同じ物理演算ビルドはx64とARM64で同じフィンガープリントを出力します。それ以外のすべては、この約束の上に成り立っています。つまり、2つのマシンが、シードと受け入れられた入力のリストに基づいて、世界についてバイト単位で合意します。その上に、3次元空間で落下、滑り、押し、傾き、転がる物体、歩き、斜面を登り、物を持ち運び、置くキャラクター、誤っている場合に理由とともに拒否されるワールドファイル、そして、見たものを認識し、記憶し、より古い証拠に基づいて信念を拒否する知性を持つキャラクターが存在します。

目指すところは、ホスト（ブラウザ、Godot、Unreal）内に存在するシミュレーションコアです。ホストは画像をレンダリングし、入力を送信し、物理演算、フィンガープリント、および記録はここに保持されます。現在の作業は、出荷されるエンジンに必要なテストスイートであり、その大部分は次のとおりです。2つの実行が分岐する最初のステップと値を特定するトレース、正確であることが証明された保存と復元、2番目のCPUアーキテクチャ、コンパイルされた物理演算に対するリンター、および世界の動作をフィンガープリントだけでなくチェックするテストです。メッシュからの衝突は実装されており、シーンは1つの固定三角形メッシュを指定でき、生成されたシーンは何も指定しません。ホストは、[docs/host-binding.md](docs/host-binding.md)のソケットにバインドされます。設計と計画は、[docs/PHASE-0.md](docs/PHASE-0.md)、[docs/PHASE-1.md](docs/PHASE-1.md)、および[docs/PHASE-2.md](docs/PHASE-2.md)にあります。

## 構築されるもの

| 機能 | 場所 | 証明 |
|---|---|---|
| 固定タイムステップのティック。各ステップの状態は、すべてのf64に対して2レーンのFNV-1aを使用してハッシュ化されます。NaNと無限大は拒否され、符号付きゼロは正規化されます。 | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt`は、最初のハーネス以降、`0d38671370d12d1e`を読み取りました。 |
| Rustで記述された物理法則は、`rapier3d-f64`にあり、`enhanced-determinism`とともに、Linuxのダイジェストが固定された単一のWebAssemblyバイナリです。1つの実行中の物理世界があり、ジオメトリが変更された場合にのみ再構築され、アクションが開始または終了するときに、その場でオブジェクトが切り替えられます。 | `solver/` | `fixtures/solver.sha256`は、CIによって再構築および比較されます。`harness/switch.test.js` |
| 位置、速度、カノニカルな四元数、角速度、および半軸を持つオブジェクト。動的なボックスは回転します。0.3の自動ステップ、45度の登り、0.2の吸着を持つキネマティックなキャラクター。ステップ数でカウントされるスリープ。 | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| キャラクターが、エンジンのRapierのインパルスルーチンのコピーを通じて押し出す処理。Rapier自身の後続の修正がバックポートされており、オブジェクトは自身の接触点でのみ押し出され、各点のインパルスは、その場所でのオブジェクトの有効質量、およびその回転を含めてサイズ調整されます。物理演算に、オブジェクトが指定されたプッシャーの速度の倍数よりも速くなるような押し出しを失敗させるガードがあります。 | `solver/src/impulses.rs` | `harness/push.test.js`、`fixtures/push/red-room-a.json`、および修正なしのコピーが、Rapierのルーチンと同じように、ビット単位で押し出すことを確認するネイティブテスト。 |
| 駆動されるオブジェクトは、動的なオブジェクトに対して解決しません。駆動されるコライダーは、ソルバーグループ3であり、グループ2を除外します。動的なコライダーは、グループ2であり、グループ3を除外します。静的なオブジェクトは、Rapierのデフォルトを維持します。コリジョングループは変更されないため、ナローフェーズは引き続きペアを検出します。JavaScriptによる切り替えはありません。ステップアップルームでは、両方のボックスが1 m/s未満に維持されます。ウォーカーの16 m/sは、1つの量子（ステップ）で0.25 mのステップです。 | `solver/src/rapier_law.rs` | `harness/step-up-121.test.js`、`harness/sweep.test.js`、およびグループが互いに除外され、コライダーハンドルが維持されることを確認するネイティブテスト。 |
| 1つの固定三角形メッシュ。シーンはそれを指定でき、生成されたシーンは何も指定しません。コンストラクターは、ローダーが拒否するメッシュを拒否し、法則は、範囲外のインデックス、繰り返しのインデックス、またはメッシュが構築される前に非有限の頂点を拒否します。トラップされた物理モジュールは破棄されます。拒否されたロードまたはステップは、その世界を保持したり、オブジェクトをコピーして戻したりしません。 | `solver/src/rapier_law.rs`, `packages/tick/scene.js`, `packages/tick/world.js` | `harness/mesh.test.js`, `harness/mesh-refusal.test.js` |
| ワールドファイル：オブジェクト、方向付けられた静的なコライダー、高さマップ、パーティションとしてのゾーン、12のロード拒否、ロード時のハザード、およびホストが信頼するインデックス。アクションは、物理演算が衝突するのと同じ2つの三角形の地形表面に配置されます。 | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js`, `harness/surface.test.js` |
| ワールドが承認されたときに実行される到達可能性スウィープ：承認されたアクションを通じて、チェッカーを使用して、ティック自身の保存から、その到達可能な状態を探索します。ゾーンに到達するものがない、オブジェクトがワールドの外に運ばれた、または投げられた場合、そのワールドは拒否され、`replay`が再現することを示す証拠が提示されます。 | `packages/load/sweep.js` | `harness/sweep.test.js`、閉じたテストルームは`fixtures/sweep/`にあります。 |
| ロード時に、効果`drive`、`climb`、`carry`、`release`、および`episode`を持つアクションが承認され、それぞれにハザードシナリオがあります。 | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| 知性：視線と視線、エピソードの引用を含む型付きの信念、墓石による上書き、古い書き込みの拒否、および満たされたフラグを持つスタンドアロンの目標。 | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| 各ステップの正確なビットでのトレースと、2つの実行が分岐する最初のステップ、オブジェクト、およびフィールドを特定するツール。 | `harness/trace.mjs`, `harness/first-difference.js` | `harness/trace.test.js`。CIは、エンジンがゴールデンから逸脱したときに、最初の違いを出力します。 |
| ゴールデンに対する動作番号：各オブジェクトのスリープステップと最終位置、ウォーカーのゾーン、およびスナップショットの長さとダイジェスト。 | `fixtures/golden-behaviour.json`, `harness/check.js` | `harness/check.test.js` |
| 3つの方法で保存および復元：ステップへの入力を再生することによって、物理モジュールのメモリをコピーすることによって、またはティック自身の状態全体を保存することによって（これは再生なしで復元されます）。それぞれが正確に継続することが証明されています。 | `packages/tick/runs.js`, `packages/tick/tick.js`, `solver/build.mjs` | `harness/restore.test.js` |
| バンドル：テストが失敗した場合、そのテストはシード、ワールド、受け入れられた入力、およびハッシュを書き込みます。`replay`は、これらを1つのコマンドで再現します。毎週のジョブは、すべてのバンドル、フィクスチャ、およびログを、プルリクエストよりもはるかに長い時間再生します。 | `packages/tick/bundle.js`, `.github/workflows/corpus.yml` | `harness/bundle.test.js` |
| 2つのCPUアーキテクチャ上で、メモリを32MiBに固定し、ホストが選択した命令、メモリの増加、およびメモリ外に保存された状態を拒否する1つのバイナリ。 | `solver/build.rs`, `solver/src/arena.rs`, `solver/lint.mjs` | CIのARM64ジョブ：`solver/lint.test.js`、`harness/caps.test.js` |
| ワールドが何をしたかのテスト：コントローラーの測定された制限でキャラクターコース、長い平坦な歩行のすべてのステップで完全な歩幅、床に沈むステップなし、薄い壁に対する薄くて速い体、地形の継ぎ目、そしてシーン全体が100万ユニット移動。 | `harness/course.test.js`, `harness/outcome.test.js` | `write-golden`は、それらのいずれかが失敗している間は書き込みを拒否します。 |
| 計測機器のベンチ：変更とその前のビルド、各ツリーは独自のプロセスで実行されます。変更が影響を与えるコードとデータを名前で示し、両方のツリーで各候補入力を実行し、変更に到達した内容、2つの実行が最初に分岐する場所、および変更でのみ失敗する内容を報告します。エンジンからのすべての結果と、モデルからの結果は一切ありません。法律の範囲は、実行が製品ビルドのフレームごとに一致する必要があるカバレッジビルドから読み取られ、変更に配置されたミュータントはベンチを測定します。 | `packages/bench` | 既知の効果を持つ変更に対して、`packages/bench/`で86のテストが実行されます。F2の法律の変更は、手動で配置され、量子98で検出されました。 |
| モデルシートの役割：役割ごとのマニフェスト、役割が読み取る内容から導き出された二律背反の法則、チェッカー内の役割ゲート、すべての承認における出所、信念に付随する信頼ラベル、およびすべてのモデル呼び出しが記録され、GPUなしでチェックされます。両方の宣言された役割は固定されます。 | `predicates/roles/`, `packages/tick/roles.js`, `packages/tick/gate.js`, `packages/propose` | `packages/tick/gate.test.js`、`packages/propose/record.test.js`は、`fixtures/sessions/`のセッション全体で実行されます。 |
| シードとログから再生し、フレームストリーム、意図ドア、およびブレンドルールに対するホストバインディング。 | `packages/tick/replay.js`, `packages/host`, `docs/host-binding.md` | `fixtures/first-scene-played.json`は、ホスト境界を越えた人物のプレイです。`harness/binding.test.js`は、ソケットを介してフィクスチャを再生します。 |

521のテスト、ステップごとに再生される7つの動作フィクスチャ、およびx64上の3つのエンジンとARM64上のノードによって、すべてのコミットで出力される2つのゴールデンハッシュ。

## インストール

要件：Node 20以降と、物理ビルド用の`wasm32-unknown-unknown`ターゲットを備えたRustツールチェーン。CIはRust 1.98.1に固定されています。`rustup target add wasm32-unknown-unknown`は、rustupをインストールした後の追加のステップです。

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, both goldens, and the behaviour numbers under node
```

`npm test`は、最初に物理をビルドし、バイナリをリントします。Linuxでは、ビルドは固定されたダイジェストと比較されます。別のホストでは、独自のダイジェストを報告します。これは、Linuxビルドが固定されたアーティファクトであるためです。

## 使用方法

すべてのコマンドは、任意のディレクトリから実行され、`--help`に回答し、成功時には0で終了し、拒否時には理由とともに1で終了し、使用方法のエラーまたは予期しない失敗時には2で終了します。`--debug`は、スタックトレースを表示します。

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

2つの実行が一致しない場合、トレースは場所を示します。

```bash
node harness/trace.mjs > a.trace                    # the product scene, one line per step in exact bits
node harness/first-difference.js a.trace b.trace    # identical, or the first step, body, and field that differ
node solver/lint.mjs                                # refuse a binary that could grow memory or let the host choose a result
```

変更は、その前のビルドに対して測定できます。ベンチは手動で実行され、ワークフローは実行されません。

```bash
npx bench trees . main HEAD ../trees                # the base and the head as git worktrees, the head's binary built in its own tree
npx bench anchors --base ../trees/base --head ../trees/head    # the code and data the change touches, as JSON
npx bench run --base ../trees/base --head ../trees/head --out ../bench --product-scene    # reach, differences, and catches, with a report
```

レポートは、そのシード、量子と復元における予算をカウントし、測定しなかったことを示します。1つのシードを持つ2つの実行は、その環境ブロックの外で同じレポートを生成します。`solver/`が変更されると、各ツリーは独自のバイナリをビルドし、法律の範囲は、製品ビルドが製品シーンを製品ビルドとまったく同じように実行するか、ベンチが理由とともに停止する、ヘッドのカバレッジビルドから得られます。

ワールドは3つの方法で復元され、物理エンジンの内部状態に書き込むことはありません。そのため、それぞれが正確です。受け入れられた入力をステップまで再生できます。物理モジュールのメモリ全体を`imageSolver()`でコピーし、`restoreImage()`で戻すことができます。または、完全なティックを`save()`で保存し、`restore(saved)`で戻すことができます。これには再生は必要なく、スイープが数千回にわたって状態に戻る方法です。別のバイナリからの、長さが間違っている、または変更されたバイトを含む画像は拒否され、チェックアウトしない保存は何も変更しません。

デバッグビューはデバッグビューです。これは、`x`、`y`、または`z`で選択した軸に沿って、コミットされたフレームを投影されたボックスとして描画します。クリックは、地面平面のターゲットです。`M`、`C`、`G`、`D`、および`U`は、移動、登る、拾う、落とす、および使用を選択します。ウォーカーのゾーンと各マインドの信念は、ティックとハッシュの隣に配置されます。ティックが保持していないものは何も描画されません。

ワールドファイルはJSONです：`name`、`seed`、`bodies`、`colliders`、`zones`、およびオプションで`heightfield`、`mesh`、および`goal`。メッシュは`{ positions, indices }`です。ボディは、オプションの四元数と角速度を持つ`{ id, x, y, z, vx, vy, vz, hx, hy, hz }`です。静的なコライダーは、その境界を持つボックスであり、オプションでその中心の周りの四元数があります。ゾーンは、名前付きのボックスです。不明なフィールド、重複するID、重なり合うボディ、コライダー内のボディ、非単位の四元数、退化または到達不能なゾーン、および何も名前が付けられていない目標は、それぞれ理由とともに拒否されます。

## 法律、一息で

シードされたティックは法律です。駆動するボディと動的なボディは、ソルバーの接触を共有せず、それでも狭いフェーズはペアを見つけます。1つのステップ、量子は1/64秒です。すべてのステップはハッシュされ、キャラクターのアクションは多くのステップに及びます。再生は、シードと承認されたもののログです。モデルは、型付きの信念とボディのドラフトを提案します。そのクラスのチェッカーは、それらを承認または拒否します。アクションのドラフトとワールドファイルは、ロード時に待機し、ハザードスイートを通過します。ホストは、コミットされたフレームを受信し、意図を返します。プレゼンテーションは、ハッシュに逆行するパスはありません。

## 信頼モデル

エンジンはローカルで実行され、自身のチェックアウト内のファイルのみにアクセスします。具体的には、ワールド、アクションのドラフト、フィクスチャ、およびコマンドに書き込ませるログなどです。`host`は`127.0.0.1`にのみバインドされます。`bench`はチェックアウトの例外であり、指定された場所にツリーとレポートを書き込み、それぞれのツリーを独自のチャイルドプロセスで実行します。どのコマンドも、ローカルのOllamaサーバーとのみ通信するソケットである`propose`以外のソケットを開きません。また、スクラッチワールドで動作するように解凍されたマニフェストを持つロールに対してのみ通信します。エンジンが宣言する両方のロールは凍結されているため、モデルクライアントがロードされる前に拒否されます。モデルの提案は、ロールゲートを通じてのみワールドに導入され、ロールゲートは、そのロールのマニフェストに沿って動作するように制御します。ツリーの物理演算をビルドするには、`bench`が`cargo build --locked`を実行します。これはソルバー自身のビルドと同じです。また、cargoは、キャッシュに存在しない場合にのみ、crates.ioからピン留めされたクレートを取得します。認証情報は読み込まれず、保存されず、送信されません。テレメトリーは収集されません。作成されたコンテンツは信頼されず、ロード時に検証されます。拒否されたファイルは何も変更しません。WebAssemblyバイナリは、CIでソースからビルドされ、SHA-256でピン留めされ、バイトとしてコミットされることはありません。メモリは32MiBに固定されており、拡張することはできません。そのため、メモリに収まりきらないワールドは、どのホストでも同じように停止します。詳細は[SECURITY.md](SECURITY.md)を参照してください。

## サポート状況

1.0より前のバージョンは、`0.x`として`main`からリリースされました。リリース間で互換性が保証されるわけではありません。ハッシュ化されたルールに対するすべての変更は、[CHANGELOG.md](CHANGELOG.md)に、生成されたゴールデンハッシュとともに記録されます。Ubuntu x64およびARM64のCIで、Node 22およびRust 1.98.1でテストされ、Windows 11で毎日ビルドされます。

## ライセンス

MITライセンスですが、Rapierのキャラクターコントローラーの一部を修正した`solver/src/kcc.rs`と`solver/src/impulses.rs`は、Apache License 2.0（`solver/LICENSE-APACHE-2.0`、`solver/NOTICE`）の対象となります。ビルドは、<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>によって行われました。
