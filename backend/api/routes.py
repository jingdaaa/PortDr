from flask import request, jsonify, current_app
from . import api_bp
from backend.portfolio.optimizer import optimize_portfolio, InputError

@api_bp.route("/optimize", methods=["POST"])
def optimize():
    data = request.get_json(silent=True) or {}
    tickers = data.get("tickers", [])
    risk_free = float(data.get("risk_free", 0.02))
    simulations = int(data.get("simulations", 5000))
    verbose = bool(data.get("verbose", False))

    try:
        results, plots = optimize_portfolio(
            tickers, risk_free=risk_free, simulations=simulations, verbose=verbose
        )
        payload = {
            "ok": True,
            "results": results,   # risk_return, correlation, optimal_portfolio
            "plots": plots,       # base64 png strings: efficient_frontier, pie_chart
            "meta": {
                "tickers": tickers,
                "risk_free": risk_free,
                "simulations": simulations
            }
        }
        return jsonify(payload), 200

    except InputError as e:
        return jsonify({"ok": False, "type": "input_error", "error": str(e)}), 400

    except Exception as e:
        current_app.logger.exception("optimize_portfolio failed")
        return jsonify({"ok": False, "type": "server_error", "error": "Internal server error"}), 500

from backend.portfolio.marketdata import fetch_last_quote, MarketDataError

@api_bp.route("/ticker/last", methods=["POST"])
def ticker_last():
    data = request.get_json(silent=True) or {}
    ticker = data.get("ticker", "")
    try:
        payload = fetch_last_quote(ticker)
        return jsonify({"ok": True, **payload}), 200
    except MarketDataError as e:
        return jsonify({"ok": False, "type": "input_error", "error": str(e)}), 400
    except Exception:
        current_app.logger.exception("ticker_last failed")
        return jsonify({"ok": False, "type": "server_error", "error": "Internal server error"}), 500
