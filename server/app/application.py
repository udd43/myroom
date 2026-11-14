"""FastAPI application factory."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import config
from .routers import auth, health, integrations, rooms, uploads
from .samples import build_sample_rooms
from .store import room_store


@asynccontextmanager
async def lifespan(_app: FastAPI):
    config.ensure_dirs()
    room_store.seed_if_empty(build_sample_rooms)
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="MyRoom 3D Spatial Server", version="2.0.0", lifespan=lifespan)

    cors_kwargs: dict[str, object] = {
        "allow_origins": config.CORS_ORIGINS,
        "allow_credentials": True,
        "allow_methods": ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["*"],
    }
    if config.CORS_ORIGIN_REGEX:
        cors_kwargs["allow_origin_regex"] = config.CORS_ORIGIN_REGEX

    app.add_middleware(CORSMiddleware, **cors_kwargs)  # type: ignore[arg-type]

    config.ensure_dirs()
    app.mount(config.STORAGE_URL_PREFIX, StaticFiles(directory=str(config.STORAGE_DIR)), name="storage")

    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(integrations.router)
    app.include_router(rooms.router)
    app.include_router(uploads.router)

    return app
