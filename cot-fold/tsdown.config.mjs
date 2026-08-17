/**
 * Standalone build config for the cot-fold client bundle.
 *
 * Replicates the browser-half contract of packages/client/tsdown.client.ts:
 * a CJS closure-factory artifact handed to window.__ModuleLoader__.load(),
 * with externals resolved through the loader module table (platform modules
 * plus the documented runtime exemption). No CSS modules here — the plugin
 * injects its own stylesheet string, so no virtual-id CSS plugin is needed.
 */

const PACKAGE_ID = '@deepseek-ai/dsh-client-ui-cot-fold'

/** Platform seed entries + the runtime exemption (see packages/client/web/src/platform.ts). */
const CLIENT_EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
]

export default {
  name: `${PACKAGE_ID}/client`,
  entry: { client: 'src/client/index.tsx' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  external: CLIENT_EXTERNALS,
  noExternal: (id) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
    'import.meta.env.MODE': JSON.stringify('production'),
    'import.meta.env': JSON.stringify({ MODE: 'production' }),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
    footer: 'return module.exports; } });',
  },
}
