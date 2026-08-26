export interface SourcePosition {
  line: number
  column: number
}

/**
 * Thrown when a line can't be parsed. Carries enough position information
 * to print a caret pointing at the exact character that broke, the same
 * way a compiler would.
 */
export class TimezoneFormatError extends Error {
  readonly line: number
  readonly column: number
  readonly sourceLine: string

  constructor(message: string, position: SourcePosition, sourceLine: string) {
    super(message)
    this.name = 'TimezoneFormatError'
    this.line = position.line
    this.column = position.column
    this.sourceLine = sourceLine
  }

  /** A multi-line, human-readable rendering with a caret under the offending column. */
  toString(): string {
    const pointer = ' '.repeat(Math.max(0, this.column - 1)) + '^'
    return [
      `${this.name}: ${this.message} (line ${this.line}, column ${this.column})`,
      `  ${this.sourceLine}`,
      `  ${pointer}`,
    ].join('\n')
  }
}
