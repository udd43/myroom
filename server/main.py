"""ASGI entrypoint: `uvicorn main:app --app-dir server`."""

from app.application import create_app

app = create_app()
