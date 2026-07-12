export const seedPlanStartIso = "2026-04-01T00:00:00";
export const pastCycleKey = "past";
export const clawbackMarker = "历史有效通告抵扣";

export type SourceRejectKind = "manual" | "report";

export function cycleWeekIndex(cycleKey: string) {
  if (cycleKey === pastCycleKey) return -1;
  const match = cycleKey.match(/^week-(\d+)$/);
  return match ? Number(match[1]) : -1;
}

export function isCycleBefore(leftKey: string, rightKey: string) {
  return cycleWeekIndex(leftKey) < cycleWeekIndex(rightKey);
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
      validPublishStatus: "PENDING" as const,
      validCompleteStatus: "PENDING" as const,
      invalidReason: preservedInvalidReason
    };
  }

  const reasonText = buildSourceInvalidReason(sourceStatus, cancelReason);
  const wasApproved = existingReview?.validPublishStatus === "APPROVED";
  const clawbackCycle = weekCycleKeyFromDate(importAt);
  const invalidReason = wasApproved
    ? `${clawbackMarker}@${clawbackCycle}：${reasonText}`
    : reasonText;

  return {
    validPublishStatus: "REJECTED" as const,
    validCompleteStatus: "REJECTED" as const,
    invalidReason
  };
}
