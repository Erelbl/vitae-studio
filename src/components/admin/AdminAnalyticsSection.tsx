"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// ── Types ────────────────────────────────────────────────────────────────────

interface FunnelMetrics {
  activeUsers: number;
  sessions: number;
  ctaClicks: number;
  startOrders: number;
  orderCompleted: number;
}

interface DailyDataPoint {
  date: string;
  activeUsers: number;
  startOrders: number;
  orderCompleted: number;
}

interface TrafficSource {
  source: string;
  sessions: number;
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-muted/60 ${className ?? ""}`} />
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  loading,
  highlight,
}: {
  label: string;
  value: string | number;
  loading: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border bg-background p-5 shadow-sm ${
        highlight ? "border-primary/30 bg-primary/4" : ""
      }`}
    >
      {loading ? (
        <>
          <Skeleton className="mb-3 h-8 w-16" />
          <Skeleton className="h-3 w-24" />
        </>
      ) : (
        <>
          <p
            className={`text-3xl font-bold tracking-tight ${
              highlight ? "text-primary" : "text-foreground"
            }`}
          >
            {value}
          </p>
          <p className="mt-1.5 text-xs font-medium text-muted-foreground">
            {label}
          </p>
        </>
      )}
    </div>
  );
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-xs">
      <p className="mb-1.5 font-semibold text-foreground/80">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: <span className="font-bold">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

// ── Format date label ─────────────────────────────────────────────────────────

function shortDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
}

// ── Main section ──────────────────────────────────────────────────────────────

export function AdminAnalyticsSection() {
  const [metrics, setMetrics] = useState<FunnelMetrics | null>(null);
  const [daily, setDaily] = useState<DailyDataPoint[]>([]);
  const [sources, setSources] = useState<TrafficSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [kpiRes, chartRes] = await Promise.all([
          fetch("/api/admin/analytics/test"),
          fetch("/api/admin/analytics/chart"),
        ]);

        if (!kpiRes.ok || !chartRes.ok) {
          throw new Error("שגיאה בטעינת נתוני אנליטיקס");
        }

        const kpiData = await kpiRes.json();
        const chartData = await chartRes.json();

        if (cancelled) return;

        if (!kpiData.success) throw new Error(kpiData.error ?? "שגיאה לא ידועה");

        setMetrics(kpiData.metrics);
        setDaily(chartData.daily ?? []);
        setSources(chartData.topSources ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "שגיאה");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const conversionRate =
    metrics && metrics.activeUsers > 0
      ? ((metrics.startOrders / metrics.activeUsers) * 100).toFixed(1) + "%"
      : "0%";

  const chartData = daily.map((d) => ({
    ...d,
    date: shortDate(d.date),
  }));

  const noData = !loading && !error && !metrics;
  const hasChart = chartData.length > 0;

  return (
    <section className="space-y-5">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-lg font-semibold">סטטיסטיקות אתר</h2>
          <p className="text-xs text-muted-foreground mt-0.5">7 הימים האחרונים</p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* No data */}
      {noData && (
        <p className="text-sm text-muted-foreground">אין עדיין נתונים</p>
      )}

      {/* KPI grid */}
      {!error && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="מבקרים" value={metrics?.activeUsers ?? 0} loading={loading} />
          <KpiCard label="סשנים" value={metrics?.sessions ?? 0} loading={loading} />
          <KpiCard label="לחיצות CTA" value={metrics?.ctaClicks ?? 0} loading={loading} />
          <KpiCard label="התחלות הזמנה" value={metrics?.startOrders ?? 0} loading={loading} />
          <KpiCard label="השלמות" value={metrics?.orderCompleted ?? 0} loading={loading} />
          <KpiCard label="אחוז המרה" value={loading ? 0 : conversionRate} loading={loading} highlight />
        </div>
      )}

      {/* Chart + sources row */}
      {!error && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Line chart */}
          <div className="lg:col-span-2 rounded-xl border bg-background p-5 shadow-sm">
            <p className="mb-4 text-sm font-semibold text-foreground/80">
              מגמה יומית
            </p>
            {loading ? (
              <Skeleton className="h-52 w-full" />
            ) : !hasChart ? (
              <div className="flex h-52 items-center justify-center text-sm text-muted-foreground">
                אין עדיין נתונים יומיים
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart
                  data={chartData}
                  margin={{ top: 4, right: 12, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    iconType="circle"
                    iconSize={8}
                  />
                  <Line
                    type="monotone"
                    dataKey="activeUsers"
                    name="מבקרים"
                    stroke="#8F9F7A"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="startOrders"
                    name="התחלות הזמנה"
                    stroke="#6b7cbc"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="orderCompleted"
                    name="השלמות"
                    stroke="#e07b5a"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Traffic sources */}
          <div className="rounded-xl border bg-background p-5 shadow-sm">
            <p className="mb-4 text-sm font-semibold text-foreground/80">
              מקורות תנועה
            </p>
            {loading ? (
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-8" />
                  </div>
                ))}
              </div>
            ) : sources.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין נתונים</p>
            ) : (
              <ul className="space-y-2.5">
                {sources.map((s) => (
                  <li
                    key={s.source}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="truncate text-foreground/80 font-medium">
                      {s.source}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {s.sessions}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
