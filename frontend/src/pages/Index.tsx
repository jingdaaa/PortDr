import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, BarChart3, TrendingUp, Shield, Target, PieChart } from "lucide-react";
import { Link } from "react-router-dom";

const Index = () => {
  const features = [
    {
      icon: <BarChart3 className="h-8 w-8 text-primary" />,
      title: "Return & risk summary",
      description:
        "Estimate annualised return and volatility from historical price data, with clear assumptions and inputs.",
    },
    {
      icon: <TrendingUp className="h-8 w-8 text-primary" />,
      title: "Monte Carlo Simulation",
      description:
        "Simulate thousands of random portfolios and select the allocation with the highest Sharpe ratio given your risk-free rate.",
    },
    {
      icon: <PieChart className="h-8 w-8 text-primary" />,
      title: "Weights & Efficient Frontier Plots",
      description:
        "Visualise the simulated efficient frontier and the resulting optimal weights with export-ready charts.",
    },
    {
      icon: <Shield className="h-8 w-8 text-primary" />,
      title: "Correlation & diversification",
      description:
        "Inspect correlations across tickers and get an at-a-glance read on how diversified the basket actually is.",
    },
    {
      icon: <Target className="h-8 w-8 text-primary" />,
      title: "Capital allocation view",
      description:
        "Compare the optimal risky portfolio against a risk-free alternative to understand the risk/return trade-off.",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-hero">
      {/* Hero */}
      <section className="relative px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="text-center animate-fade-in">
            <Badge variant="secondary" className="mb-4 px-4 py-2 text-sm font-medium">
              Portfolio analytics • Optimisation • Visualisation
            </Badge>

            <h1 className="mb-6 text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
              <span className="bg-gradient-primary bg-clip-text text-transparent">PortDr</span>
            </h1>

            <p className="mx-auto mb-8 max-w-3xl text-xl text-muted-foreground leading-relaxed">
              Here, we transform your portfolio into its best version
            </p>

            <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
              <Button asChild size="lg" className="group px-8 py-3 text-lg font-semibold">
                <Link to="/analyze">
                  Run analysis
                  <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Link>
              </Button>

              <Button
                variant="outline"
                size="lg"
                className="px-8 py-3 text-lg font-semibold"
                onClick={() => document.getElementById("method")?.scrollIntoView({ behavior: "smooth" })}
              >
                Methodology
              </Button>
            </div>

            <p className="mt-6 text-sm text-muted-foreground">
              Educational / research tool — not financial advice.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="text-center mb-12 animate-slide-up">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">What it does</h2>
            <p className="mx-auto max-w-3xl text-lg text-muted-foreground">
              A practical portfolio analysis tool that turns your desired stocks into risk/return metrics,
              correlation insight, and a max-Sharpe allocation via Monte Carlo simulation, with a single click.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {features.map((feature, index) => (
              <Card
                key={index}
                className="group bg-gradient-card border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 animate-scale-in"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <CardHeader className="pb-4">
                  <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    {feature.icon}
                  </div>
                  <CardTitle className="text-xl font-semibold">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base leading-relaxed">
                    {feature.description}
                  </CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Methodology */}
      <section id="method" className="px-4 py-16 sm:px-6 lg:px-8 bg-card/50">
        <div className="mx-auto max-w-5xl animate-slide-up">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl mb-4">
              Methodology
            </h2>
            <p className="mx-auto max-w-3xl text-lg text-muted-foreground">
              Designed to be Defensible and Transparent
            </p>
          </div>

          {/* Cards container */}
          <div className="relative grid md:grid-cols-3 rounded-xl overflow-hidden bg-gradient-card">

            {/* vertical separators (desktop only) */}
            <div className="pointer-events-none absolute inset-y-0 left-1/3 hidden w-px bg-white/10 md:block" />
            <div className="pointer-events-none absolute inset-y-0 left-2/3 hidden w-px bg-white/10 md:block" />

            {/* horizontal separators (mobile only) */}
            <div className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-white/10 md:hidden" />
            <div className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-white/10 md:hidden" />

            <Card className="border-none bg-transparent">
              <CardHeader>
                <CardTitle className="text-base">Data</CardTitle>
                <CardDescription>Historical prices</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground leading-relaxed">
                Uses adjusted close prices fetched per ticker. Real data is on its way…
              </CardContent>
            </Card>

            <Card className="border-none bg-transparent">
              <CardHeader>
                <CardTitle className="text-base">Model</CardTitle>
                <CardDescription>Monte Carlo simulation</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground leading-relaxed">
                Randomly samples portfolio weights, computes annualised return and volatility,
                and selects the max-Sharpe portfolio given a risk-free rate.
              </CardContent>
            </Card>

            <Card className="border-none bg-transparent">
              <CardHeader>
                <CardTitle className="text-base">Outputs</CardTitle>
                <CardDescription>Charts + portfolio allocation</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground leading-relaxed">
                Efficient frontier scatter, optimal weights breakdown, correlation insights,
                and allocation metrics ready for write-ups.
              </CardContent>
            </Card>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Disclaimer: PortDr is for education and experimentation only. Do not use it as the sole basis for
            investment decisions.
          </p>
        </div>
      </section>


      {/* Footer-ish CTA */}
      <section className="px-4 py-14 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl text-center animate-fade-in">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl mb-4">
            Clear inputs. Clear outputs. Clear assumptions.
          </h2>
          <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
            PortDr
          </p>
          <Button asChild size="lg" className="group px-8 py-3 text-lg font-semibold">
            <Link to="/analyze">
              Start an analysis
              <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
};

export default Index;
