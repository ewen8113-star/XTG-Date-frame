export type SignerRelationshipStatus = {
  sourceStatus?: string | null;
  cancelledAt?: string | Date | null;
};

const inactiveStatusPattern = /CANCELLED|CANCELED|已解约|已取消|已撤销|已撤回|解除签约|取消签约/i;
const activeStatusPattern = /SIGNED|已签约|签约成功|履约中/i;

export function isActiveSignerRelationship(relationship: SignerRelationshipStatus) {
  if (relationship.cancelledAt) return false;
  const sourceStatus = String(relationship.sourceStatus ?? "").trim();
  if (inactiveStatusPattern.test(sourceStatus)) return false;
  return activeStatusPattern.test(sourceStatus);
}

export function signerRelationshipStatusLabel(relationship: SignerRelationshipStatus) {
  const sourceStatus = String(relationship.sourceStatus ?? "").trim();
  if (isActiveSignerRelationship(relationship)) return sourceStatus === "SIGNED" ? "已签约" : sourceStatus || "已签约";
  if (/CANCELLED|CANCELED/i.test(sourceStatus) || relationship.cancelledAt) return "已解约";
  return sourceStatus || "状态未知";
}
