import { formatPaise } from '@/types/billing';
import { ArrowRight } from 'lucide-react';
import {
  BILLING_CARD_SHELL,
  BillingAccentBar,
  BillingMedallion,
  ProrataGlyph,
  getBillingTone,
} from '@/components/billing/billing-visuals';

interface UpgradeQuote {
  fromPlanName: string;
  toPlanName: string;
  unusedValuePaise: number;
  upgradeChargePaise: number;
  carryForward: Record<string, number>;
  newValidityDays: number;
  taxBreakdown?: { cgstPaise: number; sgstPaise: number; igstPaise: number };
}

interface Props {
  quote: UpgradeQuote;
}

export default function UpgradePreview({ quote }: Props) {
  // Emerald/"success" tone — this panel's whole point is the money the user
  // does NOT have to pay again.
  const styles = getBillingTone('success');

  // Credit-offset meter: what share of the gross amount the unused credit
  // covers. Guarded so a zero-value quote can't divide by zero.
  const gross = quote.unusedValuePaise + quote.upgradeChargePaise;
  const creditPct =
    gross > 0 ? Math.min(100, Math.round((quote.unusedValuePaise / gross) * 100)) : 0;

  return (
    // Static informational panel — no hover lift, since nothing here navigates.
    <div className={BILLING_CARD_SHELL}>
      <BillingAccentBar bar={styles.bar} />
      <div className="p-5">
        {/* Header — pro-rata medallion + the plan transition */}
        <div className="flex items-start gap-4">
          <BillingMedallion tile={styles.tile}>
            <ProrataGlyph className="h-6 w-6" />
          </BillingMedallion>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold tracking-wider text-[var(--text-muted)] uppercase">
              Pro-rated upgrade
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-base font-medium text-[var(--text)]">
              <span className="text-[var(--text-secondary)]">{quote.fromPlanName}</span>
              <ArrowRight className="text-primary flex-none" size={16} aria-hidden="true" />
              <span className="font-bold">{quote.toPlanName}</span>
            </div>
          </div>
        </div>

        {/* Credit-offset meter — makes "you only pay the difference" visible
            instead of leaving it as two numbers to mentally subtract. */}
        {gross > 0 && (
          <div className="mt-5">
            <div
              className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--bg-tertiary)]"
              role="img"
              aria-label={`Unused credit covers ${creditPct}% of the new plan amount`}
            >
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${creditPct}%` }}
              />
              <div className="bg-primary h-full flex-1 transition-all duration-500" />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] font-medium">
              <span className="inline-flex items-center gap-1.5 text-emerald-700">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-500" />
                Credit {creditPct}%
              </span>
              <span className="text-primary inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="bg-primary h-2 w-2 rounded-full" />
                You pay {100 - creditPct}%
              </span>
            </div>
          </div>
        )}

        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-[var(--text-secondary)]">Unused credit (pro-rated)</dt>
            <dd className="font-medium text-emerald-700 dark:text-emerald-400">
              − {formatPaise(quote.unusedValuePaise)}
            </dd>
          </div>
          <div className="flex justify-between border-t border-[var(--border)] pt-3">
            <dt className="font-semibold text-[var(--text)]">Upgrade charge</dt>
            <dd className="text-lg font-bold text-[var(--text)]">
              {formatPaise(quote.upgradeChargePaise)}
            </dd>
          </div>
          <div className="flex justify-between text-xs text-[var(--text-secondary)]">
            <dt>New validity</dt>
            <dd>{quote.newValidityDays} days</dd>
          </div>
        </dl>

        {Object.keys(quote.carryForward).length > 0 ? (
          <div className="mt-5 border-t border-[var(--border)] pt-4">
            <h4 className="text-xs font-semibold tracking-wide text-[var(--text-secondary)] uppercase">
              Credits carried forward
            </h4>
            <ul className="mt-2 space-y-1 text-sm">
              {Object.entries(quote.carryForward).map(([unit, qty]) => (
                <li key={unit} className="flex justify-between">
                  <span className="text-[var(--text)]">{unit.replace(/_/g, ' ')}</span>
                  <span className={`font-semibold ${styles.text}`}>+ {qty}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
