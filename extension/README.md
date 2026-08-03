# Universal Newsletter — Chrome Extension

React + Vite + TypeScript + Tailwind Chrome extension (Manifest V3), built
with [@crxjs/vite-plugin](https://crxjs.dev/vite-plugin).

## Development

```bash
npm install
npm run dev
```

Then load `dist/` (or the dev build directory) as an unpacked extension via
`chrome://extensions` with Developer Mode enabled.

## Build

```bash
npm run build
```

## Structure

- `src/popup/` — extension popup UI (React)
- `src/background/` — MV3 background service worker
- `src/lib/apiClient.ts` — axios client for the backend API
- `manifest.json` — extension manifest (source; crxjs resolves it into `dist/manifest.json`)
