import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const file = (name: string) => readFile(new URL(`../${name}`, import.meta.url), 'utf8')

test('state bucket policy allows only the owner and explicitly denies HTTP', async () => {
  const policy = JSON.parse(await file('infra/bootstrap/state-policy.json'))
  const allows = policy.Statement.filter((rule: { Effect: string }) => rule.Effect === 'Allow')
  assert.equal(allows.length, 1)
  assert.deepEqual(allows[0].Principal, { CanonicalUser: 'ajev28h57merhi7r168p' })
  assert.deepEqual(allows[0].Condition, { Bool: { 'aws:SecureTransport': 'true' } })
  const deny = policy.Statement.find((rule: { Sid: string }) => rule.Sid === 'DenyInsecureTransport')
  assert.equal(deny.Effect, 'Deny')
  assert.deepEqual(deny.Condition, { Bool: { 'aws:SecureTransport': 'false' } })
})

test('ephemeral backend credentials are scoped to state bucket and object prefix', async () => {
  const policy = JSON.parse(await file('infra/backend-access-policy.json'))
  const bucket = 'arn:aws:s3:::unicornglade-tfstate-b1gh1fk7hbuj5hu9tujb'
  assert.equal(policy.Statement.length, 2)
  assert.equal(policy.Statement[0].Resource, bucket)
  assert.equal(policy.Statement[1].Resource, `${bucket}/terraform/*`)
  assert.deepEqual(policy.Statement[1].Action, ['s3:GetObject', 's3:PutObject', 's3:DeleteObject'])
  for (const rule of policy.Statement) {
    assert.equal(rule.Effect, 'Allow')
    assert.deepEqual(rule.Principal, { CanonicalUser: 'ajev28h57merhi7r168p' })
    assert.ok(!rule.Action.includes('s3:*'))
  }
})

test('all Terraform modules use HTTPS, native locking and no inline credentials', async () => {
  for (const module of ['bootstrap', 'certificate', 'application', 'database']) {
    const hcl = await file(`infra/${module}/versions.tf`)
    assert.match(hcl, /backend "s3"/)
    assert.match(hcl, /use_lockfile\s*=\s*true/)
    assert.match(hcl, /https:\/\/storage\.yandexcloud\.net/)
    assert.doesNotMatch(hcl, /(?:access_key|secret_key|token)\s*=/)
  }
})

test('cloud gateway uses v2 and a private function with bounded scaling', async () => {
  const hcl = await file('infra/application/main.tf')
  const gateway = await file('infra/application/gateway.yaml.tftpl')
  assert.match(gateway, /payload_format_version: '2\.0'/)
  assert.match(gateway, /service_account_id: \$\{service_account_id\}/)
  assert.match(hcl, /zone_instances_limit\s*=\s*1/)
  assert.match(hcl, /retention_period\s*=\s*"24h"/)
  assert.doesNotMatch(hcl, /allUsers|allAuthenticatedUsers|static_access_key|DATABASE_URL/)
})

test('database plan has private access, deletion protection and server-generated passwords', async () => {
  const hcl = await file('infra/database/main.tf')
  assert.match(hcl, /assign_public_ip\s*=\s*false/)
  assert.match(hcl, /deletion_protection\s*=\s*true/)
  assert.match(hcl, /disk_type_id\s*=\s*"network-ssd"/)
  assert.match(hcl, /resource_preset_id\s*=\s*"s3-c2-m8"/)
  assert.match(hcl, /198\.19\.0\.0\/16/)
  assert.equal([...hcl.matchAll(/generate_password\s*=\s*true/g)].length, 2)
  assert.doesNotMatch(hcl, /^\s*(?:password|password_wo)\s*=|0\.0\.0\.0\/0/m)
})

test('database apply without explicit cost approval fails before cloud access', () => {
  const result = spawnSync(process.execPath, ['scripts/infra.mjs', 'database', 'apply'], { encoding: 'utf8', timeout: 5000 })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Database apply requires owner approval/)
})
