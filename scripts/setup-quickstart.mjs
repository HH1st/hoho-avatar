import { spawnSync } from 'node:child_process';
import { copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run npm run setup:quickstart from the repository root');
function run(args) {
  const result = spawnSync(process.execPath, [npm, ...args], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr + result.stdout);
  return result.stdout;
}
run(['run', 'build:sdk']);
const [packed] = JSON.parse(run(['pack', '--ignore-scripts', '--json']));
await copyFile(packed.filename, resolve('examples/sdk-quickstart/hoho-avatar-sdk.tgz'));
console.log(run(['--prefix', 'examples/sdk-quickstart', 'install', '--package-lock=false', '--registry=https://registry.npmjs.org', '--no-audit', '--no-fund']));
console.log('Quickstart now uses the checked-out SDK tarball. Run npm --prefix examples/sdk-quickstart run dev');
