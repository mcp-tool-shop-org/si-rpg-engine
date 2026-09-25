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

si-rpg-engineは、正確に再現される3D世界のシミュレーションコアです。物理演算を1秒間に64ステップで固定し、各ステップの後に世界のフィンガープリントを記録し、開始時のシードと受け入れた入力に基づいて、ビット単位で任意の実行を再構築できます。物理演算はRustでコンパイルされ、単一のWebAssemblyファイルとして出力されます。言語モデルは次に何が起こるかを提案し、手書きのルールが何を取り入れるかを決定します。これは[ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)の対になるもので、シミュレーションによって何が実現されるかによって評価されます。

## その概要と目指すところ

Chrome、Firefox、Safariで使用されているJavaScriptエンジン（V8、SpiderMonkey、JavaScriptCore）は、同じ世界に対して、すべてのコミットで同じフィンガープリントを出力し、同じ物理演算ビルドはx64とARM64で同じフィンガープリントを出力します。それ以外のすべては、この約束の上に成り立っています。つまり、2つのマシンが、シードと受け入れた入力のリストに基づいて、世界についてバイト単位で合意します。その上に、3次元空間で落下、滑り、押し、傾き、転がるオブジェクト、歩き、斜面を登り、物を持ち運び、置き下ろすキャラクター、誤っている場合に理由とともに拒否されるワールドファイル、そして、見たものを認識し、記憶し、より古い証拠よりも新しい証拠に基づいて信念を拒否する知性を持つキャラクターが存在します。

目指すところは、ホスト（ブラウザ、Godot、Unreal）内に存在するシミュレーションコアです。ホストが画像をレンダリングし、入力を送信し、物理演算、フィンガープリント、および記録はここに保持されます。現在の作業は、配布されるエンジンに必要なテストスイートであり、その大部分は次のとおりです。2つの実行が分岐する最初のステップと値を特定するトレース、正確であることが証明された保存と復元、2番目のCPUアーキテクチャ、コンパイルされた物理演算に対するリンター、そして、世界のフィンガープリントだけでなく、世界の動作もチェックするテストです。スイートの後には、メッシュからの衝突とホストバインディングが続きます。設計と計画は、[docs/PHASE-0.md](docs/PHASE-0.md)、[docs/PHASE-1.md](docs/PHASE-1.md)、および[docs/PHASE-2.md](docs/PHASE-2.md)にあります。

## 構築されるもの

| 機能 | 場所 | 証明 |
|---|---|---|
| 固定タイムステップのティック。各ステップの状態は、すべてのf64に対して2レーンのFNV-1aを使用してハッシュ化されます。NaNと無限大は拒否され、符号付きゼロは正規化されます。 | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt`は、最初のハーネス以降、`0d38671370d12d1e`を読み込みました。 |
| Rustで記述された物理法則。`rapier3d-f64`に、`enhanced-determinism`とともに、Linux用のダイジェストが固定された単一のWebAssemblyバイナリが含まれます。1つの実行中の物理世界があり、ジオメトリが変更された場合にのみ再構築され、アクションが開始または終了するときに、オブジェクトがその場で切り替えられます。 | `solver/` | `fixtures/solver.sha256`。CIが再構築して比較します。`harness/switch.test.js`。 |
| 位置、速度、カノニカルな四元数、角速度、および半軸を持つオブジェクト。動的なボックスは回転します。0.3の自動ステップ、45度の登坂、0.2のスナップを持つキネマティックなキャラクター。ステップ数でカウントされるスリープ状態。 | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| ワールドファイル：オブジェクト、方向付けられた静的なコリダー、高さマップ、パーティションとしてのゾーン、12個のロード拒否、ロード時のハザード、およびホストが信頼するインデックス。アクションは、物理演算が衝突するのと同じ2つの三角形の地形上に存在します。 | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js`, `harness/surface.test.js` |
| ロード時に、効果`drive`、`climb`、`carry`、`release`、および`episode`とともに許可されるアクション。それぞれにハザードシナリオがあります。 | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| 知性：視線による視界、エピソードの参照を含む型付きの信念、墓石による上書き、古い書き込みの拒否、および満たされたフラグを持つ永続的な目標。 | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| すべてのステップの正確なビットのトレースと、2つの実行が分岐する最初のステップ、オブジェクト、およびフィールドを特定するツール。 | `harness/trace.mjs`, `harness/first-difference.js` | `harness/trace.test.js`。CIは、エンジンがゴールデンから逸脱した場合に、最初の違いを出力します。 |
| ゴールデンと比較した動作番号：すべてのオブジェクトのスリープステップと最終的な位置、ウォーカーのゾーン、およびスナップショットの長さとダイジェスト。 | `fixtures/golden-behaviour.json`, `harness/check.js` | `harness/check.test.js` |
| ステップへの入力の再生、または物理モジュールのメモリのコピーによって、2つの方法で保存および復元します。どちらの方法も、正確に継続することが証明されています。 | `packages/tick/runs.js`, `solver/build.mjs` | `harness/restore.test.js` |
| バンドル：失敗したテストは、そのシード、世界、受け入れた入力、およびハッシュを書き込みます。`replay`は、これらを1つのコマンドで再現します。毎週のジョブは、すべてのバンドル、フィクスチャ、およびログを、プルリクエストよりもはるかに長い時間再生します。 | `packages/tick/bundle.js`, `.github/workflows/corpus.yml` | `harness/bundle.test.js` |
| 2つのCPUアーキテクチャ上の1つのバイナリ。メモリは32MiBに固定され、ホストが選択した命令、メモリの増加、およびメモリ外に保持された状態を拒否するリンターがあります。 | `solver/build.rs`, `solver/src/arena.rs`, `solver/lint.mjs` | CIのARM64ジョブ。`solver/lint.test.js`、`harness/caps.test.js`。 |
| 世界の動作のテスト：コントローラーの測定された制限で実行されるキャラクターのコース、薄い壁に対する薄い高速オブジェクト、および地形の継ぎ目。 | `harness/course.test.js`, `harness/outcome.test.js` | `write-golden`は、それらのいずれかが失敗すると書き込みを拒否します。 |
| シードとログから再生し、localhostでティックのデバッグビューを表示します。 | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json`は、ホスト境界を越えた人のプレイです。 |

241個のテスト、ステップごとに再生する7つの動作フィクスチャ、およびx64上の3つのエンジンとARM64上のノードによって、すべてのコミットで出力される2つのゴールデンハッシュ。

## インストール

要件：Node 20以降と、物理演算ビルド用の`wasm32-unknown-unknown`ターゲットを備えたRustツールチェーン。CIはRust 1.98.1をピン留めします。`rustup target add wasm32-unknown-unknown`は、rustupをインストールした後の追加のステップです。

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, both goldens, and the behaviour numbers under node
```

`npm test`は、最初に物理演算をビルドし、バイナリをリンターでチェックします。Linuxでは、ビルドは固定されたダイジェストと比較されます。別のホストでは、独自のダイジェストを報告します。これは、Linuxビルドが固定されたアーティファクトであるためです。

## 使用方法

すべてのコマンドは、任意のディレクトリから実行されます。成功した場合は`--help`を返し、0で終了します。拒否された場合は、理由とともに1で終了します。使用方法のエラーまたは予期しないエラーが発生した場合は、2で終了します。`--debug`は、スタックトレースを表示させます。

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

2つの実行が一致しない場合、トレースは場所を示します。

```bash
node harness/trace.mjs > a.trace                    # the product scene, one line per step in exact bits
node harness/first-difference.js a.trace b.trace    # identical, or the first step, body, and field that differ
node solver/lint.mjs                                # refuse a binary that could grow memory or let the host choose a result
```

世界は2つの方法で復元され、どちらの方法も物理エンジン内部の状態に書き込みません。そのため、どちらの方法も正確です。つまり、あるステップで受け入れられた入力を再実行するか、物理モジュールのメモリ全体を`imageSolver()`でコピーし、`restoreImage()`で元に戻します。別のバイナリからの画像、長さが異なる画像、またはバイトが変更された画像は拒否されます。

デバッグビューはデバッグビューです。これは、`x`、`y`、または`z`で選択された軸に沿って、コミットされたフレームを投影されたボックスとして描画します。クリックは、基準面上のターゲットです。`M`、`C`、`G`、`D`、および`U`は、移動、登る、拾う、落とす、および使用を選択します。ウォーカーのゾーンと各キャラクターの信念は、ティックとハッシュの横に表示されます。ティックが保持していないものは何も描画されません。

ワールドファイルはJSON形式です。`name`、`seed`、`bodies`、`colliders`、`zones`、およびオプションで`heightfield`と`goal`が含まれます。ボディは、オプションのクォータニオンと角速度を持つ`{ id, x, y, z, vx, vy, vz, hx, hy, hz }`です。静的なコリダーは、オプションのクォータニオンで中心を回転させたボックスで、その境界によって定義されます。ゾーンは、名前付きのボックスです。不明なフィールド、重複するID、重なり合うボディ、コリダー内に存在するボディ、単位ではないクォータニオン、退化したまたは到達不能なゾーン、および何も指さないゴールは、それぞれ理由とともに拒否されます。

## 法則は、一息で

シードされたティックは法則です。1ステップ、つまり量子は1/64秒です。すべてのステップはハッシュ化され、キャラクターのアクションは複数のステップに及びます。リプレイは、シードに、受け入れられたもののログを加えたものです。モデルは、意図、型付きの信念、およびボディのドラフトを提案します。そのクラスのチェッカーは、それらを受け入れるか拒否します。アクションのドラフトとワールドファイルは、ロード時に待機し、ハザードスイートを通過します。ホストは、コミットされたフレームを受信し、意図を返します。プレゼンテーションは、ハッシュに逆行するパスを持ちません。

## 信頼モデル

エンジンはローカルで実行され、自身のチェックアウト内のファイルのみにアクセスします。これには、ワールド、アクションのドラフト、フィクスチャ、およびコマンドに書き込むように指示したログが含まれます。`host`は、`127.0.0.1`にのみバインドされます。どのコマンドも他のソケットを開きません。凍結された`propose`のインストルメントは、ユーザーがそれを解凍すると、ローカルのOllamaサーバーとのみ通信し、それ以外の場所とは通信しません。認証情報は読み込まれず、保存されず、送信されません。テレメトリは収集されません。作成されたコンテンツは信頼されず、ロード時に検証されます。拒否されたファイルは何も変更しません。WebAssemblyバイナリは、CIでソースからビルドされ、SHA-256で固定され、バイトとしてコミットされることはありません。そのメモリは32MiBに固定されており、拡張することはできません。そのため、これよりも密度の高いワールドは、すべてのホストで同じように停止します。詳細は[SECURITY.md](SECURITY.md)を参照してください。

## サポート状況

1.0より前のバージョンは、`0.x`として`main`からリリースされました。リリース間の互換性は保証されません。ハッシュ化された法則に対するすべての変更は、[CHANGELOG.md](CHANGELOG.md)に、生成されたゴールデンハッシュとともに記録されます。Ubuntu x64およびARM64のCIで、Node 22およびRust 1.98.1でテストされ、Windows 11で毎日ビルドされます。

## ライセンス

MIT。MCP Tool Shopによって作成されました。
