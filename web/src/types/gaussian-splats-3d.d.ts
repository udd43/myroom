declare module "@mkkellogg/gaussian-splats-3d" {
  import * as THREE from "three";

  export class DropInViewer extends THREE.Group {
    constructor(options?: Record<string, unknown>);
    addSplatScenes(
      scenes: Array<{ path: string; splatAlphaRemovalThreshold?: number }>,
      showLoadingUI?: boolean
    ): Promise<void>;
    dispose(): Promise<void>;
  }
}

