export type ReviewStatus = "pending" | "approved" | "rejected";
export type BrokerLevel = "normal" | "seed";
export type IdentityReviewStatus = "none" | "pending" | "retained";

export interface Broker {
  id: string;
  miniProgramUserId: string;
  nickname: string;
  wechatPhone: string;
  boundPhone: string;
  realNameStatus: "未认证" | "认证中" | "已认证" | "认证失败";
  accountStatus: "正常" | "限制发布" | "临时封号" | "永久封号";
  brokerLevel: BrokerLevel;
  seedPhase: number | null;
  seedProgramJoinedAt: string | null;
  seedQualifiedAt: string | null;
  referralUnlocked: boolean;
  identityReviewStatus?: IdentityReviewStatus;
  identityReviewValidPublishCount?: number | null;
  identityReviewValidCompleteCount?: number | null;
  identityReviewTriggeredAt?: string | null;
  identityReviewResolvedAt?: string | null;
  referrerNickname?: string | null;
  referrerBoundAt?: string | null;
  refereeCount?: number;
  latestRefereeBoundAt?: string | null;
  registeredAt: string;
  lastLoginAt: string;
  violationCount: number;
  publishedBriefings: number;
  completedBriefings: number;
  signupTotalTimes: number;
  contractTotalTimes: number;
  signupTotalPeople: number;
  contractTotalPeople: number;
  briefingImportCount?: number;
  lastBriefingImportedAt?: string;
}

export interface BrokerLevelUpdate {
  brokerLevel: BrokerLevel;
  seedPhase: number | null;
  seedProgramJoinedAt: string | null;
  seedQualifiedAt: string | null;
  referralUnlocked: boolean;
}

export interface Briefing {
  id: string;
  jarvisBriefingId: string;
  brokerId: string;
  title: string;
  recruitmentType: string;
  genderRequirement: string;
  recruitCount: number;
  workAddress: string;
  workDate: string;
  workTime: string;
  publishedAt: string;
  finishedAt?: string;
  importedAt?: string;
  firstSignedAt?: string;
  sourceStatus: string;
  cancelReason: string;
  requirementText: string;
  publisherText: string;
  signedModelNames: string[];
  signedModels?: Array<{
    name: string;
    phone: string;
    userId: string;
    sourceStatus: string;
    signedAt: string;
    cancelledAt: string;
    cancelReason: string;
    active: boolean;
  }>;
  signedModelCount: number;
  detailImported: boolean;
  detailUrl: string;
  signupTimes: number;
  contractTimes: number;
  signupPeople: number;
  contractPeople: number;
  validPublishStatus: ReviewStatus;
  validCompleteStatus: ReviewStatus;
  invalidReason: string;
  reviewedAt?: string;
  evidenceCount: number;
  evidenceFiles: EvidenceFile[];
  salaryText: string;
  settlementDispute?: SettlementDispute | null;
}

export interface SettlementDispute {
  id: string;
  originalCycleKey: string;
  deferredCycleKey: string;
  deferPublishReward: boolean;
  deferCompleteReward: boolean;
  evidences: SettlementDisputeEvidence[];
  status: "pending" | "approved" | "rejected";
  reason: string;
  resolution: string;
  submittedBy: string;
  reviewedBy: string;
  submittedAt: string;
  reviewedAt: string;
}

export interface SettlementDisputeEvidence {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  uploadedAt: string;
}

export interface EvidenceFile {
  id: string;
  brokerId: string;
  briefingId: string | null;
  fileName: string;
  fileUrl: string;
  fileType: string;
  matchedAt: string;
  uploadedAt: string;
}

export interface SignerProfile {
  id: string;
  jarvisUserId: string;
  nickname: string;
  phone: string;
  avatarUrl: string;
  userType: string;
  accountStatus: string;
  gender: string;
  age: number | null;
  birthDate: string;
  region: string;
  heightCm: number | null;
  weightKg: number | null;
  bustCm: number | null;
  waistCm: number | null;
  hipCm: number | null;
  shoulderCm: number | null;
  shoeSize: string;
  clothingSize: string;
  tattoo: string;
  hairColor: string;
  hairLength: string;
  languages: string;
  bio: string;
  imageUrls: string[];
  videoUrls: string[];
  registeredAt: string;
  lastLoginAt: string;
  violationCount: number;
  acceptedBriefingCount: number;
  completedBriefingCount: number;
  briefingHistory: Array<{
    id: string;
    title: string;
    publishedAt: string;
    signedAt: string;
    sourceStatus: string;
    brokerNickname: string;
  }>;
}

export interface ReferralNode {
  id: string;
  nickname: string;
  phone: string;
  brokerLevel: BrokerLevel;
  seedPhase: number | null;
  seedProgramJoinedAt: string | null;
  seedQualifiedAt: string | null;
  referralUnlocked: boolean;
  validPublishCount: number;
  validCompleteCount: number;
}

export interface SettlementSummary {
  cycleTitle: string;
  validPublishCount: number;
  validCompleteCount: number;
  referralBaseCount: number;
  referralIncrementCount: number;
  totalAmount: number;
  status: string;
}

export interface ImportBatch {
  id: string;
  title: string;
  importedAt: string;
  source: "JARVIS_CHROME" | "MANUAL" | "EXCEL";
  operatorName: string;
  brokerCount: number;
  briefingCount: number;
  newBrokerCount: number;
  newBriefingCount: number;
  status: "预览" | "已导入" | "失败";
}
