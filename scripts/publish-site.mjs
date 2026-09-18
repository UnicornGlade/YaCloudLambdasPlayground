// Fixed build directory only. Never sync the repository, and never delete old assets.
import assert from 'node:assert/strict'
import { lstat, readdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { cloudEnvironment, folderId, root, run } from './lib/cloud-auth.mjs'

if (process.argv.length !== 2) throw new Error('Usage: node scripts/publish-site.mjs (no source overrides allowed)')
const env = cloudEnvironment({ provider: false, backend: true })
const outputs = JSON.parse(run(`${root}.tools/terraform/terraform`, [`-chdir=${root}infra/application`, 'output', '-json'], { env, capture: true }))
for (const key of ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN']) delete env[key]
const bucket = outputs.site_bucket.value
assert.equal(bucket, `unicornglade-site-${folderId}`)
const release = JSON.parse(await readFile(`${root}.artifacts/release.json`, 'utf8'))
assert.equal(outputs.app_version.value, release.version, 'Apply the matching function release before publishing its site')
const directory = `${root}.artifacts/site`
assert.ok(!(await lstat(directory)).isSymbolicLink(), 'Site directory must not be a symlink')
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' }
const files = []
async function collect(prefix = '') {
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    assert.ok(!entry.isSymbolicLink() && !entry.name.startsWith('.'), 'Hidden files and symlinks must not be published')
    const key = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) await collect(key)
    else {
      assert.ok(entry.isFile() && mime[extname(key)], `Unexpected public artifact: ${key}`)
      files.push(key)
    }
  }
}
await collect()
assert.ok(files.includes('index.html'))
// Switch entrypoint last; retain previous hashed assets for clients with old HTML.
files.sort((a, b) => Number(a === 'index.html') - Number(b === 'index.html') || a.localeCompare(b))
for (const key of files) {
  const immutable = key.startsWith('_nuxt/') && ['.js', '.css'].includes(extname(key))
  run('yc', ['storage', 's3api', 'put-object', '--bucket', bucket, '--key', key, '--body', join(directory, key),
    '--content-type', mime[extname(key)], '--cache-control', immutable ? 'public,max-age=31536000,immutable' : 'no-cache'], { capture: true })
  console.log(`Published ${key}`)
}
console.log(`Published ${files.length} static files for ${release.version}; no old objects deleted.`)
