import { RoomItem } from "@/types/room";

export const man = (v: number) => v.toLocaleString("ko-KR");

export const sqm = (pyeong: number) => (pyeong * 3.3058).toFixed(1);

export const monthlyTotal = (r: Pick<RoomItem, "monthlyRent" | "maintenanceFee">) =>
  r.monthlyRent + r.maintenanceFee;

export const effectiveMonthlyCost = (
  r: Pick<RoomItem, "deposit" | "monthlyRent" | "maintenanceFee">,
  annualRatePct = 4.0
) => +(r.deposit * (annualRatePct / 100) / 12 + r.monthlyRent + r.maintenanceFee).toFixed(1);

export const priceLine = (r: RoomItem) =>
  `${man(r.deposit)} / ${r.monthlyRent} + ${r.maintenanceFee}`;

export const ENGINE_LABEL: Record<string, string> = {
  lidar_mesh: "LiDAR 메시 (.glb)",
  apple_roomplan: "Apple RoomPlan",
  colmap_opensplat_3dgs: "OpenSplat 3DGS",
  nerfstudio_splatfacto: "Nerfstudio Splatfacto",
  dust3r_mast3r_3d: "DUSt3R / MASt3R 3D",
  stereo_sfm_volumetric: "Stereo SfM 3D",
  colmap_sfm_volumetric: "COLMAP SfM 3D",
  hybrid_volumetric: "볼류메트릭 스플랫",
  browser_volumetric: "브라우저 스플랫",
  direct_3d_upload: "3D 스캔 파일",
  sample_demo: "샘플 3D 룸",
};

export const engineLabel = (e: string | null) => (e && ENGINE_LABEL[e]) || "3D 공간";
