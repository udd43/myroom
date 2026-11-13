import { CheckGrade, RoomChecklist } from "@/types/room";

export const CHECKLIST: Array<{ key: keyof RoomChecklist; label: string }> = [
  { key: "sunlight", label: "채광" },
  { key: "waterPressure", label: "수압" },
  { key: "soundproof", label: "방음" },
  { key: "mold", label: "곰팡이·결로" },
  { key: "security", label: "보안" },
  { key: "parking", label: "주차" },
];

export const GRADES: Array<{ value: CheckGrade; label: string; text: string; solid: string }> = [
  { value: "good", label: "좋음", text: "text-ok", solid: "bg-ok text-white border-ok" },
  { value: "normal", label: "보통", text: "text-warn", solid: "bg-warn text-white border-warn" },
  { value: "bad", label: "아쉬움", text: "text-bad", solid: "bg-bad text-white border-bad" },
];

export const DEFAULT_CHECKLIST: RoomChecklist = {
  sunlight: "good",
  waterPressure: "good",
  soundproof: "normal",
  mold: "good",
  security: "good",
  parking: "normal",
};

const SCORE: Record<CheckGrade, number> = { good: 100, normal: 65, bad: 30 };

export function checklistScore(c: RoomChecklist): number {
  const vals = (Object.values(c) as CheckGrade[]).map((g) => SCORE[g] ?? 65);
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

