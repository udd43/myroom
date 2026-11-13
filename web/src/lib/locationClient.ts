import { findNearestPresetForCoords, matchPresetFromText } from "./sunlight";

export interface GpsLocationResult {
  ok: true;
  latitude: number;
  longitude: number;
  locationLabel: string;
  matchedDistrict?: string;
}

export interface GpsLocationError {
  ok: false;
  message: string;
}

/**
 * 브라우저 Geolocation API로 현재 GPS 좌표를 읽고 가장 가까운 서울 자치구/지역 라벨을 자동 매칭합니다.
 */
export function requestBrowserGpsLocation(): Promise<GpsLocationResult | GpsLocationError> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({
        ok: false,
        message: "이 브라우저는 GPS 위치 API를 지원하지 않습니다. 아래에서 서울 구·동을 선택해 주세요.",
      });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latitude = +pos.coords.latitude.toFixed(4);
        const longitude = +pos.coords.longitude.toFixed(4);
        const nearest = findNearestPresetForCoords(latitude, longitude, 15);
        const locationLabel = nearest
          ? `GPS · ${nearest.label} 인근`
          : `현재 GPS (${latitude.toFixed(2)}°N, ${longitude.toFixed(2)}°E)`;
        resolve({
          ok: true,
          latitude,
          longitude,
          locationLabel,
          matchedDistrict: nearest?.label,
        });
      },
      (err) => {
        const reason =
          err.code === 1
            ? "위치 권한이 차단되었습니다. 브라우저 주소창에서 위치 허용 후 다시 누르거나 서울 구를 선택해 주세요."
            : "현재 위치를 가져오지 못했습니다. 아래에서 서울 구·동을 직접 선택할 수 있습니다.";
        resolve({ ok: false, message: reason });
      },
      { enableHighAccuracy: true, timeout: 7000 }
    );
  });
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  locationLabel: string;
  source: "seoul_preset" | "nominatim";
}

/**
 * 서울 구·동·역명 키워드 또는 OpenStreetMap Nominatim으로 주소의 위·경도를 찾습니다.
 */
export async function resolveAddressToCoords(query: string): Promise<GeocodeResult | null> {
  const q = query.trim();
  if (!q) return null;

  const localPreset = matchPresetFromText(q);
  // 구체적인 구/동 프리셋(단순 "서울" 전체 제외)이 바로 잡히면 즉시 응답하고, 일반 주소는 Nominatim 시도
  if (localPreset && localPreset.id !== "seoul") {
    return {
      latitude: localPreset.lat,
      longitude: localPreset.lon,
      locationLabel: localPreset.label,
      source: "seoul_preset",
    };
  }

  try {
    const searchQ = q.includes("서울") ? q : `서울 ${q}`;
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=kr&q=${encodeURIComponent(
      searchQ
    )}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const items = (await res.json()) as Array<{ lat: string; lon: string; display_name?: string }>;
      if (items.length > 0) {
        const lat = +parseFloat(items[0].lat).toFixed(4);
        const lon = +parseFloat(items[0].lon).toFixed(4);
        const nearest = findNearestPresetForCoords(lat, lon, 12);
        return {
          latitude: lat,
          longitude: lon,
          locationLabel: nearest ? `${nearest.label} (${q})` : q,
          source: "nominatim",
        };
      }
    }
  } catch {
    // 오프라인/차단 시 아래 로컬 fallback 사용
  }

  if (localPreset) {
    return {
      latitude: localPreset.lat,
      longitude: localPreset.lon,
      locationLabel: localPreset.label,
      source: "seoul_preset",
    };
  }
  return null;
}

