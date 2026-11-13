"""Pydantic request models (JSON field names are part of the public API)."""

from typing import Any

from pydantic import BaseModel


class RoomCreateRequest(BaseModel):
    title: str
    address: str = ""
    dealType: str = "월세"
    deposit: int = 1000
    monthlyRent: int = 80
    maintenanceFee: int = 10
    areaPyeong: float = 10.0
    roomStructure: str = "원룸/1.5룸"
    floor: str = "3층"
    direction: str = "남향"
    pros: str = ""
    cons: str = ""
    memo: str = ""
    checklist: dict[str, str] | None = None
    latitude: float | None = None
    longitude: float | None = None
    locationLabel: str | None = None
    sunHeadingOffsetDeg: float | None = None


class RoomUpdateRequest(BaseModel):
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
    rating: float | None = None
    pros: str | None = None
    cons: str | None = None
    memo: str | None = None
    checklist: dict[str, str] | None = None
    pins: list[dict[str, Any]] | None = None
    furnitures: list[dict[str, Any]] | None = None
    roomPlan: dict[str, Any] | None = None
    latitude: float | None = None
    longitude: float | None = None
    locationLabel: str | None = None
    sunHeadingOffsetDeg: float | None = None


class PinCreateRequest(BaseModel):
    label: str
    category: str = "info"
    position: list[float]
