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

si-rpg-engineは、3Dワールドを正確に再現するシミュレーションコアです。物理演算を1秒間に64ステップで固定し、各ステップの後にワールドのフィンガープリントを記録し、開始時のシードと受け入れた入力に基づいて、ビット単位で任意の実行を再構築できます。物理演算はRustで記述され、WebAssemblyファイルにコンパイルされます。言語モデルが次に何が起こるかを提案し、手書きのルールが何を取り入れるかを決定します。これは[ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)の対となるものであり、シミュレーションによって何が実現されるかによって評価されます。

## その概要と目指すところ

Chrome、Firefox、Safariで使用されているJavaScriptエンジン（V8、SpiderMonkey、JavaScriptCore）は、同じワールドに対して、コミットごとに同じフィンガープリントを出力し、同じ物理演算ビルドはx64とARM64で同じフィンガープリントを出力します。それ以外のすべては、この約束の上に成り立っています。つまり、2つのマシンが、シードと受け入れた入力のリストに基づいて、ワールドについてバイト単位で合意します。その上に、3次元空間で落下、滑り、押し、傾き、転がるオブジェクト、歩き、斜面を登り、物を持ち運び、置くキャラクター、誤っている場合に理由とともに拒否されるワールドファイル、そして、見たものを認識し、記憶し、より古い証拠よりも新しい証拠に基づいて信念を拒否する知性を持つキャラクターが存在します。

目指すところは、ホスト（ブラウザ、Godot、Unreal）内に存在するシミュレーションコアです。ホストが画像をレンダリングし、入力を送信し、物理演算、フィンガープリント、および記録はここに保持されます。現在の作業は、リリース版エンジンに必要なテストスイートであり、その大部分は次のとおりです。2つの実行が分岐する最初のステップと値を特定するトレース、正確であることが証明された保存と復元、2番目のCPUアーキテクチャ、コンパイルされた物理演算に対するリンター、そして、ワールドのフィンガープリントだけでなく、ワールドが何をしたかをチェックするテストです。メッシュからのコリジョンは入っています。シーンは固定の三角形メッシュを一つ名付けられ、製品のシーンは一つも名付けません。ホストバインディングが残っている行です。設計と計画は、[docs/PHASE-0.md](docs/PHASE-0.md)、[docs/PHASE-1.md](docs/PHASE-1.md)、および[docs/PHASE-2.md](docs/PHASE-2.md)にあります。

## 構築するもの

| 機能 | 場所 | 証明 |
|---|---|---|
| 固定タイムステップのティック。各ステップの状態は、すべてのf64に対して2レーンのFNV-1aを使用してハッシュ化されます。NaNと無限大は拒否され、符号付きゼロは正規化されます。 | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt`は、最初のハーネス以降、`0d38671370d12d1e`を読み取りました。 |
| Rustで記述された物理法則は、`rapier3d-f64`にあり、`enhanced-determinism`とともに、Linuxダイジェストが固定されたWebAssemblyバイナリが1つあります。実行中の物理ワールドは、ジオメトリが変更された場合にのみ再構築され、アクションが開始または終了するときに、オブジェクトがその場で切り替えられます。 | `solver/` | `fixtures/solver.sha256`は、CIによって再構築および比較されます。`harness/switch.test.js` |
| 位置、速度、カノニカルな四元数、角速度、および半軸を持つオブジェクト。動的なボックスは回転します。0.3の自動ステップ、45度の登坂、0.2のスナップを持つキネマティックなキャラクター。ステップ数でカウントされるスリープ状態。 | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| キャラクターが、エンジンのRapierのインパルスルーチンのコピーを通じて押し出す処理。Rapier自身の後続の修正がバックポートされており、オブジェクトは自身の接触点でのみ押し出され、各点のインパルスは、その場所でのオブジェクトの有効質量と回転によってサイズ調整されます。物理演算において、オブジェクトが指定されたプッシャーの速度の倍数よりも速くなるような押し出しは、エラーとなります。 | `solver/src/impulses.rs` | `harness/push.test.js`、`fixtures/push/red-room-a.json`、および修正がないコピーが、Rapierのルーチンと同じように、ビット単位で押し出すことを確認するネイティブテスト。 |
| 駆動されるオブジェクトは、動的なオブジェクトに対して解決しません。駆動されるコリダーは、ソルバーグループ3であり、グループ2を除外します。動的なコリダーは、グループ2であり、グループ3を除外します。静的なオブジェクトは、Rapierのデフォルトを維持します。コリジョングループは変更されないため、ナローフェーズは引き続きペアを検出します。JavaScriptによる切り替えはありません。ステップアップルームでは、両方のボックスが1 m/s未満に維持されます。ウォーカーの16 m/sは、1つの量子における0.25 mのステップであり、それがステップです。 | `solver/src/rapier_law.rs` | `harness/step-up-121.test.js`、`harness/sweep.test.js`、およびグループが互いに除外され、コリダーハンドルが維持されることを確認するネイティブテスト。 |
| 固定の三角形メッシュが一つ。シーンはそれに名前を付けられ、製品のシーンは一つも名前を付けない。コンストラクタはローダが拒むメッシュを拒み、法則はメッシュを組む前に範囲外のインデックス、繰り返されたインデックス、有限でない頂点を拒む。トラップした物理モジュールは捨てられる。拒まれたロードやステップはその世界を保持せず、剛体を書き戻さない | `solver/src/rapier_law.rs`, `packages/tick/scene.js`, `packages/tick/world.js` | `harness/mesh.test.js`, `harness/mesh-refusal.test.js` |
| ワールドファイル：オブジェクト、方向付けられた静的なコリダー、高さマップ、パーティションとしてのゾーン、12回のロード拒否、ロード時のハザード、およびホストが信頼するインデックス。アクションは、物理演算が衝突するのと同じ2つの三角形の地形上に存在します。 | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js`, `harness/surface.test.js` |
| ワールドが許可されたときに実行される到達可能性のスキャン：許可されたアクションを通じて、チェッカーを使用して、ティック自身の保存から、到達可能な状態を探索します。ゾーンに到達できない、ワールドから運び出されたオブジェクト、またはスローは、証拠（`replay`が再現する）とともにワールドを拒否します。 | `packages/load/sweep.js` | `harness/sweep.test.js`、閉じられたテストルームは`fixtures/sweep/`にあります。 |
| ロード時に、効果`drive`、`climb`、`carry`、`release`、および`episode`を持つアクションが許可され、それぞれにハザードシナリオがあります。 | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| 知性：視線による視界、エピソードを引用する型付きの信念、墓石による置き換え、古い書き込みの拒否、および満たされたフラグを持つ永続的な目標。 | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| 各ステップの正確なビットでのトレースと、2つの実行が分岐する最初のステップ、オブジェクト、およびフィールドを特定するツール。 | `harness/trace.mjs`, `harness/first-difference.js` | `harness/trace.test.js`。CIは、エンジンがゴールデンから逸脱したときに、最初の違いを出力します。 |
| ゴールデンと比較した動作番号：各オブジェクトのスリープステップと最終的な位置、ウォーカーのゾーン、およびスナップショットの長さとダイジェスト。 | `fixtures/golden-behaviour.json`, `harness/check.js` | `harness/check.test.js` |
| 3つの方法で保存と復元：ステップへの入力を再実行すること、物理モジュールのメモリをコピーすること、またはティック自身の状態全体を保存すること（これにより、再実行なしで復元されます）。それぞれが正確に継続することが証明されています。 | `packages/tick/runs.js`, `packages/tick/tick.js`, `solver/build.mjs` | `harness/restore.test.js` |
| バンドル：失敗したテストは、シード、ワールド、受け入れた入力、およびハッシュを書き込み、`replay`が1つのコマンドでそれを再現します。毎週のジョブは、すべてのバンドル、フィクスチャ、およびログを、プルリクエストよりもはるかに長い時間再実行します。 | `packages/tick/bundle.js`, `.github/workflows/corpus.yml` | `harness/bundle.test.js` |
| 2つのCPUアーキテクチャ上の1つのバイナリで、メモリは32 MiBに固定され、ホストが選択した命令、メモリの増加、およびメモリ外に保持された状態を拒否するリンターがあります。 | `solver/build.rs`, `solver/src/arena.rs`, `solver/lint.mjs` | CIのARM64ジョブ。`solver/lint.test.js`、`harness/caps.test.js` |
| 世界の状況をテスト：コントローラーの測定限界におけるキャラクターの動き、長い平坦な道のすべてのステップでの完全な歩幅と、床に沈み込むステップがないこと、薄い壁に対する薄くて速い体、地形の継ぎ目、そして全体的なシーンが100万単位で移動する。 | `harness/course.test.js`, `harness/outcome.test.js` | `write-golden`は、それらのいずれかが失敗すると書き込みを拒否する。 |
| ツールのベンチ：変更とその前のビルド、各ツリーは独自のプロセスで実行される。変更が影響を与えるコードとデータを特定し、両方のツリーで各候補の入力を実行し、変更に到達した内容、2つの実行が最初に分岐する場所、および変更でのみ失敗するものを報告する。エンジンからのすべての結果と、モデルからのものは一切ない。法律の適用範囲は、製品ビルドのフレームごとに一致する必要があるカバレッジビルドから読み取られ、変更に配置されたミュータントがベンチを測定する。 | `packages/bench` | 既知の効果を持つ変更に対して、`packages/bench/`で86のテストを実施。手動で配置されたF2の法律の変更は、量子98で検出された。 |
| モデルシートの役割：役割ごとのマニフェスト、役割が読み取るものから派生した二律背反の法則、チェッカー内の役割ゲート、すべての承認における出所、信念に付随する信頼ラベル、およびすべてのモデル呼び出しが記録およびチェックされ、GPUは使用されない。両方の宣言された役割は固定される。 | `predicates/roles/`, `packages/tick/roles.js`, `packages/tick/gate.js`, `packages/propose` | `packages/tick/gate.test.js`、`packages/propose/record.test.js`、セッション全体で`fixtures/sessions/` |
| シードとログからリプレイし、localhostでのティックのデバッグビューを表示する。 | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json`は、ホスト境界を越えた人物のプレイである。 |

510のテスト、ステップごとにリプレイする7つの動作フィクスチャ、およびx64で3つのエンジンとARM64でノードによって出力される2つのゴールデンハッシュ。これらはすべて、すべてのコミットで実行される。

## インストール

要件：Node 20以降、および物理ビルド用の`wasm32-unknown-unknown`ターゲットを備えたRustツールチェーン。CIはRust 1.98.1に固定。`rustup target add wasm32-unknown-unknown`は、rustupをインストールした後の追加の手順である。

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, both goldens, and the behaviour numbers under node
```

`npm test`は、最初に物理をビルドし、バイナリをLintする。Linuxでは、ビルドは固定されたダイジェストと比較される。別のホストでは、独自のダイジェストを報告する。これは、Linuxビルドが固定された成果物であるためである。

## 使用方法

すべてのコマンドは、任意のディレクトリから実行され、`--help`を返し、成功した場合は0、拒否された場合は理由とともに1、および使用法エラーまたは予期しない失敗の場合は2で終了する。`--debug`は、スタックトレースを表示する。

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

2つの実行が一致しない場合、トレースは場所を示す。

```bash
node harness/trace.mjs > a.trace                    # the product scene, one line per step in exact bits
node harness/first-difference.js a.trace b.trace    # identical, or the first step, body, and field that differ
node solver/lint.mjs                                # refuse a binary that could grow memory or let the host choose a result
```

変更は、その前のビルドに対して測定できる。ベンチは手動で実行され、ワークフローは実行されない。

```bash
npx bench trees . main HEAD ../trees                # the base and the head as git worktrees, the head's binary built in its own tree
npx bench anchors --base ../trees/base --head ../trees/head    # the code and data the change touches, as JSON
npx bench run --base ../trees/base --head ../trees/head --out ../bench --product-scene    # reach, differences, and catches, with a report
```

レポートは、そのシード、量子と復元における予算をカウントし、測定しなかったものを表示する。1つのシードを持つ2つの実行は、その環境ブロックの外で同じレポートを生成する。`solver/`が変更されると、各ツリーは独自のバイナリをビルドし、法律の適用範囲は、製品シーンを製品ビルドが実行するのと同じように正確に実行する必要があるヘッドのカバレッジビルドから得られ、そうでない場合、ベンチは理由とともに停止する。

世界は3つの方法で復元され、物理エンジンの内部状態に書き込むことはない。そのため、それぞれが正確である。受け入れられた入力をステップまでリプレイできる。物理モジュールのメモリ全体を`imageSolver()`でコピーし、`restoreImage()`で戻すことができる。または、ティック全体を`save()`で保存し、`restore(saved)`で戻すこともできる。これにはリプレイは必要なく、スウィープが数千回にわたって状態に戻る方法である。別のバイナリからの画像、または長さを間違えたり、変更されたバイトが含まれている画像は拒否され、チェックアウトしない保存は何も変更しない。

デバッグビューはデバッグビューである。これは、コミットされたフレームを、`x`、`y`、または`z`で選択した軸に沿って投影されたボックスとして描画する。クリックは、地面平面のターゲットである。`M`、`C`、`G`、`D`、および`U`は、移動、登る、拾う、落とす、および使用を選択する。ウォーカーのゾーンと各心の信念は、ティックとハッシュの横に配置される。ティックが保持していないものは何も描画されない。

ワールドファイルはJSONである：`name`、`seed`、`bodies`、`colliders`、`zones`、およびオプションで`heightfield`、`mesh`、`goal`。メッシュは `{ positions, indices }`。ボディは、オプションの四元数と角速度を持つ`{ id, x, y, z, vx, vy, vz, hx, hy, hz }`である。静的なコライダーは、その境界を持つボックスであり、オプションでその中心を中心とした四元数を持つ。ゾーンは、名前付きのボックスである。不明なフィールド、重複するID、重なり合うボディ、ボディがコライダー内にある、非単位の四元数、退化または到達不能なゾーン、および何も名前が指定されていない目標は、それぞれ理由とともに拒否される。

## 法律、一息で

シードされたティックは法律である。駆動するボディと動的なボディは、ソルバーの接触を共有せず、それでも狭いフェーズでペアを見つける。1つのステップ、量子は1/64秒である。すべてのステップはハッシュされ、キャラクターのアクションは多くのステップに及ぶ。リプレイは、シードと承認されたもののログである。モデルは、型付きの信念とボディのドラフトを提案する。そのクラスのチェッカーは、それらを承認または拒否する。アクションのドラフトとワールドファイルは、ロード時に待機し、ハザードスイートを通過する。ホストは、コミットされたフレームを受信し、インテントを返す。プレゼンテーションは、ハッシュに逆行するパスを持たない。

## 信頼モデル

エンジンはローカルで実行され、自身のチェックアウト内のファイルのみにアクセスします。具体的には、ワールド、アクションのドラフト、フィクスチャ、およびコマンドに書き込ませるログなどです。`host`は`127.0.0.1`にのみバインドされます。`bench`はチェックアウトの例外であり、指定された場所にツリーとレポートを書き込み、それぞれのツリーを独自のチャイルドプロセスで実行します。どのコマンドも、ローカルのOllamaサーバーとのみ通信するソケットである`propose`以外のソケットを開きません。また、スクラッチワールドで動作するように解凍されたマニフェストを持つロールに対してのみ通信します。エンジンが宣言する両方のロールは凍結されているため、モデルクライアントがロードされる前に拒否されます。モデルの提案は、ロールゲートを通じてのみワールドに導入され、ロールゲートは、そのロールのマニフェストに沿って動作するように制御します。ツリーの物理演算をビルドするには、`bench`が`cargo build --locked`を実行します。これはソルバー自身のビルドと同様です。また、cargoは、キャッシュに存在しない場合にのみ、crates.ioからピン留めされたクレートを取得します。認証情報は読み込まれず、保存されず、送信されません。テレメトリーは収集されません。作成されたコンテンツは信頼されず、ロード時に検証されます。拒否されたファイルは何も変更しません。WebAssemblyバイナリは、CIでソースからビルドされ、SHA-256でピン留めされ、バイトとしてコミットされることはありません。メモリは32MiBに固定されており、拡張することはできません。そのため、これよりも密度が高いワールドでは、すべてのホストで同じように動作が停止します。詳細は[SECURITY.md](SECURITY.md)を参照してください。

## サポート状況

1.0より前のバージョンは、`0.x`として`main`からリリースされました。リリース間で互換性が保証されることはありません。ハッシュ化されたルールに対するすべての変更は、[CHANGELOG.md](CHANGELOG.md)に、生成されたゴールデンハッシュとともに記録されます。Ubuntu x64およびARM64のCIで、Node 22およびRust 1.98.1でテストされ、Windows 11で毎日ビルドされます。

## ライセンス

MITライセンスですが、Rapierのキャラクターコントローラーの一部を修正した`solver/src/kcc.rs`と`solver/src/impulses.rs`は、Apache License 2.0（`solver/LICENSE-APACHE-2.0`、`solver/NOTICE`）の対象となります。ビルドは、<a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>によって行われました。
