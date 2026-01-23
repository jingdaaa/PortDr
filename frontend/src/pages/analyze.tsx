import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/sonner";
import { Loader2, Plus, RefreshCw, Sparkles, X } from "lucide-react";

// ---------------- Types ----------------
interface BasicStat {
  symbol: string;
  open: number | null;
  close: number | null;
  country: string | null;
  lastDate?: string | null;
}

type RiskReturnRow = {
  Return: number;
  Deviation: number;
  Sharpe: number;
};

type OptimizePayload = {
  ok: boolean;
  results?: {
    risk_return: Record<string, RiskReturnRow>;
    correlation: Record<string, Record<string, number>>;
    optimal_portfolio: {
      expected_return: number;
      volatility: number;
      sharpe: number;
      weights: Record<string, number>;
      downside?: {
        max_drawdown: number | null;
        worst_month_return: number | null;
        worst_month_date: string | null;
        worst_year_return: number | null;
        worst_year: number | null;
        downside_deviation_annual: number | null;
        sortino: number | null;
        annual_return_geom?: number | null;
      };
    };
  };
  plots?: {
    pie_chart?: string; // base64 png
    efficient_frontier?: string; // base64 png
  };
  meta?: {
    tickers: string[];
    risk_free: number;
    simulations: number;
  };
  error?: string;
  type?: string;
};

// ---------------- Helpers ----------------
const fmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 });
const pct = new Intl.NumberFormat(undefined, { style: "percent", maximumFractionDigits: 1 });

function uniquePush(list: string[], raw: string) {
  const symbol = raw.trim().toUpperCase();
  if (!symbol) return list;
  if (list.includes(symbol)) return list;
  return [...list, symbol];
}

// Optional: if you deploy backend separately, set VITE_API_BASE to "https://your-api.com"
const API_BASE = (import.meta as any).env?.VITE_API_BASE ?? "";

async function fetchLastQuote(symbol: string): Promise<BasicStat> {
  const r = await fetch(`${API_BASE}/api/ticker/last`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticker: symbol }),
  });

  const data = (await r.json()) as any;

  // Soft-fail: keep UI working even if a ticker errors
  if (!r.ok || !data?.ok) {
    return { symbol, open: null, close: null, country: null, lastDate: null };
  }

  return {
    symbol: data.ticker ?? symbol,
    open: typeof data.last_open === "number" ? data.last_open : null,
    close: typeof data.last_close === "number" ? data.last_close : null,
    country: data.country ?? null,
    lastDate: data.last_date ?? null,
  };
}

async function fetchBasics(symbols: string[]): Promise<BasicStat[]> {
  if (!symbols.length) return [];
  return Promise.all(symbols.map((s) => fetchLastQuote(s)));
}

async function postOptimize(args: { symbols: string[]; riskFree: number; simulations: number }): Promise<OptimizePayload> {
  const r = await fetch(`${API_BASE}/api/optimize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tickers: args.symbols,
      risk_free: args.riskFree,
      simulations: args.simulations,
      verbose: false,
    }),
  });

  const data = (await r.json()) as OptimizePayload;

  if (!r.ok || !data.ok) throw new Error(data?.error || "Optimization failed");
  return data;
}

function clamp01(n: number) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

// Correlation Matrix inputs
type CorrMatrix = Record<string, Record<string, number>>;

function safeNum(x: any, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function computeCorrelationInsights(corr: CorrMatrix, weights?: Record<string, number>) {
  const tickers = Object.keys(corr).sort();
  const pairs: { a: string; b: string; v: number; wpair?: number }[] = [];

  for (let i = 0; i < tickers.length; i++) {
    for (let j = i + 1; j < tickers.length; j++) {
      const a = tickers[i];
      const b = tickers[j];
      const v = safeNum(corr?.[a]?.[b], safeNum(corr?.[b]?.[a], 0));
      const wpair = weights ? safeNum(weights[a], 0) * safeNum(weights[b], 0) : undefined;
      pairs.push({ a, b, v, wpair });
    }
  }

  if (!pairs.length) {
    return {
      tickers,
      avgAbs: 0,
      avg: 0,
      most: null as null | { a: string; b: string; v: number },
      least: null as null | { a: string; b: string; v: number },
      weightedAvgAbs: null as null | number,
      diversificationScore: 0,
    };
  }

  const avgAbs = pairs.reduce((s, p) => s + Math.abs(p.v), 0) / pairs.length;
  const avg = pairs.reduce((s, p) => s + p.v, 0) / pairs.length;

  let most = pairs[0];
  let least = pairs[0];
  for (const p of pairs) {
    if (p.v > most.v) most = p;
    if (p.v < least.v) least = p;
  }

  // Weighted average absolute correlation (uses wi * wj as weights)
  let weightedAvgAbs: number | null = null;
  if (weights) {
    const denom = pairs.reduce((s, p) => s + (p.wpair ?? 0), 0);
    if (denom > 0) {
      weightedAvgAbs = pairs.reduce((s, p) => s + Math.abs(p.v) * (p.wpair ?? 0), 0) / denom;
    }
  }

  // Diversification score (0–100): higher implies lower average absolute correlation
  const diversificationScore = clamp((1 - avgAbs) * 100, 0, 100);

  return {
    tickers,
    avgAbs,
    avg,
    most: { a: most.a, b: most.b, v: most.v },
    least: { a: least.a, b: least.b, v: least.v },
    weightedAvgAbs,
    diversificationScore,
  };
}

function CorrelationHeatmap({ corr, weights }: { corr: CorrMatrix; weights?: Record<string, number> }) {
  const tickers = Object.keys(corr).sort();
  const insight = computeCorrelationInsights(corr, weights);

  const fmt2 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
  const fmt1 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

  function cellStyle(v: number, isDiag: boolean) {
    const abs = Math.abs(v);
    const alpha = isDiag ? 0.18 : 0.06 + 0.55 * clamp(abs, 0, 1);

    const bg = v >= 0 ? `hsl(var(--primary) / ${alpha})` : `hsl(var(--destructive) / ${alpha})`;

    return {
      backgroundColor: isDiag ? `hsl(var(--muted) / 0.55)` : bg,
    } as React.CSSProperties;
  }

  if (tickers.length === 0) {
    return <div className="text-sm text-muted-foreground">Correlation matrix not available.</div>;
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border/50 bg-background/40 p-4">
          <div className="text-xs text-muted-foreground">Diversification score</div>
          <div className="mt-1 text-2xl font-bold">{fmt1.format(insight.diversificationScore)} / 100</div>
          <div className="mt-1 text-xs text-muted-foreground">Based on average absolute correlation.</div>
        </div>

        <div className="rounded-xl border border-border/50 bg-background/40 p-4">
          <div className="text-xs text-muted-foreground">Avg |correlation|</div>
          <div className="mt-1 text-2xl font-bold">{fmt2.format(insight.avgAbs)}</div>
          {insight.weightedAvgAbs != null && (
            <div className="mt-1 text-xs text-muted-foreground">Weighted: {fmt2.format(insight.weightedAvgAbs)}</div>
          )}
        </div>

        <div className="rounded-xl border border-border/50 bg-background/40 p-4">
          <div className="text-xs text-muted-foreground">Most / least correlated pair</div>
          <div className="mt-2 text-sm">
            <div>
              <span className="font-medium">{insight.most?.a}</span> ↔ <span className="font-medium">{insight.most?.b}</span>{" "}
              <span className="text-muted-foreground">({fmt2.format(insight.most?.v ?? 0)})</span>
            </div>
            <div className="mt-1">
              <span className="font-medium">{insight.least?.a}</span> ↔ <span className="font-medium">{insight.least?.b}</span>{" "}
              <span className="text-muted-foreground">({fmt2.format(insight.least?.v ?? 0)})</span>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="grid gap-1" style={{ gridTemplateColumns: `140px repeat(${tickers.length}, minmax(52px, 1fr))` }}>
          <div className="sticky left-0 z-10 rounded-md bg-background/80 p-2 text-xs font-medium text-muted-foreground backdrop-blur">
            Correlation
          </div>

          {tickers.map((t) => (
            <div key={`col-${t}`} className="p-2 text-center text-xs font-medium text-muted-foreground">
              {t}
            </div>
          ))}

          {tickers.map((r) => (
            <div key={`row-${r}`} className="contents">
              <div className="sticky left-0 z-10 rounded-md bg-background/80 p-2 text-xs font-medium backdrop-blur">{r}</div>

              {tickers.map((c) => {
                const isDiag = r === c;
                const v = safeNum(corr?.[r]?.[c], safeNum(corr?.[c]?.[r], isDiag ? 1 : 0));
                const display = isDiag ? "1.00" : fmt2.format(v);

                return (
                  <div
                    key={`${r}-${c}`}
                    className="flex items-center justify-center rounded-md border border-border/40 p-2 text-xs tabular-nums"
                    style={cellStyle(v, isDiag)}
                    title={`${r} vs ${c}: ${display}`}
                  >
                    {display}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm border border-border/50" style={{ background: `hsl(var(--destructive) / 0.35)` }} />
          Negative correlation
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm border border-border/50" style={{ background: `hsl(var(--muted) / 0.55)` }} />
          Diagonal (1.00) / near-zero
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm border border-border/50" style={{ background: `hsl(var(--primary) / 0.35)` }} />
          Positive correlation
        </span>
      </div>
    </div>
  );
}

export default function Analyze() {
  const [input, setInput] = useState("");
  const [symbols, setSymbols] = useState<string[]>([]);
  const [riskFree, setRiskFree] = useState(0.02);
  const [simulations, setSimulations] = useState(5000);
  const resultsRef = useRef<HTMLDivElement | null>(null);
  const optimizeRef = useRef<HTMLDivElement | null>(null);

  const { data: basics, isFetching: basicsLoading, refetch: refetchBasics } = useQuery({
    queryKey: ["basics", symbols],
    queryFn: () => fetchBasics(symbols),
    enabled: symbols.length > 0,
  });

  const optimizeMutation = useMutation({
    mutationFn: () => postOptimize({ symbols, riskFree, simulations }),
    onSuccess: () => {
      toast.success("Optimization finished");
      setTimeout(() => optimizeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    },
    onError: (e: any) => toast.error(e?.message ?? "Optimization failed"),
  });

  const remove = (s: string) => setSymbols((prev) => prev.filter((x) => x !== s));

  const onPush = () => {
    if (!input.trim()) return;
    setSymbols((prev) => uniquePush(prev, input));
    setInput("");
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  useEffect(() => {
    if (symbols.length) void refetchBasics();
  }, [symbols, refetchBasics]);

  const optimal = optimizeMutation.data?.results?.optimal_portfolio;
  const downside = optimal?.downside;

  const weights = useMemo(() => {
    const w = optimal?.weights ?? {};
    return Object.entries(w)
      .map(([symbol, weight]) => ({ symbol, weight }))
      .sort((a, b) => b.weight - a.weight);
  }, [optimal]);

  const canOptimize = symbols.length >= 1 && !optimizeMutation.isPending;

  return (
    <div className="min-h-screen bg-gradient-hero px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="text-center space-y-2">
          <Badge variant="secondary">Portfolio Optimizer</Badge>
          <h1 className="text-3xl sm:text-4xl font-bold"> PortDr </h1>
          <p className="text-muted-foreground">
            Redifining, Reforming, and Reoptimizing your investment journey
          </p>
        </header>

        <Card className="bg-gradient-card">
          <CardHeader>
            <CardTitle>Stocks</CardTitle>
            <CardDescription>Enter one ticker at a time (eg. AAPL, TSLA, MSFT). Press enter to add.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => (e.key === "Enter" ? onPush() : null)}
                className="flex-1 rounded-md border bg-background px-4 py-2"
                placeholder="AAPL (press Enter)"
                aria-label="Ticker symbol"
              />
              <Button onClick={onPush} className="inline-flex items-center" aria-label="Add ticker">
                <Plus className="mr-2 h-4 w-4" /> Enter
              </Button>
            </div>

            {!!symbols.length && (
              <div className="mt-4 flex flex-wrap gap-2">
                {symbols.map((s) => (
                  <span key={s} className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-sm">
                    {s}
                    <button aria-label={`remove ${s}`} onClick={() => remove(s)} className="opacity-70 hover:opacity-100">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div ref={resultsRef} />
        {symbols.length > 0 && (
          <Card className="bg-gradient-card">
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>Recent information of ticker (via the backend API).</CardDescription>
            </CardHeader>
            <CardContent>
              {basicsLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading quotes…
                </div>
              ) : basics && basics.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-muted-foreground">
                      <tr>
                        <th className="py-2">Symbol</th>
                        <th className="py-2">Open</th>
                        <th className="py-2">Close</th>
                        <th className="py-2">Country</th>
                        <th className="py-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {basics.map((b) => (
                        <tr key={b.symbol} className="border-t border-border/50">
                          <td className="py-2 font-medium">{b.symbol}</td>
                          <td className="py-2">{b.open == null ? "—" : fmt.format(b.open)}</td>
                          <td className="py-2">{b.close == null ? "—" : fmt.format(b.close)}</td>
                          <td className="py-2">{b.country ?? "—"}</td>
                          <td className="py-2">{b.lastDate ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-muted-foreground">
                  No quotes returned yet. Double-check ticker symbols or try refreshing.
                </div>
              )}

              <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">Risk-free rate (annual)</div>
                    <input
                      value={riskFree}
                      onChange={(e) => setRiskFree(Number(e.target.value))}
                      type="number"
                      step="0.005"
                      min="0"
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    />
                    <div className="text-xs text-muted-foreground">Decimal form. Example: 0.02 = 2%.</div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-sm font-medium">Simulations</div>
                    <input
                      value={simulations}
                      onChange={(e) => setSimulations(Number(e.target.value))}
                      type="number"
                      step="500"
                      min="500"
                      max="50000"
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    />
                    <div className="text-xs text-muted-foreground">More samples improves stability but increases runtime.</div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                  <Button variant="secondary" onClick={() => refetchBasics()} disabled={basicsLoading}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Refresh quotes
                  </Button>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button onClick={() => optimizeMutation.mutate()} disabled={!canOptimize}>
                          {optimizeMutation.isPending ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running…
                            </>
                          ) : (
                            <>
                              <Sparkles className="mr-2 h-4 w-4" /> Run optimization
                            </>
                          )}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      Runs Monte Carlo optimization via <span className="font-mono">/api/optimize</span> and returns weights and plots.
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div ref={optimizeRef} />
        {optimizeMutation.data?.ok && optimal && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <Badge variant="secondary">Results</Badge>
              <h2 className="text-2xl sm:text-3xl font-bold">Optimal Portfolio</h2>
              <p className="text-muted-foreground">Max-Sharpe allocation selected from the simulated portfolio set.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Card className="bg-gradient-card">
                <CardHeader>
                  <CardTitle className="text-base">Expected return</CardTitle>
                  <CardDescription>Annualized (simulation)</CardDescription>
                </CardHeader>
                <CardContent className="text-2xl font-bold">{fmt.format(optimal.expected_return)}</CardContent>
              </Card>

              <Card className="bg-gradient-card">
                <CardHeader>
                  <CardTitle className="text-base">Volatility</CardTitle>
                  <CardDescription>Annualized risk</CardDescription>
                </CardHeader>
                <CardContent className="text-2xl font-bold">{fmt.format(optimal.volatility)}</CardContent>
              </Card>

              <Card className="bg-gradient-card">
                <CardHeader>
                  <CardTitle className="text-base">Sharpe ratio</CardTitle>
                  <CardDescription>Return / risk (risk-free adjusted)</CardDescription>
                </CardHeader>
                <CardContent className="text-2xl font-bold">{fmt.format(optimal.sharpe)}</CardContent>
              </Card>
            </div>

            {downside && (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card className="bg-gradient-card">
                  <CardHeader>
                    <CardTitle className="text-base">Max drawdown</CardTitle>
                    <CardDescription>Worst peak-to-trough drop</CardDescription>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold">
                    {downside.max_drawdown == null ? "—" : `${(downside.max_drawdown * 100).toFixed(1)}%`}
                  </CardContent>
                </Card>

                <Card className="bg-gradient-card">
                  <CardHeader>
                    <CardTitle className="text-base">Worst month</CardTitle>
                    <CardDescription>{downside.worst_month_date ?? "—"}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold">
                    {downside.worst_month_return == null ? "—" : `${(downside.worst_month_return * 100).toFixed(1)}%`}
                  </CardContent>
                </Card>

                <Card className="bg-gradient-card">
                  <CardHeader>
                    <CardTitle className="text-base">Worst year</CardTitle>
                    <CardDescription>{downside.worst_year == null ? "—" : String(downside.worst_year)}</CardDescription>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold">
                    {downside.worst_year_return == null ? "—" : `${(downside.worst_year_return * 100).toFixed(1)}%`}
                  </CardContent>
                </Card>

                <Card className="bg-gradient-card">
                  <CardHeader>
                    <CardTitle className="text-base">Sortino ratio</CardTitle>
                    <CardDescription>Downside-risk adjusted return</CardDescription>
                  </CardHeader>
                  <CardContent className="text-2xl font-bold">{downside.sortino == null ? "—" : downside.sortino.toFixed(2)}</CardContent>
                </Card>
              </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="bg-gradient-card">
                <CardHeader>
                  <CardTitle>Portfolio weights</CardTitle>
                  <CardDescription>Capital allocation across tickers (weights sum to 1).</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    {weights.map((w) => (
                      <div key={w.symbol} className="space-y-1">
                        <div className="flex items-center justify-between text-sm">
                          <div className="font-medium">{w.symbol}</div>
                          <div className="text-muted-foreground">{pct.format(clamp01(w.weight))}</div>
                        </div>
                        <div className="h-2 w-full rounded-full bg-border/60">
                          <div className="h-2 rounded-full bg-primary" style={{ width: `${clamp01(w.weight) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  {optimizeMutation.data.plots?.pie_chart && (
                    <div className="pt-4">
                      <div className="text-sm font-medium mb-2">Weight breakdown (chart)</div>
                      <img
                        className="w-full rounded-lg border border-border/50"
                        alt="Optimal portfolio weights pie chart"
                        src={`data:image/png;base64,${optimizeMutation.data.plots.pie_chart}`}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-gradient-card">
                <CardHeader>
                  <CardTitle>Efficient frontier</CardTitle>
                  <CardDescription>Simulated portfolios coloured by Sharpe ratio.</CardDescription>
                </CardHeader>
                <CardContent>
                  {optimizeMutation.data.plots?.efficient_frontier ? (
                    <img
                      className="w-full rounded-lg border border-border/50"
                      alt="Efficient frontier plot"
                      src={`data:image/png;base64,${optimizeMutation.data.plots.efficient_frontier}`}
                    />
                  ) : (
                    <div className="text-sm text-muted-foreground">Plot not available for this run.</div>
                  )}
                </CardContent>
              </Card>
            </div>

            {optimizeMutation.data.results?.correlation && optimal && (
              <Card className="bg-gradient-card">
                <CardHeader>
                  <CardTitle>Correlation & diversification</CardTitle>
                  <CardDescription>Lower correlation across holdings typically indicates better diversification.</CardDescription>
                </CardHeader>
                <CardContent>
                  <CorrelationHeatmap corr={optimizeMutation.data.results.correlation} weights={optimal.weights} />
                </CardContent>
              </Card>
            )}

            {optimizeMutation.data.results?.risk_return && (
              <Card className="bg-gradient-card">
                <CardHeader>
                  <CardTitle>Asset risk / return</CardTitle>
                  <CardDescription>Annualized return, volatility, and Sharpe by ticker.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="text-muted-foreground">
                        <tr>
                          <th className="py-2">Ticker</th>
                          <th className="py-2">Return</th>
                          <th className="py-2">Volatility</th>
                          <th className="py-2">Sharpe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(optimizeMutation.data.results.risk_return).map(([ticker, row]) => (
                          <tr key={ticker} className="border-t border-border/50">
                            <td className="py-2 font-medium">{ticker}</td>
                            <td className="py-2">{fmt.format(row.Return)}</td>
                            <td className="py-2">{fmt.format(row.Deviation)}</td>
                            <td className="py-2">{fmt.format(row.Sharpe)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
