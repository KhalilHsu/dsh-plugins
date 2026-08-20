# DSH Query Navigator

An independent DSH web UI plugin that adds a Codex-style left query rail to multi-turn conversations.

## Behavior

- One marker per loaded ordinary user Query (`kind: user`). Steering and injected context are excluded.
- The marker nearest the reading line is highlighted as the transcript scrolls.
- Click a marker to scroll to its Query; hover or focus it to preview the Query text.
- The rail is hidden for fewer than two Queries or when the transcript has no overflow.
- Long conversations keep every loaded Query available in a compact scrollable rail.

## Composition and data boundaries

The plugin contributes through DSH's declared `conversation.input.dock` slot and portals only its visual overlay. It reads the session's already-materialized chat snapshot plus the stable `data-chat-*` DOM anchors. It does not replace `ui-conversation`, mutate message rows, write session events, or touch `~/.dsh/sessions`.

It works with any conversation plugin that declares the `conversation.input.dock` slot, including the stock `ui-conversation` and `@khalilhsu/dsh-ui-conversation-folded`.

## Build

The local `node_modules` symlink may point at a compatible DSH client package's `node_modules` directory. The scripts use the sibling DSH checkout's root binaries while resolving runtime packages from that client package.

```bash
pnpm run test
pnpm run typecheck
pnpm run bundle
```

The built browser entry is `lib/client.js`; DSH serves that artifact through its client module loader.

## Known limitations

- The Host projects an 80-character preview of the first human Query in every Turn; unloaded turns show that lightweight preview and load only the required older pages when clicked.
- Query navigation relies on DSH's documented conversation scrollport and stable chat anchor attributes.
