# @khalilhsu/dsh-ui-conversation-folded

[![npm version](https://img.shields.io/npm/v/@khalilhsu/dsh-ui-conversation-folded.svg)](https://www.npmjs.com/package/@khalilhsu/dsh-ui-conversation-folded)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

UI-only fork of `@deepseek-ai/dsh-client-ui-conversation` for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Folds each round's assistant activity — intermediate CoT ("Think" rows), tool calls, and in-between narration — into a bounded, scrollable container per turn.

---

## 🚀 Installation & Uninstallation

### 1. Install (via npm)

```sh
# Add the plugin to your Harness web profile
dsh plugin --profile web add @khalilhsu/dsh-ui-conversation-folded

# Restart dsh web and refresh your browser
dsh web
```

### 2. Uninstall

```sh
dsh plugin --profile web remove @khalilhsu/dsh-ui-conversation-folded
```

---

## ✨ Features & Behavior

| Feature | Description |
|---|---|
| **Bounded Height** | Scroll area for intermediate actions is capped at `--cot-fold-max-height` (default `288px`) with an internal scrollbar. |
| **Fold & Unfold** | Slim clickable bar with 收起 / 展开 showing `N tool calls · M thinking · duration`. |
| **Streaming Auto-Scroll** | Follows the newest tokens/tool outputs while running; scrolling up pauses follow, returning to bottom resumes it. |
| **Auto-Collapse on Final** | Automatically collapses the fold once the final closing response begins streaming. |
| **Session Toggle** | Header button (`思考折叠` / `思考展开`) turns the fold behavior on/off globally, saved in `localStorage`. |
| **Full Interaction Preserved** | Inspecting tool calls, per-tool expansion, code copying, and markdown features work unchanged. |

---

## 🏗️ Architecture: Why a replacement fork?

The chat flow in DSH is a keyed React list (`order.map(nodeKey => <ChatNodeSeat/>)`). Wrapping individual rows via DOM mutation plugins breaks React's reconciliation during paging, older message prepend, and compaction markers.

The fold is therefore implemented directly inside `ChatView` as a React-level turn grouping. This fork is registered via `patch.yml` to replace the default `ui-conversation` package seamlessly.

```
patch.yml            disables shipped ui-conversation, injects this fork
src/client/chat/
  ChatView.tsx       turn segmentation (slots: plain rows vs fold units)
  TurnFold.tsx       the fold: bar + capped scroller + running auto-scroll
  CotFoldToggle.tsx  session-header on/off switch
  fold-store.ts      preference state (useSyncExternalStore)
  ChatView.module.css
```

---

## 🛠️ Build from Source

```sh
# 1. Symlink dependencies from a DeepSeek Harness checkout
ln -s /path/to/deepseek-harness/packages/client/ui-conversation/node_modules node_modules

# 2. Build client & host bundles
#    lightningcss is resolved dynamically (no hardcoded machine path): the
#    symlink above points into the checkout, so `npm run bundle` works as-is;
#    alternatively set DSH_ROOT=/path/to/deepseek-harness or run tsdown from
#    inside the checkout.
npm run bundle

# 3. Add local package to profile
dsh plugin --profile web add /path/to/ui-conversation-folded
```

---

## License

MIT
