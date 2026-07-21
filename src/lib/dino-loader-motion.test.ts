import assert from "node:assert/strict";
import test from "node:test";
import { dinoLoaderMotion, dinoMovementSpeed } from "./dino-loader-motion";

test("dino loader adds obstacles as the track becomes wider", () => {
  assert.equal(dinoLoaderMotion(600).obstacleCount, 2);
  assert.equal(dinoLoaderMotion(1000).obstacleCount, 3);
  assert.equal(dinoLoaderMotion(1400).obstacleCount, 4);
});

test("obstacles keep the same speed as the moving ground", () => {
  [600, 1000, 1400].forEach((width) => {
    const motion = dinoLoaderMotion(width);
    assert.equal(motion.travelDistance / motion.trackDuration, dinoMovementSpeed);
  });
});

test("each obstacle reaches the dinosaur at a jump peak", () => {
  [600, 1000, 1400].forEach((width) => {
    const motion = dinoLoaderMotion(width);
    const collisionTime = (width / 2 + 58.5) / dinoMovementSpeed;
    motion.delays.forEach((delay, index) => {
      const desiredCollision = motion.jumpDuration * (index + 0.5);
      const phaseAtCollision = (-delay + desiredCollision) % motion.trackDuration;
      assert.ok(Math.abs(phaseAtCollision - collisionTime) < 1e-9);
    });
  });
});
