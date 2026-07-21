import assert from "node:assert/strict";
import test from "node:test";
import {
  cycleKeyRange,
  disputeRewardAmount,
  activityEndAt,
  briefingRewardCycleKey,
  clearEvidenceDisputeReason,
  firstQualificationCycle,
  isPublishedAfterSeedQualification,
  parseClawbackCycle,
  parseCompleteClawbackCycle,
  referralBaseRewardCycle,
  resolveImportReview,
  seedCurrentIncentiveStartAt,
  seedProgramStartAt,
  seedSelfRewardStartAt
} from "./briefing-rules";

test("settlement cycle ranges include weeks without the referrer's own briefings", () => {
  assert.deepEqual(cycleKeyRange("week-1", "week-6"), ["week-1", "week-2", "week-3", "week-4", "week-5", "week-6"]);
});

test("an approved signing dispute pays the deferred two-yuan signing reward", () => {
  assert.equal(disputeRewardAmount({ deferPublishReward: false, deferCompleteReward: true }), 2);
});

test("a direct referee qualifies for the base reward in the first 6 + 2 cycle", () => {
  const events = [
    ...Array.from({ length: 4 }, () => ({ cycleKey: "week-1", kind: "publish" as const })),
    { cycleKey: "week-1", kind: "complete" as const },
    ...Array.from({ length: 2 }, () => ({ cycleKey: "week-2", kind: "publish" as const })),
    { cycleKey: "week-2", kind: "complete" as const },
    ...Array.from({ length: 6 }, () => ({ cycleKey: "week-3", kind: "publish" as const })),
    ...Array.from({ length: 2 }, () => ({ cycleKey: "week-3", kind: "complete" as const }))
  ];

  assert.equal(firstQualificationCycle(events), "week-2");
  assert.equal(firstQualificationCycle(events.filter((event) => event.cycleKey === "week-3")), "week-3");
});

test("the referral base reward waits for promotion and is assigned once", () => {
  assert.equal(referralBaseRewardCycle("week-2", null), null);
  assert.equal(referralBaseRewardCycle("week-2", "week-4"), "week-4");
  assert.equal(referralBaseRewardCycle("week-2", "week-1"), "week-2");
});

test("a referred normal broker earns self rewards from the program start", () => {
  const identity = {
    brokerLevel: "normal" as const,
    seedPhase: 1,
    seedProgramJoinedAt: "2026/07/01 10:00:00",
    seedQualifiedAt: null
  };

  assert.equal(seedProgramStartAt(identity), "2026/07/01 10:00:00");
  assert.equal(seedSelfRewardStartAt(identity), "2026/07/01 10:00:00");
  assert.equal(seedCurrentIncentiveStartAt(identity), "2026/07/01 10:00:00");
});

test("a promoted referred broker keeps the program start as its reward boundary", () => {
  const identity = {
    brokerLevel: "seed" as const,
    seedPhase: 1,
    seedProgramJoinedAt: "2026/07/01 10:00:00",
    seedQualifiedAt: "2026/07/08 16:30:00"
  };

  assert.equal(seedProgramStartAt(identity), "2026/07/01 10:00:00");
  assert.equal(seedSelfRewardStartAt(identity), "2026/07/01 10:00:00");
  assert.equal(seedCurrentIncentiveStartAt(identity), "2026/07/01 10:00:00");
});

test("activity end uses the work date and final time in the work period", () => {
  const end = activityEndAt("2026-06-26", "14:00 ~ 22:00");

  assert.ok(end);
  assert.deepEqual(
    [end.getFullYear(), end.getMonth() + 1, end.getDate(), end.getHours(), end.getMinutes()],
    [2026, 6, 26, 22, 0]
  );
});

test("new signing rewards belong to the activity end cycle instead of the import cycle", () => {
  assert.equal(briefingRewardCycleKey({
    publishedAt: "2026/4/29 11:35:41",
    workDate: "2026-04-29",
    workTime: "11:30 ~ 12:00"
  }), "week-5");
});

test("activity end handles overnight and duplicated work periods", () => {
  const overnightEnd = activityEndAt("2026-06-26", "14:00 ~ 00:00");
  const duplicatedEnd = activityEndAt("2026-06-26", "17:30 ~ 22:00 17:30 ~ 22:00");

  assert.ok(overnightEnd);
  assert.deepEqual(
    [overnightEnd.getFullYear(), overnightEnd.getMonth() + 1, overnightEnd.getDate(), overnightEnd.getHours()],
    [2026, 6, 27, 0]
  );
  assert.equal(duplicatedEnd?.getHours(), 22);
  assert.equal(activityEndAt("-", "14:00 ~ 22:00"), null);
});

test("clearing an evidence dispute preserves structured review markers", () => {
  const reason = [
    "凭证异议：录屏内容待复核",
    "补充说明不应继续保留",
    "[SIGNED_MODEL_MISMATCH:id%3A123456789012]",
    "[SIGNED_MODEL_REVIEW:id%3A1458396334277591040:ACCOUNT_CANCELLED]"
  ].join("\n");

  assert.equal(clearEvidenceDisputeReason(reason), [
    "[SIGNED_MODEL_MISMATCH:id%3A123456789012]",
    "[SIGNED_MODEL_REVIEW:id%3A1458396334277591040:ACCOUNT_CANCELLED]"
  ].join("\n"));
  assert.equal(clearEvidenceDisputeReason("普通审核说明"), "普通审核说明");
});

test("only briefings published from the exact seed qualification time are eligible", () => {
  const qualifiedAt = "2026/06/08 15:30:00";

  assert.equal(isPublishedAfterSeedQualification("2026/06/08 15:29:59", qualifiedAt), false);
  assert.equal(isPublishedAfterSeedQualification("2026/06/08 15:30:00", qualifiedAt), true);
  assert.equal(isPublishedAfterSeedQualification("2026/06/09 09:00:00", qualifiedAt), true);
  assert.equal(isPublishedAfterSeedQualification("2026/06/09 09:00:00", null), false);
});

test("valid imports preserve the manual review result", () => {
  const result = resolveImportReview({
    validPublishStatus: "APPROVED",
    validCompleteStatus: "APPROVED",
    invalidReason: null
  }, "进行中", "", new Date("2026-05-11"));

  assert.equal(result.validPublishStatus, "APPROVED");
  assert.equal(result.validCompleteStatus, "APPROVED");
});

test("a cancelled rewarded briefing records both clawbacks once", () => {
  const cancelled = resolveImportReview({
    validPublishStatus: "APPROVED",
    validCompleteStatus: "APPROVED",
    invalidReason: null
  }, "已取消", "经纪人手动取消", new Date("2026-05-18"));

  assert.equal(parseClawbackCycle(cancelled.invalidReason ?? ""), "week-7");
  assert.equal(parseCompleteClawbackCycle(cancelled.invalidReason ?? ""), "week-7");

  const importedAgain = resolveImportReview(cancelled, "已取消", "经纪人手动取消", new Date("2026-05-25"));
  assert.equal(parseClawbackCycle(importedAgain.invalidReason ?? ""), "week-7");
  assert.equal(parseCompleteClawbackCycle(importedAgain.invalidReason ?? ""), "week-7");
});

test("a pending cancelled briefing does not create a reward clawback", () => {
  const result = resolveImportReview({
    validPublishStatus: "PENDING",
    validCompleteStatus: "PENDING",
    invalidReason: null
  }, "已取消", "经纪人手动取消", new Date("2026-05-18"));

  assert.equal(parseClawbackCycle(result.invalidReason ?? ""), "");
  assert.equal(parseCompleteClawbackCycle(result.invalidReason ?? ""), "");
});
