import { RoomItem, RoomPlanOpening, RoomPlanWall } from "@/types/room";

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
  keywords: string[];
}

export const KOREA_LOCATION_PRESETS: LocationPreset[] = [
  { id: "seoul-gangnam", label: "서울 강남구 역삼동", lat: 37.5007, lon: 127.0365, keywords: ["역삼", "강남", "삼성", "선릉"] },
  { id: "seoul-mapo", label: "서울 마포구 연남동", lat: 37.5618, lon: 126.9248, keywords: ["연남", "마포", "홍대", "합정", "망원"] },
  { id: "seoul-seocho", label: "서울 서초구", lat: 37.4837, lon: 127.0324, keywords: ["서초", "방배", "교대"] },
  { id: "seoul-songpa", label: "서울 송파구 잠실", lat: 37.5145, lon: 127.1059, keywords: ["송파", "잠실", "가락"] },
  { id: "seoul-seongdong", label: "서울 성동구 성수동", lat: 37.5446, lon: 127.056, keywords: ["성수", "성동", "왕십리", "건대"] },
  { id: "seoul-yongsan", label: "서울 용산구", lat: 37.5326, lon: 126.9905, keywords: ["용산", "이태원", "한남"] },
  { id: "seoul-yeongdeungpo", label: "서울 영등포구 여의도", lat: 37.5219, lon: 126.9244, keywords: ["여의도", "영등포", "당산"] },
  { id: "seoul", label: "서울특별시", lat: 37.5665, lon: 126.978, keywords: ["서울"] },
  { id: "pangyo", label: "경기 성남시 판교·분당", lat: 37.3948, lon: 127.1112, keywords: ["판교", "분당", "성남"] },
  { id: "suwon", label: "경기 수원시", lat: 37.2636, lon: 127.0286, keywords: ["수원", "광교"] },
  { id: "incheon", label: "인천광역시", lat: 37.4563, lon: 126.7052, keywords: ["인천", "송도", "부평"] },
  { id: "chuncheon", label: "강원 춘천시", lat: 37.8813, lon: 127.7298, keywords: ["춘천", "강원"] },
  { id: "daejeon", label: "대전·세종", lat: 36.3504, lon: 127.3845, keywords: ["대전", "세종", "유성"] },
  { id: "daegu", label: "대구광역시", lat: 35.8714, lon: 128.6014, keywords: ["대구", "수성"] },
  { id: "gwangju", label: "광주광역시", lat: 35.1595, lon: 126.8526, keywords: ["광주", "상무"] },
  { id: "busan", label: "부산광역시", lat: 35.1796, lon: 129.0756, keywords: ["부산", "해운대", "서면", "수영"] },
  { id: "jeju", label: "제주시", lat: 33.4996, lon: 126.5312, keywords: ["제주", "서귀포"] },
];

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
  /** 실내에서 창밖을 향하는 수평 단위 법선 벡터 (XZ 평면) */
  outwardNormal: [number, number];
  /** 창문 가로 방향 단위 접선 벡터 (XZ 평면) */
  tangent: [number, number];
  /** 방 바닥 기준 창문 하단/상단 높이 (m) */
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
  /** 방 3D 좌표계에서 태양을 향하는 단위 벡터 (Outward toward Sun) */
  towardSunRoom: [number, number, number];
  /** 방 3D 좌표계에서 빛이 창문을 통해 방 안으로 들어오는 방향 (Incoming Ray) */
  incomingRayRoom: [number, number, number];
  /** 주 창문 정면 기준 입사 코사인 (-1..1, 양수일수록 창을 통해 직사광 유입) */
  windowIncidence: number;
  isDirectSunlight: boolean;
  /** 0..1 직사광 강도 */
  directIntensity: number;
  /** 색온도 보정 RGB [r, g, b] */
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
  directFactor: number; // 0..1
  inView: boolean;
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

/**
 * 매물 향 문자열(남향/남동향/북향 등)을 진북=0°, 동=90°, 남=180°, 서=270° 방위각(도)으로 변환합니다.
 */
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

/**
 * 매물 주소 / 저장된 GPS 좌표 기반으로 위도·경도를 결정합니다.
 */
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

  const text = `${room.address || ""} ${room.title || ""}`;
  for (const preset of KOREA_LOCATION_PRESETS) {
    if (preset.keywords.some((kw) => text.includes(kw))) {
      return { lat: preset.lat, lon: preset.lon, label: preset.label, source: "address" };
    }
  }

  return { lat: 37.5665, lon: 126.978, label: "서울 (기본 기준)", source: "default" };
}

/**
 * 층수 문자열에서 저층 주변 건물 차폐 최소 고도(도)를 추정합니다.
 */
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

/**
 * NOAA 태양 적위/균시차 및 구면천문학(East, North, Up) 기반 태양 고도 및 진방위각 계산.
 * KST(UTC+9, 기준 경선 135°E) 보정을 포함합니다.
 */
export function calculateSolarPosition(
  dayOfYear: number,
  minutesOfDay: number,
  latDeg: number,
  lonDeg: number,
  tzOffsetMinutes = 540
): SolarPosition {
  const degToRad = Math.PI / 180;
  const radToDeg = 180 / Math.PI;

  const hour = minutesOfDay / 60;
  const gamma = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (hour - 12) / 24);

  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(gamma) -
      0.032077 * Math.sin(gamma) -
      0.014615 * Math.cos(2 * gamma) -
      0.040849 * Math.sin(2 * gamma));

  const declRad =
    0.006918 -
    0.399912 * Math.cos(gamma) +
    0.070257 * Math.sin(gamma) -
    0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) -
    0.002697 * Math.cos(3 * gamma) +
    0.00148 * Math.sin(3 * gamma);

  const tst = (((minutesOfDay + eqTime + 4 * lonDeg - tzOffsetMinutes) % 1440) + 1440) % 1440;
  const haRad = (tst / 4 - 180) * degToRad;
  const latRad = latDeg * degToRad;

  const sinDecl = Math.sin(declRad);
  const cosDecl = Math.cos(declRad);
  const sinLat = Math.sin(latRad);
  const cosLat = Math.cos(latRad);
  const cosHa = Math.cos(haRad);
  const sinHa = Math.sin(haRad);

  const east = -cosDecl * sinHa;
  const north = cosLat * sinDecl - sinLat * cosDecl * cosHa;
  const up = Math.max(-1, Math.min(1, sinLat * sinDecl + cosLat * cosDecl * cosHa));

  const altitudeDeg = Math.asin(up) * radToDeg;
  const azimuthDeg = ((Math.atan2(east, north) * radToDeg) % 360 + 360) % 360;

  return {
    altitudeDeg,
    azimuthDeg,
    isDaylight: altitudeDeg > 0.5,
  };
}

/**
 * RoomPlan 창문 개구부 목록으로부터 3D 창문 위치와 실내->실외 법선 벡터를 추출합니다.
 */
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
    // 접선에 수직인 두 법선 후보 중 방 중심(0,0)에서 바깥쪽을 향하는 방향 선택
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
  // 씬 기본 XZ 기준: -Z = 0°, +X = 90°, +Z = 180°, -X = 270°
  return ((Math.atan2(nx, -nz) * 180) / Math.PI + 360) % 360;
}

/**
 * 주어진 날짜·시간·위치·집 향(direction)에 대해 방 3D 공간 내 실제 태양광 상태와 창문 입사량을 계산합니다.
 */
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

  // 가장 넓은 주 창문을 매물의 대표 향 기준으로 정렬
  const primaryWin = windows.reduce((best, cur) => (cur.widthM > best.widthM ? cur : best), windows[0]);
  const primaryWinSceneAzDeg = sceneNormalToAzimuthDeg(
    primaryWin.outwardNormal[0],
    primaryWin.outwardNormal[1]
  );

  const dirStr = opts.overrideDirection ?? room.direction;
  const headingOffset = opts.headingOffsetDeg ?? room.sunHeadingOffsetDeg ?? 0;
  const roomFacingAzimuthDeg =
    ((parseDirectionAzimuthDeg(dirStr) + headingOffset) % 360 + 360) % 360;

  // 세계 나침반 각도 -> 3D/2D 방 평면 좌표 각도 회전
  const deltaDeg = primaryWinSceneAzDeg - roomFacingAzimuthDeg;
  const roomSunAzRad = ((world.azimuthDeg + deltaDeg) * Math.PI) / 180;
  const altRad = (world.altitudeDeg * Math.PI) / 180;

  const cosAlt = Math.cos(altRad);
  const sx = Math.sin(roomSunAzRad) * cosAlt;
  const sy = Math.sin(altRad);
  const sz = -Math.cos(roomSunAzRad) * cosAlt;

  const minObstructionAltDeg =
    opts.considerObstruction === false ? 1.0 : estimateObstructionAltitudeDeg(room.floor);

  // 모든 창문 중 가장 강하게 비치는 입사 코사인 평가
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
  const isDirectSunlight = world.isDaylight && aboveSkyline && windowFacingSun;

  // 저각도 황금빛 -> 정오 중성 백색광 -> 박명/차광 시 푸른 간접광 색온도 계산
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
    // 북향 또는 태양 반대편 창문: 맑지만 직사광 없는 간접 천공광(차분한 쿨톤)
    skyColor = [0.74, 0.84, 0.98];
    skyIntensity = 0.42 + 0.14 * altFactor;
  }

  let statusText: string;
  if (!world.isDaylight) {
    statusText = "일몰 후 (자연광 없음)";
  } else if (!aboveSkyline) {
    statusText = `태양 고도 ${Math.round(world.altitudeDeg)}° (주변 건물·지평선 차폐 < ${Math.round(minObstructionAltDeg)}°)`;
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

/**
 * 매물의 현재 계절·동지·춘추분·하지 기준 하루 일조시간과 시간대별 그래프 데이터를 계산합니다.
 */
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
    });
  }

  let grade: DailySunlightSummary["grade"];
  if (winter.hours >= 4.5 && cur.hours >= 5.0) grade = "최상";
  else if (cur.hours >= 3.5) grade = "양호";
  else if (cur.hours >= 1.5) grade = "보통";
  else grade = "간접광 위주";

  const summaryLine =
    cur.peakHour !== null
      ? `일조 ${cur.hours.toFixed(1)}시간 (피크 ${formatMinutesToHHMM(cur.peakHour)}, 동지 ${winter.hours.toFixed(1)}h)`
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

/**
 * 2D 평면도 & 3D 바닥에서 각 창문을 통해 들어오는 직사광 바닥 투영 다각형을 계산합니다.
 * 내벽(roomPlan.walls) 및 외곽선을 고려해 투사 광선을 클리핑합니다.
 */
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
    // 외곽 박스 클리핑
    if (Math.abs(dx) > 1e-5) {
      const tx = ((dx > 0 ? wMax : -wMax) - ox) / dx;
      if (tx > 0.08 && tx < bestT) bestT = tx;
    }
    if (Math.abs(dz) > 1e-5) {
      const tz = ((dz > 0 ? dMax : -dMax) - oz) / dz;
      if (tz > 0.08 && tz < bestT) bestT = tz;
    }
    // 내부 가벽 등 벽체 교차 클리핑
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

    // 햇빛이 창 하단(sill) ~ 상단(head) 높이에서 바닥(y=0)에 닿는 투사 거리
    const nearDist = Math.min(maxProjectionDist, Math.abs(win.sillHeightM * (horizSpeed / -ry)));
    const farDist = Math.min(maxProjectionDist, Math.abs(win.headHeightM * (horizSpeed / -ry)));

    const halfW = win.widthM * 0.48;
    const [tx, tz] = win.tangent;
    // 창문 바로 안쪽으로 0.02m 이동해 본인 벽에 막히지 않게 처리
    const insetX = -win.outwardNormal[0] * 0.03;
    const insetZ = -win.outwardNormal[1] * 0.03;

    const pLeftX = win.x - tx * halfW + insetX;
    const pLeftZ = win.z - tz * halfW + insetZ;
    const pRightX = win.x + tx * halfW + insetX;
    const pRightZ = win.z + tz * halfW + insetZ;

    // 광선 샘플 5개로 분할해 가벽 모서리도 자연스럽게 따라가도록 다각형 구성
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

    const polygon = [...nearPts, ...farPts.reverse()];
    results.push({ windowId: win.id, polygon });
  }

  return results;
}

