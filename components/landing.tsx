import Link from "next/link";

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="border-b border-slate-800/80">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span>Uptime</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/signin"
              className="text-slate-300 hover:text-white transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold transition-colors"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1 flex items-center">
        <div className="max-w-6xl mx-auto px-6 py-20 grid gap-12 lg:grid-cols-2 lg:items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-medium">
              Redis Streams · Multi-Region Workers · PostgreSQL
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight text-white">
              Event-driven website availability &amp; latency monitoring.
            </h1>
            <p className="text-slate-400 text-base sm:text-lg leading-relaxed max-w-xl">
              Monitor endpoints continuously across regional consumer groups
              (<code className="text-slate-200">bd</code>,{" "}
              <code className="text-slate-200">ind</code>) with SSRF-safe HTTP
              probing, automatic crash recovery via Redis{" "}
              <code className="text-slate-200">XAUTOCLAIM</code>, and live
              per-region response time ticks.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                href="/signup"
                className="px-5 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm transition-colors"
              >
                Create free account
              </Link>
              <Link
                href="/dashboard"
                className="px-5 py-3 rounded-xl border border-slate-700 hover:border-slate-500 text-slate-200 font-semibold text-sm transition-colors"
              >
                Open dashboard
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800 pb-3">
              <span className="font-mono">stream: uptime</span>
              <span className="text-emerald-400 font-medium">4 consumers online</span>
            </div>
            <div className="space-y-3 text-sm">
              {[
                {
                  title: "Multi-Region Redis Consumer Groups",
                  desc: "Blocking XREADGROUP workers per region with isolated connections and automatic PEL recovery.",
                },
                {
                  title: "SSRF-Protected Probe Engine",
                  desc: "Validates URL schemes, blocks private/link-local IP ranges, checks resolved DNS records, and audits redirects.",
                },
                {
                  title: "Time-Series Tick Persistence",
                  desc: "Records HTTP status codes, millisecond latency, and regional timestamps in indexed PostgreSQL tables.",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-xl border border-slate-800 bg-slate-950/70 p-4"
                >
                  <h2 className="font-semibold text-slate-100">{item.title}</h2>
                  <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
