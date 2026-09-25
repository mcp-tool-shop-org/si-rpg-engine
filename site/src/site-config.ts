import type { SiteConfig } from '@mcptoolshop/site-theme';

export const config: SiteConfig = {
  title: 'si-rpg-engine',
  description: 'A deterministic, hashed, replayable 3D simulation engine: a fixed-timestep tick with a Rust-to-WebAssembly physics law, content validated at load, and a checker that admits what a model proposes.',
  logoBadge: 'SI',
  brandName: 'si-rpg-engine',
  repoUrl: 'https://github.com/mcp-tool-shop-org/si-rpg-engine',
  footerText: 'MIT Licensed — built by <a href="https://mcp-tool-shop.github.io/" style="color:var(--color-muted);text-decoration:underline">MCP Tool Shop</a>',

  hero: {
    badge: 'Open source · 0.1.0',
    headline: 'A world two machines agree about.',
    headlineAccent: 'Byte for byte.',
    description: 'A deterministic, hashed, replayable 3D simulation engine. A fixed-timestep tick, every quantum hashed, the physics law in Rust compiled to one WebAssembly binary, content validated at load, and a checker that admits what a model proposes. Three JavaScript engines print the same hash on every commit.',
    primaryCta: { href: 'https://github.com/mcp-tool-shop-org/si-rpg-engine', label: 'View on GitHub' },
    secondaryCta: { href: 'handbook/', label: 'Read the Handbook' },
    previews: [
      { label: 'Verify', code: 'npm ci && npm run verify' },
      { label: 'Replay', code: 'npx play proposals.json --log out.json && npx replay out.json' },
      { label: 'Admit', code: 'npx load world worlds/crate-and-door.json' },
    ],
  },

  sections: [
    {
      kind: 'features',
      id: 'features',
      title: 'What holds',
      subtitle: 'Every claim here is a test on main.',
      features: [
        { title: 'One hash, three engines', desc: 'V8, SpiderMonkey, and JavaScriptCore print the same product golden and the same arithmetic golden on every commit. The arithmetic golden has not moved since the first harness.' },
        { title: 'The law in Rust', desc: 'The physics step is a Rust crate on rapier3d-f64 with enhanced determinism, compiled to one WebAssembly binary, pinned by the SHA-256 of its Linux build and rebuilt in CI.' },
        { title: 'Replay from seed and log', desc: 'A play writes the seed and the admitted inputs. Replay reruns them and fails on the first hash that differs. Nothing else is needed to rebuild a world.' },
        { title: 'Content refused with a reason', desc: 'World files, verb drafts, and play logs are validated at load against hazard suites. Twelve load refusals are each a test. A refused file changes nothing.' },
        { title: 'A checker, not a model, decides', desc: 'A language model may propose intents, beliefs, and bodies. A hand-authored predicate admits or refuses each one. The model never commits.' },
        { title: 'Minds that cite their evidence', desc: 'A body may carry a mind. Sight writes beliefs that cite the episode they came from; supersession is a tombstone; a write on older evidence is refused with both episodes named.' },
      ],
    },
    {
      kind: 'code-cards',
      id: 'usage',
      title: 'Use it',
      subtitle: 'Six commands, each answering --help.',
      cards: [
        { title: 'Play and replay', lang: 'bash', code: 'npx play proposals.json --seed 7 --log out.json\nnpx replay out.json\n# replay ok: 640 hashes' },
        { title: 'Admit a world', lang: 'bash', code: 'npx load world worlds/crate-and-door.json\n# f0fa75010a65e41b admitted\nnpx host --world worlds/crate-and-door.json\n# debug view at http://127.0.0.1:4173' },
        { title: 'Admit a verb', lang: 'bash', code: 'npx load admit fixtures/climb-draft.json\n# admitted climb\nnpx load retire climb\n# retired climb' },
      ],
    },
  ],
};
