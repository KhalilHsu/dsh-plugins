# dsh-client-ui-cot-fold

UI-only client plugin for the DeepSeek Harness Web GUI: fold the assistant's
chain-of-thought (CoT / the "Think" disclosure rows) so long reasoning never
paints an unbounded wall of text.

## What it does (UI only — no capability changes)

1. **最大高度 (max height)** — an expanded Think body is capped at
   `--cot-fold-max-height` (default `288px`) with an internal scrollbar.
2. **支持收起 (collapse)** — bodies long enough to scroll get a floating
   "收起 / Collapse" chip that collapses the whole Think row back to its
   one-line summary (it clicks the row's own disclosure toggle, so React
   state stays consistent).
3. **On/off toggle** — a "思考折叠" button in each session's header
   switches the fold on/off. The choice persists in `localStorage`
   (`dsh.cotFold`, default on) and applies from first paint.

## Install

From the checkout of this package:

```sh
dsh plugin --profile web add /path/to/cot-fold
```

Then restart the web GUI (`dsh web`) so the host Loader picks up the new
composition row. The plugin appears as `ui-cot-fold` in the host tree; its
browser bundle is served at `/plugins/@deepseek-ai/dsh-client-ui-cot-fold/client.js`.

## Build

```sh
# node half is committed as lib/index.js (empty apply).
# browser bundle:
node /path/to/dsh/node_modules/.bin/tsdown --config tsdown.config.mjs
```

The bundle is a closure-factory artifact for the GUI's module loader; externals
resolve through the loader's module table.

## Uninstall

```sh
dsh plugin --profile web remove @deepseek-ai/dsh-client-ui-cot-fold
```
