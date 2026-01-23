"""
portfolio/optimizer.py — yfinance version with debug logs
Fetch data from yfinance and prepare return/risk/correlation matrices.
"""

from typing import Iterable, List
import re
import io
import base64
import traceback
import numpy as np
import pandas as pd
import matplotlib
matplotlib.use("Agg")    # headless backend for servers
import matplotlib.pyplot as plt
import yfinance as yf
import logging

matplotlib.use("Agg")    # headless backend for servers

# --------------- Logging setup ---------------
logger = logging.getLogger("portfolio.optimizer")
# default: INFO (caller can adjust)
if not logger.handlers:
    handler = logging.StreamHandler()
    fmt = logging.Formatter("[%(levelname)s] %(message)s")
    handler.setFormatter(fmt)
    logger.addHandler(handler)
logger.setLevel(logging.INFO)

def _dbg(enabled: bool, msg: str):
    if enabled:
        logger.info(msg)

# --------------- Validation ---------------
_TICKER_RE = re.compile(r"^[A-Za-z.\-]+$")

class InputError(ValueError):
    pass

def _normalize_tickers(tickers: Iterable[str], *, verbose: bool=False) -> List[str]:
    _dbg(verbose, "STEP 0.1: Normalizing tickers…")
    if tickers is None:
        raise InputError("`tickers` cannot be None.")
    items = list(tickers)
    cleaned: List[str] = []
    seen = set()
    for t in items:
        if not isinstance(t, str):
            raise InputError("All tickers must be strings.")
        tt = t.strip().upper()
        if not tt:
            continue
        if tt not in seen:
            cleaned.append(tt)
            seen.add(tt)
    _dbg(verbose, f" → Normalized tickers: {cleaned}")
    return cleaned

def _validate_tickers(tickers: List[str], *, verbose: bool=False) -> None:
    _dbg(verbose, "STEP 0.2: Validating tickers…")
    if len(tickers) == 0:
        raise InputError("Provide at least one ticker.")
    if len(tickers) > 50:
        raise InputError("Too many tickers (max 50).")
    bad = [t for t in tickers if not _TICKER_RE.match(t)]
    if bad:
        raise InputError(f"Invalid ticker symbols: {', '.join(bad)}")
    _dbg(verbose, " → Validation OK")

# --------------- Fetch prices (yfinance) ---------------
def _fetch_yfinance_data(
    assetlist: List[str],
    *,
    period: str = "10y",
    interval: str = "1mo",
    verbose: bool = False
) -> pd.DataFrame:
    """
    Returns a DataFrame indexed by month with one column per ticker.
    Prices are adjusted via auto_adjust=True.
    """
    _dbg(verbose, f"STEP 1: Fetching prices via yfinance (period={period}, interval={interval})…")
    all_prices = pd.DataFrame()
    failed: List[str] = []

    for i, ticker in enumerate(assetlist, start=1):
        _dbg(verbose, f"  1.{i}: Fetching {ticker} …")
        try:
            hist = yf.Ticker(ticker).history(
                period=period, interval=interval, auto_adjust=True, actions=False
            )
            if hist.empty or "Close" not in hist.columns:
                _dbg(verbose, f"    ⚠ {ticker}: empty or no 'Close' column")
                failed.append(ticker)
                continue

            ser = hist["Close"].rename(ticker)
            all_prices = pd.concat([all_prices, ser], axis=1)

            _dbg(verbose, f"    ✓ {ticker}: rows={len(ser)}, start={ser.index.min().date()}, "
                          f"end={ser.index.max().date()}, first={ser.iloc[0]:.4f}, last={ser.iloc[-1]:.4f}")
        except Exception as e:
            failed.append(ticker)
            _dbg(verbose, f"    ✗ {ticker} failed: {e}")
            _dbg(verbose, traceback.format_exc())

    if all_prices.empty:
        raise RuntimeError(
            "STEP 1 FAILED: No price data fetched. "
            f"Failed tickers: {', '.join(failed) if failed else '(unknown)'}"
        )

    all_prices.index = pd.to_datetime(all_prices.index)
    all_prices = all_prices.sort_index().dropna(axis=1, how="all")

    _dbg(verbose, f"STEP 1 DONE: prices shape={all_prices.shape}")
    if verbose:
        _dbg(verbose, f"Prices preview:\n{all_prices.head(3)}")

    if failed:
        _dbg(verbose, f"[yfinance] Skipped tickers (no data): {', '.join(failed)}")

    return all_prices

# --------------- Simulation & plotting ---------------
def _simulate_portfolios(returns: pd.DataFrame, risk_free: float, simulations: int = 5000, *, verbose: bool=False):
    _dbg(verbose, "STEP 3: Monte Carlo simulation…")
    mean_returns = returns.mean() * 12
    cov_matrix = returns.cov() * 12
    num_assets = len(mean_returns)

    _dbg(verbose, f"  assets={num_assets}, sims={simulations}")
    if verbose:
        _dbg(verbose, f"  mean_returns (annualized):\n{mean_returns.round(4)}")
        _dbg(verbose, f"  cov_matrix (annualized) shape={cov_matrix.shape}")

    results = {"returns": [], "volatility": [], "sharpe": [], "weights": []}

    for s in range(simulations):
        weights = np.random.random(num_assets)
        weights /= np.sum(weights)

        port_return = float(np.dot(weights, mean_returns))
        port_vol = float(np.sqrt(np.dot(weights.T, np.dot(cov_matrix, weights))))
        sharpe = (port_return - risk_free) / port_vol if port_vol > 0 else 0.0

        results["returns"].append(port_return)
        results["volatility"].append(port_vol)
        results["sharpe"].append(sharpe)
        results["weights"].append(weights)

        if verbose and (s+1) % max(1, simulations // 5) == 0:
            _dbg(verbose, f"  … progress {s+1}/{simulations}")

    _dbg(verbose, "STEP 3 DONE")
    return results, mean_returns, cov_matrix

def _plot_efficient_frontier(results, *, verbose: bool=False):
    _dbg(verbose, "STEP 4.1: Plotting efficient frontier…")
    fig, ax = plt.subplots(figsize=(6, 4))
    sc = ax.scatter(results["volatility"], results["returns"],
                    c=results["sharpe"], cmap="viridis", marker="o", s=10, alpha=0.5)
    plt.colorbar(sc, label="Sharpe Ratio", ax=ax)
    ax.set_title("Efficient Frontier")
    ax.set_xlabel("Volatility")
    ax.set_ylabel("Expected Return")

    buf = io.BytesIO()
    plt.tight_layout()
    plt.savefig(buf, format="png")
    plt.close(fig)
    _dbg(verbose, "STEP 4.1 DONE")
    return base64.b64encode(buf.getvalue()).decode("utf-8")

def _plot_weights_pie(best_weights, tickers, *, verbose: bool=False):
    _dbg(verbose, "STEP 4.2: Plotting weights pie…")
    fig, ax = plt.subplots(figsize=(5, 5))
    ax.pie(best_weights, labels=tickers, autopct="%1.1f%%", startangle=90)
    ax.set_title("Optimal Portfolio Weights")

    buf = io.BytesIO()
    plt.tight_layout()
    plt.savefig(buf, format="png")
    plt.close(fig)
    _dbg(verbose, "STEP 4.2 DONE")
    return base64.b64encode(buf.getvalue()).decode("utf-8")

def _compute_drawdown_series(r: pd.Series) -> pd.Series:
    """Drawdown series from periodic returns."""
    wealth = (1 + r.fillna(0)).cumprod()
    peak = wealth.cummax()
    dd = wealth / peak - 1.0
    return dd

def compute_drawdown_stats(
    portfolio_returns: pd.Series,
    risk_free_annual: float = 0.02,
    periods_per_year: int = 12,
) -> dict:
    """
    Returns:
      max_drawdown (negative number)
      worst_month_return
      worst_month_date
      worst_year_return
      worst_year
      downside_deviation_annual
      sortino
    Assumes returns are periodic (monthly if periods_per_year=12).
    """
    r = portfolio_returns.dropna()
    if r.empty:
        return {
            "max_drawdown": None,
            "worst_month_return": None,
            "worst_month_date": None,
            "worst_year_return": None,
            "worst_year": None,
            "downside_deviation_annual": None,
            "sortino": None,
        }

    # Max drawdown
    dd = _compute_drawdown_series(r)
    max_dd = float(dd.min())  # negative

    # Worst month
    worst_month_return = float(r.min())
    worst_month_date = r.idxmin()
    worst_month_date_str = worst_month_date.strftime("%Y-%m-%d") if hasattr(worst_month_date, "strftime") else str(worst_month_date)

    # Worst year (compound within each year)
    if isinstance(r.index, pd.DatetimeIndex):
        yearly = (1 + r).groupby(r.index.year).prod() - 1
        worst_year_return = float(yearly.min())
        worst_year = int(yearly.idxmin())
    else:
        worst_year_return = None
        worst_year = None

    # Annualised return (geometric)
    wealth = (1 + r).cumprod()
    years = len(r) / periods_per_year
    if years > 0:
        annual_return = float(wealth.iloc[-1] ** (1 / years) - 1)
    else:
        annual_return = float((1 + r.mean()) ** periods_per_year - 1)

    # Downside deviation (annualised)
    downside = r[r < 0]
    if len(downside) > 1:
        downside_dev_period = float(downside.std(ddof=0))
        downside_dev_annual = downside_dev_period * np.sqrt(periods_per_year)
    else:
        downside_dev_annual = 0.0

    # Sortino ratio
    if downside_dev_annual > 0:
        sortino = (annual_return - float(risk_free_annual)) / downside_dev_annual
        sortino = float(sortino)
    else:
        sortino = None

    return {
        "max_drawdown": max_dd,
        "worst_month_return": worst_month_return,
        "worst_month_date": worst_month_date_str,
        "worst_year_return": worst_year_return,
        "worst_year": worst_year,
        "downside_deviation_annual": float(downside_dev_annual),
        "sortino": sortino,
        "annual_return_geom": annual_return,
    }


# --------------- Public API ---------------
def optimize_portfolio(
    tickers: Iterable[str],
    *,
    risk_free: float = 0.02,
    simulations: int = 5000,
    verbose: bool = False
):
    try:
        symbols = _normalize_tickers(tickers, verbose=verbose)
        _validate_tickers(symbols, verbose=verbose)

        # 1) Fetch prices
        prices = _fetch_yfinance_data(symbols, period="10y", interval="1mo", verbose=verbose)

        # 2) Returns & statistics
        _dbg(verbose, "STEP 2: Computing returns and stats…")
        returns = prices.pct_change().dropna(how="all")
        _dbg(verbose, f"  returns shape={returns.shape}")
        if verbose:
            _dbg(verbose, f"  returns preview:\n{returns.head(3)}")

        monthly_mean = returns.mean()
        monthly_std = returns.std(ddof=0)
        mean_return = monthly_mean * 12
        std_return = monthly_std * np.sqrt(12)

        risk_return_df = pd.DataFrame(
            [mean_return, std_return], index=["Return", "Deviation"]
        ).T
        risk_return_df["Sharpe"] = (risk_return_df["Return"] - risk_free) / risk_return_df["Deviation"]

        correlation_df = returns.corr()

        _dbg(verbose, f"  risk_return_df shape={risk_return_df.shape}")
        _dbg(verbose, f"  correlation_df shape={correlation_df.shape}")
        if verbose:
            _dbg(verbose, f"  risk_return_df preview:\n{risk_return_df.round(4).head(5)}")
            _dbg(verbose, f"  correlation_df preview:\n{correlation_df.round(3).head(5)}")
        _dbg(verbose, "STEP 2 DONE")

        # 3) Monte Carlo
        results, mean_returns, cov_matrix = _simulate_portfolios(returns, risk_free, simulations, verbose=verbose)

        # best Sharpe
        max_idx = int(np.argmax(results["sharpe"]))
        best_weights = results["weights"][max_idx]
        _dbg(verbose, f"STEP 3.1: Best Sharpe at index {max_idx} "
                      f"(return={results['returns'][max_idx]:.4f}, "
                      f"vol={results['volatility'][max_idx]:.4f}, "
                      f"sharpe={results['sharpe'][max_idx]:.4f})")
        
        # 3.2) Drawdowns & downside risk (based on monthly portfolio returns)
        # returns is monthly returns DataFrame (index=dates, cols=tickers)
        portfolio_returns = returns.dot(best_weights)  # monthly portfolio returns series
        drawdown_stats = compute_drawdown_stats(
            portfolio_returns=portfolio_returns,
            risk_free_annual=risk_free,
            periods_per_year=12,
        )
        _dbg(verbose, f"STEP 3.2: Max drawdown={drawdown_stats.get('max_drawdown')}, "
            f"Sortino={drawdown_stats.get('sortino')}")
        
        # 4) Plots
        plots = {
            "efficient_frontier": _plot_efficient_frontier(results, verbose=verbose),
            "pie_chart": _plot_weights_pie(best_weights, symbols, verbose=verbose),
        }

        # 5) Package results
        results_dict = {
            "risk_return": risk_return_df.to_dict(orient="index"),
            "correlation": correlation_df.to_dict(),
            "optimal_portfolio": {
                "expected_return": float(results["returns"][max_idx]),
                "volatility": float(results["volatility"][max_idx]),
                "sharpe": float(results["sharpe"][max_idx]),
                "weights": {symbols[i]: float(best_weights[i]) for i in range(len(symbols))},
                "downside": drawdown_stats,  # ✅ ADD THIS
            }
        }
        _dbg(verbose, "ALL STEPS DONE ✅")
        return results_dict, plots

    except Exception as e:
        logger.error("❌ optimize_portfolio FAILED")
        logger.error(str(e))
        logger.error(traceback.format_exc())
        raise

# --------------- Self-test ---------------
if __name__ == "__main__":
    logger.setLevel(logging.INFO)  # or DEBUG for even more noise
    tickers = ["AAPL", "MSFT", "TSLA"]
    res, plots = optimize_portfolio(tickers, simulations=2000, verbose=True)
    print("Optimal Portfolio:")
    print(res["optimal_portfolio"])
    print("Plots generated:", list(plots.keys()))


