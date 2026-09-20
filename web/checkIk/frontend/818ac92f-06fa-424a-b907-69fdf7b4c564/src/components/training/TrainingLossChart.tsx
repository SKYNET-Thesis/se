import React from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis } from
'recharts';

export function TrainingLossChart({
  data,
  compact = false



}: {data: {step: number;loss: number;}[];compact?: boolean;}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: compact ? -24 : -8 }}>
        <CartesianGrid stroke="rgb(var(--c-border))" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="step"
          stroke="rgb(var(--c-muted))"
          tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }}
          tickLine={false}
          axisLine={{ stroke: 'rgb(var(--c-border))' }}
          hide={compact} />
        
        <YAxis
          stroke="rgb(var(--c-muted))"
          tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }}
          tickLine={false}
          axisLine={false}
          width={44}
          domain={['auto', 'auto']} />
        
        <Tooltip
          contentStyle={{
            background: 'rgb(var(--c-elev))',
            border: '1px solid rgb(var(--c-border))',
            borderRadius: 10,
            fontSize: 12,
            color: 'rgb(var(--c-text))'
          }}
          labelFormatter={(v) => `step ${Number(v).toLocaleString()}`}
          formatter={(v: number) => [v.toFixed(3), 'loss']} />
        
        <Line
          type="monotone"
          dataKey="loss"
          stroke="rgb(var(--c-brand))"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false} />
        
      </LineChart>
    </ResponsiveContainer>);

}