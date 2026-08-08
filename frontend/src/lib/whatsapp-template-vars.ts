import type { WaTemplate } from '@/types/whatsapp';

/**
 * Parse an APPROVED template's Meta `components` into the exact set of runtime
 * parameters a SEND requires. The send modal was previously body-only, so any
 * template with a header, a media header, a dynamic URL button, or named
 * ({{name}}) body variables sent an incomplete parameter set → Meta rejected
 * with "(#131008) Required parameter is missing". This resolves ALL of them.
 */

type Comp = {
  type?: string;
  format?: string;
  text?: string;
  buttons?: Array<{ type?: string; url?: string; text?: string }>;
};

export interface TemplateVarSpec {
  headerFormat: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | 'LOCATION';
  /** TEXT header containing a {{1}} variable. */
  headerHasTextVar: boolean;
  /** IMAGE / VIDEO / DOCUMENT header — a media URL must be supplied at send. */
  headerNeedsMedia: boolean;
  /** Count of positional {{n}} body variables (0 when the body is named or has none). */
  bodyPositional: number;
  /** Named {{name}} body variables (empty when positional or none). */
  bodyNamed: string[];
  /** A URL button whose URL has a dynamic {{1}} suffix. */
  buttonUrlVar: boolean;
  /** True when the template needs no runtime parameters at all (e.g. hello_world). */
  none: boolean;
}

function comps(t: WaTemplate): Comp[] {
  const c = t.components;
  if (Array.isArray(c)) return c as Comp[];
  // Defensive: a stringified JSON column shouldn't happen, but never throw.
  if (typeof c === 'string') {
    try {
      const parsed = JSON.parse(c);
      return Array.isArray(parsed) ? (parsed as Comp[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

const varsIn = (text: string | undefined): string[] =>
  text ? [...text.matchAll(/\{\{\s*([\w]+)\s*\}\}/g)].map((m) => m[1]) : [];

export function analyzeTemplate(t: WaTemplate): TemplateVarSpec {
  const cs = comps(t);
  const header = cs.find((c) => (c.type ?? '').toUpperCase() === 'HEADER');
  const body = cs.find((c) => (c.type ?? '').toUpperCase() === 'BODY');
  const buttonsComp = cs.find((c) => (c.type ?? '').toUpperCase() === 'BUTTONS');

  const headerFormat = (header?.format ?? 'NONE').toUpperCase() as TemplateVarSpec['headerFormat'];
  const headerHasTextVar = headerFormat === 'TEXT' && varsIn(header?.text).length > 0;
  const headerNeedsMedia =
    headerFormat === 'IMAGE' || headerFormat === 'VIDEO' || headerFormat === 'DOCUMENT';

  const bodyVars = varsIn(body?.text);
  const positional = bodyVars.filter((v) => /^\d+$/.test(v)).map(Number);
  const named = [...new Set(bodyVars.filter((v) => !/^\d+$/.test(v)))];
  const bodyPositional = positional.length ? Math.max(...positional) : 0;
  const bodyNamed = named;

  const buttonUrlVar = (buttonsComp?.buttons ?? []).some(
    (b) => (b.type ?? '').toUpperCase() === 'URL' && /\{\{\s*\d+\s*\}\}/.test(b.url ?? ''),
  );

  const none =
    !headerHasTextVar &&
    !headerNeedsMedia &&
    bodyPositional === 0 &&
    bodyNamed.length === 0 &&
    !buttonUrlVar;

  return {
    headerFormat,
    headerHasTextVar,
    headerNeedsMedia,
    bodyPositional,
    bodyNamed,
    buttonUrlVar,
    none,
  };
}

/** Payload shape shared by send-template + start-conversation. */
export interface TemplateSendPayload {
  templateId: string;
  bodyParams?: string[];
  bodyNamedParams?: Array<{ name: string; text: string }>;
  headerText?: string;
  headerMediaUrl?: string;
  headerMediaType?: 'image' | 'video' | 'document';
  buttonUrlParam?: string;
}
