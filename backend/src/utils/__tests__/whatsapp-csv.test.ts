/**
 * Unit tests for `safeCsvCell` (src/utils/whatsapp-csv.ts).
 *
 * `safeCsvCell` is a pure function with no module-level dependencies, so no
 * config mocks are required here. It defends against TWO classes of issue:
 *   1. CSV/formula injection — a leading  = + - @ TAB CR  is neutralized with a
 *      `'` prefix so a spreadsheet treats the cell as literal text.
 *   2. RFC 4180 structure breakage — values containing a comma, double-quote, or
 *      newline are wrapped in quotes with embedded quotes doubled.
 */
import { safeCsvCell } from '../whatsapp-csv';

describe('safeCsvCell — formula-injection guard', () => {
  // Each of these leading chars makes a spreadsheet treat the cell as a formula.
  it.each([
    ['=', '=1+1', "'=1+1"],
    ['+', '+1', "'+1"],
    ['-', '-1', "'-1"],
    ['@', '@SUM(A1)', "'@SUM(A1)"],
    ['tab', '\tcmd', "'\tcmd"],
    ['CR', '\rcmd', "'\rcmd"],
  ])(
    'neutralizes a leading "%s" trigger by prefixing a single quote',
    (_label, input, expected) => {
      // \r also trips RFC-4180 quoting, which wraps the value — so the neutralizing
      // `'` sits just inside the opening quote. Accept either form.
      const out = safeCsvCell(input);
      expect(out.startsWith("'") || out.startsWith('"\'')).toBe(true);
      // For triggers that don't also contain a quoting-special char, the output is
      // exactly the prefixed value.
      if (!/[",\n\r]/.test(input)) {
        expect(safeCsvCell(input)).toBe(expected);
      }
    }
  );

  it('does NOT prefix when the trigger char is NOT at the start', () => {
    expect(safeCsvCell('a=b')).toBe('a=b');
    expect(safeCsvCell('total +1')).toBe('total +1');
    expect(safeCsvCell('x@y')).toBe('x@y');
  });

  it('neutralizes a dangerous DDE-style payload that also contains a comma', () => {
    const out = safeCsvCell('=cmd|"/c calc"!A1');
    // Formula-prefixed AND quoted because it contains a double-quote.
    expect(out.startsWith('"\'=cmd')).toBe(true);
    expect(out).toBe('"\'=cmd|""/c calc""!A1"');
  });
});

describe('safeCsvCell — RFC 4180 quoting/escaping', () => {
  it('quotes a value containing a comma', () => {
    expect(safeCsvCell('Doe, John')).toBe('"Doe, John"');
  });

  it('quotes and doubles an embedded double-quote', () => {
    expect(safeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(safeCsvCell('"')).toBe('""""');
  });

  it('quotes a value containing a newline (LF) or carriage return (CR)', () => {
    expect(safeCsvCell('line1\nline2')).toBe('"line1\nline2"');
    // A CR is also a formula trigger when leading, so use it mid-string here.
    expect(safeCsvCell('line1\r\nline2')).toBe('"line1\r\nline2"');
  });
});

describe('safeCsvCell — plain values pass through unchanged', () => {
  it.each(['hello', 'plain text', 'no-special-chars', 'a1b2c3', "John O'Brien"])(
    'returns "%s" unchanged',
    (input) => {
      expect(safeCsvCell(input)).toBe(input);
    }
  );

  it('returns an empty string unchanged', () => {
    expect(safeCsvCell('')).toBe('');
  });
});

describe('safeCsvCell — non-string inputs', () => {
  it('maps null and undefined to an empty string', () => {
    expect(safeCsvCell(null)).toBe('');
    expect(safeCsvCell(undefined)).toBe('');
  });

  it('stringifies numbers and booleans', () => {
    expect(safeCsvCell(42)).toBe('42');
    expect(safeCsvCell(0)).toBe('0');
    expect(safeCsvCell(3.14)).toBe('3.14');
    expect(safeCsvCell(true)).toBe('true');
    expect(safeCsvCell(false)).toBe('false');
  });

  it('treats a negative number (leading "-") as a formula trigger', () => {
    // String(-5) === '-5', whose leading '-' is neutralized.
    expect(safeCsvCell(-5)).toBe("'-5");
  });
});
