
/**
 * Calculates Euclidean distance between two landmarks.
 */
export function distance(pA, pB) {
  return Math.sqrt((pA.x - pB.x) ** 2 + (pA.y - pB.y) ** 2);
}

export function distanceWithArray(pA, array) {
  return Math.sqrt((pA.x - array[0]) ** 2 + (pA.y - array[1]) ** 2);
}

/**
 * Calculates the Eye Aspect Ratio (EAR) for blink detection.
 */
export function calculateEAR(landmarks, eyeIndices) {
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

/**
 * 
 * @param p1 
 * @param x
 * @param y
 * @returns angle between vector p2p1 and vector (x,y)
 */
export function angleBetween(p1, midx, midy, x, y) {
  // vectors: p2->p1 and p2->p3
  const v1 = {x: p1.x - midx, y: p1.y - midy};
  const v2 = {x: x - midx, y: y - midy};

  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x*v1.x + v1.y*v1.y);
  const mag2 = Math.sqrt(v2.x*v2.x + v2.y*v2.y);

  return Math.acos(dot / (mag1 * mag2)) * (180/Math.PI); // in degrees
}

/**
 * returns midpoint of the points
 * @param p1 
 * @param p2 
 */
export function midpoint(p1, p2){
  return [(p1.x+p2.x)/2, (p1.y+p2.y)/2]
}
