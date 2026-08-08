'use client';

import { ResponsiveContainer, AreaChart, Area, Tooltip } from 'recharts';

interface StatsChartProps {
  data: Array<Record<string, unknown>>;
  dataKey: string;
  color?: string;
  height?: number;
}

export default function StatsChart({
  data,
  dataKey,
  color = '#1E5CAF',
  height = 60,
}: StatsChartProps) {
  // Sanitize data — replace undefined/NaN with 0 to prevent SVG polyline errors
  const safeData = (data ?? []).map((d) => ({
    ...d,
    [dataKey]: typeof d[dataKey] === 'number' && !isNaN(d[dataKey] as number) ? d[dataKey] : 0,
  }));

  if (safeData.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={safeData}>
        <Tooltip
          contentStyle={{
            borderRadius: '6px',
            border: '1px solid var(--border)',
            fontSize: '12px',
            padding: '4px 8px',
          }}
        />
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          fill={color}
          fillOpacity={0.1}
          strokeWidth={2}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
