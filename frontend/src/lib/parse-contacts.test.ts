/**
 * Tests for the contact-import parsers (src/lib/parse-contacts.ts).
 *
 * These decide who a campaign is sent to. A parser bug here is not a rendering
 * glitch — it is messages delivered to the wrong number, or an audience that
 * silently loses rows, and it happens before any backend validation can see it.
 *
 * Pure functions over strings, so no mocks: fixtures in, exact arrays out.
 */

import {
  parseContactsText,
  parseContactsFile,
  mergePhoneLines,
  describePhoneImport,
} from './parse-contacts';

/** parseContactsFile returns diagnostics alongside the rows; these tests assert the rows. */
const rowsOf = async (file: File) => (await parseContactsFile(file)).rows;

/**
 * A File-like stub carrying the three things parseContactsFile actually reads:
 * `name` (for the extension), `type` (for the MIME fallback) and `text()`.
 *
 * jsdom's Blob does not implement `.text()`, so a real `new File([...])` throws
 * "file.text is not a function" here while working perfectly in a browser.
 */
function fileOf(name: string, content: string, type = ''): File {
  return {
    name,
    type,
    text: () => Promise.resolve(content),
  } as unknown as File;
}

describe('parseContactsText — the paste format', () => {
  it('parses phone, name and semicolon/pipe tags', () => {
    expect(parseContactsText('919876543210,Asha,vip;delhi').rows).toEqual([
      { phone: '919876543210', name: 'Asha', tags: ['vip', 'delhi'] },
    ]);
    expect(parseContactsText('919876543210,Asha,vip|delhi').rows).toEqual([
      { phone: '919876543210', name: 'Asha', tags: ['vip', 'delhi'] },
    ]);
  });

  it('accepts a bare phone with no name or tags', () => {
    expect(parseContactsText('919876543210').rows).toEqual([{ phone: '919876543210' }]);
  });

  it('trims whitespace around every field', () => {
    expect(parseContactsText('  919876543210 , Asha ,  vip ; delhi ').rows).toEqual([
      { phone: '919876543210', name: 'Asha', tags: ['vip', 'delhi'] },
    ]);
  });

  it('skips blank lines and handles CRLF', () => {
    expect(parseContactsText('919876543210\r\n\r\n919999999999\r\n').rows).toEqual([
      { phone: '919876543210' },
      { phone: '919999999999' },
    ]);
  });

  it('drops rows with no phone rather than importing an empty recipient', () => {
    expect(parseContactsText(',Asha,vip').rows).toEqual([]);
  });

  it('dedupes by phone, keeping the first occurrence', () => {
    expect(parseContactsText('919876543210,First\n919876543210,Second').rows).toEqual([
      { phone: '919876543210', name: 'First' },
    ]);
  });

  it('preserves a leading + (the number is not normalized here)', () => {
    expect(parseContactsText('+91 98765 43210,Asha').rows).toEqual([
      { phone: '+91 98765 43210', name: 'Asha' },
    ]);
  });

  it('caps the import at 5000 rows', () => {
    const many = Array.from({ length: 5100 }, (_, i) => `9199000${String(i).padStart(5, '0')}`);
    expect(parseContactsText(many.join('\n')).rows).toHaveLength(5000);
  });

  it('returns an empty list for empty input', () => {
    expect(parseContactsText('').rows).toEqual([]);
    expect(parseContactsText('   \n  \n').rows).toEqual([]);
  });
});

describe('parseContactsFile — CSV', () => {
  it('maps columns by header name, in any order', async () => {
    const csv = ['Name,Tags,Phone', 'Asha,vip;delhi,919876543210'].join('\n');
    await expect(rowsOf(fileOf('c.csv', csv))).resolves.toEqual([
      { phone: '919876543210', name: 'Asha', tags: ['vip', 'delhi'] },
    ]);
  });

  it('accepts the alternate phone header spellings', async () => {
    for (const header of ['phone', 'number', 'mobile', 'whatsapp']) {
      const csv = `${header}\n919876543210`;
      await expect(rowsOf(fileOf('c.csv', csv))).resolves.toEqual([
        { phone: '919876543210' },
      ]);
    }
  });

  it('falls back to positional phone,name,tags when there is no header', async () => {
    const csv = '919876543210,Asha,vip';
    await expect(rowsOf(fileOf('c.csv', csv))).resolves.toEqual([
      { phone: '919876543210', name: 'Asha', tags: ['vip'] },
    ]);
  });

  it('detects CSV by MIME type when the extension is missing', async () => {
    await expect(
      rowsOf(fileOf('contacts', 'phone\n919876543210', 'text/csv')),
    ).resolves.toEqual([{ phone: '919876543210' }]);
  });

  it('leaves name undefined when the header has no name column', async () => {
    const csv = ['phone,tags', '919876543210,vip'].join('\n');
    await expect(rowsOf(fileOf('c.csv', csv))).resolves.toEqual([
      { phone: '919876543210', tags: ['vip'] },
    ]);
  });

  it('keeps every other column as a personalisation attribute', async () => {
    // These used to be dropped, so a list carrying city / order number had
    // nowhere to put them and `{{city}}` reached Meta as a literal.
    const csv = ['phone,name,City,Order Number', '919876543210,Asha,Mumbai,A-1'].join('\n');
    await expect(rowsOf(fileOf('c.csv', csv))).resolves.toEqual([
      {
        phone: '919876543210',
        name: 'Asha',
        attributes: { city: 'Mumbai', order_number: 'A-1' },
      },
    ]);
  });

  it('drops an empty attribute cell rather than storing a blank value', async () => {
    const csv = ['phone,City,Plan', '919876543210,,Gold'].join('\n');
    await expect(rowsOf(fileOf('c.csv', csv))).resolves.toEqual([
      { phone: '919876543210', attributes: { plan: 'Gold' } },
    ]);
  });

  it('unions attributes across duplicate rows for the same number', async () => {
    const csv = ['phone,City,Plan', '919876543210,Mumbai,', '919876543210,,Gold'].join('\n');
    await expect(rowsOf(fileOf('c.csv', csv))).resolves.toEqual([
      { phone: '919876543210', attributes: { city: 'Mumbai', plan: 'Gold' } },
    ]);
  });
});

describe('parseContactsFile — JSON', () => {
  it('parses an array of objects, matching keys case-insensitively', async () => {
    const json = JSON.stringify([{ Phone: '919876543210', Name: 'Asha', Tags: ['vip'] }]);
    await expect(rowsOf(fileOf('c.json', json))).resolves.toEqual([
      { phone: '919876543210', name: 'Asha', tags: ['vip'] },
    ]);
  });

  it('parses an array of bare phone strings', async () => {
    const json = JSON.stringify(['919876543210', '919999999999']);
    await expect(rowsOf(fileOf('c.json', json))).resolves.toEqual([
      { phone: '919876543210' },
      { phone: '919999999999' },
    ]);
  });

  it('routes unknown keys into attributes', async () => {
    const json = JSON.stringify([{ phone: '919876543210', City: 'Mumbai', plan_tier: 'Gold' }]);
    await expect(rowsOf(fileOf('c.json', json))).resolves.toEqual([
      { phone: '919876543210', attributes: { city: 'Mumbai', plan_tier: 'Gold' } },
    ]);
  });

  it('rejects a JSON object that is not an array', async () => {
    await expect(parseContactsFile(fileOf('c.json', '{"phone":"91987"}'))).rejects.toThrow(
      'JSON must be an array of contacts.',
    );
  });
});

describe('parseContactsFile — vCard', () => {
  it('takes the first TEL and the FN of each card', async () => {
    const vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Asha Kumar',
      'TEL;TYPE=CELL:+919876543210',
      'TEL;TYPE=HOME:+911123456789',
      'END:VCARD',
      'BEGIN:VCARD',
      'FN:Ravi',
      'TEL:+919999999999',
      'END:VCARD',
    ].join('\r\n');
    await expect(rowsOf(fileOf('c.vcf', vcf))).resolves.toEqual([
      { phone: '+919876543210', name: 'Asha Kumar' },
      { phone: '+919999999999', name: 'Ravi' },
    ]);
  });

  it('falls back to the structured N field when there is no FN', async () => {
    const vcf = ['BEGIN:VCARD', 'N:Kumar;Asha;;;', 'TEL:+919876543210', 'END:VCARD'].join('\n');
    await expect(rowsOf(fileOf('c.vcf', vcf))).resolves.toEqual([
      { phone: '+919876543210', name: 'Kumar Asha' },
    ]);
  });

  it('skips a card with no TEL rather than emitting a phone-less row', async () => {
    const vcf = ['BEGIN:VCARD', 'FN:No Number', 'END:VCARD'].join('\n');
    await expect(rowsOf(fileOf('c.vcf', vcf))).resolves.toEqual([]);
  });
});

describe('parseContactsFile — unsupported input', () => {
  it('names the formats it does accept', async () => {
    await expect(parseContactsFile(fileOf('notes.txt', 'anything'))).rejects.toThrow(
      'Unsupported file type. Use CSV, XLSX, JSON, or vCard.',
    );
  });
});

describe('mergePhoneLines — folding an uploaded file into the campaign textarea', () => {
  it('appends new numbers and keeps what was already typed', () => {
    const merged = mergePhoneLines('+919876543210\n', [
      { phone: '+919999999999' },
      { phone: '+918888888888' },
    ]);
    expect(merged.text).toBe('+919876543210\n+919999999999\n+918888888888');
    expect(merged.added).toBe(2);
    expect(merged.duplicates).toBe(0);
  });

  it('dedupes on the SERVER identity of a number, not the raw string', () => {
    // The campaign is billed per recipient, so '9876543210' arriving in a file
    // under a '+919876543210' already in the box must not become two sends.
    const merged = mergePhoneLines('+919876543210', [
      { phone: '9876543210' },
      { phone: '09876543210' },
      { phone: '+919999999999' },
    ]);
    expect(merged.text).toBe('+919876543210\n+919999999999');
    expect(merged.added).toBe(1);
    expect(merged.duplicates).toBe(2);
  });

  it('starts from an empty box without leaving a blank first line', () => {
    expect(mergePhoneLines('   \n\n', [{ phone: '+919876543210' }]).text).toBe('+919876543210');
  });
});

describe('describePhoneImport — the confirmation line', () => {
  it('reports only what happened when the file was clean', () => {
    const parse = { rows: [], totalSeen: 1, truncated: false, droppedNoPhone: 0, merged: 0 };
    expect(describePhoneImport(parse, { text: '', added: 1, duplicates: 0 })).toBe('1 number added');
  });

  it('says what was left out, so a half-unusable file cannot read as a clean import', () => {
    const parse = {
      rows: new Array(5000).fill({ phone: '+919876543210' }),
      totalSeen: 6000,
      truncated: true,
      droppedNoPhone: 12,
      merged: 3,
    };
    expect(describePhoneImport(parse, { text: '', added: 4000, duplicates: 7 })).toBe(
      '4,000 numbers added · 10 already on the list · 12 row(s) had no number · ' +
        'only the first 5,000 of 6,000 were read',
    );
  });
});
