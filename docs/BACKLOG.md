# Backlog

## Voice agent follow-ups

- move microphone capture from `ScriptProcessorNode` to a 20 ms `AudioWorklet`;
- add a production deployment example for the Managed Identity gateway;
- add tool-call handling and explicit tool authorization boundaries;
- add reconnect and conversation restoration policies;
- replace the browser-to-gateway WebSocket with WebRTC when the Azure deployment supports the required server-side control pattern.

This document records work that is intentionally outside the current source-first release. Hoho Avatar is not currently distributed as an npm package. Users clone the repository, install development dependencies, and run or build the source locally.

## Package distribution

Status: deferred.

Before publishing an npm package, decide and implement:

- the final package name and npm owner or organization;
- whether the engine ships as one package or as separate core and renderer packages;
- a stable public API and semantic-versioning policy;
- ESM output, type declarations, source maps, and browser compatibility targets;
- separate output directories for the reusable library and browser demo;
- an explicit `exports` map and a minimal npm `files` allowlist;
- a build hook for release packaging without affecting normal source development;
- a clean-install consumer fixture that installs the generated tarball and imports its public API;
- public-registry publishing from CI with provenance and least-privilege credentials;
- release notes, tags, changelog conventions, and rollback guidance.

Acceptance criteria:

1. `npm pack --dry-run` contains only intended runtime files, declarations, license, and package documentation.
2. A fresh external fixture can install the tarball and instantiate `TalkingSprite` without importing repository-internal paths.
3. The demo build and library build do not overwrite or depend on each other's output.
4. Publishing is automated from a reviewed Git tag and does not rely on a developer's local npm configuration.

## Dependency reproducibility

Status: deferred while the repository is source-first.

The repository intentionally does not commit `package-lock.json`, because local development currently uses environment-specific registry infrastructure. Revisit this before a formal release so CI and releases resolve an auditable, reproducible dependency graph without committing internal registry URLs.

Possible approaches:

- generate a sanitized lockfile against the public npm registry in release automation;
- adopt a package manager and lockfile format that can remain registry-neutral;
- keep source development unlocked but generate and verify a release-only dependency snapshot.

## Renderer expansion

Status: roadmap, not current functionality.

- define an engine-neutral motion-frame contract;
- separate audio analysis from renderer lifecycle;
- add adapter boundaries for richer 2D, Live2D, and 3D runtimes;
- define capability discovery for blink, mouth, expression, pose, and viseme support;
- add renderer-specific examples without coupling asset generation to one engine.
