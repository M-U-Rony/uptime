export interface TickLike {
  id: string;
  status: "up" | "down";
  res_time_ms: number;
  statusCode?: number | null;
  region_id: string;
  createdAt: Date | string;
}

export interface WebsiteSummaryMetrics {
  latestStatus: "up" | "down" | "pending";
  latestLatencyMs: number | null;
  uptimePercent: number | null;
  avgLatencyMs: number | null;
  totalChecks: number;
}

export function computeWebsiteMetrics(ticks: TickLike[]): WebsiteSummaryMetrics {
  if (ticks.length === 0) {
    return {
      latestStatus: "pending",
      latestLatencyMs: null,
      uptimePercent: null,
      avgLatencyMs: null,
      totalChecks: 0,
    };
  }

  const upCount = ticks.filter((t) => t.status === "up").length;
  const totalLatency = ticks.reduce((sum, t) => sum + t.res_time_ms, 0);

  return {
    latestStatus: ticks[0].status,
    latestLatencyMs: ticks[0].res_time_ms,
    uptimePercent: Number(((upCount / ticks.length) * 100).toFixed(1)),
    avgLatencyMs: Math.round(totalLatency / ticks.length),
    totalChecks: ticks.length,
  };
}
