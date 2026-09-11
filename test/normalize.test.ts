import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTimezoneText } from '../src/normalize'
import { TimezoneFormatError } from '../src/errors'

function isoOf(input: string): string {
  const result = normalizeTimezoneText(input)
  assert.equal(result.errors.length, 0, `expected no errors, got: ${result.errors.map(e => e.message).join('; ')}`)
  assert.equal(result.entries.length, 1)
  return result.entries[0].iso
}

function errorOf(input: string): TimezoneFormatError {
  const result = normalizeTimezoneText(input)
  assert.equal(result.entries.length, 0, `expected no entries, got: ${JSON.stringify(result.entries)}`)
  assert.equal(result.errors.length, 1)
  return result.errors[0]
}

// --- valid formats ---

test('dash-separated date with 24-hour time and UTC', () => {
  assert.equal(isoOf('2024-03-01 14:05:00 UTC'), '2024-03-01T14:05:00Z')
})

test('slash-separated date', () => {
  assert.equal(isoOf('2024/03/01 14:05:00 UTC'), '2024-03-01T14:05:00Z')
})

test('single-digit month and day without leading zeros', () => {
  assert.equal(isoOf('2024-3-1 09:30 UTC'), '2024-03-01T09:30:00Z')
})

test('time without seconds defaults seconds to zero', () => {
  assert.equal(isoOf('2024-03-01 09:30 UTC'), '2024-03-01T09:30:00Z')
})

test('12-hour time with lowercase am', () => {
  assert.equal(isoOf('2024-03-01 9:30am EST'), '2024-03-01T09:30:00-05:00')
})

test('12-hour time with uppercase PM and dotted abbreviation', () => {
  assert.equal(isoOf('2024-03-01 9:30 P.M. EST'), '2024-03-01T21:30:00-05:00')
})

test('12-hour time 12am is midnight', () => {
  assert.equal(isoOf('2024-03-01 12:00am UTC'), '2024-03-01T00:00:00Z')
})

test('12-hour time 12pm is noon', () => {
  assert.equal(isoOf('2024-03-01 12:00pm UTC'), '2024-03-01T12:00:00Z')
})

test('comma between date and time, and between time and zone', () => {
  assert.equal(isoOf('2024-03-01, 14:05:00, UTC'), '2024-03-01T14:05:00Z')
})

test('Z zone shorthand', () => {
  assert.equal(isoOf('2024-03-01 09:00 Z'), '2024-03-01T09:00:00Z')
})

test('explicit positive offset with colon', () => {
  assert.equal(isoOf('2024-03-01 14:05:00 +05:30'), '2024-03-01T14:05:00+05:30')
})

test('explicit negative offset without colon', () => {
  assert.equal(isoOf('2024-03-01 14:05:00 -0800'), '2024-03-01T14:05:00-08:00')
})

test('leap day is accepted in a leap year', () => {
  assert.equal(isoOf('2024-02-29 00:00 UTC'), '2024-02-29T00:00:00Z')
})

test('blank lines between entries are skipped', () => {
  const result = normalizeTimezoneText('\n2024-03-01 09:00 UTC\n\n2024-03-02 10:00 UTC\n')
  assert.equal(result.errors.length, 0)
  assert.deepEqual(result.entries.map(e => e.line), [2, 4])
  assert.deepEqual(result.entries.map(e => e.iso), ['2024-03-01T09:00:00Z', '2024-03-02T10:00:00Z'])
})

test('one bad line does not stop the rest from parsing', () => {
  const result = normalizeTimezoneText('2024-13-01 10:00 UTC\n2024-03-01 09:00 UTC')
  assert.equal(result.errors.length, 1)
  assert.equal(result.entries.length, 1)
  assert.equal(result.errors[0].line, 1)
  assert.equal(result.entries[0].line, 2)
})

// --- error paths ---

test('missing year', () => {
  const err = errorOf('abcd-03-01 09:00 UTC')
  assert.match(err.message, /expected a 4-digit year/)
  assert.equal(err.column, 1)
})

test('missing separator after year', () => {
  const err = errorOf('2024 03-01 09:00 UTC')
  assert.match(err.message, /expected "-" or "\/" after the year/)
})

test('missing month', () => {
  const err = errorOf('2024--01 09:00 UTC')
  assert.match(err.message, /expected a month number/)
})

test('month out of range', () => {
  const err = errorOf('2024-13-01 10:00 UTC')
  assert.match(err.message, /month 13 is out of range \(expected 1-12\)/)
  assert.equal(err.column, 6)
})

test('missing separator after month', () => {
  const err = errorOf('2024-03 01 09:00 UTC')
  assert.match(err.message, /expected "-" or "\/" after the month/)
})

test('missing day', () => {
  const err = errorOf('2024-03- 09:00 UTC')
  assert.match(err.message, /expected a day number/)
})

test('day out of range for a 30-day month', () => {
  const err = errorOf('2024-04-31 09:00 UTC')
  assert.match(err.message, /day 31 is out of range for April 2024 \(expected 1-30\)/)
})

test('day out of range for February in a non-leap year', () => {
  const err = errorOf('2023-02-29 09:00 UTC')
  assert.match(err.message, /day 29 is out of range for February 2023 \(expected 1-28\)/)
})

test('missing space between date and time', () => {
  const err = errorOf('2024-03-0109:00 UTC')
  assert.match(err.message, /expected a space between the date and the time/)
})

test('missing hour', () => {
  const err = errorOf('2024-03-01 :00 UTC')
  assert.match(err.message, /expected an hour/)
})

test('missing colon between hour and minute', () => {
  const err = errorOf('2024-03-01 0900 UTC')
  assert.match(err.message, /expected ":" between hour and minute/)
})

test('missing minute', () => {
  const err = errorOf('2024-03-01 09: UTC')
  assert.match(err.message, /expected a two-digit minute/)
})

test('minute out of range', () => {
  const err = errorOf('2024-03-01 09:60 UTC')
  assert.match(err.message, /minute 60 is out of range \(expected 00-59\)/)
})

test('missing second after trailing colon', () => {
  const err = errorOf('2024-03-01 09:00: UTC')
  assert.match(err.message, /expected a two-digit second/)
})

test('second out of range', () => {
  const err = errorOf('2024-03-01 09:00:60 UTC')
  assert.match(err.message, /second 60 is out of range \(expected 00-59\)/)
})

test('hour out of range for 24-hour time', () => {
  const err = errorOf('2024-03-01 24:00 UTC')
  assert.match(err.message, /hour 24 is out of range for 24-hour time \(expected 0-23\)/)
})

test('hour out of range for 12-hour time', () => {
  const err = errorOf('2024-03-01 13:00pm UTC')
  assert.match(err.message, /hour 13 is out of range for 12-hour time \(expected 1-12\)/)
})

test('hour zero is invalid with am/pm', () => {
  const err = errorOf('2024-03-01 0:00am UTC')
  assert.match(err.message, /hour 0 is out of range for 12-hour time \(expected 1-12\)/)
})

test('missing space before the time zone', () => {
  const err = errorOf('2024-03-01 09:00UTC')
  assert.match(err.message, /expected a space before the time zone/)
})

test('malformed explicit offset', () => {
  const err = errorOf('2024-03-01 09:00 +5:3')
  assert.match(err.message, /expected an offset like \+05:30 or -0800/)
})

test('explicit offset with out-of-range hours', () => {
  const err = errorOf('2024-03-01 09:00 +24:00')
  assert.match(err.message, /offset \+24:00 is out of range/)
})

test('explicit offset with out-of-range minutes', () => {
  const err = errorOf('2024-03-01 09:00 +05:60')
  assert.match(err.message, /offset \+05:60 is out of range/)
})

// --- DST-aware zone abbreviations ---

test('EST resolves to standard time in winter', () => {
  assert.equal(isoOf('2024-01-15 09:00 EST'), '2024-01-15T09:00:00-05:00')
})

test('EST resolves to daylight time in summer, since it names the region not the exact label', () => {
  assert.equal(isoOf('2024-07-01 09:00 EST'), '2024-07-01T09:00:00-04:00')
})

test('EDT and EST agree once resolved against the actual date', () => {
  assert.equal(isoOf('2024-07-01 09:00 EDT'), isoOf('2024-07-01 09:00 EST'))
})

test('CET is standard time in winter and daylight time in summer', () => {
  assert.equal(isoOf('2024-01-01 12:00 CET'), '2024-01-01T12:00:00+01:00')
  assert.equal(isoOf('2024-07-01 12:00 CET'), '2024-07-01T12:00:00+02:00')
})

test('AEST/AEDT follow the southern hemisphere DST calendar, reversed from the north', () => {
  assert.equal(isoOf('2024-01-15 09:00 AEST'), '2024-01-15T09:00:00+11:00')
  assert.equal(isoOf('2024-07-15 09:00 AEDT'), '2024-07-15T09:00:00+10:00')
})

test('unrecognized zone abbreviation', () => {
  const err = errorOf('2024-03-01 09:00 XYZ')
  assert.match(err.message, /unrecognized time zone "XYZ"/)
})

test('missing zone entirely', () => {
  const err = errorOf('2024-03-01 09:00 ')
  assert.match(err.message, /expected a time zone abbreviation or offset/)
})

test('trailing garbage after the zone', () => {
  const err = errorOf('2024-03-01 09:00 UTC and then some')
  assert.match(err.message, /unexpected trailing text "and then some"/)
})

// --- error rendering ---

test('toString renders a caret under the offending column', () => {
  const err = errorOf('2024-13-01 10:00 UTC')
  const rendered = err.toString()
  const lines = rendered.split('\n')
  assert.equal(lines.length, 3)
  assert.equal(lines[0], 'TimezoneFormatError: month 13 is out of range (expected 1-12) (line 1, column 6)')
  assert.equal(lines[1], '  2024-13-01 10:00 UTC')
  assert.equal(lines[2], '  ' + ' '.repeat(5) + '^')
})
