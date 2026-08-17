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

import {
  analyzeTemplate,
  renderTemplatePreview,
  resolveSampleToken,
  templateExamples,
  tokensWithoutFallback,
  usesSampleContact,
} from './whatsapp-template-vars';
import type { WaTemplate } from '@/types/whatsapp';

/** Minimal WaTemplate carrying only what analyzeTemplate reads. */
const tpl = (components: unknown): WaTemplate =>
  ({ id: 't1', name: 'test', components }) as unknown as WaTemplate;

describe('templateExamples', () => {
  it('reads positional body examples in slot order', () => {
    const examples = templateExamples(
      tpl([
        {
          type: 'BODY',
          text: 'Hi {{1}}, order {{2}} shipped',
          example: { body_text: [['Priya', 'A1234']] },
        },
      ]),
    );
    expect(examples.body).toEqual({ '1': 'Priya', '2': 'A1234' });
  });

  it('reads named body examples and the header example', () => {
    const examples = templateExamples(
      tpl([
        {
          type: 'HEADER',
          format: 'TEXT',
          text: 'Order {{1}}',
          example: { header_text: ['A1234'] },
        },
        {
          type: 'BODY',
          text: 'Hi {{customer_name}}',
          example: { body_text_named_params: [{ param_name: 'customer_name', example: 'Priya' }] },
        },
      ]),
    );
    expect(examples.headerText).toBe('A1234');
    expect(examples.body).toEqual({ customer_name: 'Priya' });
  });

  it('falls back to the legacy variableSample column when components carry none', () => {
    const template = {
      id: 't1',
      name: 'test',
      components: [{ type: 'BODY', text: 'Hi {{1}}' }],
      variableSample: { body_text: [['Priya']] },
    } as unknown as WaTemplate;
    expect(templateExamples(template).body).toEqual({ '1': 'Priya' });
  });

  it('prefers the component examples over the legacy column', () => {
    const template = {
      id: 't1',
      name: 'test',
      components: [{ type: 'BODY', text: 'Hi {{1}}', example: { body_text: [['Approved']] } }],
      variableSample: { body_text: [['Stale']] },
    } as unknown as WaTemplate;
    expect(templateExamples(template).body).toEqual({ '1': 'Approved' });
  });

  it('returns nothing for a template with no examples at all', () => {
    expect(templateExamples(tpl([{ type: 'BODY', text: 'Hello' }]))).toEqual({ body: {} });
  });
});

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

describe('analyzeTemplate — carousel cards', () => {
  const card = (body: string, buttons: unknown[] = []) => ({
    components: [
      { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['h'] } },
      { type: 'BODY', text: body, example: { body_text: [['20%']] } },
      ...(buttons.length ? [{ type: 'BUTTONS', buttons }] : []),
    ],
  });

  it('reports one entry per card, with each card numbered from {{1}}', () => {
    const spec = analyzeTemplate(
      tpl([
        { type: 'BODY', text: 'Hi {{1}}' },
        {
          type: 'CAROUSEL',
          cards: [
            card('Save {{1}} on pots', [
              { type: 'QUICK_REPLY', text: 'More' },
              { type: 'URL', text: 'Shop', url: 'https://ex.com/{{1}}' },
            ]),
            card('And {{1}} on soil'),
          ],
        },
      ]),
    );
    expect(spec.carouselCards).toHaveLength(2);
    expect(spec.carouselCards[0]).toEqual({
      headerFormat: 'IMAGE',
      bodyPositional: 1,
      bodyText: 'Save {{1}} on pots',
      bodyExamples: ['20%'],
      buttonUrlVar: true,
      buttons: [
        { index: 0, type: 'QUICK_REPLY', text: 'More', hasUrlVar: false },
        { index: 1, type: 'URL', text: 'Shop', hasUrlVar: true },
      ],
    });
    // The second card carries no buttons at all, so it needs no button value.
    expect(spec.carouselCards[1].buttonUrlVar).toBe(false);
    // Card media and card text are runtime parameters, so a carousel is never
    // "nothing to fill in" — that is what let one be sent with no cards at all.
    expect(spec.none).toBe(false);
  });

  it('reports no cards for every other template', () => {
    expect(analyzeTemplate(tpl([{ type: 'BODY', text: 'Hello' }])).carouselCards).toEqual([]);
  });
});

describe('renderTemplatePreview — carousel cards', () => {
  it('substitutes each card with its OWN values and labels what is still empty', () => {
    const p = renderTemplatePreview(
      tpl([
        { type: 'BODY', text: 'Hi {{1}}' },
        {
          type: 'CAROUSEL',
          cards: [
            {
              components: [
                { type: 'HEADER', format: 'IMAGE' },
                { type: 'BODY', text: 'Save {{1}}' },
                {
                  type: 'BUTTONS',
                  buttons: [{ type: 'URL', text: 'Shop', url: 'https://ex.com/{{1}}' }],
                },
              ],
            },
            {
              components: [
                { type: 'HEADER', format: 'IMAGE' },
                { type: 'BODY', text: 'Save {{1}}' },
                {
                  type: 'BUTTONS',
                  buttons: [{ type: 'URL', text: 'Shop', url: 'https://ex.com/{{1}}' }],
                },
              ],
            },
          ],
        },
      ]),
      {
        bodyParams: ['Priya'],
        carouselCards: [
          {
            headerMediaUrl: 'https://cdn.example.com/1.jpg',
            bodyParams: ['20%'],
            buttonUrlParam: 'pots',
          },
          {},
        ],
      },
    );
    expect(p.cards).toHaveLength(2);
    expect(p.cards[0].body).toBe('Save 20%');
    expect(p.cards[0].mediaUrl).toBe('https://cdn.example.com/1.jpg');
    expect(p.cards[0].buttons).toEqual([{ type: 'URL', text: 'Shop', detail: 'pots' }]);
    expect(p.cards[1].body).toBe('Save {{1}}');
    // Card 2's link button has no value either, so it shows as the bare button.
    expect(p.cards[1].buttons).toEqual([{ type: 'URL', text: 'Shop' }]);
    expect(p.cards[1].mediaUrl).toBeNull();
    // Every card numbers its variables from {{1}}, so a bare token would not say
    // which card is still empty.
    expect(p.unfilled).toContain('card 2 {{1}}');
    expect(p.unfilled).not.toContain('{{1}}');
  });

  it('shows an uploaded card by its media id when there is no link to show', () => {
    const p = renderTemplatePreview(
      tpl([
        { type: 'BODY', text: 'Hello' },
        {
          type: 'CAROUSEL',
          cards: [{ components: [{ type: 'HEADER', format: 'VIDEO' }, { type: 'BODY' }] }],
        },
      ]),
      { carouselCards: [{ headerMediaId: 'media-1' }] },
    );
    expect(p.cards[0]).toEqual({
      headerFormat: 'VIDEO',
      mediaUrl: 'media-1',
      body: '',
      buttons: [],
    });
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
      headerNeedsLocation: false,
      needsOtpCode: false,
      needsCouponCode: false,
      needsLtoExpiration: false,
      bodyPositional: 2,
      bodyNamed: [],
      buttonUrlVar: true,
      carouselCards: [],
      none: false,
    });
  });
});

/**
 * renderTemplatePreview is what the operator reads before committing a send, so
 * a wrong preview is worse than none: it would confirm an order that is not the
 * one Meta receives. These pin it to the same substitution the backend does.
 */
describe('renderTemplatePreview — body', () => {
  it('substitutes positional values in order', () => {
    const p = renderTemplatePreview(tpl([{ type: 'BODY', text: 'Hi {{1}}, your order {{2}}.' }]), {
      bodyParams: ['Rahul', '#4821'],
    });
    expect(p.body).toBe('Hi Rahul, your order #4821.');
    expect(p.unfilled).toEqual([]);
  });

  it('keeps an unfilled placeholder verbatim and reports it', () => {
    const p = renderTemplatePreview(tpl([{ type: 'BODY', text: 'Hi {{1}}, order {{2}}' }]), {
      bodyParams: ['Rahul'],
    });
    expect(p.body).toBe('Hi Rahul, order {{2}}');
    expect(p.unfilled).toEqual(['{{2}}']);
  });

  it('treats a whitespace-only value as unfilled', () => {
    const p = renderTemplatePreview(tpl([{ type: 'BODY', text: 'Hi {{1}}' }]), {
      bodyParams: ['   '],
    });
    expect(p.body).toBe('Hi {{1}}');
    expect(p.unfilled).toEqual(['{{1}}']);
  });

  it('reports a repeated placeholder once', () => {
    const p = renderTemplatePreview(tpl([{ type: 'BODY', text: '{{1}} and {{1}}' }]));
    expect(p.unfilled).toEqual(['{{1}}']);
  });

  it('substitutes named values by token', () => {
    const p = renderTemplatePreview(
      tpl([{ type: 'BODY', text: 'Hi {{name}}, your {{item}} is ready' }]),
      { bodyNamedParams: { name: 'Priya', item: 'jacket' } },
    );
    expect(p.body).toBe('Hi Priya, your jacket is ready');
    expect(p.unfilled).toEqual([]);
  });

  it('preserves the whitespace form of a placeholder it cannot fill', () => {
    const p = renderTemplatePreview(tpl([{ type: 'BODY', text: 'Hi {{ 1 }}' }]));
    expect(p.body).toBe('Hi {{ 1 }}');
    expect(p.unfilled).toEqual(['{{ 1 }}']);
  });

  it('fills body {{1}} from the one-time code on an OTP template', () => {
    // Mirrors the send layer: otpCode becomes the body parameter when none was typed.
    const p = renderTemplatePreview(
      tpl([
        { type: 'BODY', text: '*{{1}}* is your verification code.' },
        { type: 'BUTTONS', buttons: [{ type: 'OTP', text: 'Copy code' }] },
      ]),
      { otpCode: '472913' },
    );
    expect(p.body).toBe('*472913* is your verification code.');
    expect(p.unfilled).toEqual([]);
  });

  it('lets an explicit body value win over the one-time code', () => {
    const p = renderTemplatePreview(
      tpl([
        { type: 'BODY', text: '{{1}} is your code.' },
        { type: 'BUTTONS', buttons: [{ type: 'OTP', text: 'Copy code' }] },
      ]),
      { bodyParams: ['112233'], otpCode: '472913' },
    );
    expect(p.body).toBe('112233 is your code.');
  });

  it('returns an empty body when the template has none', () => {
    const p = renderTemplatePreview(tpl([{ type: 'HEADER', format: 'IMAGE' }]));
    expect(p.body).toBe('');
  });
});

describe('renderTemplatePreview — header, footer and buttons', () => {
  it('substitutes a variable TEXT header', () => {
    const p = renderTemplatePreview(
      tpl([
        { type: 'HEADER', format: 'TEXT', text: 'Order {{1}}' },
        { type: 'BODY', text: 'Ready' },
      ]),
      { headerText: '#4821' },
    );
    expect(p.headerText).toBe('Order #4821');
    expect(p.headerMediaUrl).toBeNull();
  });

  it('carries the media URL for a media header and no header text', () => {
    const p = renderTemplatePreview(
      tpl([
        { type: 'HEADER', format: 'IMAGE' },
        { type: 'BODY', text: 'Hi' },
      ]),
      { headerMediaUrl: 'https://ex.com/banner.jpg' },
    );
    expect(p.headerFormat).toBe('IMAGE');
    expect(p.headerMediaUrl).toBe('https://ex.com/banner.jpg');
    expect(p.headerText).toBeNull();
  });

  it('joins name and address for a LOCATION header', () => {
    const p = renderTemplatePreview(
      tpl([
        { type: 'HEADER', format: 'LOCATION' },
        { type: 'BODY', text: 'See you there' },
      ]),
      { headerLocation: { name: 'Bandra store', address: 'Linking Rd' } },
    );
    expect(p.headerLocation).toBe('Bandra store — Linking Rd');
  });

  it('leaves the location null when nothing was entered', () => {
    const p = renderTemplatePreview(tpl([{ type: 'HEADER', format: 'LOCATION' }]));
    expect(p.headerLocation).toBeNull();
  });

  it('returns the footer text', () => {
    const p = renderTemplatePreview(
      tpl([
        { type: 'BODY', text: 'Hi' },
        { type: 'FOOTER', text: 'Reply STOP to opt out' },
      ]),
    );
    expect(p.footer).toBe('Reply STOP to opt out');
  });

  it('resolves a dynamic URL button and reports it when unfilled', () => {
    const components = [
      { type: 'BODY', text: 'Track it' },
      {
        type: 'BUTTONS',
        buttons: [{ type: 'URL', text: 'Track', url: 'https://ex.com/o/{{1}}' }],
      },
    ];
    expect(renderTemplatePreview(tpl(components), { buttonUrlParam: '4821' }).buttons).toEqual([
      { type: 'URL', text: 'Track', detail: 'https://ex.com/o/4821' },
    ]);
    const blank = renderTemplatePreview(tpl(components));
    expect(blank.buttons[0].detail).toBe('https://ex.com/o/{{1}}');
    expect(blank.unfilled).toEqual(['{{1}}']);
  });

  it('shows the coupon on a COPY_CODE button and keeps quick replies plain', () => {
    const p = renderTemplatePreview(
      tpl([
        { type: 'BODY', text: 'Enjoy' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'COPY_CODE', text: 'Copy offer code' },
            { type: 'QUICK_REPLY', text: 'Stop promotions' },
          ],
        },
      ]),
      { couponCode: 'SAVE20' },
    );
    expect(p.buttons).toEqual([
      { type: 'COPY_CODE', text: 'Copy offer code', detail: 'SAVE20' },
      { type: 'QUICK_REPLY', text: 'Stop promotions' },
    ]);
  });

  it('never throws on unparseable components', () => {
    const p = renderTemplatePreview(tpl('not json'));
    expect(p).toEqual({
      headerFormat: 'NONE',
      headerText: null,
      headerMediaUrl: null,
      headerLocation: null,
      body: '',
      footer: null,
      buttons: [],
      cards: [],
      unfilled: [],
    });
  });
});

describe('campaign sample-contact tokens', () => {
  it('stands sample data in for the per-recipient tokens', () => {
    expect(resolveSampleToken('{{name}}')).toBe('Priya Sharma');
    expect(resolveSampleToken('{{phone}}')).toBe('+91 98765 43210');
  });

  it('passes a literal through untouched, matching the backend exactly', () => {
    // resolveVars compares the raw token, so a padded one really does send literally.
    expect(resolveSampleToken('Diwali sale')).toBe('Diwali sale');
    expect(resolveSampleToken(' {{name}} ')).toBe(' {{name}} ');
  });

  it('is not fooled by inherited object keys', () => {
    expect(resolveSampleToken('toString')).toBe('toString');
    expect(usesSampleContact(['constructor'])).toBe(false);
  });

  it('flags a mapping that carries a per-recipient token', () => {
    expect(usesSampleContact(['{{name}}', 'Diwali sale'])).toBe(true);
    expect(usesSampleContact(['Diwali sale'])).toBe(false);
    expect(usesSampleContact([])).toBe(false);
    expect(usesSampleContact(['{{attr.city}}'])).toBe(true);
  });

  it('previews the value behind a fallback, not the fallback', () => {
    // `{{name|there}}` sends "there" only to the contacts with no name, so the
    // preview shows what the majority actually receives.
    expect(resolveSampleToken('{{name|there}}')).toBe('Priya Sharma');
  });

  it('shows an attribute by its key, which is the only sample it has', () => {
    expect(resolveSampleToken('{{attr.city}}')).toBe('city');
    expect(resolveSampleToken('{{attributes.order_id|—}}')).toBe('order_id');
  });
});

describe('tokensWithoutFallback', () => {
  it('names the tokens that can send an empty parameter', () => {
    // Meta rejects an empty parameter and fails the WHOLE message, so a bare
    // {{name}} over mostly-nameless imported contacts hard-fails the audience.
    expect(tokensWithoutFallback(['{{name}}', '{{attr.city}}'])).toEqual([
      '{{name}}',
      '{{attr.city}}',
    ]);
  });

  it('says nothing about a token that carries one', () => {
    expect(tokensWithoutFallback(['{{name|there}}', '{{attr.city|your city}}'])).toEqual([]);
  });

  it('never flags {{phone}} or a typed literal', () => {
    // Every contact is keyed by a phone number, so that one cannot resolve blank.
    expect(tokensWithoutFallback(['{{phone}}', 'Diwali sale', '{{order_id}}'])).toEqual([]);
  });
});
