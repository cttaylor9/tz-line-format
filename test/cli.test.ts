import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const cliPath = path.join(__dirname, '../src/cli.ts')

function runCli(input: string): { stdout: string; stderr: string; status: number | null } {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', cliPath], {
    input,
    encoding: 'utf8',
  })
  return { stdout: result.stdout, stderr: result.stderr, status: result.status }
}

test('prints a normalized ISO line per valid input line', () => {
  const { stdout, stderr, status } = runCli('2024-03-01 09:00 UTC\n2024-03-02 14:05:00 +05:30\n')
  assert.equal(stdout, '2024-03-01T09:00:00Z\n2024-03-02T14:05:00+05:30\n')
  assert.equal(stderr, '')
  assert.equal(status, 0)
})

test('prints a rendered error to stderr and exits non-zero on a bad line', () => {
  const { stdout, stderr, status } = runCli('2024-13-01 10:00 UTC\n')
  assert.equal(stdout, '')
  assert.match(stderr, /month 13 is out of range \(expected 1-12\) \(line 1, column 6\)/)
  assert.equal(status, 1)
})

test('mixes valid and invalid lines, one per stream, and still exits non-zero', () => {
  const { stdout, stderr, status } = runCli('2024-13-01 10:00 UTC\n2024-03-01 09:00 UTC\n')
  assert.equal(stdout, '2024-03-01T09:00:00Z\n')
  assert.match(stderr, /month 13 is out of range/)
  assert.equal(status, 1)
})

test('blank input produces no output and exits zero', () => {
  const { stdout, stderr, status } = runCli('')
  assert.equal(stdout, '')
  assert.equal(stderr, '')
  assert.equal(status, 0)
})
