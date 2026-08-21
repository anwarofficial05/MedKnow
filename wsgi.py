"""
WSGI entrypoint for MedKnow Healthcare Knowledge Management Portal.
Used by production WSGI servers (Gunicorn, uWSGI, Waitress) on hosting platforms like Render, Koyeb, Railway, and Fly.io.
"""
import os
from app import app, db, seed_initial_categories

with app.app_context():
    db.create_all()
    seed_initial_categories()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
