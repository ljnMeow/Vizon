import 'three';

declare module 'three' {
  interface SpotLight {
    /**
     * Exists at runtime in three, but may be missing from some @types/three versions.
     * Used by SpotLightShadow.updateMatrices() to derive shadow camera fov.
     */
    focus: number;
  }
}

