'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useLayoutEffect,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
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
  const menuRef = useRef<HTMLDivElement>(null);
  // Height scales with item count — ~36px per item + 8px padding. Cap estimate at ~300px.
  const estimatedHeight = Math.min(items.length * 36 + 8, 300);
  const dropdownPlacement = usePopoverPlacement(containerRef, isOpen, estimatedHeight);

  /**
   * The menu is portalled to <body> with `position: fixed`.
   *
   * It used to be `absolute` inside the trigger's relative wrapper, which any
   * ancestor with `overflow-hidden` clips — and the contact list is exactly
   * that (a rounded card that must clip its rows' corners). Rows further up
   * looked fine only because their menu happened to fall over the rows below;
   * the LAST row had nothing beneath it, so its menu was cut off at the card's
   * edge and its items were unreachable. Flipping the menu upward does not fix
   * that: the clip is the container's, not the viewport's. Portalling escapes
   * the ancestor entirely, which is what ui/Select.tsx already does.
   */
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number } | null>(null);

  const updatePos = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const height = menuRef.current?.offsetHeight ?? estimatedHeight;
    const GAP = 4; // matches the previous mt-1 / mb-1 spacing
    setPos({
      top: dropdownPlacement === 'top' ? rect.top - height - GAP : rect.bottom + GAP,
      // Anchor by the edge the menu is aligned to, so it cannot drift when the
      // menu is wider than its trigger (a 28px icon button, typically).
      ...(align === 'right'
        ? { right: Math.max(8, window.innerWidth - rect.right) }
        : { left: Math.max(8, rect.left) }),
    });
  }, [align, dropdownPlacement, estimatedHeight]);

  useLayoutEffect(() => {
    if (!isOpen) {
      // Deferred so the reset does not run synchronously inside the effect body.
      queueMicrotask(() => setPos(null));
      return;
    }
    updatePos();
    // Re-measure after mount: offsetHeight is real once the menu is in the DOM,
    // which matters for the upward placement where height decides `top`.
    const raf = requestAnimationFrame(updatePos);
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [isOpen, updatePos]);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    const target = e.target as Node;
    // The menu now lives outside the container, so it needs its own hit test —
    // without it every click on an item counted as "outside" and closed the menu
    // before the item's own handler could run.
    if (
      containerRef.current &&
      !containerRef.current.contains(target) &&
      (!menuRef.current || !menuRef.current.contains(target))
    ) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [handleClickOutside]);

  // Close on Escape, and when the trigger scrolls out of view the menu would
  // otherwise hang over unrelated content.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen]);

  return (
    <div className={cn('relative inline-block', className)} ref={containerRef}>
      <div className="cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        {trigger}
      </div>

      {isOpen &&
        typeof window !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            style={
              pos
                ? { position: 'fixed', top: pos.top, left: pos.left, right: pos.right }
                : // Rendered off-screen for the first frame so its real height can
                  // be measured before it is placed.
                  { position: 'fixed', top: -9999, left: -9999 }
            }
            className="animate-slide-down z-[60] min-w-[180px] rounded-lg border border-[var(--border)] bg-white py-1 shadow-[var(--shadow-lg)]"
          >
            {items.map((item, index) => {
              if (item.separator) {
                return (
                  <div key={`sep-${index}`} className="my-1 border-t border-[var(--border)]" />
                );
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
          </div>,
          document.body,
        )}
    </div>
  );
}

Dropdown.displayName = 'Dropdown';

export default Dropdown;
