import { TimezoneFormatError } from './errors'

export interface NormalizedEntry {
  line: number
  raw: string
  iso: string
}

export interface NormalizeResult {
  entries: NormalizedEntry[]
  errors: TimezoneFormatError[]
}

// Fixed offsets only, no daylight-saving rule engine yet. EST/EDT etc are the
// US meanings; abbreviations like CST are genuinely ambiguous worldwide, but
// picking one consistently beats refusing to parse anything at all.
const ZONE_OFFSETS: Record<string, number> = {
  UTC: 0,
  GMT: 0,
  EST: -5 * 60,
  EDT: -4 * 60,
  CST: -6 * 60,
  CDT: -5 * 60,
  MST: -7 * 60,
  MDT: -6 * 60,
  PST: -8 * 60,
  PDT: -7 * 60,
  IST: 5 * 60 + 30,
  JST: 9 * 60,
  CET: 1 * 60,
  CEST: 2 * 60,
  AEST: 10 * 60,
  AEDT: 11 * 60,
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

function daysInMonth(year: number, month: number): number {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return days[month - 1]
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0')
}

/**
 * Scans a single line left to right using sticky regexes, so `pos` always
 * reflects how far we've consumed and `column` is always accurate for
 * error reporting.
 */
class LineScanner {
  private pos = 0

  constructor(private readonly text: string) {}

  get column(): number {
    return this.pos + 1
  }

  isAtEnd(): boolean {
    return this.pos >= this.text.length
  }

  peekChar(): string | undefined {
    return this.text[this.pos]
  }

  restOfLine(): string {
    return this.text.slice(this.pos)
  }

  skipSpaces(): void {
    this.match(/\s*/y)
  }

  match(pattern: RegExp): RegExpExecArray | null {
    const flags = pattern.flags.includes('y') ? pattern.flags : pattern.flags + 'y'
    const sticky = new RegExp(pattern.source, flags)
    sticky.lastIndex = this.pos
    const result = sticky.exec(this.text)
    if (result) {
      this.pos = sticky.lastIndex
    }
    return result
  }
}

function parseLine(rawLine: string, lineNumber: number): NormalizedEntry {
  const scanner = new LineScanner(rawLine)
  const fail = (column: number, message: string): never => {
    throw new TimezoneFormatError(message, { line: lineNumber, column }, rawLine)
  }

  scanner.skipSpaces()

  // date: YYYY-M-D or YYYY/M/D
  const yearStart = scanner.column
  const yearMatch = scanner.match(/\d{4}/y)
  if (!yearMatch) fail(yearStart, 'expected a 4-digit year')
  const year = Number(yearMatch[0])

  if (!scanner.match(/[-/]/y)) fail(scanner.column, 'expected "-" or "/" after the year')

  const monthStart = scanner.column
  const monthMatch = scanner.match(/\d{1,2}/y)
  if (!monthMatch) fail(monthStart, 'expected a month number')
  const month = Number(monthMatch[0])
  if (month < 1 || month > 12) fail(monthStart, `month ${month} is out of range (expected 1-12)`)

  if (!scanner.match(/[-/]/y)) fail(scanner.column, 'expected "-" or "/" after the month')

  const dayStart = scanner.column
  const dayMatch = scanner.match(/\d{1,2}/y)
  if (!dayMatch) fail(dayStart, 'expected a day number')
  const day = Number(dayMatch[0])
  const monthDays = daysInMonth(year, month)
  if (day < 1 || day > monthDays) {
    fail(dayStart, `day ${day} is out of range for ${MONTH_NAMES[month - 1]} ${year} (expected 1-${monthDays})`)
  }

  if (!scanner.match(/[,]?\s+/y)) fail(scanner.column, 'expected a space between the date and the time')

  // time: H:MM or H:MM:SS, optional am/pm
  const hourStart = scanner.column
  const hourMatch = scanner.match(/\d{1,2}/y)
  if (!hourMatch) fail(hourStart, 'expected an hour')
  let hour = Number(hourMatch[0])

  if (!scanner.match(/:/y)) fail(scanner.column, 'expected ":" between hour and minute')

  const minuteStart = scanner.column
  const minuteMatch = scanner.match(/\d{2}/y)
  if (!minuteMatch) fail(minuteStart, 'expected a two-digit minute')
  const minute = Number(minuteMatch[0])
  if (minute > 59) fail(minuteStart, `minute ${minute} is out of range (expected 00-59)`)

  let second = 0
  if (scanner.peekChar() === ':') {
    scanner.match(/:/y)
    const secondStart = scanner.column
    const secondMatch = scanner.match(/\d{2}/y)
    if (!secondMatch) fail(secondStart, 'expected a two-digit second')
    second = Number(secondMatch[0])
    if (second > 59) fail(secondStart, `second ${second} is out of range (expected 00-59)`)
  }

  const meridiemMatch = scanner.match(/\s*(a\.?m\.?|p\.?m\.?)/iy)
  if (meridiemMatch) {
    if (hour < 1 || hour > 12) {
      fail(hourStart, `hour ${hour} is out of range for 12-hour time (expected 1-12)`)
    }
    const isPM = meridiemMatch[1].toLowerCase().startsWith('p')
    hour = hour % 12
    if (isPM) hour += 12
  } else if (hour > 23) {
    fail(hourStart, `hour ${hour} is out of range for 24-hour time (expected 0-23)`)
  }

  if (!scanner.match(/[,]?\s+/y)) fail(scanner.column, 'expected a space before the time zone')

  // zone: Z, an explicit offset, or a known abbreviation
  const zoneStart = scanner.column
  let offsetMinutes: number

  if (scanner.peekChar() === 'Z' || scanner.peekChar() === 'z') {
    scanner.match(/[Zz]/y)
    offsetMinutes = 0
  } else if (scanner.peekChar() === '+' || scanner.peekChar() === '-') {
    const offsetMatch = scanner.match(/([+-])(\d{2}):?(\d{2})/y)
    if (!offsetMatch) fail(zoneStart, 'expected an offset like +05:30 or -0800')
    const sign = offsetMatch[1] === '-' ? -1 : 1
    const offsetHours = Number(offsetMatch[2])
    const offsetMins = Number(offsetMatch[3])
    if (offsetHours > 23 || offsetMins > 59) fail(zoneStart, `offset ${offsetMatch[0]} is out of range`)
    offsetMinutes = sign * (offsetHours * 60 + offsetMins)
  } else {
    const wordMatch = scanner.match(/[A-Za-z]+/y)
    if (!wordMatch) fail(zoneStart, 'expected a time zone abbreviation or offset')
    const key = wordMatch[0].toUpperCase()
    const known = ZONE_OFFSETS[key]
    if (known === undefined) {
      fail(zoneStart, `unrecognized time zone "${wordMatch[0]}" (known: ${Object.keys(ZONE_OFFSETS).join(', ')})`)
    }
    offsetMinutes = known
  }

  scanner.skipSpaces()
  if (!scanner.isAtEnd()) fail(scanner.column, `unexpected trailing text "${scanner.restOfLine()}"`)

  const datePart = `${pad(year, 4)}-${pad(month)}-${pad(day)}`
  const timePart = `${pad(hour)}:${pad(minute)}:${pad(second)}`
  const offsetPart = offsetMinutes === 0
    ? 'Z'
    : `${offsetMinutes < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(offsetMinutes) / 60))}:${pad(Math.abs(offsetMinutes) % 60)}`

  return { line: lineNumber, raw: rawLine, iso: `${datePart}T${timePart}${offsetPart}` }
}

/**
 * Normalizes a block of text, one timestamp per line, into canonical
 * ISO 8601 strings. Blank lines are skipped. Lines that fail to parse are
 * collected as errors rather than aborting the whole block, so one typo
 * doesn't hide the rest.
 */
export function normalizeTimezoneText(input: string): NormalizeResult {
  const entries: NormalizedEntry[] = []
  const errors: TimezoneFormatError[] = []

  input.split('\n').forEach((rawLine, index) => {
    if (rawLine.trim().length === 0) return
    try {
      entries.push(parseLine(rawLine, index + 1))
    } catch (err) {
      if (err instanceof TimezoneFormatError) {
        errors.push(err)
      } else {
        throw err
      }
    }
  })

  return { entries, errors }
}
