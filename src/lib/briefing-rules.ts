export const seedPlanStartIso = "2026-04-01T00:00:00";
export const pastCycleKey = "past";
export const clawbackMarker = "历史有效通告抵扣";
export const completeClawbackMarker = "历史新增签约抵扣";

export type SourceRejectKind = "manual" | "report";

export function cycleWeekIndex(cycleKey: string) {
  if (cycleKey === pastCycleKey) return -1;
  const match = cycleKey.match(/^week-(\d+)$/);
  return match ? Number(match[1]) : -1;
}

export function isCycleBefore(leftKey: string, rightKey: string) {
  return cycleWeekIndex(leftKey) < cycleWeekIndex(rightKey);
}

export function firstQualificationCycle(
  events: Array<{ cycleKey: string; kind: "publish" | "complete" }>,
  publishTarget = 6,
  completeTarget = 2
) {
  let publishCount = 0;
  let completeCount = 0;
  const grouped = new Map<string, { publish: number; complete: number }>();
  events.forEach((event) => {
    if (cycleWeekIndex(event.cycleKey) < 1) return;
    const counts = grouped.get(event.cycleKey) ?? { publish: 0, complete: 0 };
    counts[event.kind] += 1;
    grouped.set(event.cycleKey, counts);
  });
  const cycleKeys = [...grouped.keys()].sort((left, right) => cycleWeekIndex(left) - cycleWeekIndex(right));
  for (const cycleKey of cycleKeys) {
    const counts = grouped.get(cycleKey)!;
    publishCount += counts.publish;
    completeCount += counts.complete;
    if (publishCount >= publishTarget && completeCount >= completeTarget) return cycleKey;
  }
  return null;
}

export function referralBaseRewardCycle(qualificationCycle: string | null, promotionCycle: string | null) {
  const qualificationIndex = qualificationCycle ? cycleWeekIndex(qualificationCycle) : -1;
  const promotionIndex = promotionCycle ? cycleWeekIndex(promotionCycle) : -1;
  if (qualificationIndex < 1 || promotionIndex < 1) return null;
  return promotionIndex >= qualificationIndex ? promotionCycle : qualificationCycle;
}

export function weekCycleKeyFromDate(value: string | Date) {
  const seedPlanStartDate = new Date(seedPlanStartIso);
  const timestamp = typeof value === "string" ? Date.parse(value.replace(/\//g, "-")) : value.getTime();
  if (!timestamp || Number.isNaN(timestamp) || timestamp < seedPlanStartDate.getTime()) {
    return pastCycleKey;
  }
  const date = new Date(timestamp);
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offsetDays = Math.floor((dayStart.getTime() - seedPlanStartDate.getTime()) / 86400000);
  const weekIndex = Math.floor(offsetDays / 7);
  return `week-${weekIndex + 1}`;
}

export function isPublishedAfterSeedQualification(publishedAt: string, seedQualifiedAt?: string | null) {
  if (seedQualifiedAt === undefined) return true;
  if (!seedQualifiedAt) return false;
  const publishedTimestamp = Date.parse(publishedAt.replace(/\//g, "-"));
  const qualifiedTimestamp = Date.parse(seedQualifiedAt.replace(/\//g, "-"));
  return !Number.isNaN(publishedTimestamp)
    && !Number.isNaN(qualifiedTimestamp)
    && publishedTimestamp >= qualifiedTimestamp;
}

export function seedProgramStartAt(identity: {
  brokerLevel: "normal" | "seed";
  seedPhase: number | null;
  seedProgramJoinedAt: string | null;
  seedQualifiedAt: string | null;
}) {
  if (!identity.seedPhase) return null;
  return identity.seedProgramJoinedAt || (identity.brokerLevel === "seed" ? identity.seedQualifiedAt : null);
}

export function seedSelfRewardStartAt(identity: {
  brokerLevel: "normal" | "seed";
  seedPhase: number | null;
  seedProgramJoinedAt: string | null;
  seedQualifiedAt: string | null;
}) {
  return seedProgramStartAt(identity);
}

export function seedCurrentIncentiveStartAt(identity: {
  brokerLevel: "normal" | "seed";
  seedPhase: number | null;
  seedProgramJoinedAt: string | null;
  seedQualifiedAt: string | null;
}) {
  return seedSelfRewardStartAt(identity) || seedProgramStartAt(identity);
}

export function activityEndAt(workDate: string, workTime: string) {
  const dateMatch = (workDate || "").match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  const timeMatches = Array.from((workTime || "").matchAll(/(?:^|\D)(\d{1,2}):(\d{2})(?=\D|$)/g));
  if (!dateMatch || timeMatches.length < 2) return null;

  const startMatch = timeMatches[0];
  const endMatch = timeMatches[timeMatches.length - 1];
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]);
  const startHour = Number(startMatch[1]);
  const startMinute = Number(startMatch[2]);
  const endHour = Number(endMatch[1]);
  const endMinute = Number(endMatch[2]);
  if ([startHour, endHour].some((hour) => hour > 23) || [startMinute, endMinute].some((minute) => minute > 59)) return null;

  const start = new Date(year, month, day, startHour, startMinute);
  const end = new Date(year, month, day, endHour, endMinute);
  if (end.getTime() <= start.getTime()) end.setDate(end.getDate() + 1);
  return end;
}

export function briefingRewardCycleKey(briefing: {
  publishedAt: string;
  workDate: string;
  workTime: string;
  finishedAt?: string;
}) {
  const rewardAt = activityEndAt(briefing.workDate, briefing.workTime)
    ?? briefing.finishedAt
    ?? briefing.publishedAt;
  return weekCycleKeyFromDate(rewardAt);
}

export function classifySourceReject(sourceStatus: string, cancelReason: string): SourceRejectKind | null {
  const status = (sourceStatus || "").trim();
  const reason = (cancelReason || "").trim();
  const text = `${status} ${reason}`;
  if (/举报成立|违规|黑名单|自动下架|管理员判定/.test(text)) return "report";
  if (/经纪人.*取消|手动取消|自行取消|发布人.*取消/.test(reason)) return "manual";
  return null;
}

export function isSourceInvalidForPublish(sourceStatus: string, cancelReason: string) {
  return classifySourceReject(sourceStatus, cancelReason) !== null;
}

export function buildSourceInvalidReason(sourceStatus: string, cancelReason: string) {
  const kind = classifySourceReject(sourceStatus, cancelReason);
  const reason = (cancelReason || "").trim();
  const status = (sourceStatus || "").trim();
  if (kind === "report") return reason || status || "举报或违规导致通告失效";
  if (kind === "manual") return reason || "经纪人手动取消通告";
  return reason || status || "来源状态异常";
}

export function sourceRejectLabel(sourceStatus: string, cancelReason: string) {
  const kind = classifySourceReject(sourceStatus, cancelReason);
  if (kind === "report") return "举报取消";
  if (kind === "manual") return "手动取消";
  return "来源异常";
}

export function parseClawbackCycle(invalidReason: string) {
  const match = (invalidReason || "").match(/历史有效通告抵扣@(week-\d+)/);
  return match?.[1] ?? "";
}

export function parseCompleteClawbackCycle(invalidReason: string) {
  const match = (invalidReason || "").match(/历史新增签约抵扣@(week-\d+)/);
  return match?.[1] ?? "";
}

export function clearEvidenceDisputeReason(invalidReason: string) {
  if (!(invalidReason || "").includes("凭证异议")) return (invalidReason || "").trim();
  return (invalidReason || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => (
      /^\[SIGNED_MODEL_MISMATCH:[^\]]+\]$/.test(line)
      || /^\[SIGNED_MODEL_REVIEW:[^\]]+\]$/.test(line)
      || line.startsWith(`${clawbackMarker}@`)
      || line.startsWith(`${completeClawbackMarker}@`)
    ))
    .join("\n");
}

function preservedReviewStatus(value?: string) {
  if (value === "APPROVED") return "APPROVED" as const;
  if (value === "REJECTED") return "REJECTED" as const;
  return "PENDING" as const;
}

export function resolveImportReview(
  existingReview: {
    validPublishStatus?: string;
    validCompleteStatus?: string;
    invalidReason?: string | null;
  } | null,
  sourceStatus: string,
  cancelReason: string,
  importAt: Date = new Date()
) {
  const sourceInvalid = isSourceInvalidForPublish(sourceStatus, cancelReason);
  if (!sourceInvalid) {
    const preservedInvalidReason = (existingReview?.invalidReason ?? "").includes("凭证异议")
      ? existingReview?.invalidReason ?? undefined
      : undefined;
    return {
      validPublishStatus: preservedReviewStatus(existingReview?.validPublishStatus),
      validCompleteStatus: preservedReviewStatus(existingReview?.validCompleteStatus),
      invalidReason: preservedInvalidReason
    };
  }

  const reasonText = buildSourceInvalidReason(sourceStatus, cancelReason);
  const existingClawbackCycle = parseClawbackCycle(existingReview?.invalidReason ?? "");
  const existingCompleteClawbackCycle = parseCompleteClawbackCycle(existingReview?.invalidReason ?? "");
  const wasApproved = existingReview?.validPublishStatus === "APPROVED" || Boolean(existingClawbackCycle);
  const wasCompleteApproved = existingReview?.validCompleteStatus === "APPROVED" || Boolean(existingCompleteClawbackCycle);
  const clawbackCycle = existingClawbackCycle || weekCycleKeyFromDate(importAt);
  const completeClawbackCycle = existingCompleteClawbackCycle || clawbackCycle;
  const invalidReason = wasApproved
    ? [
        `${clawbackMarker}@${clawbackCycle}：${reasonText}`,
        wasCompleteApproved ? `${completeClawbackMarker}@${completeClawbackCycle}：${reasonText}` : ""
      ].filter(Boolean).join("\n")
    : reasonText;

  return {
    validPublishStatus: "REJECTED" as const,
    validCompleteStatus: "REJECTED" as const,
    invalidReason
  };
}
