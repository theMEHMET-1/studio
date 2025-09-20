import { NormalizedLandmark } from '@mediapipe/tasks-vision';

/**
 * Calculates Euclidean distance between two landmarks.
 */
export function distance(pA: NormalizedLandmark, pB: NormalizedLandmark): number {
  return Math.sqrt((pA.x - pB.x) ** 2 + (pA.y - pB.y) ** 2);
}

/**
 * Calculates the Eye Aspect Ratio (EAR) for blink detection.
 */
export function calculateEAR(landmarks: NormalizedLandmark[], eyeIndices: number[]): number {
  const p1 = landmarks[eyeIndices[0]];
  const p2 = landmarks[eyeIndices[1]];
  const p3 = landmarks[eyeIndices[2]];
  const p4 = landmarks[eyeIndices[3]];
  const p5 = landmarks[eyeIndices[4]];
  const p6 = landmarks[eyeIndices[5]];

  const verticalDist = distance(p2, p6) + distance(p3, p5);
  const horizontalDist = distance(p1, p4);

  return verticalDist / (2 * horizontalDist);
}
