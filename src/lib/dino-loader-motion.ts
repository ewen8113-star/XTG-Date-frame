export const dinoMovementSpeed = 300;

export function dinoLoaderMotion(trackWidth: number) {
  const width = Math.max(280, Math.round(trackWidth));
  const obstacleCount = Math.max(1, Math.min(4, Math.round(width / 360)));
  const travelDistance = width + 67;
  const trackDuration = travelDistance / dinoMovementSpeed;
  const jumpDuration = trackDuration / obstacleCount;
  const collisionTime = (width / 2 + 58.5) / dinoMovementSpeed;
  const delays = Array.from({ length: obstacleCount }, (_, index) => {
    const desiredCollision = jumpDuration * (index + 0.5);
    const initialPhase = (collisionTime - desiredCollision + trackDuration) % trackDuration;
    return -initialPhase;
  });
  return { delays, jumpDuration, obstacleCount, trackDuration, travelDistance };
}
