# Image Nexus

Prompt & metadata viewer for AI image output folders. Mirrors ModelsNexus layout, header/sidebar shell, light/dark theming, About & Settings modals, NSFW/SFW controls, favorites, and keyboard shortcuts.

- Electron + React + TypeScript
- Tailwind + CSS Modules
- No DB (pure FS); thumbnails via `sharp`
- Metadata parsing: AUTOMATIC1111, ComfyUI (JSON/workflow/prompt), plus sidecar `.txt`/`.json` discovery
- Filters: filename/folder (inline), favorites, NSFW/SFW
- Modal: image left, metadata right with collapsible panels, Copy All / Copy Prompt
- Open in Explorer, Copy path, Export metadata (on demand), Batch delete/move
- Windows installer (NSIS) with selectable install directory

## Dev

```bash
pnpm i  # or npm i
npm run dev
