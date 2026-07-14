import assert from "node:assert/strict";
import test from "node:test";
import {
  composeInvalidReasonWithModelReviews,
  resolveStoredCompleteStatus,
  signedModelReviewDecisions,
  stripSignedModelReviewMarkers
} from "./signer-review";

test("signer review markers preserve visible review notes", () => {
  const decisions = new Map([
    ["id:1458396334277591040", "ACCOUNT_CANCELLED" as const],
    ["id:1344556532315521024", "NON_REAL_PHOTO" as const]
  ]);
  const stored = composeInvalidReasonWithModelReviews("人工复核签约者", decisions);

  assert.equal(stripSignedModelReviewMarkers(stored), "人工复核签约者");
  assert.deepEqual(signedModelReviewDecisions(stored), decisions);
});

test("legacy mismatch markers remain readable after the review upgrade", () => {
  const decisions = signedModelReviewDecisions("[SIGNED_MODEL_MISMATCH:id%3A1458396334277591040]");
  assert.equal(decisions.get("id:1458396334277591040"), "IDENTITY_INCOMPLETE");
});

test("a briefing without signed models always rejects new signing", () => {
  assert.equal(resolveStoredCompleteStatus("APPROVED", "APPROVED", false), "REJECTED");
  assert.equal(resolveStoredCompleteStatus("PENDING", "PENDING", false), "REJECTED");
  assert.equal(resolveStoredCompleteStatus("APPROVED", "APPROVED", true), "APPROVED");
});
