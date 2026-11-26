"use client";

import React, { useState } from "react";

// --- KPI Card ---
export interface KpiCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  change?: { value: number; type: "up" | "down" };
  sparklineData?: number[];
  color?: "blue" | "emerald" | "amber" | "rose" | "violet";
}

export function KpiCard({ label, value, subValue, change, sparklineData, color = "blue" }: KpiCardProps) {

  return (
    <div className="rounded-card-lg border border-neutral-100 bg-white p-5 shadow-sm hover:shadow-md transition-all">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">{label}</span>
        {change && (
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold ${
              change.type === "up" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
            }`}
          >
            {change.type === "up" ? "↑" : "↓"} {Math.abs(change.value)}%
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline justify-between">
        <div>
          <p className="text-2xl font-extrabold tracking-tight text-neutral-900 sm:text-3xl">{value}</p>
          {subValue && <p className="mt-1 text-xs font-medium text-neutral-500">{subValue}</p>}
        </div>
        {sparklineData && sparklineData.length > 1 && (
          <div className="h-10 w-24">
            <Sparkline data={sparklineData} color={color} />
          </div>
        )}
      </div>
    </div>
  );
}

// --- Sparkline ---
export function Sparkline({ data, color = "blue" }: { data: number[]; color?: string }) {
  const width = 100;
  const height = 40;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min;

  const points = data
    .map((val, idx) => {
      const x = (idx / (data.length - 1)) * width;
      const y = height - ((val - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  const colorHex = {
    blue: "#3b82f6",
    emerald: "#10b981",
    amber: "#f59e0b",
    rose: "#ef4444",
    violet: "#8b5cf6",
  }[color] || "#3b82f6";

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
      <polyline fill="none" stroke={colorHex} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}

// --- Line/Area Chart ---
export interface LineChartProps {
  data: { label: string; value: number; secondaryValue?: number }[];
  height?: number;
  prefix?: string;
}

export function LineChart({ data, height = 300, prefix = "" }: LineChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return <div className="flex h-48 items-center justify-center text-sm text-neutral-400">No chart data</div>;
  }

  const values = data.map((d) => d.value);
  const maxVal = Math.max(...values, 100);
  const minVal = 0;
  const range = maxVal - minVal;

  const svgWidth = 600;
  const svgHeight = height;
  const paddingLeft = 60;
  const paddingRight = 20;
  const paddingTop = 30;
  const paddingBottom = 40;

  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  const points = data.map((d, i) => {
    const x = paddingLeft + (i / (data.length - 1 || 1)) * chartWidth;
    const y = paddingTop + chartHeight - ((d.value - minVal) / range) * chartHeight;
    return { x, y, label: d.label, value: d.value };
  });

  const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `${pathD} L ${points[points.length - 1]?.x ?? 0} ${paddingTop + chartHeight} L ${points[0]?.x ?? 0} ${paddingTop + chartHeight} Z`;

  // Draw grid lines
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  const formatYAxis = (v: number) => {
    if (v >= 100000) return `${prefix}${(v / 100000).toFixed(1)}L`;
    if (v >= 1000) return `${prefix}${(v / 1000).toFixed(0)}k`;
    return `${prefix}${v}`;
  };

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto overflow-visible select-none">
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Grid Lines */}
        {gridLines.map((gl, idx) => {
          const y = paddingTop + chartHeight - gl * chartHeight;
          const val = minVal + gl * range;
          return (
            <g key={idx} className="opacity-40">
              <line x1={paddingLeft} y1={y} x2={svgWidth - paddingRight} y2={y} stroke="#e5e7eb" strokeDasharray="3" />
              <text x={paddingLeft - 8} y={y + 4} textAnchor="end" className="text-[10px] font-semibold fill-neutral-400">
                {formatYAxis(val)}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        <path d={areaD} fill="url(#chartGradient)" />

        {/* Line stroke */}
        <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

        {/* Dots & Hover Triggers */}
        {points.map((p, idx) => (
          <g key={idx}>
            {/* Hover vertical alignment line */}
            {hoverIndex === idx && (
              <line x1={p.x} y1={paddingTop} x2={p.x} y2={paddingTop + chartHeight} stroke="#9ca3af" strokeWidth="1" strokeDasharray="2" />
            )}

            {/* Point circles */}
            <circle
              cx={p.x}
              cy={p.y}
              r={hoverIndex === idx ? 6 : 3}
              className={`${hoverIndex === idx ? "fill-white stroke-blue-500 stroke-2" : "fill-blue-500"} transition-all`}
            />

            {/* Invisible mouseover bars */}
            <rect
              x={p.x - (chartWidth / data.length) / 2}
              y={paddingTop}
              width={chartWidth / data.length}
              height={chartHeight}
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setHoverIndex(idx)}
              onMouseLeave={() => setHoverIndex(null)}
            />
          </g>
        ))}

        {/* X Axis Labels */}
        {points.filter((_, idx) => idx % Math.max(1, Math.floor(points.length / 6)) === 0).map((p, idx) => (
          <text key={idx} x={p.x} y={svgHeight - 15} textAnchor="middle" className="text-[10px] font-semibold fill-neutral-400">
            {p.label}
          </text>
        ))}
      </svg>

      {/* HTML Tooltip */}
      {hoverIndex !== null && points[hoverIndex] && (
        <div
          className="absolute rounded-chip border border-neutral-100 bg-white p-2.5 shadow-lg text-xs font-bold transition-all z-20 pointer-events-none"
          style={{
            left: `${(points[hoverIndex].x / svgWidth) * 100}%`,
            top: `${(points[hoverIndex].y / svgHeight) * 100 - 45}%`,
            transform: "translateX(-50%)",
          }}
        >
          <div className="text-neutral-400 text-[10px]">{points[hoverIndex].label}</div>
          <div className="text-neutral-900 mt-0.5">
            {prefix}
            {points[hoverIndex].value.toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Bar Chart ---
export interface BarChartProps {
  data: { label: string; value: number }[];
  height?: number;
  prefix?: string;
}

export function BarChart({ data, height = 300, prefix = "" }: BarChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return <div className="flex h-48 items-center justify-center text-sm text-neutral-400">No chart data</div>;
  }

  const values = data.map((d) => d.value);
  const maxVal = Math.max(...values, 100);
  const minVal = 0;
  const range = maxVal - minVal;

  const svgWidth = 600;
  const svgHeight = height;
  const paddingLeft = 60;
  const paddingRight = 20;
  const paddingTop = 30;
  const paddingBottom = 40;

  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  const barWidth = (chartWidth / data.length) * 0.6;
  const barGap = (chartWidth / data.length) * 0.4;

  const formatYAxis = (v: number) => {
    if (v >= 100000) return `${prefix}${(v / 100000).toFixed(1)}L`;
    if (v >= 1000) return `${prefix}${(v / 1000).toFixed(0)}k`;
    return `${prefix}${v}`;
  };

  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-auto overflow-visible select-none">
        {/* Grid Lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((gl, idx) => {
          const y = paddingTop + chartHeight - gl * chartHeight;
          const val = minVal + gl * range;
          return (
            <g key={idx} className="opacity-40">
              <line x1={paddingLeft} y1={y} x2={svgWidth - paddingRight} y2={y} stroke="#e5e7eb" strokeDasharray="3" />
              <text x={paddingLeft - 8} y={y + 4} textAnchor="end" className="text-[10px] font-semibold fill-neutral-400">
                {formatYAxis(val)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, idx) => {
          const x = paddingLeft + idx * (barWidth + barGap) + barGap / 2;
          const barHeight = ((d.value - minVal) / range) * chartHeight;
          const y = paddingTop + chartHeight - barHeight;

          return (
            <g key={idx}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={4}
                className={`${
                  hoverIndex === idx ? "fill-blue-600" : "fill-blue-500"
                } transition-all cursor-pointer`}
                onMouseEnter={() => setHoverIndex(idx)}
                onMouseLeave={() => setHoverIndex(null)}
              />
              <text
                x={x + barWidth / 2}
                y={svgHeight - 15}
                textAnchor="middle"
                className="text-[10px] font-semibold fill-neutral-400"
              >
                {d.label.length > 8 ? `${d.label.substring(0, 7)}...` : d.label}
              </text>
            </g>
          );
        })}
      </svg>

      {hoverIndex !== null && data[hoverIndex] && (
        <div
          className="absolute rounded-chip border border-neutral-100 bg-white p-2.5 shadow-lg text-xs font-bold transition-all z-20 pointer-events-none"
          style={{
            left: `${((paddingLeft + hoverIndex * (barWidth + barGap) + barWidth / 2 + barGap / 2) / svgWidth) * 100}%`,
            top: `${((paddingTop + chartHeight - ((data[hoverIndex].value - minVal) / range) * chartHeight) / svgHeight) * 100 - 45}%`,
            transform: "translateX(-50%)",
          }}
        >
          <div className="text-neutral-400 text-[10px]">{data[hoverIndex].label}</div>
          <div className="text-neutral-900 mt-0.5">
            {prefix}
            {data[hoverIndex].value.toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Donut Chart ---
export interface DonutChartProps {
  data: { label: string; value: number }[];
  prefix?: string;
}

export function DonutChart({ data, prefix = "" }: DonutChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return <div className="flex h-48 items-center justify-center text-sm text-neutral-400">No chart data</div>;
  }

  const total = data.reduce((sum, d) => sum + d.value, 0);
  const cx = 100;
  const cy = 100;
  const r = 70;
  const strokeWidth = 20;
  const circ = 2 * Math.PI * r;

  let accumulatedAngle = 0;

  const colors = ["#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4"];

  const segments = data.map((d, idx) => {
    const pct = total > 0 ? d.value / total : 0;
    const strokeDash = pct * circ;
    const strokeOffset = circ - accumulatedAngle;
    accumulatedAngle += strokeDash;

    return {
      label: d.label,
      value: d.value,
      pct,
      strokeDash,
      strokeOffset,
      color: colors[idx % colors.length],
    };
  });

  return (
    <div className="flex flex-col items-center justify-center gap-6 sm:flex-row">
      <div className="relative size-48">
        <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90 select-none">
          {segments.map((seg, idx) => (
            <circle
              key={idx}
              cx={cx}
              cy={cy}
              r={r}
              fill="transparent"
              stroke={seg.color}
              strokeWidth={hoverIndex === idx ? strokeWidth + 4 : strokeWidth}
              strokeDasharray={`${seg.strokeDash} ${circ}`}
              strokeDashoffset={seg.strokeOffset}
              strokeLinecap="butt"
              className="transition-all cursor-pointer"
              onMouseEnter={() => setHoverIndex(idx)}
              onMouseLeave={() => setHoverIndex(null)}
            />
          ))}
          {/* Central text */}
          <circle cx={cx} cy={cy} r={r - strokeWidth / 2} fill="white" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-neutral-400">Total</span>
          <span className="text-xl font-extrabold text-neutral-900">
            {prefix}
            {total.toLocaleString()}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {segments.map((seg, idx) => (
          <div
            key={idx}
            className={`flex items-center gap-2.5 px-2 py-1 rounded-full transition-colors ${
              hoverIndex === idx ? "bg-neutral-50" : ""
            }`}
            onMouseEnter={() => setHoverIndex(idx)}
            onMouseLeave={() => setHoverIndex(null)}
          >
            <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: seg.color }} />
            <span className="text-xs font-semibold text-neutral-600 w-28 truncate">{seg.label}</span>
            <span className="text-xs font-bold text-neutral-900 ml-auto">
              {prefix}
              {seg.value.toLocaleString()}
            </span>
            <span className="text-[10px] font-extrabold text-neutral-400 ml-1">
              ({(seg.pct * 100).toFixed(0)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Heatmap Chart ---
export interface HeatmapProps {
  data: { day: string; hour: number; value: number }[];
}

export function Heatmap({ data }: HeatmapProps) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const hours = [9, 12, 15, 18, 21];

  const maxVal = Math.max(...data.map((d) => d.value), 1);

  // Group data
  const grid = new Map<string, number>();
  for (const d of data) {
    grid.set(`${d.day}-${d.hour}`, d.value);
  }

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[480px] p-2">
        <div className="flex mb-1.5 pl-10">
          {hours.map((hr) => (
            <div key={hr} className="flex-1 text-center text-[10px] font-bold text-neutral-400">
              {hr}:00
            </div>
          ))}
        </div>
        {days.map((day) => (
          <div key={day} className="flex items-center gap-1 mb-1">
            <div className="w-10 text-right pr-2 text-[10px] font-extrabold text-neutral-400">
              {day}
            </div>
            {hours.map((hr) => {
              const val = grid.get(`${day}-${hr}`) || 0;
              const alpha = val > 0 ? Math.max(0.1, val / maxVal) : 0;

              return (
                <div
                  key={hr}
                  className="flex-1 h-8 rounded transition-all cursor-pointer relative group"
                  style={{
                    backgroundColor: val > 0 ? `rgba(59, 130, 246, ${alpha})` : "#f3f4f6",
                  }}
                >
                  {/* Tooltip on Hover */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block bg-neutral-900 text-white text-[10px] font-bold px-2 py-1 rounded shadow-md z-30 pointer-events-none whitespace-nowrap">
                    {val} orders at {hr}:00
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
