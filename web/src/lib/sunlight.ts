import * as SunCalc from "suncalc";
import { NeighborBuilding, RoomItem, RoomPlanOpening, RoomPlanWall } from "@/types/room";

export type SeasonPresetId = "today" | "winter" | "equinox" | "summer";

export interface SeasonPreset {
  id: SeasonPresetId;
  label: string;
  shortLabel: string;
  dateLabel: string;
  dayOfYear: number;
}

export const SEASON_PRESETS: SeasonPreset[] = [
  { id: "today", label: "오늘", shortLabel: "오늘", dateLabel: "현재 날짜", dayOfYear: getCurrentDayOfYear() },
  { id: "winter", label: "동지 (12/22)", shortLabel: "동지", dateLabel: "12월 22일 · 최저 고도", dayOfYear: 356 },
  { id: "equinox", label: "춘·추분 (3/21)", shortLabel: "춘·추분", dateLabel: "3월 21일 · 평균 고도", dayOfYear: 80 },
  { id: "summer", label: "하지 (6/21)", shortLabel: "하지", dateLabel: "6월 21일 · 최고 고도", dayOfYear: 172 },
];

export const DIRECTION_OPTIONS = [
  "남향",
  "남동향",
  "남서향",
  "동향",
  "서향",
  "북동향",
  "북서향",
  "북향",
] as const;

export interface LocationPreset {
  id: string;
  label: string;
  lat: number;
  lon: number;
  region?: "seoul" | "korea";
  keywords: string[];
}

export const SEOUL_DISTRICT_PRESETS: LocationPreset[] = [
  { id: "seoul-gangnam", label: "서울 강남구", lat: 37.5172, lon: 127.0473, region: "seoul", keywords: ["강남", "역삼", "삼성", "선릉", "대치", "논현", "신사", "압구정", "청담", "도곡", "개포", "수서"] },
  { id: "seoul-seocho", label: "서울 서초구", lat: 37.4837, lon: 127.0324, region: "seoul", keywords: ["서초", "방배", "교대", "반포", "잠원", "양재", "내곡"] },
  { id: "seoul-songpa", label: "서울 송파구", lat: 37.5145, lon: 127.1059, region: "seoul", keywords: ["송파", "잠실", "석촌", "가락", "문정", "방이", "오금", "풍납", "위례"] },
  { id: "seoul-gangdong", label: "서울 강동구", lat: 37.5301, lon: 127.1238, region: "seoul", keywords: ["강동", "천호", "길동", "명일", "고덕", "암사", "성내", "둔촌"] },
  { id: "seoul-mapo", label: "서울 마포구", lat: 37.5663, lon: 126.9019, region: "seoul", keywords: ["마포", "연남", "홍대", "합정", "망원", "상수", "공덕", "아현", "상암", "서교", "동교"] },
  { id: "seoul-seodaemun", label: "서울 서대문구", lat: 37.5791, lon: 126.9368, region: "seoul", keywords: ["서대문", "신촌", "이대", "연희", "홍제", "북아현", "가좌"] },
  { id: "seoul-eunpyeong", label: "서울 은평구", lat: 37.6027, lon: 126.9291, region: "seoul", keywords: ["은평", "연신내", "불광", "응암", "녹번", "구파발", "진관"] },
  { id: "seoul-yongsan", label: "서울 용산구", lat: 37.5326, lon: 126.9905, region: "seoul", keywords: ["용산", "이태원", "한남", "숙대", "삼각지", "이촌", "효창", "후암"] },
  { id: "seoul-seongdong", label: "서울 성동구", lat: 37.5633, lon: 127.0371, region: "seoul", keywords: ["성동", "성수", "왕십리", "옥수", "금호", "행당", "마장", "응봉"] },
  { id: "seoul-gwangjin", label: "서울 광진구", lat: 37.5385, lon: 127.0823, region: "seoul", keywords: ["광진", "건대", "구의", "자양", "군자", "화양", "중곡", "아차산"] },
  { id: "seoul-dongdaemun", label: "서울 동대문구", lat: 37.5744, lon: 127.0396, region: "seoul", keywords: ["동대문구", "청량리", "회기", "외대", "이문", "휘경", "장안", "제기", "답십리"] },
  { id: "seoul-jungnang", label: "서울 중랑구", lat: 37.6063, lon: 127.0926, region: "seoul", keywords: ["중랑", "상봉", "면목", "망우", "신내", "중화", "먹골"] },
  { id: "seoul-seongbuk", label: "서울 성북구", lat: 37.5894, lon: 127.0167, region: "seoul", keywords: ["성북", "안암", "성신여대", "길음", "정릉", "보문", "월곡", "석계"] },
  { id: "seoul-gangbuk", label: "서울 강북구", lat: 37.6396, lon: 127.0257, region: "seoul", keywords: ["강북", "수유", "미아", "우이", "번동"] },
  { id: "seoul-dobong", label: "서울 도봉구", lat: 37.6688, lon: 127.0471, region: "seoul", keywords: ["도봉", "창동", "쌍문", "방학"] },
  { id: "seoul-nowon", label: "서울 노원구", lat: 37.6542, lon: 127.0568, region: "seoul", keywords: ["노원", "상계", "중계", "하계", "공릉", "태릉"] },
  { id: "seoul-jongno", label: "서울 종로구", lat: 37.573, lon: 126.9794, region: "seoul", keywords: ["종로", "혜화", "광화문", "경복궁", "안국", "종각", "대학로", "서촌", "북촌", "삼청", "평창동"] },
  { id: "seoul-jung", label: "서울 중구", lat: 37.5641, lon: 126.9979, region: "seoul", keywords: ["중구", "명동", "을지로", "충무로", "신당", "약수", "회현", "서울역", "시청"] },
  { id: "seoul-yeongdeungpo", label: "서울 영등포구", lat: 37.5264, lon: 126.8963, region: "seoul", keywords: ["영등포", "여의도", "당산", "문래", "신길", "대림", "양평동", "선유도"] },
  { id: "seoul-dongjak", label: "서울 동작구", lat: 37.5124, lon: 126.9393, region: "seoul", keywords: ["동작", "사당", "이수", "노량진", "상도", "흑석", "숭실대", "신대방"] },
  { id: "seoul-gwanak", label: "서울 관악구", lat: 37.4784, lon: 126.9516, region: "seoul", keywords: ["관악", "신림", "봉천", "서울대입구", "낙성대", "난곡"] },
  { id: "seoul-yangcheon", label: "서울 양천구", lat: 37.517, lon: 126.8665, region: "seoul", keywords: ["양천", "목동", "신정", "신월", "오목교"] },
  { id: "seoul-gangseo", label: "서울 강서구", lat: 37.5509, lon: 126.8495, region: "seoul", keywords: ["강서", "마곡", "화곡", "발산", "가양", "등촌", "방화", "까치산", "김포공항"] },
  { id: "seoul-guro", label: "서울 구로구", lat: 37.4954, lon: 126.8874, region: "seoul", keywords: ["구로", "신도림", "개봉", "오류", "고척", "온수"] },
  { id: "seoul-geumcheon", label: "서울 금천구", lat: 37.4569, lon: 126.8955, region: "seoul", keywords: ["금천", "가산", "독산", "시흥동"] },
];

export const OTHER_KOREA_LOCATION_PRESETS: LocationPreset[] = [
  { id: "seoul", label: "서울특별시 전체 기준 (시청)", lat: 37.5665, lon: 126.978, region: "seoul", keywords: ["서울"] },
  { id: "pangyo", label: "경기 성남시 판교·분당", lat: 37.3948, lon: 127.1112, region: "korea", keywords: ["판교", "분당", "성남"] },
  { id: "suwon", label: "경기 수원시", lat: 37.2636, lon: 127.0286, region: "korea", keywords: ["수원", "광교"] },
  { id: "incheon", label: "인천광역시", lat: 37.4563, lon: 126.7052, region: "korea", keywords: ["인천", "송도", "부평"] },
  { id: "chuncheon", label: "강원 춘천시", lat: 37.8813, lon: 127.7298, region: "korea", keywords: ["춘천", "강원"] },
  { id: "daejeon", label: "대전·세종", lat: 36.3504, lon: 127.3845, region: "korea", keywords: ["대전", "세종", "유성"] },
  { id: "daegu", label: "대구광역시", lat: 35.8714, lon: 128.6014, region: "korea", keywords: ["대구", "수성"] },
  { id: "gwangju", label: "광주광역시", lat: 35.1595, lon: 126.8526, region: "korea", keywords: ["광주", "상무"] },
  { id: "busan", label: "부산광역시", lat: 35.1796, lon: 129.0756, region: "korea", keywords: ["부산", "해운대", "서면", "수영"] },
  { id: "jeju", label: "제주시", lat: 33.4996, lon: 126.5312, region: "korea", keywords: ["제주", "서귀포"] },
];

export const KOREA_LOCATION_PRESETS: LocationPreset[] = [
  ...SEOUL_DISTRICT_PRESETS,
  ...OTHER_KOREA_LOCATION_PRESETS,
];

export interface SolarDayEvents {
  sunriseMin: number;
  solarNoonMin: number;
  sunsetMin: number;
  dayLengthHours: number;
  maxAltitudeDeg: number;
}

export interface ResolvedLocation {
  lat: number;
  lon: number;
  label: string;
  source: "gps_saved" | "address" | "default";
}

export interface RoomWindow3D {
  id: string;
  x: number;
  z: number;
  widthM: number;
  rotationDeg: number;
  outwardNormal: [number, number];
  tangent: [number, number];
  sillHeightM: number;
  headHeightM: number;
}

export interface SolarPosition {
  altitudeDeg: number;
  azimuthDeg: number; // 0=N, 90=E, 180=S, 270=W
  isDaylight: boolean;
}

export interface RoomSunState {
  world: SolarPosition;
  location: ResolvedLocation;
  roomFacingAzimuthDeg: number;
  roomFacingLabel: string;
  primaryWindowAzimuthDeg: number;
  minObstructionAltDeg: number;
  roomElevationM: number;
  blockedByBuilding: NeighborBuilding | null;
  towardSunRoom: [number, number, number];
  incomingRayRoom: [number, number, number];
  windowIncidence: number;
  isDirectSunlight: boolean;
  directIntensity: number;
  sunColor: [number, number, number];
  skyColor: [number, number, number];
  skyIntensity: number;
  statusText: string;
  windows: RoomWindow3D[];
}

export interface HourlySunSample {
  hour: number;
  label: string;
  altitudeDeg: number;
  azimuthDeg: number;
  directFactor: number;
  inView: boolean;
  blockedByName?: string;
}

export interface DailySunlightSummary {
  directHours: number;
  winterHours: number;
  equinoxHours: number;
  summerHours: number;
  peakHour: number | null;
  peakAltDeg: number;
  grade: "최상" | "양호" | "보통" | "간접광 위주";
  summaryLine: string;
  hourly: HourlySunSample[];
}

export function getCurrentDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.max(1, Math.min(365, Math.floor(diff / 86_400_000)));
}

export function formatMinutesToHHMM(minutesOfDay: number): string {
  const clamped = Math.max(0, Math.min(1439, Math.round(minutesOfDay)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function azimuthDegToKorean(azDeg: number): string {
  const norm = ((azDeg % 360) + 360) % 360;
  const dirs = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
  return `${dirs[Math.round(norm / 45) % 8]} (${Math.round(norm)}°)`;
}

export function parseDirectionAzimuthDeg(direction?: string | null): number {
  const d = (direction || "").trim();
  if (!d) return 180;
  const numMatch = d.match(/(-?\d+(?:\.\d+)?)\s*°/);
  if (numMatch) {
    const val = parseFloat(numMatch[1]);
    return ((val % 360) + 360) % 360;
  }
  if (d.includes("북동") || d.includes("동북")) return 45;
  if (d.includes("남동") || d.includes("동남")) return 135;
  if (d.includes("남서") || d.includes("서남")) return 225;
  if (d.includes("북서") || d.includes("서북")) return 315;
  if (d.includes("남")) return 180;
  if (d.includes("북")) return 0;
  if (d.includes("동")) return 90;
  if (d.includes("서")) return 270;
  return 180;
}

export function estimateRoomElevationM(floorStr?: string | null): number {
  const f = (floorStr || "").trim();
  if (f.includes("반지하") || f.includes("지하")) return 0.6;
  const m = f.match(/(\d+)\s*층/);
  if (!m) return 4.2;
  const floorNum = Math.max(1, parseInt(m[1], 10));
  return (floorNum - 1) * 3.0 + 1.6;
}

export function matchPresetFromText(text: string): LocationPreset | null {
  const normalized = (text || "").trim();
  if (!normalized) return null;
  for (const preset of KOREA_LOCATION_PRESETS) {
    if (preset.keywords.some((kw) => normalized.includes(kw))) {
      return preset;
    }
  }
  return null;
}

export function findNearestPresetForCoords(lat: number, lon: number, maxKm = 15): LocationPreset | null {
  let best: LocationPreset | null = null;
  let bestKm = maxKm;
  for (const preset of KOREA_LOCATION_PRESETS) {
    if (preset.id === "seoul") continue;
    const dLat = (preset.lat - lat) * 111.0;
    const dLon = (preset.lon - lon) * 111.0 * Math.cos((lat * Math.PI) / 180);
    const dist = Math.hypot(dLat, dLon);
    if (dist < bestKm) {
      bestKm = dist;
      best = preset;
    }
  }
  return best;
}

export function resolveRoomLocation(room: RoomItem): ResolvedLocation {
  if (
    typeof room.latitude === "number" &&
    typeof room.longitude === "number" &&
    Number.isFinite(room.latitude) &&
    Number.isFinite(room.longitude)
  ) {
    return {
      lat: room.latitude,
      lon: room.longitude,
      label: room.locationLabel || room.address || `${room.latitude.toFixed(3)}°N`,
      source: "gps_saved",
    };
  }
  const matched = matchPresetFromText(`${room.address || ""} ${room.title || ""}`);
  if (matched) {
    return { lat: matched.lat, lon: matched.lon, label: matched.label, source: "address" };
  }
  return { lat: 37.5665, lon: 126.978, label: "서울특별시 기준", source: "default" };
}

export function estimateObstructionAltitudeDeg(floorStr?: string | null): number {
  const f = (floorStr || "").trim();
  if (f.includes("반지하") || f.includes("지하")) return 24;
  const m = f.match(/(\d+)\s*층/);
  if (!m) return 6;
  const n = parseInt(m[1], 10);
  if (n <= 1) return 18;
  if (n === 2) return 12;
  if (n === 3) return 8;
  if (n <= 6) return 4;
  return 1.5;
}

function localTimeToDate(dayOfYear: number, minutesOfDay: number, tzOffsetMinutes: number): Date {
  const year = new Date().getFullYear();
  const utcMs =
    Date.UTC(year, 0, 1, 0, 0, 0) +
    (dayOfYear - 1) * 86_400_000 +
    minutesOfDay * 60_000 -
    tzOffsetMinutes * 60_000;
  return new Date(utcMs);
}

/** SunCalc v2 기반 태양 고도 및 진방위각 계산 (0=N, 90=E, 180=S, 270=W) */
export function calculateSolarPosition(
  dayOfYear: number,
  minutesOfDay: number,
  latDeg: number,
  lonDeg: number,
  tzOffsetMinutes = 540
): SolarPosition {
  const date = localTimeToDate(dayOfYear, minutesOfDay, tzOffsetMinutes);
  const pos = SunCalc.getPosition(date, latDeg, lonDeg);
  const azimuthDeg = ((pos.azimuth % 360) + 360) % 360;
  return {
    altitudeDeg: pos.altitude,
    azimuthDeg,
    isDaylight: pos.altitude > 0.5,
  };
}

/** SunCalc v2 기반 일출·남중·일몰·낮 길이 계산 */
export function computeSolarDayEvents(
  dayOfYear: number,
  latDeg: number,
  lonDeg: number,
  tzOffsetMinutes = 540
): SolarDayEvents {
  const midday = localTimeToDate(dayOfYear, 12 * 60, tzOffsetMinutes);
  const dayStartMs = localTimeToDate(dayOfYear, 0, tzOffsetMinutes).getTime();
  const times = SunCalc.getTimes(midday, latDeg, lonDeg, 0, tzOffsetMinutes);

  const toMin = (d: Date | null | undefined, fallback: number): number => {
    if (!d || !Number.isFinite(d.getTime())) return fallback;
    return Math.max(0, Math.min(1439, Math.round((d.getTime() - dayStartMs) / 60_000)));
  };

  const sunriseMin = toMin(times.sunrise, 6 * 60 + 30);
  const solarNoonMin = toMin(times.solarNoon, 12 * 60 + 30);
  const sunsetMin = toMin(times.sunset, 18 * 60);
  const noonPos = SunCalc.getPosition(times.solarNoon, latDeg, lonDeg);

  return {
    sunriseMin,
    solarNoonMin,
    sunsetMin,
    dayLengthHours: Math.max(0, Math.round(((sunsetMin - sunriseMin) / 60) * 10) / 10),
    maxAltitudeDeg: Math.round(noonPos.altitude),
  };
}

/**
 * 실제 3D 레이-박스 교차(Ray-AABB) 검사로 주변 건물 그림자에 태양광이 가려지는지 판별합니다.
 */
export function findBlockingNeighbor(
  neighbors: NeighborBuilding[] | undefined,
  roomElevationM: number,
  worldAzDeg: number,
  worldAltDeg: number
): NeighborBuilding | null {
  if (!neighbors || neighbors.length === 0 || worldAltDeg <= 0) return null;

  const azRad = (worldAzDeg * Math.PI) / 180;
  const altRad = (worldAltDeg * Math.PI) / 180;
  const dx = Math.sin(azRad) * Math.cos(altRad);
  const dy = Math.sin(altRad);
  const dz = -Math.cos(azRad) * Math.cos(altRad);

  const oy = roomElevationM;

  let closestT = Infinity;
  let blocker: NeighborBuilding | null = null;

  for (const b of neighbors) {
    if (b.heightM <= oy + 0.2) continue;
    const minX = b.xM - b.widthM / 2;
    const maxX = b.xM + b.widthM / 2;
    const minY = 0;
    const maxY = b.heightM;
    const minZ = b.zM - b.depthM / 2;
    const maxZ = b.zM + b.depthM / 2;

    const slab = (orig: number, dir: number, lo: number, hi: number): [number, number] => {
      if (Math.abs(dir) < 1e-6) {
        return orig >= lo && orig <= hi ? [-Infinity, Infinity] : [Infinity, -Infinity];
      }
      const inv = 1 / dir;
      const t1 = (lo - orig) * inv;
      const t2 = (hi - orig) * inv;
      return t1 <= t2 ? [t1, t2] : [t2, t1];
    };

    const [tx1, tx2] = slab(0, dx, minX, maxX);
    const [ty1, ty2] = slab(oy, dy, minY, maxY);
    const [tz1, tz2] = slab(0, dz, minZ, maxZ);

    const tEnter = Math.max(tx1, ty1, tz1);
    const tExit = Math.min(tx2, ty2, tz2);

    if (tExit >= Math.max(0.5, tEnter) && tEnter < closestT) {
      closestT = tEnter;
      blocker = b;
    }
  }

  return blocker;
}

export function extractRoomWindows(room: RoomItem): RoomWindow3D[] {
  const openings: RoomPlanOpening[] = room.roomPlan?.openings || [];
  const rawWins = openings.filter((o) => o.type === "window");

  if (rawWins.length === 0) {
    const zPos = room.roomPlan?.depthM ? -room.roomPlan.depthM / 2 : -2.25;
    return [
      {
        id: "virtual-win",
        x: 0,
        z: zPos,
        widthM: 2.2,
        rotationDeg: 0,
        outwardNormal: [0, -1],
        tangent: [1, 0],
        sillHeightM: 0.72,
        headHeightM: 2.12,
      },
    ];
  }

  return rawWins.map((w) => {
    const rad = ((w.rotationDeg || 0) * Math.PI) / 180;
    const tx = Math.cos(rad);
    const tz = Math.sin(rad);
    let nx = -tz;
    let nz = tx;
    if (nx * w.x + nz * w.z < 0) {
      nx = -nx;
      nz = -nz;
    }
    const nLen = Math.hypot(nx, nz) || 1;
    return {
      id: w.id,
      x: w.x,
      z: w.z,
      widthM: w.widthM,
      rotationDeg: w.rotationDeg,
      outwardNormal: [nx / nLen, nz / nLen],
      tangent: [tx, tz],
      sillHeightM: 0.72,
      headHeightM: 2.15,
    };
  });
}

function sceneNormalToAzimuthDeg(nx: number, nz: number): number {
  return ((Math.atan2(nx, -nz) * 180) / Math.PI + 360) % 360;
}

export function computeRoomSunState(
  room: RoomItem,
  opts: {
    dayOfYear: number;
    minutesOfDay: number;
    considerObstruction?: boolean;
    overrideDirection?: string;
    headingOffsetDeg?: number;
  }
): RoomSunState {
  const location = resolveRoomLocation(room);
  const world = calculateSolarPosition(opts.dayOfYear, opts.minutesOfDay, location.lat, location.lon);
  const windows = extractRoomWindows(room);

  const primaryWin = windows.reduce((best, cur) => (cur.widthM > best.widthM ? cur : best), windows[0]);
  const primaryWinSceneAzDeg = sceneNormalToAzimuthDeg(
    primaryWin.outwardNormal[0],
    primaryWin.outwardNormal[1]
  );

  const dirStr = opts.overrideDirection ?? room.direction;
  const headingOffset = opts.headingOffsetDeg ?? room.sunHeadingOffsetDeg ?? 0;
  const roomFacingAzimuthDeg =
    ((parseDirectionAzimuthDeg(dirStr) + headingOffset) % 360 + 360) % 360;

  const deltaDeg = primaryWinSceneAzDeg - roomFacingAzimuthDeg;
  const roomSunAzRad = ((world.azimuthDeg + deltaDeg) * Math.PI) / 180;
  const altRad = (world.altitudeDeg * Math.PI) / 180;

  const cosAlt = Math.cos(altRad);
  const sx = Math.sin(roomSunAzRad) * cosAlt;
  const sy = Math.sin(altRad);
  const sz = -Math.cos(roomSunAzRad) * cosAlt;

  const minObstructionAltDeg =
    opts.considerObstruction === false ? 1.0 : estimateObstructionAltitudeDeg(room.floor);
  const roomElevationM = estimateRoomElevationM(room.floor);
  const blockedByBuilding =
    opts.considerObstruction === false
      ? null
      : findBlockingNeighbor(room.neighborBuildings, roomElevationM, world.azimuthDeg, world.altitudeDeg);

  let bestIncidence = -1;
  for (const w of windows) {
    const horizLen = Math.hypot(sx, sz) || 1;
    const dot2d = (sx / horizLen) * w.outwardNormal[0] + (sz / horizLen) * w.outwardNormal[1];
    const cos3d = sx * w.outwardNormal[0] + sz * w.outwardNormal[1];
    const eff = cosAlt > 0.01 ? cos3d : dot2d;
    if (eff > bestIncidence) bestIncidence = eff;
  }

  const aboveSkyline = world.altitudeDeg > minObstructionAltDeg;
  const windowFacingSun = bestIncidence > 0.06;
  const isDirectSunlight = world.isDaylight && aboveSkyline && windowFacingSun && !blockedByBuilding;

  const altFactor = Math.max(0, Math.min(1, (world.altitudeDeg - 2) / 38));
  const rawStrength = isDirectSunlight
    ? Math.pow(Math.max(0, bestIncidence), 0.72) * (0.35 + 0.65 * Math.sin(Math.max(0.08, altRad)))
    : 0;
  const directIntensity = Math.max(0, Math.min(1, rawStrength * 1.15));

  const sunColor: [number, number, number] = [
    1.0,
    0.76 + 0.2 * altFactor,
    0.5 + 0.42 * altFactor,
  ];

  let skyColor: [number, number, number];
  let skyIntensity: number;
  if (!world.isDaylight) {
    skyColor = [0.22, 0.28, 0.42];
    skyIntensity = 0.26;
  } else if (isDirectSunlight) {
    skyColor = [0.88, 0.93, 1.0];
    skyIntensity = 0.56 + 0.14 * altFactor;
  } else {
    skyColor = [0.74, 0.84, 0.98];
    skyIntensity = 0.42 + 0.14 * altFactor;
  }

  let statusText: string;
  if (!world.isDaylight) {
    statusText = "일몰 후 (자연광 없음)";
  } else if (blockedByBuilding) {
    statusText = `건물 그림자 차폐 ('${blockedByBuilding.name}' ${blockedByBuilding.heightM}m · 고도 ${Math.round(world.altitudeDeg)}°)`;
  } else if (!aboveSkyline) {
    statusText = `태양 고도 ${Math.round(world.altitudeDeg)}° (주변 지평선 차폐 < ${Math.round(minObstructionAltDeg)}°)`;
  } else if (isDirectSunlight) {
    statusText = `직사광 유입 · 고도 ${Math.round(world.altitudeDeg)}° · ${azimuthDegToKorean(world.azimuthDeg)}`;
  } else {
    statusText = `간접광(음영) · 태양이 창 반대편 (${azimuthDegToKorean(world.azimuthDeg)})`;
  }

  return {
    world,
    location,
    roomFacingAzimuthDeg,
    roomFacingLabel: (dirStr || "남향").trim(),
    primaryWindowAzimuthDeg: primaryWinSceneAzDeg,
    minObstructionAltDeg,
    roomElevationM,
    blockedByBuilding,
    towardSunRoom: [sx, sy, sz],
    incomingRayRoom: [-sx, -sy, -sz],
    windowIncidence: bestIncidence,
    isDirectSunlight,
    directIntensity,
    sunColor,
    skyColor,
    skyIntensity,
    statusText,
    windows,
  };
}

function integrateDaylightHours(
  room: RoomItem,
  dayOfYear: number,
  considerObstruction: boolean
): { hours: number; peakHour: number | null; peakAltDeg: number } {
  let activeQuarterHours = 0;
  let bestIntensity = 0;
  let peakMin = 12 * 60;
  let peakAlt = 0;

  for (let min = 5 * 60; min <= 20 * 60; min += 15) {
    const st = computeRoomSunState(room, {
      dayOfYear,
      minutesOfDay: min,
      considerObstruction,
    });
    if (st.isDirectSunlight && st.directIntensity > 0.08) {
      activeQuarterHours += 0.25;
      if (st.directIntensity > bestIntensity) {
        bestIntensity = st.directIntensity;
        peakMin = min;
        peakAlt = st.world.altitudeDeg;
      }
    }
  }

  return {
    hours: Math.round(activeQuarterHours * 10) / 10,
    peakHour: bestIntensity > 0 ? peakMin : null,
    peakAltDeg: Math.round(peakAlt),
  };
}

export function analyzeDailySunlight(
  room: RoomItem,
  dayOfYear: number,
  considerObstruction = true
): DailySunlightSummary {
  const cur = integrateDaylightHours(room, dayOfYear, considerObstruction);
  const winter = integrateDaylightHours(room, 356, considerObstruction);
  const equinox = integrateDaylightHours(room, 80, considerObstruction);
  const summer = integrateDaylightHours(room, 172, considerObstruction);

  const hourly: HourlySunSample[] = [];
  for (let h = 6; h <= 19; h++) {
    const st = computeRoomSunState(room, {
      dayOfYear,
      minutesOfDay: h * 60 + 30,
      considerObstruction,
    });
    hourly.push({
      hour: h,
      label: `${h}시`,
      altitudeDeg: Math.round(st.world.altitudeDeg),
      azimuthDeg: Math.round(st.world.azimuthDeg),
      directFactor: st.isDirectSunlight ? st.directIntensity : 0,
      inView: st.isDirectSunlight,
      blockedByName: st.blockedByBuilding?.name,
    });
  }

  let grade: DailySunlightSummary["grade"];
  if (winter.hours >= 4.5 && cur.hours >= 5.0) grade = "최상";
  else if (cur.hours >= 3.5) grade = "양호";
  else if (cur.hours >= 1.5) grade = "보통";
  else grade = "간접광 위주";

  const summaryLine =
    cur.peakHour !== null
      ? `실질 일조 ${cur.hours.toFixed(1)}시간 (피크 ${formatMinutesToHHMM(cur.peakHour)}, 동지 ${winter.hours.toFixed(1)}h)`
      : `직사광 적음 (동지 ${winter.hours.toFixed(1)}h · 간접광 위주)`;

  return {
    directHours: cur.hours,
    winterHours: winter.hours,
    equinoxHours: equinox.hours,
    summerHours: summer.hours,
    peakHour: cur.peakHour,
    peakAltDeg: cur.peakAltDeg,
    grade,
    summaryLine,
    hourly,
  };
}

export function computeWindowFloorSunPolygons(
  room: RoomItem,
  sunState: RoomSunState
): Array<{ windowId: string; polygon: Array<[number, number]> }> {
  if (!sunState.isDirectSunlight || sunState.world.altitudeDeg < 1.5) return [];

  const [rx, ry, rz] = sunState.incomingRayRoom;
  if (ry >= -0.02) return [];

  const horizSpeed = Math.hypot(rx, rz);
  if (horizSpeed < 1e-4) return [];

  const maxProjectionDist = 9.0;
  const wMax = (room.roomPlan?.widthM ?? 6.4) * 0.52;
  const dMax = (room.roomPlan?.depthM ?? 4.8) * 0.52;
  const walls: RoomPlanWall[] = room.roomPlan?.walls || [];

  const castRayToWall = (ox: number, oz: number, dx: number, dz: number, maxDist: number): number => {
    let bestT = maxDist;
    if (Math.abs(dx) > 1e-5) {
      const tx = ((dx > 0 ? wMax : -wMax) - ox) / dx;
      if (tx > 0.08 && tx < bestT) bestT = tx;
    }
    if (Math.abs(dz) > 1e-5) {
      const tz = ((dz > 0 ? dMax : -dMax) - oz) / dz;
      if (tz > 0.08 && tz < bestT) bestT = tz;
    }
    for (const w of walls) {
      const wx = w.x2 - w.x1;
      const wz = w.z2 - w.z1;
      const denom = dx * wz - dz * wx;
      if (Math.abs(denom) < 1e-6) continue;
      const qpx = w.x1 - ox;
      const qpz = w.z1 - oz;
      const t = (qpx * wz - qpz * wx) / denom;
      const u = (qpx * dz - qpz * dx) / denom;
      if (t > 0.14 && t < bestT && u >= 0 && u <= 1) {
        bestT = t;
      }
    }
    return bestT;
  };

  const results: Array<{ windowId: string; polygon: Array<[number, number]> }> = [];
  const ux = rx / horizSpeed;
  const uz = rz / horizSpeed;

  for (const win of sunState.windows) {
    const [sx, , sz] = sunState.towardSunRoom;
    const hLen = Math.hypot(sx, sz) || 1;
    const cosInc = (sx / hLen) * win.outwardNormal[0] + (sz / hLen) * win.outwardNormal[1];
    if (cosInc <= 0.06) continue;

    const nearDist = Math.min(maxProjectionDist, Math.abs(win.sillHeightM * (horizSpeed / -ry)));
    const farDist = Math.min(maxProjectionDist, Math.abs(win.headHeightM * (horizSpeed / -ry)));

    const halfW = win.widthM * 0.48;
    const [tx, tz] = win.tangent;
    const insetX = -win.outwardNormal[0] * 0.03;
    const insetZ = -win.outwardNormal[1] * 0.03;

    const pLeftX = win.x - tx * halfW + insetX;
    const pLeftZ = win.z - tz * halfW + insetZ;
    const pRightX = win.x + tx * halfW + insetX;
    const pRightZ = win.z + tz * halfW + insetZ;

    const nearPts: Array<[number, number]> = [];
    const farPts: Array<[number, number]> = [];
    const steps = 6;
    for (let i = 0; i <= steps; i++) {
      const f = i / steps;
      const px = pLeftX + (pRightX - pLeftX) * f;
      const pz = pLeftZ + (pRightZ - pLeftZ) * f;
      const tWall = castRayToWall(px, pz, ux, uz, farDist);
      const tNear = Math.min(nearDist, tWall);
      const tFar = Math.max(tNear + 0.04, tWall);
      nearPts.push([px + ux * tNear, pz + uz * tNear]);
      farPts.push([px + ux * tFar, pz + uz * tFar]);
    }

    results.push({ windowId: win.id, polygon: [...nearPts, ...farPts.reverse()] });
  }

  return results;
}
