# SDK quickstart

This example uses the current API through an installed local SDK tarball. Its manifest does not install an incompatible published preview.

```bash
npm ci
npm run setup:quickstart
npm --prefix examples/sdk-quickstart run dev
```

Microphone capture works on localhost. To use the sample playback button, place a browser-decodable `sample.wav` in this example's `public/` directory. The automated package test supplies a fixture recording.

Run setup from the repository root. It builds the SDK, copies hoho-avatar-sdk.tgz into this example and installs the manifest. Repeat setup after SDK changes. Package tests use the same manifest instead of overriding its dependency.
