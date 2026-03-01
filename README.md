# Code Editor

A browser-based and desktop code editor powered by an AI coding agent via the [OpenClaw](https://github.com/openclaw/openclaw) gateway. Think Cursor, but with your own gateway-integrated agent.

```
┌──────────────┬──────────────────────────┬─────────────────┐
│  File Tree   │   Monaco Editor          │   Agent Panel   │
│              │   (multi-tab, themes)    │   (chat + diff) │
│  ⌘B toggle   │   ⌘K inline edit         │   ⌘J toggle     │
│              │   ⌘P quick open          │                 │
└──────────────┴──────────────────────────┴─────────────────┘
```

## Quick Start

### Web (Vercel)

Live at [editor.openknot.ai](https://editor.openknot.ai)

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm build        # production build (Vercel)
```

### Desktop (macOS)

```bash
pnpm install
pnpm tauri:dev    # opens native macOS window + hot reload
pnpm tauri:build  # builds .app + .dmg
```

> First Tauri build takes 2-5 minutes (compiling Rust deps). Subsequent builds are fast.

## Features

See [docs/FEATURES.md](docs/FEATURES.md) for the full feature list with current status and roadmap.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the technical architecture, data flow, and component map.

## Troubleshooting

See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for common issues and fixes.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘P` | Quick file open (fuzzy search) |
| `⌘K` | Inline edit at selection |
| `⌘B` | Toggle file explorer |
| `⌘J` | Toggle agent panel |
| `?` | Keyboard shortcuts overlay |
| `Enter` | Send message (in agent panel) |
| `Esc` | Close overlays |

## Tech Stack

- **Framework:** Next.js 16 + TypeScript
- **Styling:** Tailwind CSS v4 (CSS variables, no `@apply`)
- **Editor:** Monaco Editor (`@monaco-editor/react`)
- **Icons:** `@iconify/react` with Lucide icon set
- **Auth:** WorkOS AuthKit + gateway password
- **Desktop:** Tauri v2 (Rust + system WebKit)
- **Package Manager:** pnpm (always pnpm, never npm)

## License

Private — OpenKnots organization.
