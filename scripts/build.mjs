import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { execFileSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
process.chdir(root)
let revision = 'local'
try { revision = execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch {}
const version = process.env.APP_VERSION || `${revision}-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}`
if (!/^[a-zA-Z0-9._-]{1,64}$/.test(version)) throw new Error('Invalid APP_VERSION')

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed with exit code ${result.status}`)
}

run(process.execPath, ['node_modules/@nuxt/cli/bin/nuxi.mjs', 'build'], {
  env: { ...process.env, APP_VERSION: version, NITRO_PRESET: 'aws_lambda', NUXT_TELEMETRY_DISABLED: '1' },
})
await stat('.output/public/index.html')
await rm('.artifacts', { recursive: true, force: true })
await mkdir('.artifacts/function', { recursive: true })
await cp('.output/public', '.artifacts/site', { recursive: true })
await cp('.output/server', '.artifacts/function/server', { recursive: true })
await cp('deploy/function/index.js', '.artifacts/function/index.js')
await writeFile('.artifacts/function/package.json', JSON.stringify({ private: true, type: 'commonjs' }) + '\n')
run('zip', ['-qr', '../function.zip', '.'], { cwd: '.artifacts/function' })
const sha256 = createHash('sha256').update(await readFile('.artifacts/function.zip')).digest('hex')
await writeFile('.artifacts/release.json', JSON.stringify({ version, functionSha256: sha256, payloadFormatVersion: '2.0' }, null, 2) + '\n')
console.log(`Built ${version}: .artifacts/site/ and .artifacts/function.zip (not deployed)`)
