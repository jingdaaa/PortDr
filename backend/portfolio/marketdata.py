from typing import Dict, Any
import pandas as pd
import yfinance as yf

class MarketDataError(ValueError):
    pass

def fetch_last_quote(ticker: str) -> Dict[str, Any]:
    if not isinstance(ticker, str) or not ticker.strip():
        raise MarketDataError("Provide a single ticker string.")
    t = ticker.strip().upper()

    # recent daily candles; auto-adjusted
    hist = yf.Ticker(t).history(period="10d", interval="1d", auto_adjust=True, actions=False)
    hist = hist[["Open", "Close"]].dropna()
    if hist.empty:
        raise MarketDataError(f"No recent price data for {t}.")

    hist.index = pd.to_datetime(hist.index)
    last = hist.iloc[-1]
    last_date = hist.index[-1].strftime("%Y-%m-%d")

    country = None
    try:
        info = yf.Ticker(t).get_info()
        country = (info or {}).get("country")
    except Exception:
        pass

    return {
        "ticker": t,
        "country": country,
        "last_date": last_date,
        "last_open": float(last["Open"]),
        "last_close": float(last["Close"]),
    }
