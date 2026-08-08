'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

interface Props {
  data: { day: string; revenuePaise: number; refundPaise?: number }[];
}

const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

export default function RevenueChart({ data }: Props) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, left: 16, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(v: number) => inr(v)} tick={{ fontSize: 11 }} width={80} />
          <Tooltip
            formatter={(v) => (typeof v === 'number' ? inr(v) : v)}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend />
          <Bar dataKey="revenuePaise" name="Revenue" fill="#2563EB" radius={[4, 4, 0, 0]} />
          {data.some((d) => (d.refundPaise ?? 0) > 0) ? (
            <Bar dataKey="refundPaise" name="Refunds" fill="#DC2626" radius={[4, 4, 0, 0]} />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
