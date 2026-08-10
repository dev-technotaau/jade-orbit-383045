/**
 * Tests for analyzeTemplate (src/lib/whatsapp-template-vars.ts).
 *
 * This derives, from Meta's `components` JSON, exactly which parameters a send
 * has to supply. Getting it wrong is the "(#131008) Required parameter is
 * missing" rejection the module's own header comment was written about — the
 * send fails at Meta, after the operator has already committed the audience.
 *
 * Fixtures are shaped like real approved-template payloads.
 */

import { analyzeTemplate } from './whatsapp-template-vars';
import type { WaTemplate } from '@/types/whatsapp';

/** Minimal WaTemplate carrying only what analyzeTemplate reads. */
const tpl = (components: unknown): WaTemplate =>
  ({ id: 't1', name: 'test', components }) as unknown as WaTemplate;

describe('analyzeTemplate — headers', () => {
  it('reports no header when there is no HEADER component', () => {
    const spec = analyzeTemplate(tpl([{ type: 'BODY', text: 'Hello' }]));
    expect(spec.headerFormat).toBe('NONE');
    expect(spec.headerHasTextVar).toBe(false);
    expect(spec.headerNeedsMedia).toBe(false);
  });

  it('flags a TEXT header that contains a variable', () => {
    const spec = analyzeTemplate(
      tpl([
        { type: 'HEADER', format: 'TEXT', text: 'Order {{1}}' },
        { type: 'BODY', text: 'Ready' },
      ]),
    );
    expect(spec.headerFormat).toBe('TEXT');
    expect(spec.headerHasTextVar).toBe(true);
    expect(spec.headerNeedsMedia).toBe(false);
    expect(spec.none).toBe(false);
  });

  it('does NOT flag a static TEXT header', () => {
    const spec = analyzeTemplate(
      tpl([
        { type: 'HEADER', format: 'TEXT', text: 'Your order' },
        { type: 'BODY', text: 'Ready' },
      ]),
    );
    expect(spec.headerHasTextVar).toBe(false);
    expect(spec.none).toBe(true);
  });

  it.each(['IMAGE', 'VIDEO', 'DOCUMENT'])('requires media for a %s header', (format) => {
    const spec = analyzeTemplate(
      tpl([
        { type: 'HEADER', format },
        { type: 'BODY', text: 'Hi' },
      ]),
    );
    expect(spec.headerFormat).toBe(format);
    expect(spec.headerNeedsMedia).toBe(true);
    expect(spec.none).toBe(false);
  });

  it('does not require media for a LOCATION header', () => {
    const spec = analyzeTemplate(tpl([{ type: 'HEADER', format: 'LOCATION' }]));
    expect(spec.headerFormat).toBe('LOCATION');
    expect(spec.headerNeedsMedia).toBe(false);
  });

  it('matches component types case-insensitively', () => {
    const spec = analyzeTemplate(
      tpl([
        { type: 'header', format: 'image' },
        { type: 'body', text: 'Hi {{1}}' },
      ]),
    );
    expect(spec.headerNeedsMedia).toBe(true);
    expect(spec.bodyPositional).toBe(1);
  });
});

describe('analyzeTemplate — body variables', () => {
  it('counts positional variables by their highest index', () => {
    const spec = analyzeTemplate(tpl([{ type: 'BODY', text: 'Hi {{1}}, order {{2}} of {{3}}' }]));
    expect(spec.bodyPositional).toBe(3);
    expect(spec.bodyNamed).toEqual([]);
  });

  it('uses the MAX index, not the count — a gap still needs the full array', () => {
    // Meta requires a parameter per position, so {{1}} + {{3}} needs three.
    const spec = analyzeTemplate(tpl([{ type: 'BODY', text: 'Hi {{1}} and {{3}}' }]));
    expect(spec.bodyPositional).toBe(3);
  });

  it('collects named variables and dedupes repeats', () => {
    const spec = analyzeTemplate(
      tpl([{ type: 'BODY', text: 'Hi {{name}}, your {{item}} — thanks {{name}}' }]),
    );
    expect(spec.bodyNamed).toEqual(['name', 'item']);
    expect(spec.bodyPositional).toBe(0);
  });

  it('tolerates whitespace inside the braces', () => {
    expect(analyzeTemplate(tpl([{ type: 'BODY', text: 'Hi {{ 1 }}' }])).bodyPositional).toBe(1);
    expect(analyzeTemplate(tpl([{ type: 'BODY', text: 'Hi {{ name }}' }])).bodyNamed).toEqual([
      'name',
    ]);
  });

  it('reports nothing for a body with no variables', () => {
    const spec = analyzeTemplate(tpl([{ type: 'BODY', text: 'Your order has shipped.' }]));
    expect(spec.bodyPositional).toBe(0);
    expect(spec.bodyNamed).toEqual([]);
    expect(spec.none).toBe(true);
  });
});

describe('analyzeTemplate — buttons', () => {
  it('flags a URL button with a dynamic suffix', () => {
    const spec = analyzeTemplate(
      tpl([
        { type: 'BODY', text: 'Track it' },
        {
          type: 'BUTTONS',
          buttons: [{ type: 'URL', text: 'Track', url: 'https://ex.com/o/{{1}}' }],
        },
      ]),
    );
    expect(spec.buttonUrlVar).toBe(true);
    expect(spec.none).toBe(false);
  });

  it('does not flag a static URL button or a quick reply', () => {
    const spec = analyzeTemplate(
      tpl([
        { type: 'BODY', text: 'Hello' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'URL', text: 'Visit', url: 'https://ex.com' },
            { type: 'QUICK_REPLY', text: 'Yes' },
          ],
        },
      ]),
    );
    expect(spec.buttonUrlVar).toBe(false);
    expect(spec.none).toBe(true);
  });
});

describe('analyzeTemplate — malformed input', () => {
  it('parses a components column that arrived as a JSON string', () => {
    const spec = analyzeTemplate(tpl(JSON.stringify([{ type: 'BODY', text: 'Hi {{1}}' }])));
    expect(spec.bodyPositional).toBe(1);
  });

  it('never throws on unparseable or missing components', () => {
    for (const value of ['not json', null, undefined, 42, {}]) {
      const spec = analyzeTemplate(tpl(value));
      expect(spec.none).toBe(true);
      expect(spec.headerFormat).toBe('NONE');
    }
  });
});

describe('analyzeTemplate — a fully-parameterized template', () => {
  it('reports every requirement at once', () => {
    const spec = analyzeTemplate(
      tpl([
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: 'Hi {{1}}, order {{2}}' },
        { type: 'FOOTER', text: 'Reply STOP to opt out' },
        {
          type: 'BUTTONS',
          buttons: [{ type: 'URL', text: 'Track', url: 'https://ex.com/{{1}}' }],
        },
      ]),
    );
    expect(spec).toEqual({
      headerFormat: 'IMAGE',
      headerHasTextVar: false,
      headerNeedsMedia: true,
      bodyPositional: 2,
      bodyNamed: [],
      buttonUrlVar: true,
      none: false,
    });
  });
});
