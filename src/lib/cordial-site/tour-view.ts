export type TourView = { yaw: number; pitch: number; fov: number };
export const initialTourView: TourView = { yaw: 0, pitch: 0, fov: 75 };
export function changeTourView(current: TourView, delta: Partial<TourView>): TourView {
  const yaw = current.yaw + (delta.yaw ?? 0);
  return {
    yaw: ((yaw % 360) + 360) % 360,
    pitch: Math.max(-80, Math.min(80, current.pitch + (delta.pitch ?? 0))),
    fov: Math.max(35, Math.min(100, current.fov + (delta.fov ?? 0))),
  };
}
