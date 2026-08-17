'use client';

import { useState } from 'react';
import { Ticket, Clock, ShoppingBag } from 'lucide-react';
import Input from '@/components/ui/Input';
import { cn } from '@/lib/utils';

/**
 * Opt-in MARKETING-only template add-ons authored at create time. Each toggle,
 * when enabled, contributes one or more Meta `components` entries that are
 * appended to the base HEADER/BODY/FOOTER built by the templates create wizard:
 *
 *   1. COUPON CODE  → a COPY_CODE button inside the single BUTTONS component
 *      ({ type:'COPY_CODE', example:[sampleCode], text:btnText }).
 *   2. LIMITED-TIME OFFER → a standalone LIMITED_TIME_OFFER component.
 *   3. CATALOG / MPM → a CATALOG button inside the single BUTTONS component
 *      ({ type:'CATALOG' }); products are pulled from the connected Meta catalog.
 *
 * These are strictly additive and never apply to UTILITY / AUTHENTICATION
 * templates. The builder below also returns a validation error when the result
 * would obviously break Meta's button-component rules (a CATALOG button must be
 * the only button, and the BUTTONS component caps at 10 entries).
 */

/** Lifted state for the MARKETING add-ons, owned by the create wizard. */
export interface MarketingAddOnState {
  couponEnabled: boolean;
  setCouponEnabled: (v: boolean) => void;
  couponButtonText: string;
  setCouponButtonText: (v: string) => void;
  couponSampleCode: string;
  setCouponSampleCode: (v: string) => void;

  ltoEnabled: boolean;
  setLtoEnabled: (v: boolean) => void;
  ltoText: string;
  setLtoText: (v: string) => void;

  catalogEnabled: boolean;
  setCatalogEnabled: (v: boolean) => void;
}

/** Initial add-on state, when the builder is opened on an existing template. */
export interface MarketingAddOnSeed {
  couponEnabled?: boolean;
  couponButtonText?: string;
  couponSampleCode?: string;
  ltoEnabled?: boolean;
  ltoText?: string;
  catalogEnabled?: boolean;
}

/**
 * Hook that owns the MARKETING add-on form state. Keeps the page component lean
 * while exposing strongly-typed state + setters for the UI and the builder.
 *
 * The seed matters on an EDIT: these toggles emit real components
 * (LIMITED_TIME_OFFER, a CATALOG button), and starting them off meant reopening
 * such a template and saving it resubmitted the template to Meta with the offer
 * countdown or the catalog button silently removed.
 */
export function useMarketingAddOnState(seed: MarketingAddOnSeed = {}): MarketingAddOnState {
  const [couponEnabled, setCouponEnabledRaw] = useState(seed.couponEnabled ?? false);
  const [couponButtonText, setCouponButtonText] = useState(
    seed.couponButtonText ?? 'Copy offer code',
  );
  const [couponSampleCode, setCouponSampleCode] = useState(seed.couponSampleCode ?? '');

  const [ltoEnabled, setLtoEnabled] = useState(seed.ltoEnabled ?? false);
  const [ltoText, setLtoText] = useState(seed.ltoText ?? '');

  const [catalogEnabled, setCatalogEnabledRaw] = useState(seed.catalogEnabled ?? false);

  // Meta allows a catalog button ONLY as the sole button, so the two are
  // mutually exclusive. That used to be enforced in the render alone — the
  // coupon checkbox was drawn as `couponEnabled && !catalogEnabled`, so turning
  // the catalog on redrew the coupon box as unchecked while the state stayed
  // true, and clicking it fired onChange(true) again. The operator was shown an
  // unchecked box they could not clear, and then a submit error telling them to
  // remove the very thing the UI said was off. Enforce it in the state instead.
  const setCouponEnabled = (v: boolean) => {
    if (v) setCatalogEnabledRaw(false);
    setCouponEnabledRaw(v);
  };
  const setCatalogEnabled = (v: boolean) => {
    if (v) setCouponEnabledRaw(false);
    setCatalogEnabledRaw(v);
  };

  return {
    couponEnabled,
    setCouponEnabled,
    couponButtonText,
    setCouponButtonText,
    couponSampleCode,
    setCouponSampleCode,
    ltoEnabled,
    setLtoEnabled,
    ltoText,
    setLtoText,
    catalogEnabled,
    setCatalogEnabled,
  };
}

/** Meta caps a template's BUTTONS component at 10 button entries. */
const MAX_BUTTONS = 10;

/**
 * Build the extra MARKETING `components` entries from the add-on state, to be
 * concatenated onto the wizard's base components. Returns a validation error
 * instead of throwing so the wizard can surface it before submitting to Meta.
 *
 * @param existingButtonCount number of button entries the wizard already emits
 *        in the single BUTTONS component (0 in the current text-only wizard).
 */
export function buildMarketingAddOnComponents(
  state: MarketingAddOnState,
  existingButtonCount = 0,
): { components: unknown[]; error?: string } {
  const components: unknown[] = [];
  const buttons: unknown[] = [];

  if (state.ltoEnabled) {
    const text = state.ltoText.trim();
    if (!text) return { components: [], error: 'Enter the limited-time offer text' };
    components.push({
      type: 'LIMITED_TIME_OFFER',
      limited_time_offer: { text, has_expiration: true },
    });
  }

  if (state.couponEnabled) {
    const text = state.couponButtonText.trim();
    if (!text) return { components: [], error: 'Enter the copy-code button text' };
    const sample = state.couponSampleCode.trim();
    // No silent default. This used to substitute the literal 'SAVE20' when the
    // field was blank, so a template was submitted to Meta for review carrying a
    // sample code the operator never chose and never saw.
    if (!sample) return { components: [], error: 'Enter a sample coupon code for Meta review' };
    // Scalar `example`, matching the button builder in TemplateBuilder — the two
    // emitted different shapes for the same button type, so which one Meta got
    // depended on where in the wizard the operator added it.
    buttons.push({ type: 'COPY_CODE', example: sample });
  }

  if (state.catalogEnabled) {
    buttons.push({ type: 'CATALOG' });
  }

  // Meta requires a CATALOG button to be the sole button in the template. Split
  // so the message names the actual blocker: the old single branch told the
  // operator to "remove the coupon button" even when no coupon was enabled and
  // the real problem was the buttons they had added in the wizard above.
  if (state.catalogEnabled && state.couponEnabled) {
    return {
      components: [],
      error: 'Turn off the coupon button — a catalog button must be the only button',
    };
  }
  if (state.catalogEnabled && existingButtonCount > 0) {
    return {
      components: [],
      error: 'Remove the other buttons — a catalog button must be the only button',
    };
  }

  if (existingButtonCount + buttons.length > MAX_BUTTONS) {
    return {
      components: [],
      error: `A template can have at most ${MAX_BUTTONS} buttons`,
    };
  }

  if (buttons.length) {
    components.push({ type: 'BUTTONS', buttons });
  }

  return { components };
}

function Toggle({
  checked,
  onChange,
  icon,
  title,
  hint,
  disabled,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: React.ReactNode;
  title: string;
  hint: string;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
      <label
        className={cn(
          'flex items-start gap-2.5',
          disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        )}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
        />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--text)]">
            {icon}
            {title}
          </span>
          <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">{hint}</span>
        </span>
      </label>
      {checked && children ? <div className="mt-3 space-y-3 pl-6">{children}</div> : null}
    </div>
  );
}

/**
 * MARKETING-only add-on controls. Render this beneath the body/footer fields of
 * the create wizard when `category === 'MARKETING'`.
 */
export default function MarketingTemplateAddOns({ state }: { state: MarketingAddOnState }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-[var(--text-muted)]">Marketing add-ons (optional)</p>

      <Toggle
        checked={state.couponEnabled}
        disabled={state.catalogEnabled}
        onChange={state.setCouponEnabled}
        icon={<Ticket className="h-4 w-4 text-emerald-600" />}
        title="Add copy-code coupon button"
        hint="Recipients tap to copy a promo code. Fill the actual code per send."
      >
        <Input
          label="Button text"
          value={state.couponButtonText}
          onChange={(e) => state.setCouponButtonText(e.target.value)}
          placeholder="Copy offer code"
          maxLength={25}
        />
        {/* The code itself is a SEND-time value, supplied per message in the
            inbox composer or once per campaign in the wizard — not authored
            here. Saying so avoids an operator approving a template and then
            hunting for where the real code goes. */}
        <Input
          label="Sample code (for Meta review)"
          value={state.couponSampleCode}
          onChange={(e) => state.setCouponSampleCode(e.target.value)}
          placeholder="SAVE20"
          maxLength={15}
        />
      </Toggle>

      <Toggle
        checked={state.ltoEnabled}
        onChange={state.setLtoEnabled}
        icon={<Clock className="h-4 w-4 text-amber-600" />}
        title="Limited-time offer"
        hint="Shows an expiring-offer banner with a live countdown in the message."
      >
        <Input
          label="Offer text"
          value={state.ltoText}
          onChange={(e) => state.setLtoText(e.target.value)}
          placeholder="Ends soon!"
          maxLength={16}
        />
      </Toggle>

      <Toggle
        checked={state.catalogEnabled}
        onChange={state.setCatalogEnabled}
        icon={<ShoppingBag className="h-4 w-4 text-blue-600" />}
        title="Catalog message"
        hint="Adds a single catalog button, opening the catalog bound to your number under Settings → Catalog and cart. Carts customers submit arrive in the inbox as orders."
      />

      {state.catalogEnabled ? (
        <p className="text-[11px] text-amber-600">
          Catalog templates can only carry the catalog button, so the coupon button is off. Turn the
          catalog message off to author a coupon button.
        </p>
      ) : null}
    </div>
  );
}
