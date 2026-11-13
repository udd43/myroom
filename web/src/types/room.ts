export type CheckGrade = "good" | "normal" | "bad";

export interface RoomChecklist {
  sunlight: CheckGrade;
  waterPressure: CheckGrade;
  soundproof: CheckGrade;
  mold: CheckGrade;
  security: CheckGrade;
  parking: CheckGrade;
}

export interface RoomPin {
  id: string;
  label: string;
  category: "check" | "size" | "info" | "issue";
  position: [number, number, number];
}

export interface FurnitureItem {
  id: string;
  name: string;
  widthM: number;
  depthM: number;
  heightM: number;
  position: [number, number, number];
  rotationY: number; // 라디안 또는 도(degree)
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
  type: "door" | "window";
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

export interface RoomItem {
  id: string;
  title: string;
  address: string;
  dealType: "월세" | "전세" | "매매" | string;
  deposit: number;
  monthlyRent: number;
  maintenanceFee: number;
  areaPyeong: number;
  roomStructure: string;
  floor: string;
  direction: string;
  MoveInDate?: string;
  rating: number;
  pros: string;
  cons: string;
  memo: string;
  checklist: RoomChecklist;
  pins: RoomPin[];
  furnitures?: FurnitureItem[];
  roomPlan?: RoomPlanData | null;
  status: "empty" | "processing" | "ready" | "error";
  progress: number;
  stageText: string;
  splatUrl: string | null;
  plyUrl: string | null;
  modelUrl?: string | null; // LiDAR GLB
  usdzUrl?: string | null; // Apple RoomPlan USDZ (AR Quick Look)
  videoUrl: string | null;
  thumbUrl: string | null;
  splatCount: number;
  engine: string | null;
  createdAt: string;
  localSplatPreset?: "yeoksam" | "yeonnam";
  latitude?: number | null;
  longitude?: number | null;
  locationLabel?: string | null;
  sunHeadingOffsetDeg?: number | null;
}

export interface ParsedSplatData {
  count: number;
  positions: Float32Array;
  scales: Float32Array;
  colors: Float32Array;
  quats: Float32Array; // normalized w, x, y, z (count * 4)
}

export type CameraMode = "orbit" | "dollhouse" | "walkthrough";

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
>;

export type UploadKind = "video" | "3d" | "none";
export type Quality = "high" | "fast";
