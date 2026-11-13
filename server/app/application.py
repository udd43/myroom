"""FastAPI application factory."""

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import config
from .routers import health, rooms, uploads
from .samples import build_sample_rooms
from .store import room_store


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    config.ensure_dirs()
    room_store.seed_if_empty(build_sample_rooms)
    yield


def create_app() -> FastAPI:
    config.ensure_dirs()  # the /storage mount requires an existing directory

    app = FastAPI(title=config.APP_TITLE, version=config.APP_VERSION, lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.mount(
        config.STORAGE_URL_PREFIX,
        StaticFiles(directory=str(config.STORAGE_DIR)),
        name="storage",
    )

    app.include_router(health.router)
    app.include_router(rooms.router)
    app.include_router(uploads.router)
    return app
