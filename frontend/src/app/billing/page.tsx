import { redirect } from 'next/navigation';

/**
 * `/billing` is the parent of the user's billing dashboard family
 * (orders, invoices, subscriptions, payment methods, credits, …). It has
 * no dedicated landing page yet — visitors land on the orders list, which
 * is the most common starting point.
 */
export default function BillingIndexPage(): never {
  redirect('/billing/orders');
}
