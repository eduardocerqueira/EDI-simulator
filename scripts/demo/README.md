# Demo video recorder

Records the videos in [docs/demo](../../docs/demo) with Playwright against the running stack.
Kept outside the npm workspaces so CI never installs a browser.

```bash
cd scripts/demo
npm install && npm run install-browser        # once
# start a fresh stack (separate compose project so your dev data is untouched)
COMPOSE_PROJECT_NAME=edi-demo docker compose up -d --build --wait
COMPOSE_PROJECT_NAME=edi-demo npx tsx record.ts infra distributor customer   # → .out/raw/*.webm
./make-media.sh                                   # → docs/demo/*.mp4, *-preview.gif, *.jpg (needs ffmpeg)
COMPOSE_PROJECT_NAME=edi-demo docker compose down -v
```

Record `infra` first on an empty stack: it bootstraps the catalogs and generates the data the other two scenes show.
Terminal scenes run the real commands and stream their real output; captions are overlaid in the page.
