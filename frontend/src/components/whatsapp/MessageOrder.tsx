'use client';

import { ShoppingCart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageOrderProps {
  payload: unknown;
}

interface OrderItem {
  productRetailerId: string | null;
  quantity: number;
  itemPrice: number;
  currency: string | null;
}

interface ParsedOrder {
  catalogId: string | null;
  products: OrderItem[];
  totalQuantity: number;
  totalPrice: number;
  currency: string;
  note: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const num = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;
const str = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

/**
 * Read the normalised order the inbound worker writes.
 *
 * Deliberately tolerant: an order that arrived before this shape existed is
 * still in the payload column as Meta's own snake_case, and showing "1 item"
 * from a raw envelope is better than showing an empty bubble.
 */
function parseOrder(payload: unknown): ParsedOrder | null {
  if (!isRecord(payload)) return null;
  const rawItems = Array.isArray(payload.products)
    ? payload.products
    : Array.isArray(payload.product_items)
      ? payload.product_items
      : [];

  const products: OrderItem[] = rawItems.filter(isRecord).map((it) => ({
    productRetailerId: str(it.productRetailerId) ?? str(it.product_retailer_id),
    quantity: num(it.quantity) || Number(it.quantity) || 0,
    itemPrice: num(it.itemPrice) || Number(it.item_price) || 0,
    currency: str(it.currency),
  }));
  if (products.length === 0) return null;

  const totalQuantity = num(payload.totalQuantity) || products.reduce((n, p) => n + p.quantity, 0);
  const totalPrice =
    num(payload.totalPrice) || products.reduce((n, p) => n + p.quantity * p.itemPrice, 0);

  return {
    catalogId: str(payload.catalogId) ?? str(payload.catalog_id),
    products,
    totalQuantity,
    totalPrice,
    currency: str(payload.currency) ?? products.find((p) => p.currency)?.currency ?? '',
    note: str(payload.note) ?? str(payload.text),
  };
}

/**
 * A cart a customer submitted from the catalog.
 *
 * These used to arrive as UNSUPPORTED messages with the line items buried in a
 * generic payload blob and nothing to render them, so the agent saw an empty
 * bubble where a customer had just tried to buy something.
 */
export default function MessageOrder({ payload }: MessageOrderProps) {
  const order = parseOrder(payload);

  if (!order) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <ShoppingCart className="h-4 w-4 shrink-0" aria-hidden />
        <span>Placed an order</span>
      </div>
    );
  }

  const money = (value: number) =>
    order.currency ? `${order.currency} ${value.toFixed(2)}` : value.toFixed(2);

  return (
    <div
      className={cn(
        'flex max-w-xs flex-col gap-2 rounded-lg border border-[var(--border)]',
        'bg-[var(--bg-secondary)] p-3',
      )}
    >
      <div className="flex items-center gap-2">
        <ShoppingCart className="h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden />
        <p className="text-sm font-semibold text-[var(--text)]">
          Order · {order.totalQuantity} item{order.totalQuantity === 1 ? '' : 's'}
        </p>
      </div>

      <ul className="space-y-1">
        {order.products.map((p, i) => (
          <li
            key={`${p.productRetailerId ?? 'item'}-${i}`}
            className="flex items-baseline justify-between gap-2 text-xs text-[var(--text)]"
          >
            <span className="min-w-0 truncate font-mono">
              {p.productRetailerId ?? 'Unnamed item'}
            </span>
            <span className="shrink-0 text-[var(--text-muted)]">
              ×{p.quantity} · {money(p.itemPrice)}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex items-baseline justify-between border-t border-[var(--border)] pt-1.5 text-sm">
        <span className="font-medium text-[var(--text-muted)]">Total</span>
        <span className="font-semibold text-[var(--text)]">{money(order.totalPrice)}</span>
      </div>

      {order.note && <p className="text-xs break-words text-[var(--text-muted)]">“{order.note}”</p>}
    </div>
  );
}
