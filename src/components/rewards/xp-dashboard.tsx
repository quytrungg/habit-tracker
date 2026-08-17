"use client";

import { format, parseISO } from "date-fns";
import { ChartNoAxesCombined, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import type { XpHistoryPoint } from "@/server/services/habit-service";

const ranges = [
  { label: "7D", days: 7 },
  { label: "30D", days: 30 },
  { label: "All", days: null },
] as const;

export function XpDashboard({ points }: { points: XpHistoryPoint[] }) {
  const [range, setRange] = useState<(typeof ranges)[number]["days"]>(30);
  const visiblePoints = useMemo(
    () => (range ? points.slice(-range) : points),
    [points, range],
  );
  const totalXp = visiblePoints.at(-1)?.totalXp ?? 0;
  const earnedXp = visiblePoints.reduce((total, point) => total + point.earnedXp, 0);
  const maximum = Math.max(...visiblePoints.map((point) => point.totalXp), 1);
  const path = visiblePoints
    .map((point, index) => {
      const x = visiblePoints.length === 1 ? 50 : (index / (visiblePoints.length - 1)) * 100;
      const y = 92 - (point.totalXp / maximum) * 78;
      return `${index ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
  const areaPath = path ? `${path} L100 92 L0 92 Z` : "";
  const labels = visiblePoints.filter(
    (_, index) =>
      index === 0 ||
      index === visiblePoints.length - 1 ||
      index % Math.max(1, Math.floor(visiblePoints.length / 4)) === 0,
  );

  return (
    <section aria-labelledby="xp-dashboard-title" className="xp-dashboard">
      <header className="xp-dashboard-header">
        <div>
          <p className="eyebrow">YOUR MOMENTUM</p>
          <h2 id="xp-dashboard-title">XP dashboard</h2>
        </div>
        <div aria-label="XP chart range" className="xp-range-picker">
          {ranges.map(({ label, days }) => (
            <button
              aria-pressed={range === days}
              key={label}
              onClick={() => setRange(days)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="xp-summary">
        <span>Total XP</span>
        <strong><Sparkles aria-hidden="true" size={19} /> {totalXp.toLocaleString()}</strong>
        <small>+{earnedXp} XP in this range</small>
      </div>

      {visiblePoints.length ? (
        <div
          aria-label={`Cumulative XP line chart ending at ${totalXp} XP`}
          className="xp-chart"
          role="img"
        >
          <svg aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="xp-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.26" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {[20, 40, 60, 80].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} />)}
            <path d={areaPath} fill="url(#xp-area)" />
            <path d={path} fill="none" stroke="var(--accent)" strokeWidth="0.55" vectorEffect="non-scaling-stroke" />
            <circle cx={visiblePoints.length === 1 ? 50 : 100} cy={92 - (totalXp / maximum) * 78} fill="var(--accent)" r="1.15" />
          </svg>
          <span className="xp-chart-value">{totalXp} XP</span>
        </div>
      ) : (
        <div className="xp-chart-empty"><ChartNoAxesCombined aria-hidden="true" /> Check in to start your XP history.</div>
      )}

      {visiblePoints.length ? (
        <div className="xp-chart-labels" aria-hidden="true">
          {labels.map((point) => <span key={point.date}>{format(parseISO(`${point.date}T12:00:00`), "MMM d")}</span>)}
        </div>
      ) : null}
    </section>
  );
}
