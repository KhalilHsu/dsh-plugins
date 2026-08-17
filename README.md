# DSH Plugins

UI-only plugins for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
Web GUI. Installed through the standard profile-plugin mechanism; the official
Harness checkout stays untouched.

## Packages

| Directory | Package | Status | What it does |
|---|---|---|---|
| `ui-conversation-folded/` | `@deepseek-ai/dsh-client-ui-conversation-folded` | **current** | Replaces the chat view with per-turn folding: each round's intermediate attempts (thinking, tool calls, in-between narration) live in a bounded, collapsible 288px scroller; the turn's final summary text, and the tail row (copy / like-dislike / timing) stay outside, fully visible. Streaming-aware: auto-scroll + bottom/top fade while generating, auto-collapse when the closing message starts, full-height expand once the turn is done. |
| `cot-fold/` | `@deepseek-ai/dsh-client-ui-cot-fold` | archived | Early experiment: capped/collapsed reasoning ("Think") rows only. Superseded by `ui-conversation-folded`. Kept for history. |

## Why a fork (replacement), not an additive plugin

The fold must regroup the chat flow's React-rendered rows, which no slot
extension point exposes. The shipped chat (`ui-conversation`) is therefore
replaced: the profile patch disables the original row and inserts this fork,
which registers the same conversation slots with the folding `ChatView`.

## Install

```sh
# from a DeepSeek Harness checkout whose `dsh` CLI is built:
dsh plugin --profile web add /path/to/dsh-plugins/ui-conversation-folded
# restart `dsh web`, then refresh the browser
```

The patch (`patch.yml`) disables `ui-conversation` and inserts the fork under
entry id `ui-conversation-folded`. Uninstall:

```sh
dsh plugin --profile web remove @deepseek-ai/dsh-client-ui-conversation-folded
```

## Build

Each package needs the Harness checkout's toolchain (`tsdown`) and its
node_modules (the package `node_modules` is a workspace link into the checkout
— see the build config's comments).

```sh
cd ui-conversation-folded
/Users/<you>/path/to/deepseek-harness/node_modules/.bin/tsdown --config tsdown.config.mjs
```

`lib/` is git-ignored; rebuild it after cloning on a new machine.

## Development on a new machine

```sh
git clone git@github.com:<you>/dsh-plugins.git
cd dsh-plugins/ui-conversation-folded
# point node_modules at the Harness checkout (see tsdown.config.mjs):
ln -s /path/to/deepseek-harness/packages/client/ui-conversation/node_modules node_modules
# build, then install into the profile as above
```

## Layout notes

- `ui-conversation-folded/src/client/chat/ChatView.tsx` — turn segmentation
  (plain rows vs fold units vs the closing summary), turn-tail boundaries,
  closing-based summary extraction, per-portion timing.
- `ui-conversation-folded/src/client/chat/TurnFold.tsx` — the fold component:
  clickable summary bar (duration · tool calls · thinking), full-width
  divider, phase-aware height (288px while generating, full when done),
  auto-scroll, bottom/top fades, auto-collapse on the final message.
- `ui-conversation-folded/patch.yml` — the replacement patch.
