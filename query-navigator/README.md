# @khalilhsu/dsh-ui-query-navigator

[![npm version](https://img.shields.io/npm/v/@khalilhsu/dsh-ui-query-navigator.svg)](https://www.npmjs.com/package/@khalilhsu/dsh-ui-query-navigator)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)

An independent DSH web UI plugin that adds a Codex-style left query rail to multi-turn conversations.

---

## 🚀 Installation & Uninstallation

### 1. Install (via npm)

```sh
# Add the plugin to your Harness web profile
dsh plugin --profile web add @khalilhsu/dsh-ui-query-navigator

# Restart dsh web and refresh your browser
dsh web
```

### 2. Uninstall

```sh
dsh plugin --profile web remove @khalilhsu/dsh-ui-query-navigator
```

---

## ✨ Features & Behavior

- **Full-Session Turn Rail**: One marker per user query across the entire conversation, including unloaded older turns.
- **Scroll-Aware Highlight**: The marker nearest the viewport reading line is automatically highlighted as you scroll.
- **Click to Jump & On-Demand Pagination**: Click any marker to scroll to its query; unloaded turns are paged in on demand.
- **Hover Preview & Smart Excerpt**: Lightweight Host projection provides 80-character excerpts plus image count badges for all turns without downloading heavy assistant history.
- **Session Header Toggle**: Header button (`Query 导航`) toggles the navigation rail on/off globally, persisted in `localStorage`.
- **Clean Fallback**: Hidden when there is only one query or no transcript overflow.

---

## 🏗️ Composition and Data Boundaries

The plugin contributes through DSH's declared `conversation.input.dock` (for the rail) and `conversation.session.header.actions` (for the toggle) slots and portals only its visual overlay. It reads the session's already-materialized chat snapshot plus stable `data-chat-*` DOM anchors. It does not replace `ui-conversation`, mutate message rows, write session events, or touch `~/.dsh/sessions`.

It is **fully standalone** and works with any conversation plugin that declares the `conversation.input.dock` slot, including the stock `ui-conversation` and `@khalilhsu/dsh-ui-conversation-folded`.

---

## 🛠️ Build from Source

```bash
# 1. Symlink dependencies from a DeepSeek Harness checkout
ln -s /path/to/deepseek-harness/packages/client/ui-conversation/node_modules node_modules

# 2. Run tests and typecheck
npm test
npm run typecheck

# 3. Build client & host bundles
npm run bundle

# 4. Add local package to profile
dsh plugin --profile web add /path/to/query-navigator
```

The built browser entry is `lib/client.js`; DSH serves that artifact through its client module loader.

---

## License

[MIT](../LICENSE)
