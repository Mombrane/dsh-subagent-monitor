/**
 * Self-contained tsdown build for the standalone plugin repository.
 *
 * - Node half  -> lib/index.js (ESM), imported by the DSH host Loader.
 * - Browser half -> lib/client.js (CJS closure), served by DSH at
 *   /plugins/<package-name>/client.js; the banner registers the factory
 *   with window.__ModuleLoader__ exactly like DSH's own client bundles.
 */
import { defineConfig, type UserConfig } from 'tsdown'

const ID = '@leetoners/dsh-ui-subagent-monitor'

/** Platform modules the DSH web loader answers at runtime: they must stay external. */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  // The loader table answers this specifier natively (snapshot-store exemption).
  '@deepseek-ai/dsh-client-runtime/client',
]

const nodeHalf: UserConfig = {
  name: ID,
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  clean: false,
  dts: false,
  fixedExtension: false,
}

const clientHalf: UserConfig = {
  name: `${ID}/client`,
  entry: { client: 'src/client/index.ts' },
  outDir: 'lib',
  format: ['cjs'],
  platform: 'browser',
  sourcemap: true,
  clean: false,
  dts: false,
  external: PLATFORM_MODULES,
  noExternal: (id: string) => (PLATFORM_MODULES.includes(id) ? undefined : true),
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'import.meta.env.MODE': JSON.stringify('production'),
    'import.meta.env': JSON.stringify({ MODE: 'production' }),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default defineConfig([nodeHalf, clientHalf])
