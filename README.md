# DSH Plugins

[![npm version](https://img.shields.io/npm/v/@khalilhsu/dsh-ui-conversation-folded.svg)](https://www.npmjs.com/package/@khalilhsu/dsh-ui-conversation-folded)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

UI-only plugins for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) Web GUI. Installed cleanly through the official Profile-Plugin mechanism (`dsh plugin`) without modifying upstream Harness source code.

---

## 📦 Packages

| Directory | Package | Status | What it does |
|---|---|---|---|
| [`ui-conversation-folded/`](./ui-conversation-folded) | [`@khalilhsu/dsh-ui-conversation-folded`](https://www.npmjs.com/package/@khalilhsu/dsh-ui-conversation-folded) | **Active** | **Per-turn folding for chat**: Each round's intermediate activity (thinking / CoT, tool calls, in-between narration) is neatly folded into a bounded 288px scroller. Final conclusion text and turn metrics stay outside and visible. Supports streaming auto-scroll, auto-collapse on summary, and global toggle. |
| `cot-fold/` | `@deepseek-ai/dsh-client-ui-cot-fold` | Archived | Early experiment: capped/collapsed reasoning ("Think") rows only. Superseded by `ui-conversation-folded`. |

---

## 🚀 Quick Start (Install & Uninstall)

### Install via npm (Recommended)

Run from your DeepSeek Harness environment:

```sh
# 1. Add the plugin to your web profile
dsh plugin --profile web add @khalilhsu/dsh-ui-conversation-folded

# 2. Restart `dsh web`, then refresh your browser
dsh web
```

### Uninstall

```sh
dsh plugin --profile web remove @khalilhsu/dsh-ui-conversation-folded
```

---

## 💡 Key Features (`ui-conversation-folded`)

- **Bounded Height Frame**: Intermediate thought processes and tool calls are capped at `288px` (configurable via `--cot-fold-max-height`) with internal scroll.
- **Collapsible Summary Bar**: Each turn displays an expandable summary bar with `Duration · Tool count · Thinking blocks`.
- **Streaming-Aware Follow**: Auto-scrolls to the newest tokens/tool outputs while generating. Pauses when scrolling up; resumes when back at the bottom.
- **Auto Collapse on Completion**: Gracefully auto-collapses intermediate reasoning once the final answer begins streaming.
- **Global Header Toggle**: Persistent on/off toggle button (`思考折叠` / `思考展开`) in the session header (persisted in `localStorage`).
- **Zero Loss of Interaction**: All child interactions (inspect tool output, expand individual tools, markdown copying) remain 100% functional.

---

## 🛠️ Local Development & Build

If you want to build or modify the plugin locally from source:

```sh
git clone https://github.com/KhalilHsu/dsh-plugins.git
cd dsh-plugins/ui-conversation-folded

# Symlink node_modules to your local deepseek-harness checkout
ln -s /path/to/deepseek-harness/packages/client/ui-conversation/node_modules node_modules

# Build the client & node bundles
npm run bundle

# Install locally into your profile
dsh plugin --profile web add /path/to/dsh-plugins/ui-conversation-folded
```

---

## License

[MIT](LICENSE)
