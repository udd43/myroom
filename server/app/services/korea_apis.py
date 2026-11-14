"""External Korean real-estate, address, transit, and 3D building height API clients."""

from __future__ import annotations

import datetime as dt
import json
import math
import statistics
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any

from .. import config


def _http_get_raw(url: str, headers: dict[str, str] | None = None, timeout: float = 10.0) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "MyRoom/1.0", **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _encode_data_go_kr_key(raw_key: str) -> str:
    """Normalize either Decoded or URL-Encoded 공공데이터포털 serviceKey without double-encoding."""
    decoded = urllib.parse.unquote(raw_key.strip())
    return urllib.parse.quote(decoded, safe="")


def _xml_items_to_dicts(xml_text: str) -> tuple[str | None, list[dict[str, Any]]]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return ("INVALID_RESPONSE", [])
    err_msg = root.findtext(".//returnAuthMsg") or root.findtext(".//errMsg") or root.findtext(".//resultMsg")
    code = root.findtext(".//resultCode") or root.findtext(".//returnReasonCode")
    items: list[dict[str, Any]] = []
    for item_el in root.findall(".//item"):
        row: dict[str, Any] = {}
        for child in item_el:
            row[child.tag] = (child.text or "").strip()
        if row:
            items.append(row)
    if items:
        return (None, items)
    if code and code not in ("00", "000", "0"):
        return (f"{code}: {err_msg or '공공데이터 API 오류'}", [])
    return (None, [])


def _parse_data_go_kr_response(raw_text: str) -> tuple[str | None, list[dict[str, Any]]]:
    stripped = raw_text.lstrip()
    if stripped.startswith("{") or stripped.startswith("["):
        try:
            data = json.loads(stripped)
            resp = data.get("response", data)
            header = resp.get("header", {})
            result_code = str(header.get("resultCode", "00"))
            body = resp.get("body", {})
            raw_items = body.get("items", {}) if isinstance(body, dict) else {}
            item = raw_items.get("item") if isinstance(raw_items, dict) else raw_items
            if isinstance(item, dict):
                return (None, [item])
            if isinstance(item, list):
                return (None, item)
            if result_code not in ("00", "000", "0", "None", ""):
                return (f"{result_code}: {header.get('resultMsg', 'API 오류')}", [])
            return (None, [])
        except json.JSONDecodeError:
            pass
    return _xml_items_to_dicts(raw_text)


def _to_int(val: Any) -> int:
    if val is None:
        return 0
    s = str(val).replace(",", "").strip()
    if not s:
        return 0
    try:
        return int(float(s))
    except ValueError:
        return 0


def _to_float(val: Any) -> float:
    if val is None:
        return 0.0
    s = str(val).replace(",", "").strip()
    if not s:
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    )
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


# 1. 행정안전부 도로명주소 검색 API (juso.go.kr)
def search_juso(keyword: str, limit: int = 8) -> dict[str, Any]:
    if not config.JUSO_API_KEY:
        return {
            "configured": False,
            "items": [],
            "message": "행안부 도로명주소 API 키(JUSO_API_KEY)가 설정되지 않았습니다.",
        }
    query = urllib.parse.urlencode(
        {
            "confmKey": config.JUSO_API_KEY,
            "currentPage": 1,
            "countPerPage": max(1, min(limit, 20)),
            "keyword": keyword.strip(),
            "resultType": "json",
        }
    )
    url = f"https://business.juso.go.kr/addrlink/addrLinkApi.do?{query}"
    try:
        payload = json.loads(_http_get_raw(url, timeout=8.0))
        results = payload.get("results", {})
        common = results.get("common", {})
        if str(common.get("errorCode", "0")) != "0":
            return {
                "configured": True,
                "items": [],
                "error": common.get("errorMessage") or "주소 검색 실패",
            }
        juso_list = results.get("juso") or []
        items = []
        for row in juso_list:
            adm_cd = str(row.get("admCd", "")).strip()
            bun_raw = str(row.get("lnbrMnnm", "")).strip()
            ji_raw = str(row.get("lnbrSlno", "")).strip()
            mt_yn = str(row.get("mtYn", "0")).strip()
            items.append(
                {
                    "roadAddr": row.get("roadAddr", ""),
                    "jibunAddr": row.get("jibunAddr", ""),
                    "zipNo": row.get("zipNo", ""),
                    "bdNm": row.get("bdNm", ""),
                    "siNm": row.get("siNm", ""),
                    "sggNm": row.get("sggNm", ""),
                    "emdNm": row.get("emdNm", ""),
                    "admCd": adm_cd,
                    "sigunguCd": adm_cd[:5] if len(adm_cd) >= 10 else "",
                    "bjdongCd": adm_cd[5:10] if len(adm_cd) >= 10 else "",
                    "platGbCd": "1" if mt_yn == "1" else "0",
                    "bun": bun_raw.zfill(4) if bun_raw.isdigit() else "",
                    "ji": ji_raw.zfill(4) if ji_raw.isdigit() else "0000",
                }
            )
        return {"configured": True, "items": items}
    except Exception as exc:
        return {"configured": True, "items": [], "error": f"도로명주소 API 요청 실패: {exc}"}


# 2. 카카오 로컬 (좌표 변환 + 지하철역/편의점 등 주변 POI)
def geocode_kakao(query: str) -> dict[str, Any]:
    if not config.KAKAO_REST_API_KEY:
        return {"configured": False}
    headers = {"Authorization": f"KakaoAK {config.KAKAO_REST_API_KEY}"}
    q = urllib.parse.urlencode({"query": query.strip(), "size": 5})
    try:
        data = json.loads(_http_get_raw(f"https://dapi.kakao.com/v2/local/search/address.json?{q}", headers=headers))
        docs = data.get("documents") or []
        if not docs:
            kw_q = urllib.parse.urlencode({"query": query.strip(), "size": 5})
            kw_data = json.loads(
                _http_get_raw(f"https://dapi.kakao.com/v2/local/search/keyword.json?{kw_q}", headers=headers)
            )
            docs = kw_data.get("documents") or []
        if not docs:
            return {"configured": True, "found": False}
        top = docs[0]
        addr = top.get("address") or {}
        road_addr = top.get("road_address") or {}
        b_code = str(addr.get("b_code", "")).strip()
        main_no = str(addr.get("main_address_no", "")).strip()
        sub_no = str(addr.get("sub_address_no", "")).strip()
        return {
            "configured": True,
            "found": True,
            "latitude": float(top["y"]),
            "longitude": float(top["x"]),
            "addressName": road_addr.get("address_name") or top.get("address_name") or top.get("place_name") or query,
            "jibunAddress": addr.get("address_name") or "",
            "buildingName": road_addr.get("building_name") or top.get("place_name") or "",
            "regionLabel": " ".join(
                p for p in [addr.get("region_1depth_name"), addr.get("region_2depth_name"), addr.get("region_3depth_name")] if p
            ),
            "sigunguCd": b_code[:5] if len(b_code) == 10 else "",
            "bjdongCd": b_code[5:10] if len(b_code) == 10 else "",
            "bun": main_no.zfill(4) if main_no.isdigit() else "",
            "ji": sub_no.zfill(4) if sub_no.isdigit() else "0000",
            "candidates": [
                {
                    "name": d.get("place_name") or d.get("road_address_name") or d.get("address_name"),
                    "address": d.get("road_address_name") or d.get("address_name") or "",
                    "latitude": float(d["y"]),
                    "longitude": float(d["x"]),
                }
                for d in docs[:5]
            ],
        }
    except Exception as exc:
        return {"configured": True, "found": False, "error": str(exc)}


def fetch_nearby_poi(latitude: float, longitude: float) -> dict[str, Any]:
    if not config.KAKAO_REST_API_KEY:
        return {
            "configured": False,
            "subways": [],
            "convenienceStores": [],
            "marts": [],
            "message": "KAKAO_REST_API_KEY를 설정하면 역세권·편의점·마트 도보 거리가 자동 조회됩니다.",
        }
    headers = {"Authorization": f"KakaoAK {config.KAKAO_REST_API_KEY}"}

    def _query_cat(code: str, radius: int, limit: int = 3) -> list[dict[str, Any]]:
        qs = urllib.parse.urlencode(
            {
                "category_group_code": code,
                "x": f"{longitude:.7f}",
                "y": f"{latitude:.7f}",
                "radius": radius,
                "sort": "distance",
                "size": limit,
            }
        )
        try:
            res = json.loads(_http_get_raw(f"https://dapi.kakao.com/v2/local/search/category.json?{qs}", headers=headers))
            out = []
            for doc in res.get("documents") or []:
                dist_m = _to_int(doc.get("distance"))
                out.append(
                    {
                        "name": doc.get("place_name", ""),
                        "categoryDetail": doc.get("category_name", ""),
                        "distanceM": dist_m,
                        "walkMinutes": max(1, round(dist_m / 67)) if dist_m > 0 else 1,
                        "latitude": float(doc.get("y", 0) or 0),
                        "longitude": float(doc.get("x", 0) or 0),
                    }
                )
            return out
        except Exception:
            return []

    return {
        "configured": True,
        "subways": _query_cat("SW8", 1800, 4),
        "convenienceStores": _query_cat("CS2", 600, 4),
        "marts": _query_cat("MT1", 2000, 2),
    }


# 3. 대중교통 출퇴근 소요시간 (ODsay 개인 무료 / Kakao Mobility 제휴 / Fallback 추정)
def fetch_transit_commute(
    origin_lat: float,
    origin_lng: float,
    dest_lat: float,
    dest_lng: float,
    dest_label: str = "목적지",
) -> dict[str, Any]:
    straight_km = round(_haversine_km(origin_lat, origin_lng, dest_lat, dest_lng), 2)

    if config.ODSAY_API_KEY:
        try:
            qs = urllib.parse.urlencode(
                {
                    "SX": f"{origin_lng:.6f}",
                    "SY": f"{origin_lat:.6f}",
                    "EX": f"{dest_lng:.6f}",
                    "EY": f"{dest_lat:.6f}",
                    "apiKey": config.ODSAY_API_KEY,
                }
            )
            data = json.loads(_http_get_raw(f"https://api.odsay.com/v1/api/searchPubTransPathT?{qs}", timeout=9.0))
            result = data.get("result") or {}
            paths = result.get("path") or []
            if paths:
                best = min(paths, key=lambda p: _to_int((p.get("info") or {}).get("totalTime")) or 999)
                info = best.get("info") or {}
                sub_paths = best.get("subPath") or []
                legs = []
                for sp in sub_paths:
                    t = sp.get("trafficType")
                    if t == 1 and sp.get("lane"):
                        legs.append(sp["lane"][0].get("name") or "지하철")
                    elif t == 2 and sp.get("lane"):
                        legs.append(f"버스 {sp['lane'][0].get('busNo', '')}".strip())
                return {
                    "configured": True,
                    "provider": "odsay",
                    "isEstimate": False,
                    "destLabel": dest_label,
                    "straightKm": straight_km,
                    "totalMinutes": _to_int(info.get("totalTime")),
                    "walkMinutes": max(0, _to_int(info.get("totalWalk")) // 67),
                    "transfers": max(0, _to_int(info.get("busTransitCount")) + _to_int(info.get("subwayTransitCount")) - 1),
                    "fareWon": _to_int(info.get("payment")),
                    "routeSummary": " → ".join(legs) if legs else "대중교통 추천 경로",
                }
        except Exception:
            pass

    if config.KAKAO_REST_API_KEY and config.KAKAO_MOBILITY_TRANSIT_ENABLED:
        try:
            headers = {"Authorization": f"KakaoAK {config.KAKAO_REST_API_KEY}"}
            qs = urllib.parse.urlencode(
                {
                    "origin": f"{origin_lng:.6f},{origin_lat:.6f}",
                    "destination": f"{dest_lng:.6f},{dest_lat:.6f}",
                }
            )
            data = json.loads(
                _http_get_raw(
                    f"https://apis-navi.kakaomobility.com/affiliate/publictransit/v1/multimodal/directions?{qs}",
                    headers=headers,
                    timeout=9.0,
                )
            )
            routes = data.get("routes") or []
            if routes:
                summary = routes[0].get("summary") or {}
                sec = _to_int(summary.get("duration"))
                if sec > 0:
                    return {
                        "configured": True,
                        "provider": "kakao_mobility",
                        "isEstimate": False,
                        "destLabel": dest_label,
                        "straightKm": straight_km,
                        "totalMinutes": max(1, round(sec / 60)),
                        "fareWon": _to_int((summary.get("fare") or {}).get("regular")),
                        "routeSummary": "카카오모빌리티 대중교통 최적 경로",
                    }
        except Exception:
            pass

    # Fallback: realistic Seoul urban transit time estimation
    est_min = max(8, round(straight_km * 3.1 + 8)) if straight_km > 1.2 else max(5, round(straight_km * 14))
    return {
        "configured": False,
        "provider": "haversine_estimate",
        "isEstimate": True,
        "destLabel": dest_label,
        "straightKm": straight_km,
        "totalMinutes": est_min,
        "routeSummary": f"직선 {straight_km}km 기반 추정 (ODSAY_API_KEY 등록 시 실제 환승시간 조회)",
    }


# 4. 건축물대장 표제부 조회 (건축HUB)
def fetch_building_registry(sigungu_cd: str, bjdong_cd: str, bun: str, ji: str = "0000", plat_gb_cd: str = "0") -> dict[str, Any]:
    if not config.DATA_GO_KR_API_KEY:
        return {
            "configured": False,
            "message": "DATA_GO_KR_API_KEY가 설정되지 않아 건축물대장을 조회할 수 없습니다.",
        }
    key_q = _encode_data_go_kr_key(config.DATA_GO_KR_API_KEY)
    params = urllib.parse.urlencode(
        {
            "sigunguCd": sigungu_cd.zfill(5),
            "bjdongCd": bjdong_cd.zfill(5),
            "platGbCd": plat_gb_cd or "0",
            "bun": bun.zfill(4),
            "ji": (ji or "0").zfill(4),
            "_type": "json",
            "numOfRows": 10,
            "pageNo": 1,
        }
    )
    url = f"https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?serviceKey={key_q}&{params}"
    try:
        raw = _http_get_raw(url, timeout=10.0)
        err, items = _parse_data_go_kr_response(raw)
        if err:
            return {"configured": True, "found": False, "error": err}
        if not items:
            return {"configured": True, "found": False}

        top = items[0]
        main_purp = str(top.get("mainPurpsCdNm", "")).strip()
        etc_purp = str(top.get("etcPurps", "")).strip()
        combined = f"{main_purp} {etc_purp}"
        is_neighborhood_living = "근린생활" in combined or "근생" in combined
        approval_raw = str(top.get("useAprDay", "")).strip()
        approval_year = int(approval_raw[:4]) if len(approval_raw) >= 4 and approval_raw[:4].isdigit() else None
        violation_text = str(top.get("vltnBldYn", "") or top.get("resDocDesc", "") or "").strip()
        has_violation = violation_text.upper() in ("Y", "1", "TRUE") or "위반" in combined

        warnings: list[str] = []
        if is_neighborhood_living:
            warnings.append("주용도가 근린생활시설로 되어 있어 주거용 불법 용도변경(근생 빌라) 및 전세대출·보증보험 거절 위험을 반드시 확인하세요.")
        if has_violation:
            warnings.append("위반건축물 표기 또는 특이사항이 감지되었습니다. 등기부·건축물대장 원문을 열람하세요.")

        return {
            "configured": True,
            "found": True,
            "buildingName": str(top.get("bldNm", "")).strip() or str(top.get("dongNm", "")).strip(),
            "mainPurpose": main_purp or "정보 없음",
            "etcPurpose": etc_purp,
            "structureName": str(top.get("strctCdNm", "")).strip(),
            "approvalDate": (
                f"{approval_raw[:4]}.{approval_raw[4:6]}.{approval_raw[6:8]}"
                if len(approval_raw) == 8
                else approval_raw
            ),
            "approvalYear": approval_year,
            "groundFloors": _to_int(top.get("grndFlrCnt")),
            "undergroundFloors": _to_int(top.get("ugrndFlrCnt")),
            "householdCount": _to_int(top.get("hhldCnt")) or _to_int(top.get("fmlyCnt")),
            "totalAreaSqm": _to_float(top.get("totArea")),
            "floorAreaRatioPct": _to_float(top.get("vlRat")),
            "buildingCoveragePct": _to_float(top.get("bcRat")),
            "isNeighborhoodLiving": is_neighborhood_living,
            "hasViolation": has_violation,
            "warnings": warnings,
        }
    except Exception as exc:
        return {"configured": True, "found": False, "error": f"건축물대장 조회 오류: {exc}"}


# 5. 국토교통부 전월세 실거래가 조회 (연립다세대 + 오피스텔)
def _recent_months(count: int = 3) -> list[str]:
    today = dt.date.today().replace(day=1)
    out = []
    y, m = today.year, today.month
    for _ in range(count):
        out.append(f"{y}{m:02d}")
        m -= 1
        if m == 0:
            y -= 1
            m = 12
    return out


def fetch_rent_market(
    lawd_cd: str,
    target_deposit: int = 0,
    target_monthly: int = 0,
    target_area_sqm: float = 0.0,
    umd_hint: str = "",
    conversion_rate_pct: float = 4.5,
) -> dict[str, Any]:
    if not config.DATA_GO_KR_API_KEY:
        return {
            "configured": False,
            "message": "DATA_GO_KR_API_KEY를 설정하면 법정동 실거래가 시세 비교가 표시됩니다.",
        }
    key_q = _encode_data_go_kr_key(config.DATA_GO_KR_API_KEY)
    endpoints = [
        ("연립다세대", "https://apis.data.go.kr/1613000/RTMSDataSvcRHRent/getRTMSDataSvcRHRent"),
        ("오피스텔", "https://apis.data.go.kr/1613000/RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent"),
    ]
    trades: list[dict[str, Any]] = []
    errors: list[str] = []

    for ymd in _recent_months(2):
        for kind, ep in endpoints:
            qs = urllib.parse.urlencode({"LAWD_CD": lawd_cd[:5], "DEAL_YMD": ymd, "numOfRows": 60, "pageNo": 1})
            url = f"{ep}?serviceKey={key_q}&{qs}"
            try:
                raw = _http_get_raw(url, timeout=9.0)
                err, items = _parse_data_go_kr_response(raw)
                if err:
                    errors.append(err)
                    continue
                for row in items:
                    deposit = _to_int(row.get("deposit") or row.get("보증금액"))
                    monthly = _to_int(row.get("monthlyRent") or row.get("월세금액"))
                    area = _to_float(row.get("excluUseAr") or row.get("전용면적"))
                    umd = str(row.get("umdNm") or row.get("법정동") or "").strip()
                    name = str(row.get("mhouseNm") or row.get("offiNm") or row.get("단지") or kind).strip()
                    if area <= 0:
                        continue
                    equiv_monthly = monthly + (deposit * (conversion_rate_pct / 100.0) / 12.0)
                    trades.append(
                        {
                            "kind": kind,
                            "name": name,
                            "umdNm": umd,
                            "areaSqm": round(area, 1),
                            "deposit": deposit,
                            "monthlyRent": monthly,
                            "equivMonthly": round(equiv_monthly, 1),
                            "equivPerSqm": round(equiv_monthly / area, 2),
                            "dealDate": f"{ymd[:4]}.{ymd[4:]}",
                            "floor": _to_int(row.get("floor") or row.get("층")),
                        }
                    )
            except Exception as exc:
                errors.append(str(exc))

    if not trades:
        return {
            "configured": True,
            "sampleCount": 0,
            "error": errors[0] if errors else None,
            "verdict": "데이터 부족",
        }

    # Prefer matching 법정동 if hint matches >= 5 rows
    dong_clean = umd_hint.strip().replace("동", "")
    matched = [t for t in trades if dong_clean and dong_clean in t["umdNm"]] if dong_clean else []
    pool = matched if len(matched) >= 5 else trades
    if target_area_sqm > 0:
        area_filtered = [t for t in pool if abs(t["areaSqm"] - target_area_sqm) <= max(12.0, target_area_sqm * 0.45)]
        if len(area_filtered) >= 4:
            pool = area_filtered

    per_sqm_vals = [t["equivPerSqm"] for t in pool]
    med_per_sqm = statistics.median(per_sqm_vals)
    target_equiv = target_monthly + (target_deposit * (conversion_rate_pct / 100.0) / 12.0)
    area_for_cmp = target_area_sqm if target_area_sqm > 0 else statistics.median(t["areaSqm"] for t in pool)
    market_expected_equiv = med_per_sqm * area_for_cmp

    diff_pct = ((target_equiv - market_expected_equiv) / market_expected_equiv * 100.0) if market_expected_equiv > 0 else 0.0
    if diff_pct <= -8.0:
        verdict = "평균 대비 저렴"
    elif diff_pct >= 8.0:
        verdict = "평균 대비 비쌈"
    else:
        verdict = "적정 시세"

    return {
        "configured": True,
        "sampleCount": len(pool),
        "medianEquivMonthly": round(market_expected_equiv, 1),
        "targetEquivMonthly": round(target_equiv, 1),
        "diffPct": round(diff_pct, 1),
        "verdict": verdict,
        "conversionRatePct": conversion_rate_pct,
        "recentTrades": sorted(pool, key=lambda x: x["dealDate"], reverse=True)[:8],
    }


# 6. 브이월드(VWorld) 주변 3D 건물 높이 / 형상 조회 (LT_C_SPBD)
def _flatten_ring(coords: Any) -> list[tuple[float, float]]:
    ring: list[tuple[float, float]] = []
    if not isinstance(coords, list):
        return ring
    if coords and isinstance(coords[0], (int, float)) and len(coords) >= 2:
        return [(float(coords[0]), float(coords[1]))]
    if coords and isinstance(coords[0], list):
        if coords[0] and isinstance(coords[0][0], (int, float)):
            for pt in coords:
                if len(pt) >= 2:
                    ring.append((float(pt[0]), float(pt[1])))
            return ring
        return _flatten_ring(coords[0])
    return ring


def fetch_vworld_nearby_buildings(latitude: float, longitude: float, radius_m: float = 95.0) -> dict[str, Any]:
    if not config.VWORLD_API_KEY:
        return {
            "configured": False,
            "buildings": [],
            "message": "VWORLD_API_KEY를 설정하면 실제 주변 건물 높이를 3D로 불러와 그림자 일조권을 계산합니다.",
        }

    lat_m = 111_000.0
    lng_m = max(30_000.0, 111_000.0 * math.cos(math.radians(latitude)))
    d_lat = radius_m / lat_m
    d_lng = radius_m / lng_m
    bbox = f"BOX({longitude - d_lng:.6f},{latitude - d_lat:.6f},{longitude + d_lng:.6f},{latitude + d_lat:.6f})"

    qs = urllib.parse.urlencode(
        {
            "service": "data",
            "version": "2.0",
            "request": "GetFeature",
            "data": "LT_C_SPBD",
            "key": config.VWORLD_API_KEY,
            "domain": config.VWORLD_DOMAIN or "localhost",
            "format": "json",
            "crs": "EPSG:4326",
            "size": 45,
            "geomFilter": bbox,
        }
    )
    endpoints = [
        f"https://api.vworld.kr/req/data?{qs}",
        f"https://api.vworld.kr/req/data?{qs}",
        f"http://api.vworld.kr/req/data?{qs}",
    ]
    raw_body: str | None = None
    last_exc: Exception | None = None
    for idx, url in enumerate(endpoints):
        try:
            raw_body = _http_get_raw(url, timeout=14.0)
            break
        except urllib.error.HTTPError as exc:
            last_exc = exc
            if exc.code not in (502, 503, 504) or idx == len(endpoints) - 1:
                break
            time.sleep(0.5)
        except (urllib.error.URLError, TimeoutError) as exc:
            last_exc = exc
            if idx == len(endpoints) - 1:
                break
            time.sleep(0.5)
        except Exception as exc:
            last_exc = exc
            break

    if raw_body is None:
        return {"configured": True, "buildings": [], "error": f"브이월드 3D 건물 조회 오류: {last_exc}"}

    try:
        data = json.loads(raw_body)
        resp = data.get("response") or {}
        if resp.get("status") != "OK":
            err = (resp.get("error") or {}).get("text") or resp.get("status") or "VWorld API 오류"
            return {"configured": True, "buildings": [], "error": err}

        features = (
            ((resp.get("result") or {}).get("featureCollection") or {}).get("features")
            or []
        )
        buildings: list[dict[str, Any]] = []
        for idx, feat in enumerate(features):
            props = feat.get("properties") or {}
            geom = feat.get("geometry") or {}
            ring = _flatten_ring(geom.get("coordinates"))
            if len(ring) < 3:
                continue

            # Map lng/lat -> room local coords: +X = East, +Z = South (Three.js top-down North = -Z)
            pts_m = [((lng - longitude) * lng_m, (latitude - lat) * lat_m) for lng, lat in ring]
            xs = [p[0] for p in pts_m]
            zs = [p[1] for p in pts_m]
            cx = sum(xs) / len(xs)
            cz = sum(zs) / len(zs)
            dist = math.hypot(cx, cz)
            if dist < 4.5 or dist > radius_m * 1.3:
                continue

            height_m = _to_float(props.get("HEIGHT") or props.get("height") or props.get("BLD_HGT"))
            floors = _to_int(props.get("GRO_FLO_CO") or props.get("gro_flo_co"))
            if height_m <= 1.0:
                height_m = max(4.0, floors * 3.2) if floors > 0 else 10.5

            width_m = max(4.0, min(50.0, max(xs) - min(xs)))
            depth_m = max(4.0, min(50.0, max(zs) - min(zs)))
            name = (
                str(props.get("BLD_NM") or props.get("buld_nm") or props.get("BULD_NM") or "").strip()
                or (f"주변 건물 ({floors}층)" if floors > 0 else "주변 건물")
            )
            buildings.append(
                {
                    "id": str(feat.get("id") or f"vw-{idx}"),
                    "name": name,
                    "xM": round(cx, 2),
                    "zM": round(cz, 2),
                    "widthM": round(width_m, 2),
                    "depthM": round(depth_m, 2),
                    "heightM": round(height_m, 2),
                    "floors": floors or max(1, round(height_m / 3.2)),
                    "distanceM": round(dist, 1),
                    "source": "vworld",
                }
            )

        buildings.sort(key=lambda b: b["distanceM"])
        return {"configured": True, "buildings": buildings[:24]}
    except Exception as exc:
        return {"configured": True, "buildings": [], "error": f"브이월드 3D 건물 조회 오류: {exc}"}

