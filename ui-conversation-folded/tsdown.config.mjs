/**
 * Standalone build for the ui-conversation-folded fork.
 *
 * Replicates packages/client/tsdown.client.ts for BOTH halves:
 *  - node half: lib/index.js + lib/invariant.js (esm, host loader imports it);
 *  - browser half: lib/client.js — the closure-factory artifact handed to
 *    window.__ModuleLoader__.load(), externals resolved through the loader
 *    module table, CSS Modules compiled by lightningcss and inlined with a
 *    <style data-plugin> tag, and a bundle purity gate that forbids
 *    cross-plugin value imports outside the platform/exempt set.
 */

import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { existsSync, realpathSync } from 'node:fs'
import { basename, dirname, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

/**
 * Resolve lightningcss from whichever DSH checkout is on disk, without
 * hardcoding a machine-specific absolute path. Order:
 *   1. normal node resolution (works when this config sits inside a DSH
 *      checkout, or the local node_modules chain provides the package);
 *   2. $DSH_ROOT/node_modules (explicit knob for standalone builds);
 *   3. the realpath of this directory's node_modules symlink (points into
 *      the DSH checkout per the README setup), walking up from there;
 *   4. walk up from cwd (tsdown invoked from inside the DSH checkout);
 *   5. walk up from this config file's directory.
 */
function findLightningcssRoot() {
  const starts = []
  if (process.env.DSH_ROOT) starts.push(resolvePath(process.env.DSH_ROOT))
  const here = dirname(fileURLToPath(import.meta.url))
  try {
    starts.push(realpathSync(join(here, 'node_modules')))
  } catch {
    // symlink not present (fresh clone) — skip
  }
  starts.push(process.cwd(), here)
  for (const start of starts) {
    let dir = start
    for (;;) {
      if (existsSync(join(dir, 'node_modules', 'lightningcss'))) return dir
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
  }
  return null
}

let transform
try {
  ;({ transform } = require('lightningcss'))
} catch {
  const root = findLightningcssRoot()
  if (root === null) {
    throw new Error(
      'lightningcss not found. Run tsdown from inside the DSH checkout, ' +
        'or set DSH_ROOT=/path/to/DSH, or install lightningcss next to this config.',
    )
  }
  ;({ transform } = createRequire(join(root, 'noop.cjs'))('lightningcss'))
}

const PACKAGE_ID = '@khalilhsu/dsh-ui-conversation-folded'

/** Platform seed entries + the runtime exemption (packages/client/web/src/platform.ts). */
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

/** Wire/type layers a client bundle may inline (mirror of the repo gate). */
const INLINE_SAFE = /^@deepseek-ai\/dsh-(host-apiproxy|session|llm|tools|brand)(\/|$)/
const VENDORED_LIBRARY = /^@deepseek-ai\/(cosmokit|schemastery)(\/|$)/
const GENERATED_REMOTE = /^@deepseek-ai\/dsh-[a-z0-9]+(?:-[a-z0-9]+)*\/remote$/

const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

function cssModulesPlugin() {
  return {
    name: 'dsh-css-modules-inline',
    resolveId(source, importer) {
      if (!source.endsWith('.module.css')) return null
      const abs = importer !== undefined ? resolvePath(dirname(importer), source) : source
      return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
    },
    async load(virtualId) {
      if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
      const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
      this.addWatchFile(fileId)
      const source = await readFile(fileId)
      const { code, exports: cssExports } = transform({
        filename: fileId,
        code: source,
        cssModules: { pattern: '[hash]_[local]' },
        minify: true,
      })
      const classMap = {}
      for (const [local, exp] of Object.entries(cssExports ?? {})) classMap[local] = exp.name
      const tagId = `${PACKAGE_ID}/${basename(fileId)}`
      return [
        `const css = ${JSON.stringify(code.toString())};`,
        `const tagId = ${JSON.stringify(tagId)};`,
        'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
        '  const tag = document.createElement(\'style\');',
        `  tag.dataset.plugin = ${JSON.stringify(PACKAGE_ID)};`,
        '  tag.dataset.pluginCss = tagId;',
        '  tag.textContent = css;',
        '  document.head.appendChild(tag);',
        '}',
        `export default ${JSON.stringify(classMap)};`,
      ].join('\n')
    },
  }
}

function purityGate() {
  return {
    name: 'dsh-client-bundle-purity',
    resolveId(source) {
      if (!source.startsWith('@deepseek-ai/')) return null
      if (CLIENT_EXTERNALS.includes(source)) return null
      if (VENDORED_LIBRARY.test(source)) return null
      if (INLINE_SAFE.test(source) || GENERATED_REMOTE.test(source)) return null
      throw new Error(
        `client bundle purity: "${source}" is not a platform module, an inline-safe wire layer, or a generated /remote contribution`,
      )
    },
  }
}

/** Node half: host loader entry + invariant companion. */
const nodeHalf = {
  name: PACKAGE_ID,
  entry: { index: 'src/index.ts', invariant: 'src/invariant.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  clean: false,
  // The host resolves every @deepseek-ai/* import from the profile's
  // node_modules at runtime; nothing of this package's own must inline them.
  external: [/^@deepseek-ai\//],
}

/** Browser half: closure-factory client bundle. */
const clientHalf = {
  name: `${PACKAGE_ID}/client`,
  entry: { client: 'src/client/index.ts' },
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
  plugins: [purityGate(), cssModulesPlugin()],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
    footer: 'return module.exports; } });',
  },
}

export default [nodeHalf, clientHalf]
