"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface TickItem {
  id: string;
  res_time_ms: number;
  status: "up" | "down";
  statusCode: number | null;
  region_id: string;
  createdAt: string;
  region?: { id: string; name: string };
}

interface WebsiteItem {
  id: string;
  url: string;
  timeAdded: string;
  metrics: {
    latestStatus: "up" | "down" | "pending";
    latestLatencyMs: number | null;
    uptimePercent: number | null;
    avgLatencyMs: number | null;
    totalChecks: number;
  };
  ticks: TickItem[];
}

export default function DashboardClient() {
  const router = useRouter();
  const [websites, setWebsites] = useState<WebsiteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [urlInput, setUrlInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchWebsites = useCallback(async () => {
    try {
      const res = await fetch("/api/getAllWebsites", { cache: "no-store" });
      if (res.status === 401) {
        router.push("/signin");
        return;
      }
      if (!res.ok) {
        throw new Error("Failed to load monitored websites");
      }
      const data = (await res.json()) as { websites?: WebsiteItem[] };
      setWebsites(data.websites ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      try {
        const res = await fetch("/api/getAllWebsites", { cache: "no-store" });
        if (cancelled) return;
        if (res.status === 401) {
          router.push("/signin");
          return;
        }
        if (!res.ok) {
          throw new Error("Failed to load monitored websites");
        }
        const data = (await res.json()) as { websites?: WebsiteItem[] };
        if (!cancelled) {
          setWebsites(data.websites ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load data");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadInitial();
    const interval = setInterval(() => {
      void fetchWebsites();
    }, 15_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fetchWebsites, router]);

  async function handleAddWebsite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/createWebsite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlInput }),
      });

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Failed to add website");
        return;
      }

      setUrlInput("");
      await fetchWebsites();
    } catch {
      setError("Network error while adding website");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/websites/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Failed to delete website");
        return;
      }
      setWebsites((prev) => prev.filter((site) => site.id !== id));
    } catch {
      setError("Network error while deleting website");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSignOut() {
    await fetch("/api/signout", { method: "POST" });
    router.push("/signin");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/80">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span>Uptime Dashboard</span>
          </Link>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void fetchWebsites()}
              className="px-3 py-1.5 rounded-lg border border-slate-700 hover:border-slate-500 text-xs font-medium text-slate-200 cursor-pointer"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4">
          <div>
            <h1 className="text-lg font-semibold text-white">
              Add a website to monitor
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Public HTTP/HTTPS endpoints only. Workers probe every 60 seconds
              from Bangladesh (<code>bd</code>) and India (<code>ind</code>).
            </p>
          </div>

          <form
            onSubmit={handleAddWebsite}
            className="flex flex-col sm:flex-row gap-3"
          >
            <input
              type="url"
              required
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold text-sm transition-colors cursor-pointer"
            >
              {submitting ? "Adding..." : "Add Monitor"}
            </button>
          </form>

          {error && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-300">
              {error}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Monitored Endpoints ({websites.length})
            </h2>
            <span className="text-xs text-slate-500">Auto-refreshes every 15s</span>
          </div>

          {loading ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-400">
              Loading monitors...
            </div>
          ) : websites.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-10 text-center text-sm text-slate-400">
              No websites monitored yet. Add a public URL above to start probing.
            </div>
          ) : (
            <div className="grid gap-4">
              {websites.map((site) => {
                const statusColor =
                  site.metrics.latestStatus === "up"
                    ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                    : site.metrics.latestStatus === "down"
                      ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                      : "bg-amber-500/15 text-amber-300 border-amber-500/30";

                const orderedTicks = [...site.ticks].reverse();

                return (
                  <div
                    key={site.id}
                    className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase border ${statusColor}`}
                          >
                            {site.metrics.latestStatus}
                          </span>
                          <a
                            href={site.url}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-sm text-white hover:text-emerald-400 truncate"
                          >
                            {site.url}
                          </a>
                        </div>
                        <p className="text-xs text-slate-400">
                          Uptime:{" "}
                          <strong className="text-slate-200">
                            {site.metrics.uptimePercent !== null
                              ? `${site.metrics.uptimePercent}%`
                              : "Pending"}
                          </strong>
                          {" · "}Avg latency:{" "}
                          <strong className="text-slate-200">
                            {site.metrics.avgLatencyMs !== null
                              ? `${site.metrics.avgLatencyMs}ms`
                              : "—"}
                          </strong>
                          {" · "}Checks:{" "}
                          <strong className="text-slate-200">
                            {site.metrics.totalChecks}
                          </strong>
                        </p>
                      </div>

                      <button
                        type="button"
                        disabled={deletingId === site.id}
                        onClick={() => void handleDelete(site.id)}
                        className="px-3 py-1.5 rounded-lg border border-slate-700 hover:border-rose-500/60 hover:text-rose-300 text-xs text-slate-400 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {deletingId === site.id ? "Removing..." : "Delete"}
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Recent ticks (oldest → newest)</span>
                        <span>Regions: bd, ind</span>
                      </div>
                      {orderedTicks.length === 0 ? (
                        <p className="text-xs text-slate-500 italic">
                          Waiting for first regional worker probe...
                        </p>
                      ) : (
                        <div className="flex items-center gap-1 h-7">
                          {orderedTicks.map((tick) => (
                            <div
                              key={tick.id}
                              title={`[${tick.region_id}] ${tick.status.toUpperCase()} · HTTP ${tick.statusCode ?? "ERR"} · ${tick.res_time_ms}ms · ${new Date(tick.createdAt).toLocaleString()}`}
                              className={`flex-1 max-w-4 h-full rounded-sm ${
                                tick.status === "up"
                                  ? "bg-emerald-500/85 hover:bg-emerald-400"
                                  : "bg-rose-500/85 hover:bg-rose-400"
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
