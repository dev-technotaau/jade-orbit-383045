'use client';

import { ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, Legend, Tooltip } from 'recharts';

interface PieChartProps {
  data: Array<{ name: string; value: number; color: string }>;
  height?: number;
  innerRadius?: number;
  showLabel?: boolean;
}

const renderLabel = ({ name, percent }: { name?: string; percent?: number }) =>
  `${name || ''} ${((percent || 0) * 100).toFixed(0)}%`;

export default function PieChart({
  data,
  height = 300,
  innerRadius = 60,
  showLabel = true,
}: PieChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsPie margin={{ top: 20, right: 20, bottom: 5, left: 20 }}>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={innerRadius}
          outerRadius={innerRadius + 40}
          paddingAngle={2}
          dataKey="value"
          label={showLabel ? renderLabel : false}
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            borderRadius: '8px',
            border: '1px solid var(--border)',
          }}
        />
        <Legend />
      </RechartsPie>
    </ResponsiveContainer>
  );
}
