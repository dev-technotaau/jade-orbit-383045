import { z } from 'zod';
import { templateComponentsSchema, refineParameterFormat } from '../whatsapp-template-components';

/**
 * The `components` array used to be `z.array(z.any())`, so every structural
 * mistake was found by Meta a round trip later and came back as a prose string
 * that mapped to no field — while the template name was claimed at Meta forever.
 *
 * These cases are the shapes the browser builder actually emits
 * (TemplateBuilder `buildStandardComponents` / `buildAuthComponents`), so a
 * change that makes the schema stricter than the builder fails here rather than
 * at Meta.
 */
const parse = (components: unknown) => templateComponentsSchema.safeParse(components);
const messages = (result: ReturnType<typeof parse>): string[] =>
  result.success ? [] : result.error.issues.map((i) => i.message);

describe('templateComponentsSchema — shapes the builder emits', () => {
  it('accepts a marketing template with header, body, footer and buttons', () => {
    const result = parse([
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Order {{1}}',
        example: { header_text: ['A1234'] },
      },
      {
        type: 'BODY',
        text: 'Hi {{1}}, your order {{2}} has shipped.',
        example: { body_text: [['Priya', 'A1234']] },
      },
      { type: 'FOOTER', text: 'Reply STOP to opt out' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Thanks' },
          {
            type: 'URL',
            text: 'Track order',
            url: 'https://example.com/t/{{1}}',
            example: ['https://example.com/t/A1234'],
          },
        ],
      },
    ]);
    expect(result.success).toBe(true);
  });

  it('accepts a named-placeholder body with per-name examples', () => {
    const result = parse([
      {
        type: 'BODY',
        text: 'Hi {{customer_name}}, your appointment is confirmed.',
        example: {
          body_text_named_params: [{ param_name: 'customer_name', example: 'Priya' }],
        },
      },
    ]);
    expect(result.success).toBe(true);
  });

  it('accepts an authentication template, whose body carries no text', () => {
    const result = parse([
      { type: 'BODY', add_security_recommendation: true },
      { type: 'FOOTER', code_expiration_minutes: 10 },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'OTP',
            otp_type: 'ONE_TAP',
            text: 'Copy code',
            autofill_text: 'Autofill',
            package_name: 'com.example.app',
            signature_hash: '01234567890',
          },
        ],
      },
    ]);
    expect(result.success).toBe(true);
  });

  it('accepts the marketing add-ons (offer countdown + copy-code button)', () => {
    const result = parse([
      { type: 'BODY', text: 'Flash sale on now.' },
      {
        type: 'LIMITED_TIME_OFFER',
        limited_time_offer: { text: 'Ends soon', has_expiration: true },
      },
      { type: 'BUTTONS', buttons: [{ type: 'COPY_CODE', example: 'SAVE20' }] },
    ]);
    expect(result.success).toBe(true);
  });

  it('accepts a carousel: two cards with the same media, body and buttons', () => {
    const card = (body: string) => ({
      components: [
        { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['4::abc'] } },
        { type: 'BODY', text: body, example: { body_text: [['20%']] } },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'QUICK_REPLY', text: 'More like this' },
            {
              type: 'URL',
              text: 'Shop now',
              url: 'https://example.com/s?p={{1}}',
              example: ['https://example.com/s?p=summer'],
            },
          ],
        },
      ],
    });
    const result = parse([
      { type: 'BODY', text: 'Rare plants, {{1}}!', example: { body_text: [['Priya']] } },
      { type: 'CAROUSEL', cards: [card('Save {{1}} on pots'), card('Save {{1}} on soil')] },
    ]);
    expect(result.success).toBe(true);
  });

  it('keeps fields it does not model — the parsed body is what Meta receives', () => {
    const result = parse([
      { type: 'BODY', text: 'Hello', some_future_meta_field: { nested: true } },
    ]);
    expect(result.success).toBe(true);
    expect(result.success && result.data[0]).toMatchObject({
      type: 'BODY',
      some_future_meta_field: { nested: true },
    });
  });

  it('normalises lowercase types to the uppercase Meta requires on create', () => {
    const result = parse([
      { type: 'body', text: 'Hello' },
      { type: 'buttons', buttons: [{ type: 'quick_reply', text: 'Hi' }] },
    ]);
    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual([
      { type: 'BODY', text: 'Hello' },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Hi' }] },
    ]);
  });
});

describe('templateComponentsSchema — carousel rules', () => {
  const imageCard = (over: Record<string, unknown> = {}) => ({
    components: [
      { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['h'] } },
      { type: 'BODY', text: 'Card text' },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'More' }] },
    ],
    ...over,
  });
  const withCarousel = (cards: unknown[]) =>
    parse([
      { type: 'BODY', text: 'Hello' },
      { type: 'CAROUSEL', cards },
    ]);

  it('rejects cards whose header formats disagree', () => {
    const result = withCarousel([
      imageCard(),
      {
        components: [
          { type: 'HEADER', format: 'VIDEO', example: { header_handle: ['h'] } },
          { type: 'BODY', text: 'Card text' },
          { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'More' }] },
        ],
      },
    ]);
    expect(messages(result)).toContain(
      'Every card must use the same header format — card 2 is VIDEO but card 1 is IMAGE'
    );
  });

  it('rejects cards whose buttons are in a different order', () => {
    const result = withCarousel([
      {
        components: [
          { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['h'] } },
          { type: 'BODY', text: 'Card text' },
          {
            type: 'BUTTONS',
            buttons: [
              { type: 'QUICK_REPLY', text: 'More' },
              { type: 'URL', text: 'Shop', url: 'https://example.com' },
            ],
          },
        ],
      },
      {
        components: [
          { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['h'] } },
          { type: 'BODY', text: 'Card text' },
          {
            type: 'BUTTONS',
            buttons: [
              { type: 'URL', text: 'Shop', url: 'https://example.com' },
              { type: 'QUICK_REPLY', text: 'More' },
            ],
          },
        ],
      },
    ]);
    expect(messages(result).join(' ')).toContain('the same buttons in the same order');
  });

  it('rejects a card with a text header — a card header is media only', () => {
    const result = withCarousel([
      {
        components: [
          { type: 'HEADER', format: 'TEXT', text: 'nope' },
          { type: 'BODY', text: 'x' },
        ],
      },
    ]);
    expect(result.success).toBe(false);
  });

  it('rejects a card variable with no example value', () => {
    const result = withCarousel([
      {
        components: [
          { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['h'] } },
          { type: 'BODY', text: 'Save {{1}}' },
        ],
      },
    ]);
    expect(messages(result)).toContain(
      'Provide an example value for each of the 1 card variable(s)'
    );
  });

  it('rejects a bubble header or button row beside a carousel', () => {
    const result = parse([
      { type: 'HEADER', format: 'IMAGE', example: { header_handle: ['h'] } },
      { type: 'BODY', text: 'Hello' },
      { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'Hi' }] },
      { type: 'CAROUSEL', cards: [imageCard()] },
    ]);
    expect(messages(result)).toEqual(
      expect.arrayContaining([
        "A carousel template's message bubble carries body text only — put the HEADER on the cards",
        "A carousel template's message bubble carries body text only — put the BUTTONS on the cards",
      ])
    );
  });

  it('rejects an eleventh card', () => {
    const result = withCarousel(Array.from({ length: 11 }, () => imageCard()));
    expect(messages(result)).toContain('A carousel is limited to 10 cards');
  });

  it('normalises a lowercase carousel, cards included', () => {
    const result = parse([
      { type: 'body', text: 'Hello' },
      {
        type: 'carousel',
        cards: [
          {
            components: [
              { type: 'header', format: 'image', example: { header_handle: ['h'] } },
              { type: 'body', text: 'Card text' },
              { type: 'buttons', buttons: [{ type: 'quick_reply', text: 'More' }] },
            ],
          },
        ],
      },
    ]);
    expect(result.success).toBe(true);
    // `validate` reassigns req.body to the parsed result, so this IS what Meta
    // receives — uppercase, cards and all.
    expect(result.success && result.data[1]).toMatchObject({
      type: 'CAROUSEL',
      cards: [
        {
          components: [
            { type: 'HEADER', format: 'IMAGE' },
            { type: 'BODY', text: 'Card text' },
            { type: 'BUTTONS', buttons: [{ type: 'QUICK_REPLY', text: 'More' }] },
          ],
        },
      ],
    });
  });
});

describe('templateComponentsSchema — mistakes Meta used to find for us', () => {
  it('rejects a template with no BODY', () => {
    const result = parse([{ type: 'FOOTER', text: 'Bye' }]);
    expect(result.success).toBe(false);
    expect(messages(result).join(' ')).toContain('exactly one BODY');
  });

  it('rejects two BODY components', () => {
    const result = parse([
      { type: 'BODY', text: 'One' },
      { type: 'BODY', text: 'Two' },
    ]);
    expect(messages(result).join(' ')).toContain('exactly one BODY');
  });

  it('rejects two headers', () => {
    const result = parse([
      { type: 'HEADER', format: 'TEXT', text: 'A' },
      { type: 'HEADER', format: 'TEXT', text: 'B' },
      { type: 'BODY', text: 'Hello' },
    ]);
    expect(messages(result).join(' ')).toContain('at most one HEADER');
  });

  it('rejects a media header with no uploaded sample', () => {
    const result = parse([
      { type: 'HEADER', format: 'IMAGE' },
      { type: 'BODY', text: 'Hello' },
    ]);
    expect(messages(result).join(' ')).toContain('header_handle');
  });

  it('rejects a body variable with no example', () => {
    const result = parse([{ type: 'BODY', text: 'Hi {{1}}' }]);
    expect(messages(result).join(' ')).toContain('example value');
  });

  it('rejects placeholders that skip a number', () => {
    const result = parse([
      { type: 'BODY', text: 'Hi {{1}} — {{3}}', example: { body_text: [['a', 'b']] } },
    ]);
    expect(messages(result).join(' ')).toContain('no gaps');
  });

  it('rejects a body that mixes numbered and named placeholders', () => {
    const result = parse([{ type: 'BODY', text: 'Hi {{1}} of {{city}}' }]);
    expect(messages(result).join(' ')).toContain('not both');
  });

  it('rejects a named header, which Meta approves and then refuses on every send', () => {
    const result = parse([
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Hi {{name}}',
        example: { header_text: ['Priya'] },
      },
      { type: 'BODY', text: 'Hello' },
    ]);
    expect(messages(result).join(' ')).toContain('numbered');
  });

  it('rejects a footer containing a variable', () => {
    const result = parse([
      { type: 'BODY', text: 'Hello' },
      { type: 'FOOTER', text: 'Sent to {{1}}' },
    ]);
    expect(messages(result).join(' ')).toContain('cannot contain variables');
  });

  it('rejects more than ten buttons', () => {
    const result = parse([
      { type: 'BODY', text: 'Hello' },
      {
        type: 'BUTTONS',
        buttons: Array.from({ length: 11 }, (_, i) => ({
          type: 'QUICK_REPLY',
          text: `Option ${i}`,
        })),
      },
    ]);
    expect(messages(result).join(' ')).toContain('at most 10 buttons');
  });

  it('rejects a third URL button', () => {
    const result = parse([
      { type: 'BODY', text: 'Hello' },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'URL', text: 'A', url: 'https://a.example' },
          { type: 'URL', text: 'B', url: 'https://b.example' },
          { type: 'URL', text: 'C', url: 'https://c.example' },
        ],
      },
    ]);
    expect(messages(result).join(' ')).toContain('at most 2 website buttons');
  });

  it('rejects a dynamic URL button with no example link', () => {
    const result = parse([
      { type: 'BODY', text: 'Hello' },
      {
        type: 'BUTTONS',
        buttons: [{ type: 'URL', text: 'Track', url: 'https://a.example/{{1}}' }],
      },
    ]);
    expect(messages(result).join(' ')).toContain('example URL');
  });

  it('rejects a call button with no phone number, naming the field', () => {
    const result = parse([
      { type: 'BODY', text: 'Hello' },
      { type: 'BUTTONS', buttons: [{ type: 'PHONE_NUMBER', text: 'Call us' }] },
    ]);
    expect(result.success).toBe(false);
    // The path is what the raw Meta error never carried.
    expect(result.success === false && result.error.issues[0].path).toEqual([
      1,
      'buttons',
      0,
      'phone_number',
    ]);
  });

  it('rejects zero-tap autofill without the terms acknowledgement', () => {
    const result = parse([
      { type: 'BODY', add_security_recommendation: true },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'OTP',
            otp_type: 'ZERO_TAP',
            text: 'Copy code',
            package_name: 'com.example.app',
            signature_hash: '01234567890',
          },
        ],
      },
    ]);
    expect(messages(result).join(' ')).toContain('zero_tap_terms_accepted');
  });

  it('rejects an empty components array', () => {
    expect(parse([]).success).toBe(false);
  });
});

describe('refineParameterFormat', () => {
  const check = (value: { components?: unknown; parameterFormat?: 'POSITIONAL' | 'NAMED' }) => {
    const schema = z.object({ components: z.any(), parameterFormat: z.any() });
    return schema.superRefine(refineParameterFormat).safeParse(value);
  };

  it('rejects NAMED declared over a numbered body', () => {
    const result = check({
      components: [{ type: 'BODY', text: 'Hi {{1}}' }],
      parameterFormat: 'NAMED',
    });
    expect(result.success).toBe(false);
  });

  it('rejects POSITIONAL declared over a named body', () => {
    const result = check({
      components: [{ type: 'BODY', text: 'Hi {{customer_name}}' }],
      parameterFormat: 'POSITIONAL',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a body with no placeholders under either format', () => {
    expect(
      check({ components: [{ type: 'BODY', text: 'Hello' }], parameterFormat: 'NAMED' }).success
    ).toBe(true);
  });
});
