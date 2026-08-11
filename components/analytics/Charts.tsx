"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  LabelList,
} from "recharts";

export function ChartTooltip({
  active,
  payload,
  label,
  labelFormatter,
  valueFormatter,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
  labelFormatter?: (l: string) => string;
  valueFormatter?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-base-300 border border-base-300 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-base-content/50 mb-1.5">
        {labelFormatter ? labelFormatter(String(label)) : label}
      </p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <span className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
          <span className="text-base-content/60">{p.name}</span>
          <span className="ml-auto font-medium tabular-nums text-base-content">
            {valueFormatter ? valueFormatter(p.value) : p.value?.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

const AXIS = { stroke: "rgba(255,255,255,0.15)", fontSize: 11, tick: { fill: "rgba(255,255,255,0.35)" } };
const GRID = { stroke: "rgba(255,255,255,0.06)", strokeDasharray: "3 3" };

export function fmtDay(d: string) {
  try {
    return new Date(d + "T12:00:00Z").toLocaleDateString("en-GB", {
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

export function ActivityAreaChart({
  data,
  series,
  height = 240,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[];
  series: { key: string; color: string; label: string }[];
  height?: number;
}) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-sm text-base-content/30" style={{ height }}>
        No activity data yet
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={"grad-" + s.key} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey="day" {...AXIS} tickFormatter={fmtDay} interval="preserveStartEnd" minTickGap={40} />
        <YAxis {...AXIS} allowDecimals={false} width={36} />
        <Tooltip content={<ChartTooltip labelFormatter={fmtDay} />} />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" iconSize={8} />
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            fill={"url(#grad-" + s.key + ")"}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 0 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function GroupedBarChart({
  data,
  bars,
  height = 260,
  xKey = "name",
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[];
  bars: { key: string; color: string; label: string }[];
  height?: number;
  xKey?: string;
}) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-sm text-base-content/30" style={{ height }}>
        No campaign data yet
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barGap={2}>
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey={xKey} {...AXIS} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
        <YAxis {...AXIS} allowDecimals={false} width={36} />
        <Tooltip content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} />
        {bars.map((b) => (
          <Bar key={b.key} dataKey={b.key} name={b.label} fill={b.color} radius={[3, 3, 0, 0]} maxBarSize={28} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RateBars({
  data,
  height = 220,
}: {
  data: { name: string; rate: number; color: string }[];
  height?: number;
}) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-sm text-base-content/30" style={{ height }}>
        No rate data yet
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid {...GRID} horizontal={false} />
        <XAxis type="number" domain={[0, 100]} {...AXIS} unit="%" />
        <YAxis type="category" dataKey="name" {...AXIS} width={110} tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
        <Tooltip content={<ChartTooltip valueFormatter={(v) => v + "%"} />} />
        <Bar dataKey="rate" name="Rate" radius={[0, 4, 4, 0]} maxBarSize={18}>
          {data.map((d, i) => (
            <Cell key={i} fill={d.color} />
          ))}
          <LabelList dataKey="rate" position="right" formatter={(v) => v + "%"} style={{ fill: "rgba(255,255,255,0.5)", fontSize: 11 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const PIE_COLORS = ["#5aa2ff", "#32d583", "#f4b740", "#e879f9", "#fb923c", "#f87171", "#a78bfa"];

export function DonutChart({
  data,
  height = 220,
  innerRadius = 55,
  outerRadius = 80,
}: {
  data: { name: string; value: number; color?: string }[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) {
    return (
      <div className="flex items-center justify-center text-sm text-base-content/30" style={{ height }}>
        No data yet
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={innerRadius} outerRadius={outerRadius} paddingAngle={2} stroke="none">
          {data.map((d, i) => (
            <Cell key={i} fill={d.color || PIE_COLORS[i % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" iconSize={8} formatter={(value) => <span className="text-base-content/60">{value}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function FunnelBars({ stages }: { stages: { label: string; value: number; color: string }[] }) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  return (
    <div className="space-y-3">
      {stages.map((s, i) => {
        const pct = Math.max(2, (s.value / max) * 100);
        const drop = i > 0 && stages[i - 1].value > 0 ? Math.round((s.value / stages[i - 1].value) * 1000) / 10 : null;
        return (
          <div key={s.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-base-content/50">{s.label}</span>
              <div className="flex items-center gap-2">
                {drop !== null && <span className="text-[10px] text-base-content/30">{drop}% of prev</span>}
                <span className="text-sm font-semibold tabular-nums">{s.value.toLocaleString()}</span>
              </div>
            </div>
            <div className="h-2 bg-base-300/40 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-700" style={{ width: pct + "%", background: s.color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function HourBarChart({ data, height = 180 }: { data: { hour: number; label: string; count: number }[]; height?: number }) {
  const hasData = data.some((d) => d.count > 0);
  if (!hasData) {
    return (
      <div className="flex items-center justify-center text-sm text-base-content/30" style={{ height }}>
        No send-time data yet
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid {...GRID} vertical={false} />
        <XAxis dataKey="label" {...AXIS} interval={2} tick={{ fontSize: 9 }} />
        <YAxis {...AXIS} allowDecimals={false} width={32} />
        <Tooltip content={<ChartTooltip />} />
        <Bar dataKey="count" name="Sends" fill="#5aa2ff" radius={[2, 2, 0, 0]} maxBarSize={14} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function RateKpi({
  label, value, suffix = "%", color, sub,
}: { label: string; value: number; suffix?: string; color: string; sub?: string }) {
  return (
    <div className="bg-base-200 border border-base-300/50 rounded-xl p-4">
      <p className="text-[11px] text-base-content/40 uppercase tracking-wide mb-2">{label}</p>
      <p className="text-2xl font-semibold tabular-nums leading-none" style={{ color }}>
        {value}
        <span className="text-sm font-normal text-base-content/40 ml-0.5">{suffix}</span>
      </p>
      {sub && <p className="text-[11px] text-base-content/30 mt-1.5">{sub}</p>}
    </div>
  );
}

// ─── Day-by-day breakdown table ─────────────────────────────────────────────
// A dense, scannable row-per-day view that sits under the area chart on the
// dashboard/LinkedIn/email analytics pages — the chart shows the shape of activity,
// this shows the exact numbers plus day-over-day deltas.

export interface DailyBreakdownColumn {
  key: string;
  label: string;
  color: string;
}

export function DailyBreakdownTable({
  data,
  columns,
  maxRows = 14,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any[];
  columns: DailyBreakdownColumn[];
  maxRows?: number;
}) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-sm text-base-content/30 py-10">
        No activity data yet
      </div>
    );
  }

  // Most recent day first, capped so the table doesn't run forever on old campaigns.
  const rows = [...data].reverse().slice(0, maxRows);
  const totals = columns.reduce<Record<string, number>>((acc, c) => {
    acc[c.key] = data.reduce((s, r) => s + (Number(r[c.key]) || 0), 0);
    return acc;
  }, {});

  function delta(row: Record<string, unknown>, idx: number, key: string): number | null {
    // idx is the index within `rows` (newest-first); the previous calendar day is idx+1.
    const prev = rows[idx + 1];
    if (!prev) return null;
    return (Number(row[key]) || 0) - (Number(prev[key]) || 0);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-base-300/50">
            <th className="text-left font-medium text-base-content/40 uppercase tracking-wide py-2 pr-3 sticky left-0 bg-base-200">Day</th>
            {columns.map((c) => (
              <th key={c.key} className="text-right font-medium text-base-content/40 uppercase tracking-wide py-2 px-2 whitespace-nowrap">
                <span className="inline-flex items-center gap-1.5 justify-end">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
                  {c.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const isToday = idx === 0;
            return (
              <tr key={row.day} className={`border-b border-base-300/20 hover:bg-base-300/20 transition-colors ${isToday ? "bg-primary/[0.03]" : ""}`}>
                <td className="py-1.5 pr-3 whitespace-nowrap font-medium text-base-content/70 sticky left-0 bg-base-200">
                  {fmtDay(row.day)}
                  {isToday && <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded bg-primary/15 text-primary uppercase tracking-wide">Today</span>}
                </td>
                {columns.map((c) => {
                  const val = Number(row[c.key]) || 0;
                  const d = delta(row, idx, c.key);
                  return (
                    <td key={c.key} className="py-1.5 px-2 text-right tabular-nums whitespace-nowrap">
                      <span className={val > 0 ? "text-base-content" : "text-base-content/25"}>{val.toLocaleString()}</span>
                      {d !== null && d !== 0 && (
                        <span className={`ml-1 text-[10px] ${d > 0 ? "text-success" : "text-error"}`}>
                          {d > 0 ? "▲" : "▼"}{Math.abs(d)}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-base-300/60">
            <td className="py-2 pr-3 font-semibold text-base-content/60 sticky left-0 bg-base-200">
              {data.length > maxRows ? `Total (last ${data.length}d)` : "Total"}
            </td>
            {columns.map((c) => (
              <td key={c.key} className="py-2 px-2 text-right tabular-nums font-semibold" style={{ color: c.color }}>
                {totals[c.key].toLocaleString()}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
