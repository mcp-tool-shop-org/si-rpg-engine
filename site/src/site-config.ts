import type { SiteConfig } from '@mcptoolshop/site-theme';

export const config: SiteConfig = {
  title: 'si-rpg-engine',
  description: 'A simulation core for 3D worlds that replays exactly: physics in Rust compiled to WebAssembly, a fingerprint of the world after every step, and the same answer on every engine and every machine.',
  logoBadge: 'SI',
  brandName: 'si-rpg-engine',
  repoUrl: 'https://github.com/mcp-tool-shop-org/si-rpg-engine',
  footerText: 'MIT Licensed — built by <a href="https://mcp-tool-shop.github.io/" style="color:var(--color-muted);text-decoration:underline">MCP Tool Shop</a>',

  hero: {
    badge: 'Open source · MIT · 0.1.0',
    headline: 'A 3D physics world',
    headlineAccent: 'that replays exactly.',
    description: 'si-rpg-engine steps physics at a fixed 64 steps per second, records a fingerprint of the world after every step, and can rebuild any run from its starting seed and the inputs it accepted, bit for bit. The physics is Rust compiled to WebAssembly, and the same build gives the same answer in the JavaScript engines behind Chrome, Firefox, and Safari, and on both x64 and ARM processors.',
    primaryCta: { href: 'https://github.com/mcp-tool-shop-org/si-rpg-engine', label: 'View on GitHub' },
    secondaryCta: { href: 'handbook/', label: 'Read the Handbook' },
    previews: [
      { label: 'Check it', code: 'npm ci && npm run verify' },
      { label: 'Replay a run', code: 'npx play proposals.json --log out.json && npx replay out.json' },
      { label: 'Load a world', code: 'npx load world worlds/crate-and-door.json' },
    ],
  },

  sections: [
    {
      kind: 'features',
      id: 'features',
      title: 'What it guarantees',
      subtitle: 'Each of these is checked by the test suite on every commit.',
      features: [
        { title: 'The same answer everywhere', desc: 'One build of the physics produces the same fingerprint in V8, SpiderMonkey, and JavaScriptCore, and on x64 and ARM64. The build fails if any of them disagrees.' },
        { title: 'Exact replay', desc: 'A run is its starting seed plus the inputs that were accepted. Replaying them rebuilds every step, and when two runs differ, the tools name the first step, body, and value where they part. A failing check saves one file that reproduces the failure with a single command.' },
        { title: 'Save and restore', desc: 'Restore a world by replaying its inputs, or by copying the physics module\'s memory and putting it back. Both are tested to continue exactly as the original run did.' },
        { title: 'Real 3D physics', desc: 'Boxes fall, slide, stack, tip, and tumble; a character climbs steps and slopes and walks over terrain. The physics is the Rapier engine in its deterministic mode, compiled to one WebAssembly file with a pinned checksum.' },
        { title: 'Worlds explored before they run', desc: 'Before a world is admitted, the engine explores every state its characters can reach with the actions it allows. A zone nothing can reach, or a body pushed out of the world, is refused with a recording that reproduces it.' },
        { title: 'Content checked before it runs', desc: 'World files and new character actions are validated when they load. A file that fails is rejected with the reason, and the running world does not change.' },
        { title: 'AI suggests, rules decide', desc: 'A language model can suggest what a character does or comes to believe, only through a role the engine declares. Hand-written rules hold each suggestion to what its role allows and check it against the world as it is when it arrives, and every call to the model is recorded, so a run replays without it.' },
      ],
    },
    {
      kind: 'code-cards',
      id: 'usage',
      title: 'Try it',
      subtitle: 'You need Node 20 or newer and the Rust toolchain. Every command explains itself with --help.',
      cards: [
        { title: 'Build and check', lang: 'bash', code: 'git clone https://github.com/mcp-tool-shop-org/si-rpg-engine.git\ncd si-rpg-engine\nnpm ci\nnpm run verify' },
        { title: 'Record and replay a run', lang: 'bash', code: 'npx play proposals.json --seed 7 --log out.json\nnpx replay out.json' },
        { title: 'Load a world and watch it', lang: 'bash', code: 'npx load world worlds/crate-and-door.json\nnpx host --world worlds/crate-and-door.json\n# then open http://127.0.0.1:4173' },
      ],
    },
  ],
};
