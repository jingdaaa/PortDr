from flask import Blueprint

api_bp = Blueprint("api", __name__, url_prefix="/api")

# Import routes so they register on blueprint import
from . import routes  # noqa: E402,F401