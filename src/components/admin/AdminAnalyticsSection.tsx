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
    <div className={`animate-pulse rounded-md bg-muted/50 ${className ?? ""}`} />
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  loading,
  accent,
  sub,
}: {
  label: string;
  value: string | number;
  loading: boolean;
  /** "primary" = subtle primary tint, "conversion" = dedicated conversion style */
  accent?: "primary" | "conversion";
  /** optional helper text below the label */
  sub?: string;
}) {
  const isConversion = accent === "conversion";
  const isPrimary = accent === "primary";

  const containerCls = [
    "rounded-xl border bg-background p-5 shadow-sm transition-shadow hover:shadow-md",
    isConversion && "border-primary/25 bg-primary/5",
    isPrimary && "border-border/80",
  ]
    .filter(Boolean)
    .join(" ");

  if (loading) {
    return (
      <div className={containerCls}>
        <Skeleton className="mb-3 h-9 w-14" />
        <Skeleton className="h-3 w-20" />
        {sub && <Skeleton className="mt-1.5 h-2.5 w-28" />}
      </div>
    );
  }

  return (
    <div className={containerCls}>
      {isPrimary && (
        <div className="mb-3 h-0.5 w-6 rounded-full bg-primary/40" />
      )}
      <p
        className={[
          "text-[2rem] font-bold leading-none tracking-tight",
          isConversion ? "text-primary" : "text-foreground",
        ].join(" ")}
      >
        {value}
      </p>
      <p
        className={[
          "mt-2 text-xs font-medium",
          isConversion ? "text-primary/80" : "text-muted-foreground",
        ].join(" ")}
      >
        {label}
      </p>
      {sub && (
        <p className="mt-1 text-[10px] leading-snug text-muted-foreground/60">
          {sub}
        </p>
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
    <div className="rounded-lg border bg-background px-3.5 py-2.5 shadow-lg text-xs">
      <p className="mb-2 font-semibold text-foreground/70 tracking-wide">{label}</p>
      <div className="space-y-1">
        {payload.map((p) => (
          <div key={p.name} className="flex items-center gap-2">
            <span
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: p.color }}
            />
            <span className="text-muted-foreground">{p.name}</span>
            <span className="ms-auto font-bold text-foreground">{p.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Format date label ─────────────────────────────────────────────────────────

function shortDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("he-IL", { day: "numeric", month: "numeric" });
}

// ── Polished empty state ──────────────────────────────────────────────────────

function EmptyState({ message, sub }: { message: string; sub: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
      <div className="mb-1 h-px w-8 rounded-full bg-border" />
      <p className="text-sm font-medium text-foreground/40">{message}</p>
      <p className="text-xs text-muted-foreground/50">{sub}</p>
    </div>
  );
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

  const maxSessions = sources.reduce((m, s) => Math.max(m, s.sessions), 1);

  return (
    <section className="space-y-7">
      {/* ── Header ── */}
      <div className="flex items-end justify-between border-b border-border/50 pb-4">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            סטטיסטיקות אתר
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            7 הימים האחרונים · עדכון בזמן אמת
          </p>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive/80">
          {error}
        </div>
      )}

      {/* ── No data ── */}
      {noData && (
        <p className="text-sm text-muted-foreground/70">
          אין עדיין נתונים זמינים
        </p>
      )}

      {/* ── KPI grid — funnel order ── */}
      {!error && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard
            label="מבקרים"
            value={metrics?.activeUsers ?? 0}
            loading={loading}
            accent="primary"
          />
          <KpiCard
            label="סשנים"
            value={metrics?.sessions ?? 0}
            loading={loading}
          />
          <KpiCard
            label="לחיצות CTA"
            value={metrics?.ctaClicks ?? 0}
            loading={loading}
          />
          <KpiCard
            label="התחלות הזמנה"
            value={metrics?.startOrders ?? 0}
            loading={loading}
            accent="primary"
          />
          <KpiCard
            label="השלמות"
            value={metrics?.orderCompleted ?? 0}
            loading={loading}
          />
          <KpiCard
            label="המרה"
            value={loading ? "—" : conversionRate}
            loading={loading}
            accent="conversion"
            sub="מבקרים ← התחלות הזמנה"
          />
        </div>
      )}

      {/* ── Chart + sources ── */}
      {!error && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Line chart */}
          <div className="lg:col-span-2 rounded-xl border bg-background p-6 shadow-sm">
            <div className="mb-5">
              <p className="text-sm font-semibold text-foreground">מגמה יומית</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                מבקרים, התחלות הזמנה והשלמות לפי יום
              </p>
            </div>

            {loading ? (
              <Skeleton className="h-52 w-full rounded-lg" />
            ) : !hasChart ? (
              <EmptyState
                message="אין מספיק נתונים עדיין"
                sub="הנתונים יופיעו לאחר פעילות ראשונית באתר"
              />
            ) : (
              <>
                {/* Legend — manual, above chart */}
                <div className="mb-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
                  {[
                    { color: "#8F9F7A", label: "מבקרים" },
                    { color: "#6b7cbc", label: "התחלות הזמנה" },
                    { color: "#e07b5a", label: "השלמות" },
                  ].map((l) => (
                    <span key={l.label} className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: l.color }}
                      />
                      {l.label}
                    </span>
                  ))}
                </div>
                <ResponsiveContainer width="100%" height={188}>
                  <LineChart
                    data={chartData}
                    margin={{ top: 2, right: 8, left: -24, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                      opacity={0.6}
                    />
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
                      width={28}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
                    <Line
                      type="monotone"
                      dataKey="activeUsers"
                      name="מבקרים"
                      stroke="#8F9F7A"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3.5, strokeWidth: 0 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="startOrders"
                      name="התחלות הזמנה"
                      stroke="#6b7cbc"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3.5, strokeWidth: 0 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="orderCompleted"
                      name="השלמות"
                      stroke="#e07b5a"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 3.5, strokeWidth: 0 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </>
            )}
          </div>

          {/* Traffic sources */}
          <div className="rounded-xl border bg-background p-6 shadow-sm">
            <div className="mb-5">
              <p className="text-sm font-semibold text-foreground">מקורות תנועה</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                סשנים לפי מקור
              </p>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex justify-between">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-6" />
                    </div>
                    <Skeleton className="h-1 w-full rounded-full" />
                  </div>
                ))}
              </div>
            ) : sources.length === 0 ? (
              <EmptyState
                message="אין מספיק נתונים עדיין"
                sub="מקורות התנועה יופיעו לאחר פעילות ראשונית"
              />
            ) : (
              <ul className="space-y-3.5">
                {sources.map((s) => {
                  const pct = Math.round((s.sessions / maxSessions) * 100);
                  return (
                    <li key={s.source}>
                      <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-medium text-foreground/80">
                          {s.source}
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {s.sessions}
                        </span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-muted/60">
                        <div
                          className="h-full rounded-full bg-primary/50 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

        </div>
      )}
    </section>
  );
}
