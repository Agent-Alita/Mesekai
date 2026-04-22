import type { Results } from '@mediapipe/holistic'

/**
 * Module-level mutable store for the latest MediaPipe Holistic result.
 * Written by the Webcam component's onResults callback and read from the
 * Three.js animation loop. Avoids React re-renders on every frame.
 */
export const poseStore: { latest: Results | null } = { latest: null }
