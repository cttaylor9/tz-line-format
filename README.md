# tz-line-format

Timestamps that come from logs, calendar exports, or people pasting meeting
times into chat are rarely written consistently: `2024-3-1 9:30am EST`,
`2024/03/01 14:05:00 +05:30`, `2024-03-01T09:00Z`. This library takes a block
of text with one such timestamp per line and normalizes each one to a
canonical ISO 8601 string (`YYYY-MM-DDTHH:MM:SS±HH:MM`), or tells you exactly
where and why a line failed.

The point of the project is the second half. A vague "invalid date" error is
useless when you're staring at a file with 400 lines in it. Every failure
here comes with a line number, a column number, and a caret pointing at the
character that broke.

## Usage

```ts
import { normalizeTimezoneText } from './src'

const input = `2024-3-1 9:30am EST
2024-13-01 10:00 UTC
2024-03-01, 14:05:00 +05:30`

const result = normalizeTimezoneText(input)

for (const entry of result.entries) {
  console.log(entry.line, entry.iso)
}
// 1 2024-03-01T09:30:00-05:00
// 3 2024-03-01T14:05:00+05:30

for (const error of result.errors) {
  console.log(error.toString())
}
// TimezoneFormatError: month 13 is out of range (expected 1-12) (line 2, column 6)
//   2024-13-01 10:00 UTC
//        ^
```

Parsing never throws for a bad line — it collects the error and keeps going,
so one typo on line 200 doesn't hide problems on line 5.

## What it accepts

- Dates: `YYYY-M-D` or `YYYY/M/D`, with or without leading zeros.
- Times: `H:MM` or `H:MM:SS`, 24-hour, or 12-hour with `am`/`pm`/`a.m.`/`p.m.`.
- Zones: `Z`, an explicit offset (`+05:30`, `-0800`), a fixed-offset
  abbreviation (`UTC`, `GMT`, `IST`, `JST`), or a daylight-saving-aware
  abbreviation (`EST`/`EDT`, `MST`/`MDT`, `PST`/`PDT`, `CET`/`CEST`,
  `AEST`/`AEDT`) — see `ZONE_FIXED_OFFSETS` and `ZONE_DST_REGIONS` in
  `src/normalize.ts`. The DST-aware ones are resolved against the real IANA
  tz database rules for that region and date (via `Intl`, which Node ships
  with), so `EST` in July on the US east coast correctly comes out as
  `-04:00` because daylight time was actually in effect, not `-05:00` from a
  fixed table.
- Flexible whitespace and an optional comma between the date and time
  segments.

### Region-ambiguous abbreviations

`CST`/`CDT` name different real zones depending on the country — US Central,
China Standard (which doesn't observe DST, so there's no "CDT" for it), and
Cuba Standard. `normalizeTimezoneText` takes an options object as its second
argument to pick which one is meant:

```ts
normalizeTimezoneText('2024-01-15 09:00 CST', { region: 'CN' })
// entries[0].iso === '2024-01-15T09:00:00+08:00'
```

`region` defaults to `'US'` if omitted. See `AMBIGUOUS_ZONE_REGIONS` in
`src/normalize.ts` for the full abbreviation-to-region-to-zone table. The
CLI exposes the same choice as a flag: `--region=CN`.

## Known limitations

- No support yet for relative expressions ("3pm PST + 5 hours").
- Years must be exactly 4 digits.

## CLI

`src/cli.ts` reads a block of text from stdin, one timestamp per line, and
writes normalized ISO lines to stdout in input order. Lines that fail to
parse write a rendered `TimezoneFormatError` to stderr instead and cause the
process to exit non-zero, but they don't stop the rest of the lines from
being processed. Pass `--region=US|CN|CU` to control how ambiguous
abbreviations like `CST` are resolved (see above); it defaults to `US`.

```
npm run build
echo '2024-3-1 9:30am EST' | node dist/cli.js
# 2024-03-01T09:30:00-05:00

echo '2024-01-15 09:00 CST' | node dist/cli.js --region=CN
# 2024-01-15T09:00:00+08:00
```

## Building

```
npm install
npm run build   # compiles src/ to dist/ via tsc
npm test        # runs test/normalize.test.ts with Node's built-in TS stripping
```

## License

MIT, see `LICENSE`.
