import { BetaAnalyticsDataClient } from "@google-analytics/data";

function getClient(): BetaAnalyticsDataClient {
  const clientEmail = process.env.GA4_CLIENT_EMAIL;
  const rawPrivateKey = process.env.GA4_PRIVATE_KEY;

  if (!clientEmail || !rawPrivateKey) {
    throw new Error("Missing GA4 credentials: GA4_CLIENT_EMAIL or GA4_PRIVATE_KEY");
  }

  // Vercel stores the private key with literal \n — normalize to real newlines
  const privateKey = rawPrivateKey.replace(/\\n/g, "\n");

  return new BetaAnalyticsDataClient({
    credentials: { client_email: clientEmail, private_key: privateKey },
  });
}

function getPropertyId(): string {
  const id = process.env.GA4_PROPERTY_ID;
  if (!id) throw new Error("Missing GA4_PROPERTY_ID env var");
  return id.startsWith("properties/") ? id : `properties/${id}`;
}

export interface FunnelMetrics {
  activeUsers: number;
  sessions: number;
  ctaClicks: number;
  startOrders: number;
  orderCompleted: number;
}

/**
 * Fetch a small set of funnel metrics for the last N days.
 */
export async function fetchFunnelMetrics(
  daysAgo: number = 7
): Promise<FunnelMetrics> {
  const client = getClient();
  const property = getPropertyId();

  const dateRange = { startDate: `${daysAgo}daysAgo`, endDate: "today" };

  // --- session + user report ---
  const [sessionReport] = await client.runReport({
    property,
    dateRanges: [dateRange],
    metrics: [{ name: "activeUsers" }, { name: "sessions" }],
  });

  const activeUsers = Number(
    sessionReport.rows?.[0]?.metricValues?.[0]?.value ?? 0
  );
  const sessions = Number(
    sessionReport.rows?.[0]?.metricValues?.[1]?.value ?? 0
  );

  // --- event count report filtered to our funnel events ---
  const funnelEvents = ["cta_click", "start_order", "order_completed"];

  const [eventReport] = await client.runReport({
    property,
    dateRanges: [dateRange],
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        inListFilter: { values: funnelEvents },
      },
    },
  });

  const eventCounts: Record<string, number> = {};
  for (const row of eventReport.rows ?? []) {
    const name = row.dimensionValues?.[0]?.value ?? "";
    const count = Number(row.metricValues?.[0]?.value ?? 0);
    eventCounts[name] = count;
  }

  return {
    activeUsers,
    sessions,
    ctaClicks: eventCounts["cta_click"] ?? 0,
    startOrders: eventCounts["start_order"] ?? 0,
    orderCompleted: eventCounts["order_completed"] ?? 0,
  };
}

export interface DailyDataPoint {
  date: string; // "YYYY-MM-DD"
  activeUsers: number;
  startOrders: number;
  orderCompleted: number;
}

export interface TrafficSource {
  source: string;
  sessions: number;
}

export interface ChartData {
  daily: DailyDataPoint[];
  topSources: TrafficSource[];
}

/**
 * Fetch per-day breakdown and top traffic sources for the last N days.
 */
export async function fetchChartData(daysAgo: number = 7): Promise<ChartData> {
  const client = getClient();
  const property = getPropertyId();

  const dateRange = { startDate: `${daysAgo}daysAgo`, endDate: "yesterday" };

  // Daily users
  const [usersReport] = await client.runReport({
    property,
    dateRanges: [dateRange],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "activeUsers" }],
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });

  // Daily funnel events by date
  const funnelEvents = ["start_order", "order_completed"];
  const [eventsReport] = await client.runReport({
    property,
    dateRanges: [dateRange],
    dimensions: [{ name: "date" }, { name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        inListFilter: { values: funnelEvents },
      },
    },
    orderBys: [{ dimension: { dimensionName: "date" } }],
  });

  // Build a map: date → { activeUsers, startOrders, orderCompleted }
  const byDate: Record<string, DailyDataPoint> = {};

  for (const row of usersReport.rows ?? []) {
    const raw = row.dimensionValues?.[0]?.value ?? "";
    // GA4 returns dates as "YYYYMMDD"
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    byDate[date] = {
      date,
      activeUsers: Number(row.metricValues?.[0]?.value ?? 0),
      startOrders: 0,
      orderCompleted: 0,
    };
  }

  for (const row of eventsReport.rows ?? []) {
    const raw = row.dimensionValues?.[0]?.value ?? "";
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    const eventName = row.dimensionValues?.[1]?.value ?? "";
    const count = Number(row.metricValues?.[0]?.value ?? 0);
    if (!byDate[date]) {
      byDate[date] = { date, activeUsers: 0, startOrders: 0, orderCompleted: 0 };
    }
    if (eventName === "start_order") byDate[date].startOrders = count;
    if (eventName === "order_completed") byDate[date].orderCompleted = count;
  }

  const daily = Object.values(byDate).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  // Top traffic sources (top 5 by sessions)
  const [sourcesReport] = await client.runReport({
    property,
    dateRanges: [dateRange],
    dimensions: [{ name: "sessionSource" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: 5,
  });

  const topSources: TrafficSource[] = (sourcesReport.rows ?? []).map((row) => ({
    source: row.dimensionValues?.[0]?.value ?? "(unknown)",
    sessions: Number(row.metricValues?.[0]?.value ?? 0),
  }));

  return { daily, topSources };
}
