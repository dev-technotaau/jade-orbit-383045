'use client';

import {
  ResponsiveContainer,
  AreaChart as RechartsArea,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

interface AreaChartProps {
  data: Array<Record<string, unknown>>;
  xKey: string;
  yKey: string;
  yKey2?: string;
  color?: string;
  color2?: string;
  height?: number;
  showGrid?: boolean;
}

export default function AreaChart({
  data,
  xKey,
  yKey,
  yKey2,
  color = '#1E5CAF',
  color2 = '#10B981',
  height = 300,
  showGrid = true,
}: AreaChartProps) {
  // Sanitize data — replace undefined/NaN with 0 to prevent SVG polyline errors
  const safeData = (data ?? []).map((d) => {
    const row: Record<string, unknown> = { ...d };
    for (const key of [yKey, yKey2]) {
      if (key) {
        row[key] = typeof d[key] === 'number' && !isNaN(d[key] as number) ? d[key] : 0;
      }
    }
    return row;
  });

  if (safeData.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsArea data={safeData}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />}
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
          tickLine={false}
          axisLine={{ stroke: 'var(--border)' }}
        />
        <YAxis
          tick={{ fontSize: 12, fill: 'var(--text-muted)' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            borderRadius: '8px',
            border: '1px solid var(--border)',
            boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
          }}
        />
        <Area
          type="monotone"
          dataKey={yKey}
          stroke={color}
          fill={color}
          fillOpacity={0.1}
          strokeWidth={2}
        />
        {yKey2 && (
          <Area
            type="monotone"
            dataKey={yKey2}
            stroke={color2}
            fill={color2}
            fillOpacity={0.1}
            strokeWidth={2}
          />
        )}
      </RechartsArea>
    </ResponsiveContainer>
  );
}
