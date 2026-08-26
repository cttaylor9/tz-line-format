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
- Zones: `Z`, an explicit offset (`+05:30`, `-0800`), or a fixed-offset
  abbreviation (`UTC`, `EST`, `PDT`, `JST`, `IST`, `CET`, and a handful of
  others — see `ZONE_OFFSETS` in `src/normalize.ts`).
- Flexible whitespace and an optional comma between the date and time
  segments.

## Known limitations

- Zone abbreviations map to fixed offsets, not real IANA rules — there's no
  historical DST calculation, and some abbreviations (`CST`, for instance)
  are genuinely ambiguous depending on the country.
- No support yet for relative expressions ("3pm PST + 5 hours").
- Years must be exactly 4 digits.

## Building

There's no build step wired up yet — `tsconfig.json` is there for when a
TypeScript compiler is installed locally.

## License

MIT, see `LICENSE`.
