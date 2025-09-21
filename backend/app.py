import logging
from flask import Flask, jsonify
from flask_cors import CORS
from .api import api_bp

def create_app():
    app = Flask(__name__)

    # CORS: loosen as needed (e.g., set specific origin)
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Logging
    handler = logging.StreamHandler()
    handler.setLevel(logging.INFO)
    app.logger.addHandler(handler)
    app.logger.setLevel(logging.INFO)

    # Blueprints
    app.register_blueprint(api_bp)

    @app.get("/health")
    def health():
        return jsonify({"status": "ok"}), 200

    return app

if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=5001, debug=True)
