<!-- study-swarm · si-rpg-engine · product alignment · 2026-09-25 -->
# Study-swarm dispatch: where the industry is going, for the Director

> **What this is.** Research the Director asked for on 2026-09-25 to align the product. It informs decisions about hosts, licensing, and what the engine's properties are worth to whom. It is not part of the engine's law, and nothing in it names a slice, a contract, a brief, or a research prompt for the engine. The engine stays a three-dimensional simulation measured by what it simulates.

Two research lanes ran in parallel, each on retrieval only: a source the lane could not fetch did not enter. Lane D: the games industry in 2025–2026. Lane E: web3 and games in 2025–2026.

## Step 1 — Load-bearing questions

- **QD1** Which engines and platforms are developers and players actually moving to, and what does that mean for an embeddable simulation core?
- **QD2** How are generated content and models received by developers, players, unions, and platforms, and what does an admitted-input log buy there?
- **QD3** Where is deterministic, replayable, verifiable state already a paid-for feature?
- **QE1** What survived of web3 games, and what did the survivors keep?
- **QE2** Which verification ideas from that period stand on their own without a token or a chain?

## Research grounding (the dispatch's empirical floor)

### Lane D — the games industry

1. **Among developers, 42% name Unreal as their primary engine, 30% Unity, 19% a proprietary engine, and 11% Godot, which newer indie teams favour; 28% were laid off in two years; 52% think generative AI is bad for the industry, up from 30%, yet 36% use it; 73% of executives rank PC in their top three platforms, 28% target Steam Deck, 39% are interested in Switch 2.** Elderkin, GDC 2026 State of the Game Industry, https://gdconf.com/article/gdc-2026-state-of-the-game-industry-reveals-impact-of-layoffs-generative-ai-and-more/. Implication: Godot first and Unreal second as hosts; PC and handheld PC as the targets; describe the model layer as a proposer behind an author-written checker, because the audience distrusts generated content.
2. **Unity cancelled its Runtime Fee, raised the Personal ceiling to 200,000 dollars, and raised Pro and Enterprise prices from January 2025.** Unity 2024, "Unity Editor Software Terms Update: Runtime Fee Cancellation", https://unity.com/blog/terms-update-runtime-fee-cancellation. Implication: licensing risk is now weighed heavily; a permissive licence on the core is itself a feature.
3. **Godot releases on Steam show exponential growth, the community roughly doubled in two years, and each stable release is downloaded about two million times.** John 2026, "Godot usage and engine growth", https://godotengine.org/article/godot-growth-stats-2026/. Implication: a GDExtension or WebAssembly host for Godot is the adoption path with momentum.
4. **7,818 Steam games, about 7% of the library and about 20% of 2025 releases, declare generative-AI use, eight times the prior year, and about 60% of declarations are for visual assets; declaring is voluntary.** Lambe 2025, "The Surprising New Number of GenAI Games on Steam", https://www.totallyhuman.io/blog/the-surprising-new-number-of-genai-games-on-steam. Implication: a record of exactly which inputs were admitted can back an honest disclosure.
5. **The SAG-AFTRA 2025 Interactive Media Agreement, ratified with 95% of the vote, requires consent, a reasonably specific description of use, pay, and usage reports for a performer's digital replica.** Smizer 2025, Frankfurt Kurnit Klein and Selz, https://ipandmedialaw.fkks.com/post/102ksuq/new-sag-aftra-2025-interactive-media-agreement-approved-by-members. Implication: an auditable, replayable log fits reporting duties; this matters for voice, not physics.
6. **Games six or more years old took 57% of playtime, twelve PC games take half of PC playtime, and console subscriptions grew 14.1% in 2024.** Newzoo 2025 via GameDev Reports, https://gamedevreports.substack.com/p/newzoo-pc-and-console-market-in-2025. Implication: long-lived games reward a simulation whose saves and replays keep working across patches.
7. **Roblox paid more than 23,500 creators in 2025 and shipped a generative 3D system; Fortnite puts 40% of net Item Shop revenue into a creator engagement pool.** Roblox Form 10-K FY2025, https://www.sec.gov/Archives/edgar/data/1315098/000131509826000024/rblx-20251231.htm; Epic Games, "Engagement Payout in Fortnite Creative", https://dev.epicgames.com/documentation/fortnite/engagement-payout-in-fortnite-creative. Implication: content with money attached needs content that can be checked; content validated at load is a trust feature.
8. **Photon Quantum, a deterministic predict-and-rollback engine, is sold on server-validated logic and stored replays; XGuardian is a server-side, explainable aim-assist cheat detector that needs only pitch and yaw as inputs.** Photon 2024, https://blog.photonengine.com/the-evolution-of-deterministic-multiplayer-photon-quantum-now-a-unity-verified-solution/; Zhang, Sun, and Qian 2026, "XGuardian", arXiv:2601.18068. Implication: replay as a check on match integrity is already a paid-for category.

### Lane E — web3 and games

9. **About 93% of GameFi projects are effectively dead, tokens are down about 95% from 2022 peaks, Axie Infinity fell from 2.7 million daily users to about 5,500, and more than 300 games shut down.** Reynolds 2026, CoinDesk on Caladan's analysis, https://www.coindesk.com/markets/2026/04/23/more-than-90-of-web3-games-failed-after-usd15-billion-boom-as-gamers-never-showed-up-caladan. Implication: a token economy brings no players.
10. **Daily active wallets fell 17% quarter on quarter in Q2 2025, funding fell 93% year on year to 73 million dollars, and nearly 75% of it went to infrastructure rather than studios.** Reynolds 2025, CoinDesk on DappRadar data, https://www.coindesk.com/web3/2025/07/11/web3-gaming-faces-ongoing-turmoil-market-metrics-reveal-persistent-decline. Implication: the remaining buyers are few and are infrastructure buyers.
11. **Lattice, maker of the MUD autonomous-world framework, could not reach a sustainable model, open-sourced its tools, and turned off its Redstone chain in May 2026.** Bitget News 2026, https://www.bitget.com/amp/news/detail/12560605366927. Implication: shared on-chain game state was not a business; MUD is an idea to learn from, not a market.
12. **ZKsync documents recording a player's actions, re-running a deterministic Rust game inside the SP1 zkVM, and checking the proof on-chain against the claimed score.** Schwartz 2025, "Build a ZK Game", https://code.zksync.io/tutorials/build-a-zk-game. Implication: seed, input log, and pinned binary are exactly this shape; the use is leaderboard and tournament integrity.
13. **The visible survivor keeps blockchain features fully optional, its wallet counts may be inflated by farming, and its real challenge is winning players on the game.** Dion 2024, Naavik, https://naavik.co/digest/off-the-grid-takes-on-the-shooter-market/. Implication: attributable records matter only behind a good game.
14. **Steam's onboarding rules still ban applications that issue or trade cryptocurrency or NFTs; Apple allows external NFT links and payments only on the US App Store after the Epic ruling.** Valve, https://partner.steamgames.com/doc/gettingstarted/onboarding; Faridi 2025, https://www.crowdfundinsider.com/2025/05/239239-apple-revises-app-store-guidelines-for-crypto-and-nfts-following-court-ruling/. Implication: anything issuing tokens is locked out of Steam; verification without a token passes everywhere.
15. **The SEC closed its Yuga Labs and OpenSea investigations with no charges; a Brazilian court ordered about 65 million dollars in loot-box damages and required disclosed odds, age verification, and refunds.** Coghlan 2025, https://cointelegraph.com/news/yuga-labs-sec-closed-investigation-nft-platform; Leite and Buzanovsky 2026, https://www.lickslegal.com/articles/brazil-s-first-loot-box-ruling-key-takeaways-for-digital-companies. Implication: an engine where every random outcome traces to a seed can prove its published odds, which regulators now ask for.
16. **The Content Authenticity Initiative's 2026 review lists phone and camera support for C2PA and no game platforms.** Parsons 2026, https://contentauthenticity.org/blog/the-state-of-content-authenticity-in-2026. Implication: provenance for generated content in games is an opening, not yet a requirement.

Not established by any retrievable source: a cross-game asset that shipped and lasted. The lane dropped the marketing claims it found.

## Step 4 — Verification

Every citation above is gated by `roleos verify-citations` before Step 5 counts; the receipt sits beside this file. Most sources are reports, filings, and vendor posts that the arXiv/Crossref oracle reports `unparsed`; they were retrieval-verified by the lanes.

## Step 5 — What the product aligns to

For the Director. Each line names the findings it rests on.

- **Hosts.** The first host is Godot, by GDExtension or the browser build; the second is Unreal. The engine stays a core that embeds, not a whole engine. (1, 2, 3)
- **Licence.** Keep the core permissively licensed; it is a feature buyers now weigh. (2)
- **Platforms.** PC and handheld PC first. (1, 6)
- **The model layer, described.** A model proposes, an author-written checker admits, and the admitted log is hashed. That is the honest description for a distrustful audience, and it backs a Steam disclosure and a usage report. (1, 4, 5)
- **What the hash is worth, and to whom.** Match integrity and replay verification are a paid category; provable odds under loot-box rulings are a compliance need; user content with payouts needs content that is checked. Those three are the buyers of a hashed, replayable, load-validated engine. (7, 8, 12, 15)
- **What it does not align to.** Tokens, NFTs, and autonomous worlds. The market is gone, Steam bans the issuance, and the leading engine company in that space closed. Any chain layer stays optional and outside the engine. (9, 10, 11, 13, 14)
- **An opening, not a requirement.** Provenance for generated content in games has no platform mandate yet; the admitted-input log is already the right record if one arrives. (4, 16)
