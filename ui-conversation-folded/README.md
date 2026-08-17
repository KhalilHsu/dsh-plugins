# dsh-client-ui-conversation-folded

UI-only fork of `@deepseek-ai/dsh-client-ui-conversation` that folds each
round's assistant activity — every CoT ("Think" rows), tool call, and the turn
tail — into one bounded, scrollable container per turn.

## What changes (and what doesn't)

| | |
|---|---|
| 最大高度 | each turn's scroll area is capped at `--cot-fold-max-height` (default `288px`) with an internal scrollbar — like an iframe; a single tool call taller than the cap scrolls inside the frame |
| 支持收起 | every turn has a slim bar with 收起 / 展开; the collapsed bar shows a `N tool calls · M thinking` summary |
| 生成中自动滚动 | while the turn is running, the container auto-scrolls to the newest messages / tool calls; scrolling up inside pauses the follow, scrolling back to the bottom resumes it |
| 交互保留 | the same node renderers render inside the fold — per-tool expand/collapse, details, inspect, markdown, images all work unchanged |
| 总开关 | a session-header button (思考折叠 / 思考展开) turns the whole fold on/off; persisted in `localStorage` (`dsh.cotFold`), default on |

Everything else in the conversation surface (composer, input machine, details,
commands, settings, trajectory tab, …) is byte-for-byte the shipped package.

## Why a fork

The chat flow is a keyed React list (`order.map(nodeKey => <ChatNodeSeat/>)`).
Wrapping its rows in DOM containers from a side plugin would break React's
commit on reorders (load-older prepends, compaction markers). The fold is
therefore implemented *inside* `ChatView` as a React-level grouping — safe by
construction. This fork is the UI-only delivery vehicle for that change.

## Layout

```
patch.yml            disables the shipped ui-conversation row, inserts this fork
src/client/chat/
  ChatView.tsx       turn segmentation (slots: plain rows vs fold units)
  TurnFold.tsx       the fold: bar + capped scroller + running auto-scroll
  CotFoldToggle.tsx  session-header on/off switch
  fold-store.ts      preference state (useSyncExternalStore)
  ChatView.module.css turnFold* + cotFoldToggle styles
```

## Build & install

```sh
# build (node half + client bundle)
/Users/bytedance/Desktop/DSH/node_modules/.bin/tsdown --config tsdown.config.mjs

# install into the web profile, then restart `dsh web`
dsh plugin --profile web add /path/to/ui-conversation-folded
```

The `node_modules` symlink inside this directory points at the original
package's dependency set (identical dependency surface, resolved from the
repo); the client bundle keeps the module-table externals contract.

## Uninstall

```sh
dsh plugin --profile web remove @deepseek-ai/dsh-client-ui-conversation-folded
```
