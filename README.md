# DSH Plugins

[![npm version](https://img.shields.io/npm/v/@khalilhsu/dsh-ui-conversation-folded.svg)](https://www.npmjs.com/package/@khalilhsu/dsh-ui-conversation-folded)
[![npm version](https://img.shields.io/npm/v/@khalilhsu/dsh-ui-query-navigator.svg)](https://www.npmjs.com/package/@khalilhsu/dsh-ui-query-navigator)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

UI-only plugins for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) Web GUI. Installed cleanly through the official Profile-Plugin mechanism (`dsh plugin`) without modifying upstream Harness source code.

---

## 📦 Packages

| Directory | Package | Status | What it does |
|---|---|---|---|
| [`ui-conversation-folded/`](./ui-conversation-folded) | [`@khalilhsu/dsh-ui-conversation-folded`](https://www.npmjs.com/package/@khalilhsu/dsh-ui-conversation-folded) | **Active** | **Per-turn folding for chat**: Each round's intermediate activity (thinking / CoT, tool calls, in-between narration) is neatly folded into a bounded 288px scroller. Final conclusion text and turn metrics stay outside and visible. Supports streaming auto-scroll, auto-collapse on summary, and global toggle. |
| [`query-navigator/`](./query-navigator) | [`@khalilhsu/dsh-ui-query-navigator`](https://www.npmjs.com/package/@khalilhsu/dsh-ui-query-navigator) | **Active** | **Codex-style multi-turn query navigator**: A fixed left-rail with one marker per user query. Highlights the active turn on scroll, click to jump, hover to preview. Supports on-demand loading of unloaded older turns. Fully standalone — works with any conversation plugin. |
| `cot-fold/` | `@deepseek-ai/dsh-client-ui-cot-fold` | Archived | Early experiment: capped/collapsed reasoning ("Think") rows only. Superseded by `ui-conversation-folded`. |

---

## 🚀 Quick Start (Install & Uninstall)

### Install via npm (Recommended)

Run from your DeepSeek Harness environment:

```sh
# Per-turn folding
dsh plugin --profile web add @khalilhsu/dsh-ui-conversation-folded

# Query navigator (can be installed independently or together)
dsh plugin --profile web add @khalilhsu/dsh-ui-query-navigator

# Restart `dsh web`, then refresh your browser
dsh web
```

### Uninstall

```sh
dsh plugin --profile web remove @khalilhsu/dsh-ui-conversation-folded
dsh plugin --profile web remove @khalilhsu/dsh-ui-query-navigator
```

---

## 💡 Key Features (`ui-conversation-folded`)

- **Bounded Height Frame**: Intermediate thought processes and tool calls are capped at `288px` (configurable via `--cot-fold-max-height`) with internal scroll.
- **Collapsible Summary Bar**: Each turn displays an expandable summary bar with `Duration · Tool count · Thinking blocks`.
- **Streaming-Aware Follow**: Auto-scrolls to the newest tokens/tool outputs while generating. Pauses when scrolling up; resumes when back at the bottom.
- **Auto Collapse on Completion**: Gracefully auto-collapses intermediate reasoning once the final answer begins streaming.
- **Questions Stay Visible**: `ask_user_question` rows render outside the fold as interaction boundaries so pending "提问·等待回答" rows are never hidden.
- **Global Header Toggle**: Persistent on/off toggle button (`思考折叠` / `思考展开`) in the session header (persisted in `localStorage`).
- **Standard Attachment Slots**: Fully aligned with DSH attachment slot contracts for message galleries and composer attachments.
- **Zero Loss of Interaction**: All child interactions (inspect tool output, expand individual tools, markdown copying) remain 100% functional.

---

## 💡 Key Features (`query-navigator`)

- **Full-Session Turn Rail**: One marker per user query across the entire conversation, including unloaded older turns.
- **Scroll-Aware Highlight**: The marker nearest the viewport reading line is automatically highlighted as you scroll.
- **Click to Jump & On-Demand Pagination**: Click any marker to scroll to its query; unloaded turns are paged in on demand.
- **Hover Preview & Smart Excerpt**: Lightweight Host projection provides 80-character excerpts plus image count badges for all turns without downloading heavy assistant history.
- **Global Header Toggle**: Persistent on/off toggle button (`Query 导航`) in the session header (persisted in `localStorage`).
- **Fully Standalone**: Works with any conversation plugin that declares the `conversation.input.dock` slot — no dependency on other plugins in this repo.

---

## 🛠️ Local Development & Build

If you want to build or modify the plugin locally from source:

```sh
git clone https://github.com/KhalilHsu/dsh-plugins.git
cd dsh-plugins/ui-conversation-folded  # or query-navigator

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
