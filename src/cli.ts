#!/usr/bin/env node
import { normalizeTimezoneText, AmbiguousZoneRegion } from './normalize'
import { TimezoneFormatError } from './errors'

const SUPPORTED_REGIONS: AmbiguousZoneRegion[] = ['US', 'CN', 'CU']

/** Reads `--region=XX` off argv, for disambiguating zone abbreviations like CST. */
function parseRegionFlag(argv: string[]): AmbiguousZoneRegion | undefined {
  const flag = argv.find((arg) => arg.startsWith('--region='))
  if (!flag) return undefined
  const value = flag.slice('--region='.length).toUpperCase()
  if (!SUPPORTED_REGIONS.includes(value as AmbiguousZoneRegion)) {
    throw new Error(`unknown --region "${value}" (supported: ${SUPPORTED_REGIONS.join(', ')})`)
  }
  return value as AmbiguousZoneRegion
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    process.stdin.on('data', (chunk: Buffer) => chunks.push(chunk))
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    process.stdin.on('error', reject)
  })
}

async function main(): Promise<void> {
  const region = parseRegionFlag(process.argv.slice(2))
  const input = await readStdin()
  const { entries, errors } = normalizeTimezoneText(input, { region })

  // Entries and errors come back as separate arrays; interleave them by line
  // number so output order matches the order lines appeared in the input.
  const byLine = new Map<number, { iso: string } | { error: TimezoneFormatError }>()
  for (const entry of entries) byLine.set(entry.line, { iso: entry.iso })
  for (const error of errors) byLine.set(error.line, { error })

  const lineNumbers = [...byLine.keys()].sort((a, b) => a - b)
  let hadError = false

  for (const lineNumber of lineNumbers) {
    const result = byLine.get(lineNumber)!
    if ('iso' in result) {
      process.stdout.write(`${result.iso}\n`)
    } else {
      hadError = true
      process.stderr.write(`${result.error.toString()}\n`)
    }
  }

  process.exitCode = hadError ? 1 : 0
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  process.exitCode = 1
})
