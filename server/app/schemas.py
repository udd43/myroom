"""Pydantic request/response schemas for rooms, pins, timeline evidence, share links, and sync."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ChecklistSchema(BaseModel):
    model_config = ConfigDict(extra="allow")

    sunlight: str = "normal"
    waterPressure: str = "normal"
    soundproof: str = "normal"
    mold: str = "normal"
    security: str = "normal"
    parking: str = "normal"


class RoomPinCreate(BaseModel):
    model_config = ConfigDict(extra="allow")

    label: str = Field(..., min_length=1, max_length=200)
    category: str = "info"
    position: list[float] = Field(..., min_length=3, max_length=3)
    note: str | None = None
    mediaUrl: str | None = None
    mediaType: Literal["image", "video", "audio"] | None = None
    noiseDb: float | None = Field(default=None, ge=0.0, le=140.0)
    stage: Literal["viewing", "move_in", "move_out", "defect"] | None = None
    createdAt: str | None = None


class TimelineEventCreate(BaseModel):
    model_config = ConfigDict(extra="allow")

    stage: Literal["viewing", "contract", "move_in", "living", "move_out"] = "viewing"
    title: str = Field(..., min_length=1, max_length=200)
    note: str | None = ""
    mediaUrl: str | None = None
    mediaType: Literal["image", "video", "audio"] | None = None
    noiseDb: float | None = Field(default=None, ge=0.0, le=140.0)
    pinIds: list[str] = Field(default_factory=list)
    createdAt: str | None = None


class RoomCreate(BaseModel):
    model_config = ConfigDict(extra="allow")

    title: str = Field(..., min_length=1, max_length=200)
    address: str = ""
    dealType: str = "월세"
    deposit: int = 0
    monthlyRent: int = 0
    maintenanceFee: int = 0
    areaPyeong: float = 0.0
    roomStructure: str = ""
    floor: str = ""
    direction: str = ""
    latitude: float | None = None
    longitude: float | None = None
    locationLabel: str | None = None
    sunHeadingOffsetDeg: float = 0.0
    pros: str = ""
    cons: str = ""
    memo: str = ""
    checklist: dict[str, Any] = Field(default_factory=ChecklistSchema().model_dump)
    bjdongMeta: dict[str, Any] | None = None
    neighborBuildings: list[dict[str, Any]] = Field(default_factory=list)
    propertyIntel: dict[str, Any] | None = None
    furnitures: list[dict[str, Any]] = Field(default_factory=list)
    pins: list[dict[str, Any]] = Field(default_factory=list)
    timeline: list[dict[str, Any]] = Field(default_factory=list)


class RoomUpdate(BaseModel):
    model_config = ConfigDict(extra="allow")

    title: str | None = None
    address: str | None = None
    dealType: str | None = None
    deposit: int | None = None
    monthlyRent: int | None = None
    maintenanceFee: int | None = None
    areaPyeong: float | None = None
    roomStructure: str | None = None
    floor: str | None = None
    direction: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    locationLabel: str | None = None
    sunHeadingOffsetDeg: float | None = None
    MoveInDate: str | None = None
    rating: float | None = None
    pros: str | None = None
    cons: str | None = None
    memo: str | None = None
    checklist: dict[str, Any] | None = None
    pins: list[dict[str, Any]] | None = None
    furnitures: list[dict[str, Any]] | None = None
    roomPlan: dict[str, Any] | None = None
    bjdongMeta: dict[str, Any] | None = None
    neighborBuildings: list[dict[str, Any]] | None = None
    propertyIntel: dict[str, Any] | None = None
    timeline: list[dict[str, Any]] | None = None


class RoomSyncRequest(BaseModel):
    rooms: list[dict[str, Any]] = Field(default_factory=list)


class PresignUploadRequest(BaseModel):
    roomId: str = Field(..., min_length=1)
    filename: str = Field(..., min_length=1)
    contentType: str = "application/octet-stream"
    kind: Literal["splat", "spz", "model", "usdz", "video", "media"] = "media"
