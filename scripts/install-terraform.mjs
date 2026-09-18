import { createHash } from 'node:crypto'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// SHA-256 pinned from HashiCorp's HTTPS release manifest, not a third-party mirror.
const version = '1.16.2'
const sha256 = '0d17011f0c4664539b164b044903d04e296c86c13cb9f28040076c65cfb3985a'
if (process.platform !== 'linux' || process.arch !== 'x64') {
  throw new Error('This installer supports linux/amd64 only; use the verified HashiCorp release for your platform.')
}
const directory = fileURLToPath(new URL('../.tools/terraform/', import.meta.url))
const name = `terraform_${version}_linux_amd64.zip`
const response = await fetch(`https://releases.hashicorp.com/terraform/${version}/${name}`, { signal: AbortSignal.timeout(120_000) })
if (!response.ok) throw new Error(`Terraform download failed: HTTP ${response.status}`)
const archive = Buffer.from(await response.arrayBuffer())
if (createHash('sha256').update(archive).digest('hex') !== sha256) throw new Error('Terraform SHA-256 mismatch')
await mkdir(directory, { recursive: true, mode: 0o700 })
await writeFile(`${directory}/${name}`, archive, { mode: 0o600 })
const extracted = spawnSync('unzip', ['-o', '-q', `${directory}/${name}`, 'terraform', '-d', directory], { stdio: 'inherit' })
if (extracted.error || extracted.status !== 0) throw new Error('Unable to extract Terraform: unzip is required')
await chmod(`${directory}/terraform`, 0o700)
const checked = spawnSync(`${directory}/terraform`, ['version'], { stdio: 'inherit' })
if (checked.error || checked.status !== 0) throw new Error('Terraform version check failed')
console.log('Installed locally in .tools/terraform/; system installation was not modified.')
