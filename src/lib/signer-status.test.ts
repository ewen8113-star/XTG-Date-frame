import assert from "node:assert/strict";
import test from "node:test";
import { isActiveSignerRelationship, signerRelationshipStatusLabel } from "./signer-status";

test("an active signed relationship can participate in new-signing review", () => {
  assert.equal(isActiveSignerRelationship({ sourceStatus: "SIGNED" }), true);
  assert.equal(isActiveSignerRelationship({ sourceStatus: "已签约" }), true);
});

test("a cancelled relationship remains history but is not an active signing", () => {
  assert.equal(isActiveSignerRelationship({ sourceStatus: "CANCELLED" }), false);
  assert.equal(isActiveSignerRelationship({ sourceStatus: "已解约" }), false);
  assert.equal(signerRelationshipStatusLabel({ sourceStatus: "CANCELLED" }), "已解约");
});

test("a cancellation timestamp overrides a stale signed status", () => {
  const relationship = { sourceStatus: "已签约", cancelledAt: "2026-05-06T14:20:00+08:00" };
  assert.equal(isActiveSignerRelationship(relationship), false);
  assert.equal(signerRelationshipStatusLabel(relationship), "已解约");
});
