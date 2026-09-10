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
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run test:package
python skills/generate-talking-sprite-character/scripts/validate_character.py public/characters/pixel-bot/character.json
python skills/generate-talking-sprite-character/scripts/validate_character.py public/characters/pixel-portrait/character.json
```

New example characters must include every required mouth state, pass the bundled validator, and have documented redistribution rights in `ASSETS.md`.

## Debugging the SDK with the demo

`npm run dev` hot-reloads the demo application; it uses the published SDK installed in `examples/basic/node_modules/`. Engine unit tests exercise `src/`, and `npm run test:package` builds and validates a local SDK tarball in an independent consumer.

For a manual demo session with local SDK changes, stop the dev server, then run these commands from the repository root. Use the tarball filename printed by `npm pack` if the SDK version has changed.

```bash
npm pack
npm --prefix examples/basic install --no-save --package-lock=false ./hh1st-hoho-avatar-0.1.0-beta.2.tgz
npm run dev -- --force
```

Repeat the pack/install sequence after each SDK change; the SDK source does not hot-reload. This temporary installation leaves the demo manifest and lockfile unchanged. Stop the server and run `npm run setup:demo` to restore the published dependency before committing or running the demo release checks.

By contributing, you agree that your contribution is licensed under the repository's MIT License.
