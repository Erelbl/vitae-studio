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
