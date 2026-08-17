'use client';

import { Plus, X } from 'lucide-react';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import type { WaSegmentRule } from '@/types/whatsapp';

/**
 * The advanced half of an audience filter.
 *
 * Targeting used to be "any of these tags" plus an opt-in status, and nothing
 * else on WaContact was reachable: an operator could not ask for "tagged mumbai
 * AND premium", "messaged us in the last 30 days", "did not reply to the Diwali
 * campaign", or an imported column — so every non-trivial audience had to be
 * assembled outside the product and pasted back in as a phone list.
 *
 * One row per rule, compiled server-side by `segmentContactWhere`. The field
 * catalogue below is deliberately the same list the backend compiles, so a row
 * that can be built here is a row that narrows the audience.
 */

/** Field options, grouped the way an operator thinks about them. */
const FIELD_OPTIONS = [
  { value: 'tags', label: 'Tags' },
  { value: 'optInStatus', label: 'Opt-in status' },
  { value: 'optInSource', label: 'Opt-in source' },
  { value: 'lastInboundAt', label: 'Last message from them' },
  { value: 'lastOutboundAt', label: 'Last message we sent' },
  { value: 'lastMarketingAt', label: 'Last marketing message' },
  { value: 'attr', label: 'Imported column' },
  { value: 'campaign', label: 'Campaign engagement' },
];

const TAG_OPS = [
  { value: 'any', label: 'has any of' },
  { value: 'all', label: 'has all of' },
  { value: 'none', label: 'has none of' },
];
const STATUS_OPS = [
  { value: 'equals', label: 'is' },
  { value: 'not', label: 'is not' },
];
const SOURCE_OPS = [
  { value: 'equals', label: 'is' },
  { value: 'contains', label: 'contains' },
];
const DATE_OPS = [
  { value: 'within', label: 'in the last (days)' },
  { value: 'notWithin', label: 'not in the last (days)' },
  { value: 'exists', label: 'ever happened' },
  { value: 'notExists', label: 'never happened' },
];
const ATTR_OPS = [
  { value: 'equals', label: 'is' },
  { value: 'contains', label: 'contains' },
  { value: 'exists', label: 'is set' },
  { value: 'notExists', label: 'is not set' },
];
const CAMPAIGN_OPS = [
  { value: 'received', label: 'received' },
  { value: 'notReceived', label: 'did not receive' },
  { value: 'replied', label: 'replied to' },
  { value: 'notReplied', label: 'did not reply to' },
  { value: 'clicked', label: 'clicked a link in' },
  { value: 'notClicked', label: 'did not click in' },
];

const OPT_IN_VALUES = [
  { value: 'OPTED_IN', label: 'Opted in' },
  { value: 'OPTED_OUT', label: 'Opted out' },
  { value: 'UNKNOWN', label: 'Unknown' },
];

/** Which field family a rule belongs to — `attr.city` collapses to 'attr'. */
function familyOf(field: string): string {
  if (field.startsWith('attr.') || field === 'attr') return 'attr';
  return field;
}

function operatorsFor(family: string) {
  if (family === 'tags') return TAG_OPS;
  if (family === 'optInStatus') return STATUS_OPS;
  if (family === 'optInSource') return SOURCE_OPS;
  if (family === 'attr') return ATTR_OPS;
  if (family === 'campaign') return CAMPAIGN_OPS;
  return DATE_OPS;
}

/** The first operator of a family — used when the field changes underneath a row. */
function defaultOperator(family: string): string {
  return operatorsFor(family)[0].value;
}

export interface SegmentRulesBuilderProps {
  rules: WaSegmentRule[];
  /** How the rows combine. 'and' narrows, 'or' widens. */
  op: 'and' | 'or';
  onChange: (rules: WaSegmentRule[]) => void;
  onOpChange: (op: 'and' | 'or') => void;
  /** Campaigns offered by the engagement rule; empty hides nothing, it just has no options. */
  campaignOptions?: Array<{ value: string; label: string }>;
}

export default function SegmentRulesBuilder({
  rules,
  op,
  onChange,
  onOpChange,
  campaignOptions = [],
}: SegmentRulesBuilderProps) {
  const update = (index: number, patch: Partial<WaSegmentRule>) =>
    onChange(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const add = () => onChange([...rules, { field: 'tags', operator: 'all', value: [] }]);
  const remove = (index: number) => onChange(rules.filter((_, i) => i !== index));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-[var(--text)]">Advanced rules</p>
          <p className="text-xs text-[var(--text-muted)]">
            Target on tags, imported columns, recency and past-campaign behaviour.
          </p>
        </div>
        {rules.length > 1 && (
          <div className="w-40">
            <Select
              options={[
                { value: 'and', label: 'Match ALL rules' },
                { value: 'or', label: 'Match ANY rule' },
              ]}
              value={op}
              onChange={(v) => onOpChange(v === 'or' ? 'or' : 'and')}
              clearable={false}
            />
          </div>
        )}
      </div>

      {rules.map((rule, i) => {
        const family = familyOf(rule.field);
        const ops = operatorsFor(family);
        const needsValue = rule.operator !== 'exists' && rule.operator !== 'notExists';
        return (
          <div
            key={i}
            className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2"
          >
            <div className="min-w-[9rem] flex-1">
              <Select
                options={FIELD_OPTIONS}
                value={family}
                onChange={(v) =>
                  update(i, {
                    field: v === 'attr' ? 'attr.' : v,
                    operator: defaultOperator(v),
                    value: v === 'tags' ? [] : '',
                  })
                }
                clearable={false}
              />
            </div>

            {/* An imported column needs its own name — `attr.city` is the field. */}
            {family === 'attr' && (
              <div className="min-w-[7rem] flex-1">
                <Input
                  value={rule.field.slice(5)}
                  onChange={(e) => update(i, { field: `attr.${e.target.value.trim()}` })}
                  placeholder="city"
                />
              </div>
            )}

            <div className="min-w-[9rem] flex-1">
              <Select
                options={ops}
                value={rule.operator}
                onChange={(v) => update(i, { operator: v })}
                clearable={false}
              />
            </div>

            {needsValue && (
              <div className="min-w-[9rem] flex-1">
                {family === 'tags' ? (
                  <Input
                    value={
                      Array.isArray(rule.value) ? rule.value.join(', ') : String(rule.value ?? '')
                    }
                    onChange={(e) =>
                      update(i, {
                        value: e.target.value
                          .split(',')
                          .map((t) => t.trim())
                          .filter(Boolean),
                      })
                    }
                    placeholder="mumbai, premium"
                  />
                ) : family === 'optInStatus' ? (
                  <Select
                    options={OPT_IN_VALUES}
                    value={String(rule.value ?? '')}
                    onChange={(v) => update(i, { value: v })}
                    clearable={false}
                  />
                ) : family === 'campaign' ? (
                  <Select
                    options={campaignOptions}
                    value={String(rule.value ?? '')}
                    onChange={(v) => update(i, { value: v })}
                    searchable={campaignOptions.length > 6}
                    placeholder={campaignOptions.length ? 'Pick a campaign' : 'No campaigns yet'}
                    clearable={false}
                  />
                ) : family === 'attr' || family === 'optInSource' ? (
                  <Input
                    value={String(rule.value ?? '')}
                    onChange={(e) => update(i, { value: e.target.value })}
                    placeholder={family === 'attr' ? 'Mumbai' : 'form'}
                  />
                ) : (
                  <Input
                    type="number"
                    min={1}
                    value={String(rule.value ?? '')}
                    onChange={(e) => update(i, { value: e.target.value })}
                    placeholder="30"
                  />
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => remove(i)}
              aria-label={`Remove rule ${i + 1}`}
              className="mb-1 rounded-md p-2 text-[var(--text-muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}

      <Button variant="outline" size="sm" leftIcon={<Plus className="h-4 w-4" />} onClick={add}>
        Add rule
      </Button>
    </div>
  );
}

/**
 * Drop rows the operator started and never finished.
 *
 * A half-filled row must narrow NOTHING — the backend already ignores it, and
 * sending it anyway would leave the saved filter carrying a condition that reads
 * as active in the editor but does nothing to the audience.
 */
export function usableRules(rules: WaSegmentRule[]): WaSegmentRule[] {
  return rules.filter((r) => {
    if (!r.field || r.field === 'attr.' || !r.operator) return false;
    if (r.operator === 'exists' || r.operator === 'notExists') return true;
    if (Array.isArray(r.value)) return r.value.length > 0;
    return String(r.value ?? '').trim() !== '';
  });
}
