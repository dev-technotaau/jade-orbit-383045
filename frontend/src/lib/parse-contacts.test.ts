/**
 * Tests for the contact-import parsers (src/lib/parse-contacts.ts).
 *
 * These decide who a campaign is sent to. A parser bug here is not a rendering
 * glitch — it is messages delivered to the wrong number, or an audience that
 * silently loses rows, and it happens before any backend validation can see it.
 *
 * Pure functions over strings, so no mocks: fixtures in, exact arrays out.
 */

import { parseContactsText, parseContactsFile } from './parse-contacts';

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
    expect(parseContactsText('919876543210,Asha,vip;delhi')).toEqual([
      { phone: '919876543210', name: 'Asha', tags: ['vip', 'delhi'] },
    ]);
    expect(parseContactsText('919876543210,Asha,vip|delhi')).toEqual([
      { phone: '919876543210', name: 'Asha', tags: ['vip', 'delhi'] },
    ]);
  });

  it('accepts a bare phone with no name or tags', () => {
    expect(parseContactsText('919876543210')).toEqual([{ phone: '919876543210' }]);
  });

  it('trims whitespace around every field', () => {
    expect(parseContactsText('  919876543210 , Asha ,  vip ; delhi ')).toEqual([
      { phone: '919876543210', name: 'Asha', tags: ['vip', 'delhi'] },
    ]);
  });

  it('skips blank lines and handles CRLF', () => {
    expect(parseContactsText('919876543210\r\n\r\n919999999999\r\n')).toEqual([
      { phone: '919876543210' },
      { phone: '919999999999' },
    ]);
  });

  it('drops rows with no phone rather than importing an empty recipient', () => {
    expect(parseContactsText(',Asha,vip')).toEqual([]);
  });

  it('dedupes by phone, keeping the first occurrence', () => {
    expect(parseContactsText('919876543210,First\n919876543210,Second')).toEqual([
      { phone: '919876543210', name: 'First' },
    ]);
  });

  it('preserves a leading + (the number is not normalized here)', () => {
    expect(parseContactsText('+91 98765 43210,Asha')).toEqual([
      { phone: '+91 98765 43210', name: 'Asha' },
    ]);
  });

  it('caps the import at 5000 rows', () => {
    const many = Array.from({ length: 5100 }, (_, i) => `9199000${String(i).padStart(5, '0')}`);
    expect(parseContactsText(many.join('\n'))).toHaveLength(5000);
  });

  it('returns an empty list for empty input', () => {
    expect(parseContactsText('')).toEqual([]);
    expect(parseContactsText('   \n  \n')).toEqual([]);
  });
});

describe('parseContactsFile — CSV', () => {
  it('maps columns by header name, in any order', async () => {
    const csv = ['Name,Tags,Phone', 'Asha,vip;delhi,919876543210'].join('\n');
    await expect(parseContactsFile(fileOf('c.csv', csv))).resolves.toEqual([
      { phone: '919876543210', name: 'Asha', tags: ['vip', 'delhi'] },
    ]);
  });

  it('accepts the alternate phone header spellings', async () => {
    for (const header of ['phone', 'number', 'mobile', 'whatsapp']) {
      const csv = `${header}\n919876543210`;
      await expect(parseContactsFile(fileOf('c.csv', csv))).resolves.toEqual([
        { phone: '919876543210' },
      ]);
    }
  });

  it('falls back to positional phone,name,tags when there is no header', async () => {
    const csv = '919876543210,Asha,vip';
    await expect(parseContactsFile(fileOf('c.csv', csv))).resolves.toEqual([
      { phone: '919876543210', name: 'Asha', tags: ['vip'] },
    ]);
  });

  it('detects CSV by MIME type when the extension is missing', async () => {
    await expect(
      parseContactsFile(fileOf('contacts', 'phone\n919876543210', 'text/csv')),
    ).resolves.toEqual([{ phone: '919876543210' }]);
  });

  it('leaves name undefined when the header has no name column', async () => {
    const csv = ['phone,tags', '919876543210,vip'].join('\n');
    await expect(parseContactsFile(fileOf('c.csv', csv))).resolves.toEqual([
      { phone: '919876543210', tags: ['vip'] },
    ]);
  });
});

describe('parseContactsFile — JSON', () => {
  it('parses an array of objects, matching keys case-insensitively', async () => {
    const json = JSON.stringify([{ Phone: '919876543210', Name: 'Asha', Tags: ['vip'] }]);
    await expect(parseContactsFile(fileOf('c.json', json))).resolves.toEqual([
      { phone: '919876543210', name: 'Asha', tags: ['vip'] },
    ]);
  });

  it('parses an array of bare phone strings', async () => {
    const json = JSON.stringify(['919876543210', '919999999999']);
    await expect(parseContactsFile(fileOf('c.json', json))).resolves.toEqual([
      { phone: '919876543210' },
      { phone: '919999999999' },
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
    await expect(parseContactsFile(fileOf('c.vcf', vcf))).resolves.toEqual([
      { phone: '+919876543210', name: 'Asha Kumar' },
      { phone: '+919999999999', name: 'Ravi' },
    ]);
  });

  it('falls back to the structured N field when there is no FN', async () => {
    const vcf = ['BEGIN:VCARD', 'N:Kumar;Asha;;;', 'TEL:+919876543210', 'END:VCARD'].join('\n');
    await expect(parseContactsFile(fileOf('c.vcf', vcf))).resolves.toEqual([
      { phone: '+919876543210', name: 'Kumar Asha' },
    ]);
  });

  it('skips a card with no TEL rather than emitting a phone-less row', async () => {
    const vcf = ['BEGIN:VCARD', 'FN:No Number', 'END:VCARD'].join('\n');
    await expect(parseContactsFile(fileOf('c.vcf', vcf))).resolves.toEqual([]);
  });
});

describe('parseContactsFile — unsupported input', () => {
  it('names the formats it does accept', async () => {
    await expect(parseContactsFile(fileOf('notes.txt', 'anything'))).rejects.toThrow(
      'Unsupported file type. Use CSV, XLSX, JSON, or vCard.',
    );
  });
});
