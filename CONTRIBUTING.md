# Contributing to Hoho Avatar

Issues and pull requests are welcome. Keep changes focused and avoid committing generated output, private reference images, credentials, or local environment files.

## Development setup

Requirements:

- Node.js 20.19 or newer
- npm
- Python 3 and Pillow when working on character assets

```bash
npm install
npm run setup:demo
python -m pip install -r skills/generate-talking-sprite-character/requirements.txt
```

Before opening a pull request, run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:package
python skills/generate-talking-sprite-character/scripts/validate_character.py public/characters/pixel-bot/character.json
python skills/generate-talking-sprite-character/scripts/validate_character.py public/characters/pixel-portrait/character.json
```

New example characters must include every required mouth state, pass the bundled validator, and have documented redistribution rights in `ASSETS.md`.

Lint uses Oxlint's correctness rules across SDK, examples, server, scripts and tests. Run `npm run lint:fix` for safe automatic fixes. Type checking remains a separate check. Oxlint avoids the current typescript-eslint peer-version limit, which excludes the repository's TypeScript 7 toolchain. Generated output and dependencies are excluded.

## Debugging the SDK with the demo

`npm run dev` hot-reloads the single Studio and local SDK source. Select a 2D character or Mochi (3D) to exercise the same controls through different renderers. Run `npm run setup:demo` after the root `npm ci`.

`npm run test:package` installs a local SDK tarball into a clean consumer, first without Three.js for 2D, then with the optional peer for 3D. The shared motion controller has no Three.js imports.

By contributing, you agree that your contribution is licensed under the repository's MIT License.

`npm run setup:quickstart` builds and installs the SDK tarball through the quickstart manifest. Studio responsibilities are divided between CharacterStage (assets), StudioAudio (local audio), VoiceSession and main.ts (catalog/UI wiring).
