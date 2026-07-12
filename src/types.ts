export type ReviewStatus = "pending" | "approved" | "rejected";
export type BrokerLevel = "normal" | "seed";

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
  referralUnlocked: boolean;
  registeredAt: string;
  lastLoginAt: string;
  violationCount: number;
  publishedBriefings: number;
  completedBriefings: number;
  signupTotalTimes: number;
  contractTotalTimes: number;
  signupTotalPeople: number;
  contractTotalPeople: number;
}

export interface BrokerLevelUpdate {
  brokerLevel: BrokerLevel;
  seedPhase: number | null;
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
  importedAt?: string;
  sourceStatus: string;
  cancelReason: string;
  requirementText: string;
  publisherText: string;
  signedModelNames: string[];
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

export interface ReferralNode {
  id: string;
  nickname: string;
  phone: string;
  brokerLevel: BrokerLevel;
  seedPhase: number | null;
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
