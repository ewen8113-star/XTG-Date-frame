export type SignedModelReviewDecision =
  | "APPROVED"
  | "IDENTITY_INCOMPLETE"
  | "NON_REAL_PHOTO"
  | "DUPLICATE_SIGNER"
  | "ACCOUNT_CANCELLED";

export const signedModelReviewOptions: Array<{ value: SignedModelReviewDecision; label: string }> = [
  { value: "APPROVED", label: "审核通过" },
  { value: "IDENTITY_INCOMPLETE", label: "身份信息不完整" },
  { value: "NON_REAL_PHOTO", label: "非真人照片" },
  { value: "DUPLICATE_SIGNER", label: "签约者重复" },
  { value: "ACCOUNT_CANCELLED", label: "该用户已注销" }
];

export const signedModelReviewLabels = Object.fromEntries(
  signedModelReviewOptions.map((option) => [option.value, option.label])
) as Record<SignedModelReviewDecision, string>;

export function normalizeSignedModelKey(key: string) {
  if (key.includes(":")) return key;
  if (/^\d{12,}$/.test(key)) return `id:${key}`;
  if (/^\d{6,15}$/.test(key)) return `phone:${key}`;
  return `name:${key.toLowerCase()}`;
}

export function signedModelReviewDecisions(invalidReason: string) {
  const decisions = new Map<string, SignedModelReviewDecision>();
  const legacyPattern = /\[SIGNED_MODEL_MISMATCH:([^\]]+)\]/g;
  for (const match of invalidReason.matchAll(legacyPattern)) {
    decisions.set(decodeKey(match[1]), "IDENTITY_INCOMPLETE");
  }
  const pattern = /\[SIGNED_MODEL_REVIEW:([^:\]]+):(APPROVED|IDENTITY_INCOMPLETE|NON_REAL_PHOTO|DUPLICATE_SIGNER|ACCOUNT_CANCELLED)\]/g;
  for (const match of invalidReason.matchAll(pattern)) {
    decisions.set(decodeKey(match[1]), match[2] as SignedModelReviewDecision);
  }
  return decisions;
}

export function stripSignedModelReviewMarkers(invalidReason: string) {
  return invalidReason
    .replace(/\n?\[SIGNED_MODEL_MISMATCH:[^\]]+\]/g, "")
    .replace(/\n?\[SIGNED_MODEL_REVIEW:[^\]]+\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function composeInvalidReasonWithModelReviews(
  invalidReason: string,
  decisions: Map<string, SignedModelReviewDecision>
) {
  const visibleReason = stripSignedModelReviewMarkers(invalidReason);
  const markers = Array.from(decisions.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, decision]) => `[SIGNED_MODEL_REVIEW:${encodeURIComponent(key)}:${decision}]`);
  return [visibleReason, ...markers].filter(Boolean).join("\n");
}

export function isSignedModelReviewIssue(decision?: SignedModelReviewDecision) {
  return Boolean(decision && decision !== "APPROVED");
}

export function resolveStoredCompleteStatus(
  publishStatus: "APPROVED" | "PENDING" | "REJECTED",
  requestedStatus: "APPROVED" | "PENDING" | "REJECTED",
  hasSignedModels: boolean
) {
  if (!hasSignedModels) return "REJECTED" as const;
  if (publishStatus === "APPROVED") return requestedStatus;
  return publishStatus === "REJECTED" ? "REJECTED" as const : "PENDING" as const;
}

function decodeKey(value: string) {
  try {
    return normalizeSignedModelKey(decodeURIComponent(value));
  } catch {
    return normalizeSignedModelKey(value);
  }
}
