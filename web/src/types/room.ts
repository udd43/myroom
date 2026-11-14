export type CheckGrade = "good" | "normal" | "bad";
export type CameraMode = "orbit" | "dollhouse" | "walkthrough";

export interface ParsedSplatData {
  count: number;
  positions: Float32Array;
  scales: Float32Array;
  colors: Float32Array;
  quats: Float32Array;
}

export interface RoomChecklist {
  sunlight: CheckGrade;
  waterPressure: CheckGrade;
  soundproof: CheckGrade;
  mold: CheckGrade;
  security: CheckGrade;
  parking: CheckGrade;
}

export type PinStage = "viewing" | "move_in" | "move_out" | "defect";

export interface RoomPin {
  id: string;
  label: string;
  category: "check" | "size" | "issue" | "info";
  position: [number, number, number];
  note?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "audio";
  noiseDb?: number;
  stage?: PinStage;
  createdAt?: string;
}

export type TimelineStage = "viewing" | "contract" | "move_in" | "living" | "move_out";

export interface TimelineEvent {
  id: string;
  stage: TimelineStage;
  title: string;
  note?: string;
  mediaUrl?: string;
  mediaType?: "image" | "video" | "audio";
  noiseDb?: number;
  pinIds?: string[];
  createdAt: string;
}

export interface FurnitureItem {
  id: string;
  name: string;
  widthM: number;
  depthM: number;
  heightM: number;
  position: [number, number, number];
  rotationY: number;
  color: string;
}

export interface RoomPlanWall {
  id: string;
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  lengthM: number;
  heightM: number;
}

export interface RoomPlanOpening {
  id: string;
  type: "window" | "door";
  x: number;
  z: number;
  widthM: number;
  rotationDeg: number;
}

export interface RoomPlanObject {
  id: string;
  label: string;
  x: number;
  z: number;
  widthM: number;
  depthM: number;
  heightM: number;
  rotationDeg: number;
}

export interface RoomPlanData {
  source: string;
  widthM: number;
  depthM: number;
  ceilingHeightM: number;
  walls: RoomPlanWall[];
  openings: RoomPlanOpening[];
  objects: RoomPlanObject[];
}

export interface NeighborBuilding {
  id: string;
  name: string;
  xM: number; // +X East relative to target room (m)
  zM: number; // +Z South relative to target room (m)
  widthM: number;
  depthM: number;
  heightM: number;
  floors?: number;
  distanceM?: number;
  source?: "vworld" | "manual";
}

export interface BjdongMeta {
  admCd?: string;
  sigunguCd: string;
  bjdongCd: string;
  bun: string;
  ji: string;
  platGbCd?: string;
}

export interface BuildingRegistryInfo {
  configured: boolean;
  found?: boolean;
  error?: string;
  buildingName?: string;
  mainPurpose?: string;
  etcPurpose?: string;
  structureName?: string;
  approvalDate?: string;
  approvalYear?: number | null;
  groundFloors?: number;
  undergroundFloors?: number;
  householdCount?: number;
  totalAreaSqm?: number;
  floorAreaRatioPct?: number;
  buildingCoveragePct?: number;
  isNeighborhoodLiving?: boolean;
  hasViolation?: boolean;
  warnings?: string[];
}

export interface RentTradeRow {
  kind: string;
  name: string;
  umdNm: string;
  areaSqm: number;
  deposit: number;
  monthlyRent: number;
  equivMonthly: number;
  dealDate: string;
  floor: number;
}

export interface RentMarketInfo {
  configured: boolean;
  sampleCount?: number;
  medianEquivMonthly?: number;
  targetEquivMonthly?: number;
  diffPct?: number;
  verdict?: string;
  conversionRatePct?: number;
  recentTrades?: RentTradeRow[];
  error?: string;
}

export interface NearbyPoiItem {
  name: string;
  categoryDetail: string;
  distanceM: number;
  walkMinutes: number;
  latitude: number;
  longitude: number;
}

export interface NearbyPoiInfo {
  configured: boolean;
  subways: NearbyPoiItem[];
  convenienceStores: NearbyPoiItem[];
  marts: NearbyPoiItem[];
}

export interface CommuteInfo {
  configured: boolean;
  provider: string;
  isEstimate: boolean;
  destLabel: string;
  straightKm: number;
  totalMinutes: number;
  walkMinutes?: number;
  transfers?: number;
  fareWon?: number;
  routeSummary: string;
}

export interface PropertyIntel {
  buildingRegistry?: BuildingRegistryInfo;
  rentMarket?: RentMarketInfo;
  nearbyPoi?: NearbyPoiInfo;
  commute?: CommuteInfo;
  fetchedAt?: string;
}

export interface RoomItem {
  id: string;
  title: string;
  address: string;
  dealType: string;
  deposit: number;
  monthlyRent: number;
  maintenanceFee: number;
  areaPyeong: number;
  roomStructure: string;
  floor: string;
  direction: string;
  latitude?: number;
  longitude?: number;
  locationLabel?: string;
  sunHeadingOffsetDeg?: number;
  MoveInDate?: string;
  rating?: number;
  pros: string;
  cons: string;
  memo: string;
  checklist: RoomChecklist;
  pins: RoomPin[];
  furnitures: FurnitureItem[];
  roomPlan?: RoomPlanData;
  neighborBuildings?: NeighborBuilding[];
  bjdongMeta?: BjdongMeta | null;
  propertyIntel?: PropertyIntel | null;
  timeline?: TimelineEvent[];
  shareToken?: string | null;
  status: "idle" | "queued" | "processing" | "ready" | "error";
  progress: number;
  stageText: string;
  splatUrl: string | null;
  spzUrl?: string | null;
  plyUrl: string | null;
  modelUrl?: string | null;
  usdzUrl?: string | null;
  videoUrl: string | null;
  thumbUrl: string | null;
  splatCount: number;
  engine: string | null;
  createdAt: string;
  updatedAt?: string;
  localSplatPreset?: "yeoksam" | "yeonnam";
}

export type NewRoomMeta = Pick<
  RoomItem,
  | "title"
  | "address"
  | "dealType"
  | "deposit"
  | "monthlyRent"
  | "maintenanceFee"
  | "areaPyeong"
  | "roomStructure"
  | "floor"
  | "direction"
  | "pros"
  | "cons"
  | "memo"
  | "checklist"
  | "latitude"
  | "longitude"
  | "locationLabel"
  | "bjdongMeta"
  | "neighborBuildings"
  | "propertyIntel"
>;

export type UploadKind = "video" | "3d" | "none";
export type Quality = "high" | "fast";

export interface AuthStatusResponse {
  authEnabled: boolean;
  authenticated: boolean;
  maxUploadMb: number;
  r2Enabled: boolean;
}

export interface IntegrationStatusResponse {
  authEnabled: boolean;
  r2Enabled: boolean;
  maxUploadMb: number;
  maxConcurrentJobs: number;
  apis: {
    juso: boolean;
    dataGoKrBuilding: boolean;
    dataGoKrRent: boolean;
    kakaoLocal: boolean;
    transit: boolean;
    odsay: boolean;
    kakaoMobilityTransit: boolean;
    vworld3d: boolean;
  };
}
