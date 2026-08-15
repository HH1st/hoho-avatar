# Contributing to Hoho Avatar

Issues and pull requests are welcome. Keep changes focused and avoid committing generated output, private reference images, credentials, or local environment files.

## Development setup

Requirements:

- Node.js 20.19 or newer
- npm
- Python 3 and Pillow when working on character assets

```bash
npm install
python -m pip install -r skills/generate-talking-sprite-character/requirements.txt
```

Before opening a pull request, run:

```bash
npm run typecheck
npm test
npm run build
python skills/generate-talking-sprite-character/scripts/validate_character.py public/characters/pixel-bot/character.json
python skills/generate-talking-sprite-character/scripts/validate_character.py public/characters/pixel-portrait/character.json
```

New example characters must include every required mouth state, pass the bundled validator, and have documented redistribution rights in `ASSETS.md`.

By contributing, you agree that your contribution is licensed under the repository's MIT License.
