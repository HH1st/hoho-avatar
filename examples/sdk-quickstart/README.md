# SDK quickstart

This example installs the public SDK preview and uses only its public imports:

```bash
cd examples/sdk-quickstart
npm install --registry=https://registry.npmjs.org
npm run dev
```

Microphone capture works on localhost. To use the sample playback button, place a browser-decodable `sample.wav` in this example's `public/` directory. The automated package test supplies a fixture recording.

To try an unpublished local change, run `npm pack` at the repository root and install the resulting tarball here.
