# SDK releases

Package: `@hh1st/hoho-avatar`. The current 0.1.x API is early and may change in a minor release; patch releases should preserve behavior. Record user-visible changes in `CHANGELOG.md`.

## One-time npm setup

Before the first registry publication, verify ownership of the `hh1st` npm scope. Configure an npm trusted publisher for repository `HH1st/hoho-avatar`, workflow `publish-sdk.yml`, environment `npm`. Add reviewers to the GitHub `npm` environment so tag-triggered publication is explicitly reviewed. No npm token belongs in this repository.

If npm requires an initial package before a trusted publisher can be registered, the package owner must perform that bootstrap with their authenticated npm session, then enable trusted publishing for subsequent releases. The repository does not perform this account setup or publish automatically during normal builds.

## Release a reviewed version

1. Update the root SDK `package.json`, lockfile, documented local tarball filenames and changelog. The Studio imports local SDK source; quickstart installs the current local tarball via setup:quickstart.
2. Install repository dependencies and run `npm run setup:demo`, then `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` and `npm run test:package` with Chromium installed. The unified demo checks exercise the checked-out SDK; the package test exercises the SDK being released.
3. Inspect `npm pack --dry-run` for the runtime, types, source maps, original robot assets, README and license only.
4. Commit using the repository identity `HH1st`.
5. Create and push the matching `vX.Y.Z` tag after release authorization. The workflow verifies the tag/version, tests the tarball and publishes that exact tarball with npm provenance via OIDC.
6. Verify the public install and add release notes. Update installation docs in a follow-up commit; quickstart continues testing the current tarball. Prereleases use `next`; stable releases use `latest`.

The first preview release is `0.1.0-beta.1`, using the `next` dist-tag. The local bootstrap command, after npm authentication, is `npm publish ./hh1st-hoho-avatar-0.1.0-beta.1.tgz --access public --tag next --registry=https://registry.npmjs.org`. Local bootstrap does not claim OIDC provenance; configured GitHub trusted-publishing runs attach it.

## Rollback

Prefer a new patch release. If a release is defective, move the npm `latest` dist-tag back to the last working version and deprecate the defective version with an explanation. Do not silently replace existing package versions or delete release history.
