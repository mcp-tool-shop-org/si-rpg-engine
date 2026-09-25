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

決定論的で、ハッシュ化され、再現可能な3Dシミュレーションエンジン。ティックは固定タイムステップで実行され、状態のすべての量子がハッシュ化され、物理法則はRustでコンパイルされ、単一のWebAssemblyバイナリになります。再現は、シードと許可されたもののログによって行われます。言語モデルは、世界に提案を行うことができます。手動で作成されたチェッカーが、何を受け入れるかを決定します。これは、[ai-rpg-engine](https://github.com/mcp-tool-shop-org/ai-rpg-engine)の対になるものであり、シミュレーションによって何が実現されるかによって評価されます。

## その概要と、目指す姿

V8、SpiderMonkey、JavaScriptCoreという3つのJavaScriptエンジンが、すべてのコミットで同じ世界に対して同じハッシュを出力します。これが、エンジンの残りの部分が構築されている約束です。それは、2つのマシンが、シードと許可された入力のリストから、バイト単位で合意できる世界です。その上に、3次元で落下、滑り、押し、傾き、転がる物体が配置されています。歩き、斜面を登り、持ち運び、置くことができるキャラクター。間違っている場合に理由とともに拒否されるワールドファイル。そして、それらを見て、見たものを記憶し、古い証拠よりも新しい証拠に基づいて拒否する思考が存在します。

目指す姿は、ホスト（ブラウザ、Godot、またはUnreal）内に存在するシミュレーションコアです。ホストは画像をレンダリングし、意図を送信し、一方、法則、ハッシュ、および記録はここに保持されます。次の段階は、今日のスタジオがどのようにテストしているかを調査した結果に基づいて決定される、リリース版エンジンのテストスイートです。その後、メッシュからの衝突、ホストとのバインディング、およびモデルシートをテストツールとして使用するための調整が行われます。計画は、[docs/PHASE-0.md](docs/PHASE-0.md)と[docs/PHASE-1.md](docs/PHASE-1.md)に記載されており、すべての段階は`docs/`に記述された指示に基づいて構築されました。

## 構築されるもの

| 機能 | 場所 | 証明 |
|---|---|---|
| 固定タイムステップのティック、すべてのf64に対する2レーンのFNV-1aハッシュ、NaNは拒否、符号付きゼロは正規化 | `packages/tick`, `packages/frame` | `fixtures/golden-arith.txt`は、最初のハーネス以降、`0d38671370d12d1e`を読み取りました |
| Rustで記述された物理法則（`rapier3d-f64`、`enhanced-determinism`）、単一のWebAssemblyバイナリ、Linuxダイジェストは固定 | `solver/` | `fixtures/solver.sha256`。CIは再ビルドし、比較します |
| 位置、速度、カノニカルな四元数、角速度、および半軸を持つ物体。動的なボックスは回転します。0.3ステップ、45°の登り、0.2のスナップを持つキネマティックなキャラクター。スリープは量子でカウントされます。ソルバーのスナップショットはハッシュ化されます。 | `solver/src/rapier_law.rs`, `packages/tick/world.js` | `fixtures/behavior-3d.json`, `behavior-rotation.json`, `behavior-ramp.json`, `shape-traversal.json` |
| ワールドファイル：物体、方向付けられた静的なコリダー、高さマップ、パーティションとしてのゾーン、12個のロード拒否、ロード時のハザード、ホストが信頼するインデックス | `packages/tick/scene.js`, `packages/tick/admit-world.js`, `worlds/` | `packages/tick/scene.test.js` |
| ロード時に効果`drive`、`climb`、`carry`、`release`、`episode`とともに許可された動詞。それぞれにハザードシナリオがあります | `predicates/`, `packages/load` | `fixtures/behavior-verbs.json` |
| 思考：視線による視界、エピソードを引用する型付きの信念、墓石の置き換え、古い書き込みの拒否、満たされたフラグを持つ永続的な目標 | `packages/tick/memory.js`, `predicates/beliefs/keys.json` | `fixtures/behavior-minds.json` |
| シードとログからの再現。localhostでのティックのデバッグビュー | `packages/tick/replay.js`, `packages/host` | `fixtures/first-scene-played.json`は、ホスト境界を通過する個人のプレイです |

73個のテスト、フレームごとに再現する7つの動作フィクスチャ、およびすべてのコミットで3つのエンジンで実行される2つのゴールデンハッシュ。

## インストール

要件：Node 20以降と、ソルバービルド用の`wasm32-unknown-unknown`ターゲットを備えたRustツールチェーン。CIはRust 1.98.1を固定します。`rustup target add wasm32-unknown-unknown`は、rustupをインストールした後の追加の手順です。

```bash
git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git
cd si-rpg-engine
npm ci
npm run verify     # typecheck, the suite, and both goldens under node
```

`npm test`は、最初にソルバーをビルドします。Linuxでは、ビルドは固定されたダイジェストと比較されます。別のホストでは、独自のダイジェストを報告します。これは、Linuxビルドが固定された成果物であるためです。

## 使用方法

すべてのコマンドは、任意のディレクトリから実行され、`--help`を出力し、成功した場合は0、拒否された場合は理由とともに1、および使用法エラーまたは予期しないエラーの場合は2で終了します。`--debug`は、スタックトレースを表示させます。

```bash
npx play proposals.json --seed 7 --log out.json    # run proposals through the tick, print every committed frame
npx replay out.json                                 # rerun a log; fails on the first hash that differs
npx load world worlds/crate-and-door.json           # validate a world, run its hazards, write its load hash to the index
npx load admit fixtures/climb-draft.json            # compile a verb draft, run the hazards for its effect, add it to the catalog
npx load retire climb                               # take a verb out of the catalog
npx host --world worlds/crate-and-door.json         # serve the debug view at http://127.0.0.1:4173
npx write-golden                                    # rewrite fixtures/golden.txt from harness/sim.mjs, with a reason in the commit
```

デバッグビューは、デバッグビューです。コミットされたフレームを、`x`、`y`、または`z`で選択された軸に沿って投影されたボックスとして描画します。クリックは、地面平面のターゲットです。`M`、`C`、`G`、`D`、および`U`は、移動、登り、拾い上げ、置き、および使用を選択します。ウォーカーのゾーンと各思考の信念は、ティックとハッシュの横に表示されます。ティックが保持していないものは何も描画されません。

ワールドファイルはJSONです：`name`、`seed`、`bodies`、`colliders`、`zones`、およびオプションで`heightfield`と`goal`。物体は、オプションの四元数と角速度を持つ`{ id, x, y, z, vx, vy, vz, hx, hy, hz }`です。静的なコリダーは、オプションの四元数を持つ中心のボックスによって定義されます。ゾーンは、名前付きのボックスです。不明なフィールド、重複するID、重なり合う物体、コリダー内の物体、単位ではない四元数、退化または到達不能なゾーン、および何も指さない目標は、それぞれ理由とともに拒否されます。

## 法則は、一息で

シードされたティックが法則です。量子は1/64秒であり、すべての量子はハッシュ化され、プレイヤーのアクションは多くの量子に及びます。再現は、シードと許可されたもののログによって行われます。モデルは、意図、型付きの信念、および物体ドラフトを提案します。そのクラスのチェッカーが、許可または拒否します。動詞ドラフトとワールドファイルは、ロード時に待機し、ハザードスイートを通過します。ホストは、コミットされたフレームを受信し、意図を返します。プレゼンテーションからハッシュへのパスはありません。

## 信頼モデル

エンジンはローカルで実行され、独自のチェックアウト内のファイル（ワールド、動詞ドラフト、フィクスチャ、およびコマンドに書き込むように要求するログ）にのみアクセスします。`host`は、`127.0.0.1`のみにバインドされます。どのコマンドも他のソケットを開きません。凍結された`propose`のツールは、個人がそれを解凍すると、ローカルのOllamaサーバーとのみ通信し、それ以外とは通信しません。資格情報は読み込まれず、保存されず、送信されません。テレメトリは収集されません。作成されたコンテンツは信頼されず、ロード時に検証されます。拒否されたファイルは、何も変更しません。WebAssemblyバイナリは、CIでソースからビルドされ、SHA-256によって固定され、バイトとしてコミットされることはありません。 [SECURITY.md](SECURITY.md)を参照してください。

## サポート状況

バージョン1.0以前は、`main`から`0.x`としてリリースされました。異なるバージョンの互換性は保証されません。ハッシュ化されたコードに対するすべての変更は、その変更によって生成されたハッシュ値とともに、[CHANGELOG.md](CHANGELOG.md)に記録されます。CI環境のUbuntuでNode 22とRust 1.98.1を使用してテストされ、Windows 11で毎日ビルドされます。

## ライセンス

MIT。MCP Tool Shopによって作成されました。
