// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://mcp-tool-shop-org.github.io',
  base: '/si-rpg-engine',
  integrations: [
    starlight({
      title: 'si-rpg-engine',
      logo: {
        src: './src/assets/logo.png',
        alt: 'si-rpg-engine',
        href: '/si-rpg-engine/',
        replacesTitle: false,
      },
      description: 'A deterministic, hashed, replayable 3D simulation engine: a fixed-timestep tick with a Rust-to-WebAssembly physics law, content validated at load, and a checker that admits what a model proposes.',
      disable404Route: true,
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/mcp-tool-shop-org/si-rpg-engine' },
      ],
      sidebar: [
        {
          label: 'Handbook',
          items: [{ autogenerate: { directory: 'handbook' } }],
        },
      ],
      customCss: ['./src/styles/starlight-custom.css'],
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
