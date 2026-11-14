"""External Korean property/location/building/transit API proxy routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from .. import config
from ..security import require_auth
from ..services.korea_apis import (
    fetch_building_registry,
    fetch_nearby_poi,
    fetch_rent_market,
    fetch_transit_commute,
    fetch_vworld_nearby_buildings,
    geocode_kakao,
    search_juso,
)

router = APIRouter(prefix="/api/integrations", tags=["integrations"])


@router.get("/status")
async def get_integration_status():
    """Return configured capability status (booleans only, never raw API keys)."""
    return config.integration_status()


@router.get("/address/search")
async def search_address(q: str = Query(..., min_length=2), _auth: None = Depends(require_auth)):
    """Search Korean road/jibun addresses via juso.go.kr (plus optional Kakao geocode)."""
    juso_res = search_juso(q)
    kakao_res = geocode_kakao(q) if (not juso_res.get("items") or len(juso_res.get("items", [])) == 0) else None
    return {"juso": juso_res, "kakao": kakao_res}


@router.get("/geocode")
async def geocode_address(q: str = Query(..., min_length=2), _auth: None = Depends(require_auth)):
    return geocode_kakao(q)


@router.get("/building-registry")
async def get_building_registry(
    sigunguCd: str = Query(..., min_length=5, max_length=5),
    bjdongCd: str = Query(..., min_length=5, max_length=5),
    bun: str = Query(..., min_length=1, max_length=4),
    ji: str = Query("0000", max_length=4),
    platGbCd: str = Query("0", max_length=1),
    _auth: None = Depends(require_auth),
):
    return fetch_building_registry(sigunguCd, bjdongCd, bun, ji, platGbCd)


@router.get("/rent-market")
async def get_rent_market(
    lawdCd: str = Query(..., min_length=5, max_length=10),
    deposit: int = Query(0, ge=0),
    monthlyRent: int = Query(0, ge=0),
    areaSqm: float = Query(0.0, ge=0.0),
    umd: str = Query(""),
    ratePct: float = Query(4.5, ge=0.0, le=20.0),
    _auth: None = Depends(require_auth),
):
    return fetch_rent_market(
        lawd_cd=lawdCd,
        target_deposit=deposit,
        target_monthly=monthlyRent,
        target_area_sqm=areaSqm,
        umd_hint=umd,
        conversion_rate_pct=ratePct,
    )


@router.get("/nearby")
async def get_nearby_pois(
    lat: float = Query(...),
    lng: float = Query(...),
    _auth: None = Depends(require_auth),
):
    return fetch_nearby_poi(lat, lng)


@router.get("/commute")
async def get_commute_time(
    originLat: float = Query(...),
    originLng: float = Query(...),
    destLat: float = Query(...),
    destLng: float = Query(...),
    destLabel: str = Query("목적지"),
    _auth: None = Depends(require_auth),
):
    return fetch_transit_commute(originLat, originLng, destLat, destLng, destLabel)


@router.get("/vworld/buildings")
async def get_vworld_buildings(
    lat: float = Query(...),
    lng: float = Query(...),
    radiusM: float = Query(95.0, ge=25.0, le=200.0),
    _auth: None = Depends(require_auth),
):
    return fetch_vworld_nearby_buildings(lat, lng, radius_m=radiusM)

