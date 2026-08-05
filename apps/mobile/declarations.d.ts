declare module "*.glb" {
  const value: number;
  export default value;
}

declare module "expo-three" {
  import type { ExpoWebGLRenderingContext } from "expo-gl/build/GLView.types";
  export class Renderer {
    constructor(options: { gl: ExpoWebGLRenderingContext });
    setSize(width: number, height: number): void;
    render(scene: import("three").Scene, camera: import("three").Camera): void;
  }
}
