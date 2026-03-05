# Changelog

## [1.1.0] — 2026-03-05

### Added
- **OpenClaw Dev persona** — Docs-aware ecosystem agent preset in Agent Builder with PR workflow, issue triage, architecture review, and security lens
- **Git sidebar panel** — Full git status, staging, and branch management in the sidebar
- **Linux AppImage** — Cross-platform release (x86_64)
- **Apple code signing & notarization** — macOS DMG signed with Developer ID and notarized by Apple
- **Comparison chart** — README now includes competitor averages column

### Fixed
- **Spotify login broken in production build** — Added `tauri-plugin-localhost` to serve assets via `http://localhost:3080` instead of `tauri://` custom protocol (#1)
- **YouTube Error 153** — Same localhost plugin fix resolves YouTube embed origin rejection (#2)

### Changed
- App size reduced from 8.4 MB to 7.8 MB (signed DMG)
- Improved component styles and layout consistency

## [1.0.0] — 2026-03-05

### Added
- Initial public release
- AI Agent Chat with Ask, Agent, and Plan modes
- Agent Builder wizard — 5 persona presets + custom system prompts
- Per-hunk diff review (accept/reject individual changes)
- 7 themes: Obsidian, Bone, Neon, Catppuccin, VooDoo, CyberNord, PrettyPink
- Monaco Editor with multi-tab, Vim mode, ⌘K inline edits, ⌘P quick open
- GitHub integration via device flow auth
- Integrated terminal (xterm.js) with gateway slash commands
- Spotify and YouTube plugins
- Tauri v2 desktop app (macOS Apple Silicon)
- Apache 2.0 license
