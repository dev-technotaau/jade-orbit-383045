'use client';

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { usePopoverPlacement } from '@/hooks/use-popover-placement';

export interface DropdownItem {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  separator?: boolean;
  destructive?: boolean;
}

interface DropdownProps {
  trigger: ReactNode;
  items: DropdownItem[];
  align?: 'left' | 'right';
  className?: string;
}

function Dropdown({ trigger, items, align = 'left', className }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Height scales with item count — ~36px per item + 8px padding. Cap estimate at ~300px.
  const estimatedHeight = Math.min(items.length * 36 + 8, 300);
  const dropdownPlacement = usePopoverPlacement(containerRef, isOpen, estimatedHeight);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [handleClickOutside]);

  return (
    <div className={cn('relative inline-block', className)} ref={containerRef}>
      <div className="cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        {trigger}
      </div>

      {isOpen && (
        <div
          className={cn(
            'animate-slide-down absolute z-50 min-w-[180px] rounded-lg border border-[var(--border)] bg-white py-1 shadow-[var(--shadow-lg)]',
            align === 'right' ? 'right-0' : 'left-0',
            dropdownPlacement === 'top' ? 'bottom-full mb-1' : 'top-full mt-1',
          )}
        >
          {items.map((item, index) => {
            if (item.separator) {
              return <div key={`sep-${index}`} className="my-1 border-t border-[var(--border)]" />;
            }

            const Icon = item.icon;

            return (
              <button
                key={`item-${index}`}
                type="button"
                disabled={item.disabled}
                onClick={() => {
                  item.onClick();
                  setIsOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors duration-150',
                  'hover:bg-[var(--bg-secondary)]',
                  item.disabled && 'pointer-events-none opacity-50',
                  item.destructive
                    ? 'text-error hover:bg-[var(--error-light)]'
                    : 'text-[var(--text)]',
                )}
              >
                {Icon && <Icon className="h-4 w-4 shrink-0" />}
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

Dropdown.displayName = 'Dropdown';

export default Dropdown;
