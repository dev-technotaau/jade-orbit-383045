'use client';

import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TabItem {
  key: string;
  label: string;
}

type TabVariant = 'underline' | 'pills';

interface TabsProps {
  tabs: TabItem[];
  activeTab: string;
  onChange: (key: string) => void;
  variant?: TabVariant;
  children?: ReactNode;
  className?: string;
}

function Tabs({
  tabs,
  activeTab,
  onChange,
  variant = 'underline',
  children,
  className,
}: TabsProps) {
  const panelId = `tabpanel-${activeTab}`;

  return (
    <div className={cn('w-full', className)}>
      <div
        role="tablist"
        className={cn(
          'flex',
          variant === 'underline' && 'gap-0 border-b border-[var(--border)]',
          variant === 'pills' && 'gap-1 rounded-lg bg-[var(--bg-tertiary)] p-1',
        )}
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          const tabId = `tab-${tab.key}`;

          return (
            <button
              key={tab.key}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={isActive}
              // Only the active tab's panel is rendered in the DOM
              // (see the single `<div role="tabpanel" id={panelId}>`
              // below, which itself is gated on `children`). axe-core
              // / Lighthouse flag aria-controls values that point at a
              // non-existent id — so we omit aria-controls on inactive
              // tabs (and on the active one too if no panel rendered).
              // The back-link via `aria-labelledby` on the active
              // panel still wires the pair for assistive tech.
              aria-controls={isActive && children ? panelId : undefined}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(tab.key)}
              className={cn(
                'text-sm font-medium whitespace-nowrap transition-all duration-200',
                variant === 'underline' &&
                  cn(
                    '-mb-px border-b-2 px-4 py-2.5',
                    isActive
                      ? 'border-primary text-primary'
                      : 'border-transparent text-[var(--text-muted)] hover:border-[var(--border)] hover:text-[var(--text)]',
                  ),
                variant === 'pills' &&
                  cn(
                    'rounded-md px-3 py-1.5',
                    isActive
                      ? 'bg-white text-[var(--text)] shadow-[var(--shadow-sm)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text)]',
                  ),
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {children && (
        <div role="tabpanel" id={panelId} aria-labelledby={`tab-${activeTab}`} className="mt-4">
          {children}
        </div>
      )}
    </div>
  );
}

Tabs.displayName = 'Tabs';

export default Tabs;
