'use client';

import { Line, LineChart, ResponsiveContainer, Tooltip } from 'recharts';

interface Props {
  data: { x: string | number; y: number }[];
  color?: string;
  height?: number;
}

export default function Sparkline({ data, color = '#2563EB', height = 40 }: Props) {
  if (!data || data.length === 0) {
    return <div className="text-xs text-[var(--text-secondary)]">No data</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Tooltip
          contentStyle={{ fontSize: 12, padding: 4, borderRadius: 4 }}
          formatter={(v) => (typeof v === 'number' ? v.toLocaleString() : v)}
        />
        <Line type="monotone" dataKey="y" stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
