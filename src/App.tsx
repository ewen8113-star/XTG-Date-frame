import {
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  CircleDollarSign,
  Copy,
  Download,
  Database,
  ExternalLink,
  Gauge,
  GitBranch,
  Check,
  Link,
  LayoutDashboard,
  ListChecks,
  Moon,
  ReceiptText,
  Search,
  Sprout,
  ShieldCheck,
  Sun,
  Bell,
  BookOpen,
  Trash2,
  Handshake,
  WalletCards,
  UserRound,
  Users,
  Upload,
  UserCog,
  History,
  RefreshCw,
  Wrench,
  UsersRound,
  XCircle
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { LoginScreen } from "./components/LoginScreen";
import { BrokerFissionTree } from "./components/BrokerFissionTree";
import { DinoLoader } from "./design-components/loaders/DinoLoader";
import { SignerDetailPage } from "./components/SignerDetailPage";
import { SystemGuide } from "./components/SystemGuide";
import { briefings, brokers, importBatches, referralNodes } from "./data/mockData";
import { appVersion, releaseNotes } from "./data/releaseNotes";
import { allSystemPermissions, defaultPermissionsForRole, readAccounts, roleDescriptions, roleLabels, saveAccounts, syncLocalAccounts, updateRemoteAccount, type StoredAccount, type SystemPermission, type SystemRole } from "./lib/auth";
import {
  activityEndAt,
  briefingRewardCycleKey,
  cycleKeyRange,
  cycleWeekIndex,
  disputeRewardAmount,
  firstQualificationCycle,
  isPublishedAfterSeedQualification,
  isSourceInvalidForPublish,
  parseClawbackCycle,
  parseCompleteClawbackCycle,
  referralBaseRewardCycle,
  seedCurrentIncentiveStartAt,
  seedProgramStartAt,
  seedSelfRewardStartAt,
  sourceRejectLabel
} from "./lib/briefing-rules";
import {
  composeInvalidReasonWithModelReviews,
  isSignedModelReviewIssue,
  signedModelReviewDecisions,
  signedModelReviewLabels,
  signedModelReviewOptions,
  stripSignedModelReviewMarkers,
  type SignedModelReviewDecision
} from "./lib/signer-review";
import { exportSettlementReportPdf, type SettlementReportDecision, type SettlementReportRow } from "./lib/settlement-report";
import { signerRelationshipStatusLabel } from "./lib/signer-status";
import type { Briefing, Broker, BrokerLevelUpdate, EvidenceFile, ImportBatch, ReferralNode, ReviewStatus } from "./types";

type SettlementDisputeRecord = {
  id: string;
  briefingId: string;
  jarvisBriefingId: string;
  briefingTitle: string;
  brokerId: string;
  brokerNickname: string;
  brokerPhone: string;
  originalCycleKey: string;
  deferredCycleKey: string;
  deferPublishReward: boolean;
  deferCompleteReward: boolean;
  evidences: Array<{ id: string; fileName: string; fileUrl: string; fileType: string; uploadedAt: string }>;
  status: "pending" | "approved" | "rejected";
  reason: string;
  resolution: string;
  submittedAt: string;
  reviewedAt: string;
};

type PageKey = "dashboard" | "audit" | "stats" | "brokers" | "brokerFission" | "workspace" | "briefingReview" | "signerDetail" | "financePending" | "financePaid" | "financeReport" | "system" | "operationLogs" | "dataBackup" | "dataSync" | "guide";
type WorkspaceTab = "briefings" | "signedModels" | "level" | "network" | "settlement" | "paymentStatus";
type BrokerFilter = "all" | "normal" | "seed";
type SeedPhaseFilter = "all" | "none" | `${number}`;
type FinanceOrderStatus = "pending" | "approved" | "paid" | "rejected";
type SettlementDetailItem = {
  id: string;
  object: string;
  description: string;
  amount: number;
};
type SettlementLineItem = {
  id: string;
  title: string;
  quantity: number;
  rule: string;
  amount: number;
  basis: string;
  details?: SettlementDetailItem[];
};
type FinanceOrder = {
  id: string;
  brokerId: string;
  brokerNickname: string;
  brokerPhone: string;
  cycleKey: string;
  cycleLabel: string;
  amount: number;
  submittedAt: string;
  approvedAt?: string;
  paidAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  status: FinanceOrderStatus;
  rows: SettlementLineItem[];
  carryForward: number;
  weekSubtotal: number;
  settlementTotal: number;
};
type SavedViewState = {
  page?: PageKey;
  selectedBrokerId?: string;
  selectedBriefingId?: string;
  selectedSignerId?: string;
  signerReturnPage?: PageKey;
  workspaceTab?: WorkspaceTab;
  workspaceCycleByBroker?: Record<string, string>;
  financeOrders?: FinanceOrder[];
};
type BrowserViewState = Omit<SavedViewState, "page"> & {
  __xtgViewState: true;
  page: PageKey;
  lastListPage?: PageKey;
};

const navItems = [
  { key: "dashboard" as const, label: "工作总览", icon: LayoutDashboard },
  { key: "audit" as const, label: "审核中心", icon: ListChecks },
  { key: "brokers" as const, label: "经纪人用户", icon: UsersRound },
  { key: "workspace" as const, label: "经纪人工作台", icon: BriefcaseBusiness },
  { key: "stats" as const, label: "数据分析", icon: BarChart3 },
  { key: "system" as const, label: "账户管理", icon: UserCog }
];

const permissionLabels: Record<SystemPermission, { label: string; description: string }> = {
  dashboard: { label: "工作总览", description: "查看运营核心指标和待办概览" },
  audit: { label: "审核中心", description: "处理通告、凭证和签约审核" },
  brokers: { label: "经纪人用户", description: "查看经纪人列表和裂变关系图" },
  workspace: { label: "经纪人工作台", description: "进入经纪人详情、通告和签约者页面" },
  stats: { label: "数据分析", description: "查看业务统计与趋势" },
  finance: { label: "财务管理", description: "查看付款订单和财务报表" },
  operationLogs: { label: "操作日志", description: "查看系统操作记录" },
  dataSync: { label: "数据同步", description: "执行和查看鑫通告数据同步" },
  dataBackup: { label: "数据备份", description: "创建和还原系统备份" }
};

const reviewText: Record<ReviewStatus, string> = {
  pending: "待审核",
  approved: "通过",
  rejected: "不通过"
};

const legacyViewStateKey = "xtg-review-admin-view-state";
const viewStateKey = "xtg-review-admin-view-state-test-v2";
const pageKeys: PageKey[] = ["dashboard", "audit", "stats", "brokers", "brokerFission", "workspace", "briefingReview", "signerDetail", "financePending", "financePaid", "financeReport", "system", "operationLogs", "dataBackup", "dataSync", "guide"];
const workspaceTabs: WorkspaceTab[] = ["briefings", "signedModels", "level", "network", "settlement", "paymentStatus"];
const seedPlanStartDate = new Date("2026-04-01T00:00:00");
const pastCycleKey = "past";
const releaseReadStoragePrefix = "xtg-read-release-notes";

function releaseReadStorageKey(accountName: string) {
  return `${releaseReadStoragePrefix}:${accountName || "anonymous"}`;
}

function loadReadReleaseNoteIds(accountName: string) {
  try {
    const stored = JSON.parse(window.localStorage.getItem(releaseReadStorageKey(accountName)) ?? "[]");
    return Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function money(value: number) {
  return `¥${value.toLocaleString("zh-CN")}`;
}

function dateValue(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value.replace(/\//g, "-"));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function dateTimeInputValue(value?: string | null) {
  if (value === null) return "";
  const date = value ? new Date(value.replace(/\//g, "-")) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("无法读取头像文件"));
    reader.onerror = () => reject(new Error("无法读取头像文件"));
    reader.readAsDataURL(file);
  });
}

function AccountAvatar({ account, fallback = "" }: { account?: StoredAccount; fallback?: string }) {
  const initial = (account?.account ?? fallback).slice(0, 1).toUpperCase();
  return (
    <span className="admin-avatar">
      {initial}
      {account?.avatarUrl ? (
        <img
          alt=""
          key={account.avatarUrl}
          onError={(event) => { event.currentTarget.style.display = "none"; }}
          src={account.avatarUrl}
        />
      ) : null}
    </span>
  );
}

function cleanRequirement(value: string) {
  return (value || "-").split("报名列表")[0].split("签约列表")[0].replace(/^要求描述\s*/, "").trim() || "-";
}

function cleanSalary(value: string) {
  return (value || "-").replace(/\s*工作要求\s*$/g, "").trim() || "-";
}

function splitDetailValues(value: string) {
  const text = (value || "").trim();
  if (!text || text === "-") return ["-"];
  return text.split(/\s+(?=\d{2}:\d{2}\s*~)|\s+(?=20\d{2}[-/]\d{2}[-/]\d{2})/).filter(Boolean);
}

function readBetweenLabels(text: string, label: string, labels: string[]) {
  const start = text.indexOf(label);
  if (start < 0) return "-";
  const body = text.slice(start + label.length).trim();
  const nextIndex = labels
    .filter((item) => item !== label)
    .map((item) => body.indexOf(item))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  return (nextIndex === undefined ? body : body.slice(0, nextIndex)).replace(/[；;，,]\s*$/g, "").trim() || "-";
}

function salaryDetailItems(value: string) {
  const text = cleanSalary(value).replace(/\s+/g, " ");
  const labels = ["基础薪资", "连档薪资", "加班费", "报酬说明"];
  const items = labels.map((label) => ({ label, value: readBetweenLabels(text, label, labels) })).filter((item) => item.value !== "-");
  return items.length ? items : [{ label: "薪资信息", value: text || "-" }];
}

const requirementLabels = ["要求描述", "年龄", "身高", "体重", "纹身", "头发颜色", "头发长度", "胸围", "腰围", "臀围", "肩宽", "鞋码", "衣服尺码", "语言"];

function requirementValueMap(value: string) {
  const text = (value || "-").split("报名列表")[0].split("签约列表")[0].replace(/[；;]/g, " ").replace(/\s+/g, " ").trim();
  return Object.fromEntries(requirementLabels.map((label) => [label, readBetweenLabels(text, label, requirementLabels)]));
}

function weekCycleForDate(value: string | Date) {
  const timestamp = dateValue(value);
  if (!timestamp || timestamp < seedPlanStartDate.getTime()) {
    return {
      key: pastCycleKey,
      label: "往期通告",
      shortLabel: "往期通告",
      start: null as Date | null,
      end: null as Date | null
    };
  }
  const date = new Date(timestamp);
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const offsetDays = Math.floor((dayStart.getTime() - seedPlanStartDate.getTime()) / 86400000);
  const weekIndex = Math.floor(offsetDays / 7);
  const start = new Date(seedPlanStartDate.getTime() + weekIndex * 7 * 86400000);
  const end = new Date(start.getTime() + 6 * 86400000);
  const format = (target: Date) => target.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
  const monthWeekNumber = Math.floor((start.getDate() - 1) / 7) + 1;
  const monthWeekText = ["一", "二", "三", "四", "五"][monthWeekNumber - 1] ?? String(monthWeekNumber);
  const monthCycleLabel = `${start.getFullYear()}年${start.getMonth() + 1}月第${monthWeekText}周`;
  return {
    key: `week-${weekIndex + 1}`,
    label: `${monthCycleLabel}（${format(start)} - ${format(end)}）`,
    shortLabel: monthCycleLabel,
    start,
    end
  };
}

function weekCycleForKey(cycleKey: string) {
  const cycleIndex = cycleWeekIndex(cycleKey);
  if (cycleIndex < 1) return weekCycleForDate("");
  return weekCycleForDate(new Date(seedPlanStartDate.getTime() + (cycleIndex - 1) * 7 * 86400000));
}

function isBriefingSeedEligible(briefing: Briefing, seedQualifiedAt?: string | null) {
  return isPublishedAfterSeedQualification(briefing.publishedAt, seedQualifiedAt);
}

function brokerProgramStartAt(broker: Pick<Broker, "brokerLevel" | "seedPhase" | "seedProgramJoinedAt" | "seedQualifiedAt">) {
  return seedProgramStartAt(broker);
}

function brokerSelfRewardStartAt(broker: Pick<Broker, "brokerLevel" | "seedPhase" | "seedProgramJoinedAt" | "seedQualifiedAt">) {
  return seedSelfRewardStartAt(broker);
}

function brokerCurrentIncentiveStartAt(broker: Pick<Broker, "brokerLevel" | "seedPhase" | "seedProgramJoinedAt" | "seedQualifiedAt">) {
  return seedCurrentIncentiveStartAt(broker);
}

function brokerDisplayName(broker: Pick<Broker, "nickname" | "boundPhone">) {
  const withoutPhone = broker.boundPhone ? broker.nickname.replace(broker.boundPhone, "") : broker.nickname;
  return withoutPhone.replace(/[\s·•]+$/g, "").trim() || broker.nickname;
}

function briefingCycleForEligibility(briefing: Briefing, seedQualifiedAt?: string | null) {
  return isBriefingSeedEligible(briefing, seedQualifiedAt) ? weekCycleForDate(briefing.publishedAt) : weekCycleForDate("");
}

function buildWeekCycleOptions(briefings: Briefing[], seedQualifiedAt?: string | null) {
  const cycleMap = new Map<string, ReturnType<typeof weekCycleForDate>>();
  const addCycleByIndex = (index: number) => {
    if (index < 1) return;
    const cycleDate = new Date(seedPlanStartDate.getTime() + (index - 1) * 7 * 86400000);
    const cycle = weekCycleForDate(cycleDate.toISOString());
    cycleMap.set(cycle.key, cycle);
  };
  briefings.forEach((briefing) => {
    const startCycle = briefingCycleForEligibility(briefing, seedQualifiedAt);
    if (startCycle.key === pastCycleKey) {
      cycleMap.set(startCycle.key, startCycle);
      return;
    }
    const endCycle = briefingLifecycleEndCycle(briefing);
    for (let index = cycleWeekIndex(startCycle.key); index <= cycleWeekIndex(endCycle.key); index += 1) {
      addCycleByIndex(index);
    }
    addCycleByIndex(cycleWeekIndex(briefingBonusCycleKey(briefing)));
    const deferredCycleKey = briefing.settlementDispute?.deferredCycleKey;
    if (briefing.settlementDispute?.status === "approved" && deferredCycleKey) {
      addCycleByIndex(cycleWeekIndex(deferredCycleKey));
    }
  });
  const incentiveStartCycle = seedQualifiedAt ? weekCycleForDate(seedQualifiedAt) : null;
  const latestCycleIndex = Math.max(
    ...Array.from(cycleMap.keys()).map(cycleWeekIndex),
    incentiveStartCycle ? cycleWeekIndex(incentiveStartCycle.key) : -1
  );
  if (incentiveStartCycle && incentiveStartCycle.key !== pastCycleKey) {
    cycleKeyRange(incentiveStartCycle.key, `week-${latestCycleIndex}`).forEach((key) => addCycleByIndex(cycleWeekIndex(key)));
  }
  return Array.from(cycleMap.values()).sort((left, right) => {
    if (left.key === pastCycleKey) return 1;
    if (right.key === pastCycleKey) return -1;
    return (right.start?.getTime() ?? 0) - (left.start?.getTime() ?? 0);
  });
}

function latestWeekCycleKey(briefings: Briefing[], seedQualifiedAt?: string | null) {
  return buildWeekCycleOptions(briefings, seedQualifiedAt).find((cycle) => cycle.key !== pastCycleKey)?.key ?? pastCycleKey;
}

function previousWeekCycleKey(cycleKey: string) {
  const match = cycleKey.match(/^week-(\d+)$/);
  if (!match) return "";
  const weekNumber = Number(match[1]);
  return weekNumber > 1 ? `week-${weekNumber - 1}` : pastCycleKey;
}

function cycleBriefings(briefings: Briefing[], cycleKey: string, seedQualifiedAt?: string | null) {
  if (cycleKey === pastCycleKey) {
    return briefings.filter((briefing) => briefingCycleForEligibility(briefing, seedQualifiedAt).key === pastCycleKey);
  }
  const targetIndex = cycleWeekIndex(cycleKey);
  return briefings.filter((briefing) => {
    const startIndex = cycleWeekIndex(briefingCycleForEligibility(briefing, seedQualifiedAt).key);
    const endIndex = cycleWeekIndex(briefingLifecycleEndCycle(briefing).key);
    return startIndex >= 0 && targetIndex >= startIndex && targetIndex <= endIndex;
  });
}

function briefingLifecycleEndCycle(briefing: Briefing) {
  if (sourceRejected(briefing)) {
    const clawbackCycle = parseClawbackCycle(briefing.invalidReason);
    if (clawbackCycle) {
      const clawbackIndex = cycleWeekIndex(clawbackCycle);
      const clawbackDate = new Date(seedPlanStartDate.getTime() + (clawbackIndex - 1) * 7 * 86400000);
      return weekCycleForDate(clawbackDate.toISOString());
    }
    return weekCycleForDate(briefing.importedAt || briefing.finishedAt || briefing.publishedAt);
  }
  if (/已结束|已完成|已关闭|已取消|已下架/.test(briefing.sourceStatus)) {
    return weekCycleForDate(activityEndAt(briefing.workDate, briefing.workTime) ?? (briefing.finishedAt || briefing.publishedAt));
  }
  return weekCycleForDate(new Date().toISOString());
}

function briefingBonusCycleKey(briefing: Briefing) {
  return briefingRewardCycleKey(briefing);
}

function deltaText(current: number, previous: number) {
  const diff = current - previous;
  if (diff === 0) return "较上周持平";
  return `较上周 ${diff > 0 ? "+" : ""}${diff}`;
}

function parseSignedModelName(value: string) {
  const text = value.trim();
  const modelId = text.match(/#(\d{12,})/)?.[1] ?? "";
  const textWithoutIds = text.replace(/#\d{12,}/g, "");
  const phone = textWithoutIds.match(/\d{6,15}/)?.[0] ?? "";
  const name = text
    .replace(/#\d{12,}/g, "")
    .replace(/[（(]?\d{6,15}[）)]?/g, "")
    .replace(/[·\s]+$/g, "")
    .trim() || "未命名模特";
  const key = modelId ? `id:${modelId}` : phone ? `phone:${phone}` : `name:${name.toLowerCase()}`;
  return {
    key,
    name,
    phone,
    userId: modelId,
    label: modelId ? `${name} · #${modelId}` : phone ? `${name} · ${phone}` : name
  };
}

function hasMatchedEvidence(briefing: Briefing) {
  return briefing.evidenceCount > 0 || briefing.evidenceFiles.some((evidence) => evidence.briefingId === briefing.id);
}

function sourceRejected(briefing: Briefing) {
  return isSourceInvalidForPublish(briefing.sourceStatus, briefing.cancelReason);
}

function hasEvidenceDispute(briefing: Briefing) {
  return briefing.invalidReason.includes("凭证异议");
}

function effectivePublishStatus(briefing: Briefing): ReviewStatus {
  if (sourceRejected(briefing)) return "rejected";
  if (hasEvidenceDispute(briefing)) return "pending";
  if (briefing.validPublishStatus === "approved" && !briefing.reviewedAt) return "pending";
  if (briefing.validPublishStatus === "rejected") return "rejected";
  if (briefing.validPublishStatus === "approved") return "approved";
  return "pending";
}

const dailyPublishRewardLimit = 3;
const weeklyPublishRewardLimit = 12;

function calendarDayKey(value: string) {
  const timestamp = dateValue(value);
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function buildPublishCapState(briefings: Briefing[]) {
  const eligibleApprovedIds = new Set<string>();
  const cappedIds = new Set<string>();
  const dailyCounts = new Map<string, number>();
  const weeklyCounts = new Map<string, number>();

  [...briefings]
    .sort((left, right) => dateValue(left.publishedAt) - dateValue(right.publishedAt) || left.id.localeCompare(right.id))
    .forEach((briefing) => {
      const status = effectivePublishStatus(briefing);
      const wasHistoricallyApproved = Boolean(parseClawbackCycle(briefing.invalidReason));
      if (status === "rejected" && !wasHistoricallyApproved) return;
      const dayKey = `${briefing.brokerId}:${calendarDayKey(briefing.publishedAt)}`;
      const weekKey = `${briefing.brokerId}:${weekCycleForDate(briefing.publishedAt).key}`;
      const dailyCount = dailyCounts.get(dayKey) ?? 0;
      const weeklyCount = weeklyCounts.get(weekKey) ?? 0;
      const capped = dailyCount >= dailyPublishRewardLimit || weeklyCount >= weeklyPublishRewardLimit;
      if (capped) {
        cappedIds.add(briefing.id);
        return;
      }
      if (status === "approved" || wasHistoricallyApproved) {
        eligibleApprovedIds.add(briefing.id);
        dailyCounts.set(dayKey, dailyCount + 1);
        weeklyCounts.set(weekKey, weeklyCount + 1);
      }
    });

  return { eligibleApprovedIds, cappedIds };
}

function cappedPublishStatus(briefing: Briefing, briefings: Briefing[]): ReviewStatus {
  const status = effectivePublishStatus(briefing);
  if (status !== "approved") return status;
  return buildPublishCapState(briefings).eligibleApprovedIds.has(briefing.id) ? "approved" : "pending";
}

function needsAdminEvidenceReview(briefing: Briefing) {
  if (sourceRejected(briefing)) return false;
  if (hasEvidenceDispute(briefing)) return true;
  return effectivePublishStatus(briefing) === "pending";
}

function manualReviewStatus(briefing: Briefing): { status: ReviewStatus; label: string } {
  if (sourceRejected(briefing)) {
    return { status: "pending", label: "无需审核" };
  }
  const publishStatus = effectivePublishStatus(briefing);
  const completeStatus = briefing.validCompleteStatus;
  if (publishStatus !== "pending" && completeStatus !== "pending" && briefing.reviewedAt) {
    return { status: "approved", label: "人工已审核" };
  }
  return { status: "pending", label: "人工未审核" };
}

function isClawbackBriefing(briefing: Briefing, settlementCycleKey: string) {
  return parseClawbackCycle(briefing.invalidReason) === settlementCycleKey;
}

function buildClawbackBriefings(briefings: Briefing[], settlementCycleKey?: string) {
  if (!settlementCycleKey) return [];
  return briefings.filter((briefing) => isClawbackBriefing(briefing, settlementCycleKey));
}

function buildCompleteClawbackBriefings(briefings: Briefing[], settlementCycleKey?: string) {
  if (!settlementCycleKey) return [];
  return briefings.filter((briefing) => parseCompleteClawbackCycle(briefing.invalidReason) === settlementCycleKey);
}

function publishReviewLabel(briefing: Briefing) {
  if (sourceRejected(briefing)) return sourceRejectLabel(briefing.sourceStatus, briefing.cancelReason);
  return undefined;
}

function cappedPublishLabel(briefing: Briefing, briefings: Briefing[]) {
  if (buildPublishCapState(briefings).cappedIds.has(briefing.id)) return "候选待定";
  return publishReviewLabel(briefing);
}

function signingStatusLabel(row: Pick<RewardCompleteRow, "briefing" | "newModels" | "bonusEligible" | "publishStatus">) {
  if (row.publishStatus === "rejected") return "不通过";
  if (row.publishStatus === "pending") return "候选待定";
  if (row.briefing.contractPeople > 0 && row.newModels.length === 0) return "签约者重复";
  return reviewText[effectiveCompleteStatus(row)];
}

function signingFailureReason(row: RewardCompleteRow) {
  const reviewIssues = Array.from(signedModelReviewDecisions(row.briefing.invalidReason).values())
    .filter(isSignedModelReviewIssue)
    .map((decision) => signedModelReviewLabels[decision]);
  if (reviewIssues.length) return [...new Set(reviewIssues)].join("、");
  if (row.briefing.contractPeople > 0 && row.newModels.length === 0) return "签约者均为历史重复";
  return stripSignedModelReviewMarkers(row.briefing.invalidReason)
    || row.briefing.cancelReason
    || (row.publishStatus === "rejected" ? "有效通告不通过" : "新增签约人工审核不通过");
}

function effectiveCompleteStatus(row: Pick<RewardCompleteRow, "briefing" | "newModels" | "bonusEligible"> & { publishStatus?: ReviewStatus }): ReviewStatus {
  const publishStatus = row.publishStatus ?? effectivePublishStatus(row.briefing);
  if (publishStatus === "rejected") return "rejected";
  if (publishStatus === "pending") return "pending";
  if (row.briefing.validCompleteStatus === "rejected") return "rejected";
  if (row.briefing.contractPeople > 0 && row.newModels.length === 0) return "rejected";
  if (row.briefing.validCompleteStatus === "approved" && !row.briefing.reviewedAt) return "pending";
  if (row.briefing.validCompleteStatus === "approved") return "approved";
  return "pending";
}

type RewardCompleteRow = {
  briefing: Briefing;
  newModels: ReturnType<typeof parseSignedModelName>[];
  repeatedModels: ReturnType<typeof parseSignedModelName>[];
  publishApproved: boolean;
  publishStatus: ReviewStatus;
  completeApproved: boolean;
  bonusEligible: boolean;
  reason: string;
};

function signedModelsForBriefing(briefing: Briefing) {
  const uniqueItems = new Map<string, ReturnType<typeof parseSignedModelName>>();
  const names = briefing.signedModels?.length
    ? briefing.signedModels.map((model) => `${model.name}${model.phone ? `（${model.phone}）` : ""}${model.userId ? ` · #${model.userId}` : ""}`)
    : briefing.signedModelNames;
  names.map(parseSignedModelName).forEach((model) => uniqueItems.set(model.key, model));
  return Array.from(uniqueItems.values());
}

function activeSignedModelsForBriefing(briefing: Briefing) {
  if (!briefing.signedModels?.length) return signedModelsForBriefing(briefing);
  const activeKeys = new Set(
    briefing.signedModels
      .filter((model) => model.active)
      .map((model) => parseSignedModelName(`${model.name}${model.phone ? `（${model.phone}）` : ""}${model.userId ? ` · #${model.userId}` : ""}`).key)
  );
  return signedModelsForBriefing(briefing).filter((model) => activeKeys.has(model.key));
}

function buildSignedModelRows(briefings: Briefing[]) {
  const rows = new Map<string, {
    key: string;
    name: string;
    phone: string;
    userId: string;
    firstBriefingTitle: string;
    firstBriefingAt: string;
    lastBriefingTitle: string;
    lastBriefingAt: string;
    briefingCount: number;
  }>();

  [...briefings]
    .sort((left, right) => dateValue(left.publishedAt) - dateValue(right.publishedAt))
    .forEach((briefing) => {
      signedModelsForBriefing(briefing).forEach((model) => {
        const current = rows.get(model.key);
        if (!current) {
          rows.set(model.key, {
            key: model.key,
            name: model.name,
            phone: model.phone,
            userId: model.userId,
            firstBriefingTitle: briefing.title,
            firstBriefingAt: briefing.publishedAt,
            lastBriefingTitle: briefing.title,
            lastBriefingAt: briefing.publishedAt,
            briefingCount: 1
          });
          return;
        }
        current.lastBriefingTitle = briefing.title;
        current.lastBriefingAt = briefing.publishedAt;
        current.briefingCount += 1;
      });
    });

  return Array.from(rows.values()).sort((left, right) => dateValue(right.lastBriefingAt) - dateValue(left.lastBriefingAt));
}

function importDayKey(value: string) {
  const timestamp = dateValue(value);
  if (!timestamp) return "";
  return new Date(timestamp).toISOString().slice(0, 10);
}

function buildSignedModelSummary(briefings: Briefing[]) {
  const signedRows = buildSignedModelRows(briefings);
  const importDays = briefings
    .map((briefing) => importDayKey(briefing.importedAt || briefing.publishedAt))
    .filter(Boolean)
    .sort();
  const latestImportDay = importDays[importDays.length - 1] ?? "";
  const latestImportModels = new Set<string>();
  const previousModels = new Set<string>();

  briefings.forEach((briefing) => {
    const targetSet = importDayKey(briefing.importedAt || briefing.publishedAt) === latestImportDay ? latestImportModels : previousModels;
    signedModelsForBriefing(briefing).forEach((model) => targetSet.add(model.key));
  });

  const newLatestModels = signedRows.filter((model) => latestImportModels.has(model.key) && !previousModels.has(model.key));
  return {
    signedRows,
    totalSignedModelCount: signedRows.length,
    signingRecordCount: briefings.reduce((total, item) => total + signedModelsForBriefing(item).length, 0),
    latestImportDay,
    newLatestModels
  };
}

function buildRewardProfile(
  briefings: Briefing[],
  cycleKey?: string,
  seedQualifiedAt?: string | null,
  signedHistoryStartAt: string | null | undefined = seedQualifiedAt
) {
  const orderedBriefings = [...briefings].sort((left, right) => dateValue(left.publishedAt) - dateValue(right.publishedAt));
  const eligibleBriefings = orderedBriefings.filter((briefing) => isBriefingSeedEligible(briefing, seedQualifiedAt));
  const eligibleIds = new Set(eligibleBriefings.map((briefing) => briefing.id));
  const historyBriefings = orderedBriefings.filter((briefing) => isBriefingSeedEligible(briefing, signedHistoryStartAt));
  const publishCapState = buildPublishCapState(eligibleBriefings);
  const signedHistory = new Set<string>();
  const completeRows: RewardCompleteRow[] = [];
  historyBriefings.forEach((briefing) => {
    const historicalModels = signedModelsForBriefing(briefing);
    const activeModels = activeSignedModelsForBriefing(briefing);
    const newModels = activeModels.filter((model) => !signedHistory.has(model.key));
    const repeatedModels = activeModels.filter((model) => signedHistory.has(model.key));
    if (!eligibleIds.has(briefing.id)) {
      historicalModels.forEach((model) => signedHistory.add(model.key));
      return;
    }
    const rawPublishStatus = effectivePublishStatus(briefing);
    const wasHistoricallyApproved = Boolean(parseClawbackCycle(briefing.invalidReason));
    const wasCompleteApproved = Boolean(parseCompleteClawbackCycle(briefing.invalidReason));
    const historicalPublishStatus = wasHistoricallyApproved ? "approved" : rawPublishStatus;
    const publishStatus = historicalPublishStatus === "approved" && !publishCapState.eligibleApprovedIds.has(briefing.id) ? "pending" : historicalPublishStatus;
    const publishApproved = publishStatus === "approved";
    const completeApproved = wasCompleteApproved || (briefing.validCompleteStatus === "approved" && Boolean(briefing.reviewedAt));
    const bonusEligible = publishApproved && completeApproved && newModels.length > 0;
    historicalModels.forEach((model) => signedHistory.add(model.key));
    completeRows.push({
      briefing,
      newModels,
      repeatedModels,
      publishApproved,
      publishStatus,
      completeApproved,
      bonusEligible,
      reason: bonusEligible
        ? `新增 ${newModels.length} 人`
        : publishApproved && completeApproved
          ? "签约人员均为历史已合作人员"
          : "有效通告/新增签约待人工审核"
    });
  });
  const scopedBriefings = cycleKey ? cycleBriefings(eligibleBriefings, cycleKey, seedQualifiedAt) : eligibleBriefings;
  const scopedIds = new Set(scopedBriefings.map((briefing) => briefing.id));
  const validPublishBriefings = eligibleBriefings.filter((briefing) => (
    (!cycleKey || weekCycleForDate(briefing.publishedAt).key === cycleKey)
    && publishCapState.eligibleApprovedIds.has(briefing.id)
  ));
  const clawbackBriefings = buildClawbackBriefings(eligibleBriefings, cycleKey);
  const completeClawbackBriefings = buildCompleteClawbackBriefings(eligibleBriefings, cycleKey);
  const bonusCompleteRows = completeRows.filter((row) => (
    row.bonusEligible && (!cycleKey || briefingBonusCycleKey(row.briefing) === cycleKey)
  ));
  return {
    validPublishCount: validPublishBriefings.length,
    bonusCompleteCount: bonusCompleteRows.length,
    validPublishBriefings,
    clawbackBriefings,
    clawbackCount: clawbackBriefings.length,
    completeClawbackBriefings,
    completeClawbackCount: completeClawbackBriefings.length,
    completeRows: completeRows.filter((row) => scopedIds.has(row.briefing.id)),
    bonusCompleteRows,
    signedModelRows: buildSignedModelRows(eligibleBriefings)
  };
}

function buildReviewSummary(
  briefings: Briefing[],
  rewardProfile: ReturnType<typeof buildRewardProfile> = buildRewardProfile(briefings)
) {
  const completeRows = rewardProfile.completeRows;
  const pendingPublishCount = completeRows.filter((row) => row.publishStatus === "pending").length;
  const pendingCompleteCount = completeRows.filter((row) => effectiveCompleteStatus(row) === "pending").length;
  const rejectedPublishCount = briefings.filter((briefing) => effectivePublishStatus(briefing) === "rejected").length;
  const rejectedCompleteCount = completeRows.filter((row) => effectiveCompleteStatus(row) === "rejected").length;
  const manuallyReviewableBriefings = briefings.filter((briefing) => !sourceRejected(briefing));
  const manualReviewedCount = manuallyReviewableBriefings.filter((briefing) => manualReviewStatus(briefing).label === "人工已审核").length;
  const manualPendingCount = manuallyReviewableBriefings.length - manualReviewedCount;
  const missingDetailCount = briefings.filter((item) => !item.detailImported).length;
  const missingEvidenceCount = briefings.filter((item) => !hasMatchedEvidence(item) && effectivePublishStatus(item) === "pending").length;
  return {
    rewardProfile,
    pendingPublishCount,
    pendingCompleteCount,
    rejectedPublishCount,
    rejectedCompleteCount,
    pendingAnyCount: briefings.filter((briefing) => {
      const completeRow = completeRows.find((row) => row.briefing.id === briefing.id);
      return effectivePublishStatus(briefing) === "pending" || (completeRow ? effectiveCompleteStatus(completeRow) === "pending" : false);
    }).length,
    rejectedAnyCount: briefings.filter((briefing) => {
      const completeRow = completeRows.find((row) => row.briefing.id === briefing.id);
      return effectivePublishStatus(briefing) === "rejected" || (completeRow ? effectiveCompleteStatus(completeRow) === "rejected" : false);
    }).length,
    manualReviewedCount,
    manualPendingCount,
    missingDetailCount,
    missingEvidenceCount
  };
}

function computeCycleRewardGross(
  rewardProfile: ReturnType<typeof buildRewardProfile>,
  referralBaseCount: number,
  referralIncrementCount: number
) {
  return rewardProfile.validPublishCount
    + rewardProfile.bonusCompleteCount * 2
    + referralBaseCount * 10
    + referralIncrementCount;
}

function referralQualificationCycle(briefings: Briefing[], programStartAt: string | null) {
  const profile = buildRewardProfile(briefings, undefined, programStartAt);
  return firstQualificationCycle([
    ...profile.validPublishBriefings.map((briefing) => ({
      cycleKey: weekCycleForDate(briefing.publishedAt).key,
      kind: "publish" as const
    })),
    ...profile.bonusCompleteRows.map((row) => ({
      cycleKey: briefingBonusCycleKey(row.briefing),
      kind: "complete" as const
    }))
  ]);
}

function referralBaseAwardCycle(node: ReferralNode, briefings: Briefing[]) {
  const qualificationCycle = referralQualificationCycle(briefings, seedProgramStartAt(node));
  const promotionCycle = node.brokerLevel === "seed" && node.seedQualifiedAt
    ? weekCycleForDate(node.seedQualifiedAt).key
    : null;
  return referralBaseRewardCycle(qualificationCycle, promotionCycle);
}

function buildSettlementLedger({
  brokerBriefings,
  brokerRewardStartAt,
  allBriefings,
  referrals,
  cycleKey
}: {
  brokerBriefings: Briefing[];
  brokerRewardStartAt: string | null;
  allBriefings: Briefing[];
  referrals: ReferralNode[];
  cycleKey: string;
}) {
  const cycles = buildWeekCycleOptions(brokerBriefings, brokerRewardStartAt)
    .filter((cycle) => cycle.key !== pastCycleKey)
    .sort((left, right) => (left.start?.getTime() ?? 0) - (right.start?.getTime() ?? 0));
  let carryForward = 0;

  for (const cycle of cycles) {
    const rewardProfile = buildRewardProfile(brokerBriefings, cycle.key, brokerRewardStartAt);
    const referralProfiles = referrals.map((node) => {
      const nodeBriefings = allBriefings.filter((briefing) => briefing.brokerId === node.id);
      const programStartAt = seedProgramStartAt(node);
      return {
        node,
        profile: buildRewardProfile(nodeBriefings, cycle.key, programStartAt),
        baseAwardCycle: referralBaseAwardCycle(node, nodeBriefings)
      };
    });
    const referralBaseCount = referralProfiles.filter(({ baseAwardCycle }) => baseAwardCycle === cycle.key).length;
    const referralIncrementCount = referralProfiles.reduce((total, { profile }) => total + profile.bonusCompleteCount, 0);
    const gross = computeCycleRewardGross(rewardProfile, referralBaseCount, referralIncrementCount);
    const clawbackAmount = rewardProfile.clawbackCount + rewardProfile.completeClawbackCount * 2;
    const weekSubtotal = gross - clawbackAmount;
    const total = carryForward + weekSubtotal;
    if (cycle.key === cycleKey) {
      return {
        carryForward,
        weekSubtotal,
        total,
        carryOut: total < 0 ? total : 0,
        payout: total > 0 ? total : 0
      };
    }
    carryForward = total < 0 ? total : 0;
  }

  return {
    carryForward: 0,
    weekSubtotal: 0,
    total: 0,
    carryOut: 0,
    payout: 0
  };
}

function settlementDecision(status: ReviewStatus, rewarded: boolean): SettlementReportDecision {
  if (rewarded) return "计奖";
  return status === "pending" ? "待审核" : "不计奖";
}

function publishSettlementReason(briefing: Briefing, rewarded: boolean, capped: boolean) {
  if (rewarded) return "人工审核通过，符合有效通告奖励条件";
  if (capped) return "达到每日 3 条或每周 12 条上限，当前为候选待定";
  if (effectivePublishStatus(briefing) === "rejected") {
    return briefing.cancelReason || stripSignedModelReviewMarkers(briefing.invalidReason) || sourceRejectLabel(briefing.sourceStatus, briefing.cancelReason) || "有效通告审核不通过";
  }
  return hasMatchedEvidence(briefing) ? "有效通告仍待人工审核" : "未上传匹配凭证，暂不计奖";
}

function signingSettlementReason(row: RewardCompleteRow) {
  if (row.bonusEligible) return `新增签约：${row.newModels.map((model) => model.label).join("、")}`;
  if (signedModelsForBriefing(row.briefing).length === 0) return "无签约者，新增签约不通过";
  if (row.newModels.length === 0) return `签约者均为历史重复：${row.repeatedModels.map((model) => model.label).join("、")}`;
  if (row.publishStatus === "rejected") return "有效通告审核不通过，新增签约不计奖";
  if (effectiveCompleteStatus(row) === "pending") return "有效通告或新增签约仍待人工审核";
  return stripSignedModelReviewMarkers(row.briefing.invalidReason) || "新增签约人工审核不通过";
}

function percentValue(value: number, total: number) {
  return total === 0 ? "0.0%" : `${((value / total) * 100).toFixed(1)}%`;
}

function brokerBriefings(broker: Broker, briefingsData: Briefing[]) {
  return briefingsData.filter((briefing) => briefing.brokerId === broker.id);
}

function buildBrokerPerformanceRows(brokersData: Broker[], briefingsData: Briefing[]) {
  return brokersData.map((broker) => {
    const allBrokerItems = brokerBriefings(broker, briefingsData);
    const currentIncentiveStartAt = brokerCurrentIncentiveStartAt(broker);
    const brokerItems = allBrokerItems.filter((briefing) => isBriefingSeedEligible(briefing, currentIncentiveStartAt));
    const rewardProfile = buildRewardProfile(brokerItems, undefined, currentIncentiveStartAt);
    const selfRewardProfile = buildRewardProfile(allBrokerItems, undefined, brokerSelfRewardStartAt(broker));
    const reviewSummary = buildReviewSummary(brokerItems, rewardProfile);
    const signedSummary = buildSignedModelSummary(brokerItems);
    const publishRewardAmount = selfRewardProfile.validPublishCount;
    const completeRewardAmount = selfRewardProfile.bonusCompleteCount * 2;
    const isPromotionReady = rewardProfile.validPublishCount >= 6 && rewardProfile.bonusCompleteCount >= 2;
    return {
      broker,
      briefingCount: brokerItems.length,
      validPublishCount: rewardProfile.validPublishCount,
      bonusCompleteCount: rewardProfile.bonusCompleteCount,
      signedModelCount: signedSummary.totalSignedModelCount,
      pendingCount: reviewSummary.pendingAnyCount,
      rewardAmount: publishRewardAmount + completeRewardAmount,
      isPromotionReady
    };
  });
}

function buildProgramReviewSummary(brokersData: Broker[], briefingsData: Briefing[]) {
  const summaries = brokersData.map((broker) => {
    const allBrokerItems = brokerBriefings(broker, briefingsData);
    const currentIncentiveStartAt = brokerCurrentIncentiveStartAt(broker);
    const activeItems = allBrokerItems.filter((briefing) => isBriefingSeedEligible(briefing, currentIncentiveStartAt));
    return buildReviewSummary(
      activeItems,
      buildRewardProfile(allBrokerItems, undefined, currentIncentiveStartAt)
    );
  });
  const sum = (key: "pendingPublishCount" | "pendingCompleteCount" | "rejectedPublishCount" | "rejectedCompleteCount" | "pendingAnyCount" | "manualReviewedCount" | "manualPendingCount" | "missingDetailCount" | "missingEvidenceCount") => (
    summaries.reduce((total, summary) => total + summary[key], 0)
  );
  return {
    pendingPublishCount: sum("pendingPublishCount"),
    pendingCompleteCount: sum("pendingCompleteCount"),
    rejectedPublishCount: sum("rejectedPublishCount"),
    rejectedCompleteCount: sum("rejectedCompleteCount"),
    pendingAnyCount: sum("pendingAnyCount"),
    manualReviewedCount: sum("manualReviewedCount"),
    manualPendingCount: sum("manualPendingCount"),
    missingDetailCount: sum("missingDetailCount"),
    missingEvidenceCount: sum("missingEvidenceCount")
  };
}

function programEligibleBriefings(brokersData: Broker[], briefingsData: Briefing[]) {
  const brokerMap = new Map(brokersData.map((broker) => [broker.id, broker]));
  return briefingsData.filter((briefing) => {
    const broker = brokerMap.get(briefing.brokerId);
    return broker ? isBriefingSeedEligible(briefing, brokerCurrentIncentiveStartAt(broker)) : false;
  });
}

function latestImportTitle(importBatchesData: ImportBatch[]) {
  const latest = [...importBatchesData].sort((left, right) => dateValue(right.importedAt) - dateValue(left.importedAt))[0];
  return latest ? `${latest.title} · ${latest.importedAt}` : "暂无导入批次";
}

function readSavedViewState(): SavedViewState {
  try {
    window.localStorage.removeItem(legacyViewStateKey);
    const rawValue = window.localStorage.getItem(viewStateKey);
    if (!rawValue) return {};
    const savedValue = JSON.parse(rawValue) as SavedViewState;
    return {
      page: savedValue.page && pageKeys.includes(savedValue.page) ? savedValue.page : undefined,
      selectedBrokerId: savedValue.selectedBrokerId,
      selectedBriefingId: savedValue.selectedBriefingId,
      selectedSignerId: savedValue.selectedSignerId,
      signerReturnPage: savedValue.signerReturnPage && pageKeys.includes(savedValue.signerReturnPage) ? savedValue.signerReturnPage : undefined,
      workspaceTab: savedValue.workspaceTab && workspaceTabs.includes(savedValue.workspaceTab) ? savedValue.workspaceTab : undefined,
      workspaceCycleByBroker: savedValue.workspaceCycleByBroker,
      financeOrders: Array.isArray(savedValue.financeOrders) ? savedValue.financeOrders : []
    };
  } catch {
    return {};
  }
}

function isBrowserViewState(value: unknown): value is BrowserViewState {
  if (!value || typeof value !== "object") return false;
  const state = value as BrowserViewState;
  return state.__xtgViewState === true && Boolean(state.page && pageKeys.includes(state.page));
}

function isTextEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function App() {
  const savedViewState = useMemo(() => readSavedViewState(), []);
  const [page, setPage] = useState<PageKey>(savedViewState.page ?? "dashboard");
  const [brokerRows, setBrokerRows] = useState<Broker[]>(brokers);
  const [briefingRows, setBriefingRows] = useState<Briefing[]>(briefings);
  const [importBatchRows, setImportBatchRows] = useState<ImportBatch[]>(importBatches);
  const [selectedBrokerId, setSelectedBrokerId] = useState(savedViewState.selectedBrokerId ?? brokers[0].id);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>(savedViewState.workspaceTab ?? "briefings");
  const [workspaceCycleByBroker, setWorkspaceCycleByBroker] = useState<Record<string, string>>(
    () => savedViewState.workspaceCycleByBroker ?? {}
  );
  const [financeOrders, setFinanceOrders] = useState<FinanceOrder[]>(() => savedViewState.financeOrders ?? []);
  const [lastListPage, setLastListPage] = useState<PageKey>("brokers");
  const [brokerListPage, setBrokerListPage] = useState(1);
  const [selectedBriefingId, setSelectedBriefingId] = useState(savedViewState.selectedBriefingId ?? "");
  const [selectedSignerId, setSelectedSignerId] = useState(savedViewState.selectedSignerId ?? "");
  const [signerReturnPage, setSignerReturnPage] = useState<PageKey>(savedViewState.signerReturnPage ?? "briefingReview");
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    window.localStorage.getItem("xtg-theme") === "dark" ? "dark" : "light"
  );
  const [accounts, setAccounts] = useState<StoredAccount[]>(readAccounts);
  const [currentAccountName, setCurrentAccountName] = useState(() => window.sessionStorage.getItem("xtg-current-account") ?? "");
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const accountName = window.sessionStorage.getItem("xtg-current-account") ?? "";
    return window.sessionStorage.getItem("xtg-authenticated") === "true" && readAccounts().some((account) => account.account === accountName && account.enabled);
  });
  const [profileOpen, setProfileOpen] = useState(false);
  const [updatesOpen, setUpdatesOpen] = useState(false);
  const [releaseDetailOpen, setReleaseDetailOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState("");
  const [selectedReleaseId, setSelectedReleaseId] = useState(releaseNotes[0].id);
  const [readReleaseNoteIds, setReadReleaseNoteIds] = useState<string[]>(() => loadReadReleaseNoteIds(currentAccountName));
  const updatesCloseTimerRef = useRef<number | null>(null);
  const currentViewRef = useRef({
    page: savedViewState.page ?? "dashboard" as PageKey,
    selectedBrokerId: savedViewState.selectedBrokerId ?? brokers[0].id,
    selectedBriefingId: savedViewState.selectedBriefingId ?? "",
    selectedSignerId: savedViewState.selectedSignerId ?? "",
    signerReturnPage: savedViewState.signerReturnPage ?? "briefingReview" as PageKey,
    workspaceTab: savedViewState.workspaceTab ?? "briefings" as WorkspaceTab,
    lastListPage: "brokers" as PageKey
  });
  const currentAccount = accounts.find((account) => account.account === currentAccountName);
  const selectedRelease = releaseNotes.find((note) => note.id === selectedReleaseId) ?? releaseNotes[0];
  const unreadReleaseCount = releaseNotes.filter((note) => !readReleaseNoteIds.includes(note.id)).length;
  const currentRole = currentAccount?.role ?? "operations";
  const currentPermissions = currentRole === "super_admin"
    ? allSystemPermissions
    : currentAccount?.permissions ?? defaultPermissionsForRole(currentRole);
  const permissionSet = new Set<SystemPermission>(currentPermissions);
  const hasPermission = (permission: SystemPermission) => currentRole === "super_admin" || permissionSet.has(permission);
  const canOperate = (["dashboard", "audit", "brokers", "workspace", "stats"] as SystemPermission[]).some(hasPermission);
  const canManageFinance = hasPermission("finance");
  const navPermissionMap: Partial<Record<PageKey, SystemPermission>> = {
    dashboard: "dashboard",
    audit: "audit",
    brokers: "brokers",
    workspace: "workspace",
    stats: "stats"
  };
  const visibleNavItems = navItems.filter((item) => item.key === "system"
    ? currentRole === "super_admin"
    : Boolean(navPermissionMap[item.key] && hasPermission(navPermissionMap[item.key]!)));
  const mobileNavItems = !canOperate && canManageFinance
    ? [
        navItems[0],
        { key: "financePending" as const, label: "待付款", icon: WalletCards },
        { key: "financePaid" as const, label: "已付款", icon: CheckCircle2 },
        { key: "financeReport" as const, label: "财务报表", icon: BarChart3 }
      ]
    : visibleNavItems.slice(0, 4);
  const globalSearchResults = useMemo(() => {
    const query = globalSearch.trim().toLowerCase();
    if (!query) return { brokers: [] as Broker[], briefings: [] as Briefing[], signers: [] as ReturnType<typeof parseSignedModelName>[] };
    const matchingBrokers = brokerRows.filter((item) => `${item.nickname} ${item.miniProgramUserId} ${item.boundPhone} ${item.wechatPhone}`.toLowerCase().includes(query)).slice(0, 5);
    const matchingBriefings = briefingRows.filter((item) => `${item.title} ${item.jarvisBriefingId}`.toLowerCase().includes(query)).slice(0, 5);
    const signerMap = new Map<string, ReturnType<typeof parseSignedModelName>>();
    briefingRows.forEach((item) => signedModelsForBriefing(item).forEach((model) => signerMap.set(model.key, model)));
    const matchingSigners = [...signerMap.values()].filter((item) => `${item.name} ${item.phone} ${item.userId}`.toLowerCase().includes(query)).slice(0, 5);
    return { brokers: matchingBrokers, briefings: matchingBriefings, signers: matchingSigners };
  }, [briefingRows, brokerRows, globalSearch]);

  const selectedBroker = useMemo(
    () => brokerRows.find((broker) => broker.id === selectedBrokerId) ?? brokerRows[0] ?? brokers[0],
    [brokerRows, selectedBrokerId]
  );
  const selectedBriefing = useMemo(
    () => briefingRows.find((briefing) => briefing.id === selectedBriefingId),
    [briefingRows, selectedBriefingId]
  );
  const selectedBrokerBriefings = useMemo(
    () => briefingRows.filter((briefing) => briefing.brokerId === selectedBroker.id),
    [briefingRows, selectedBroker.id]
  );
  const workspaceCycleKey = useMemo(() => {
    const savedCycleKey = workspaceCycleByBroker[selectedBroker.id];
    const currentIncentiveStartAt = brokerCurrentIncentiveStartAt(selectedBroker);
    const weekCycles = buildWeekCycleOptions(selectedBrokerBriefings, currentIncentiveStartAt);
    const latestCycleKey = latestWeekCycleKey(selectedBrokerBriefings, currentIncentiveStartAt);
    if (savedCycleKey && weekCycles.some((cycle) => cycle.key === savedCycleKey)) {
      return savedCycleKey;
    }
    return latestCycleKey;
  }, [selectedBroker, selectedBrokerBriefings, workspaceCycleByBroker]);

  function updateWorkspaceCycle(brokerId: string, cycleKey: string) {
    setWorkspaceCycleByBroker((current) => ({ ...current, [brokerId]: cycleKey }));
  }

  function applyBrowserViewState(state: BrowserViewState) {
    setPage(state.page);
    if (state.selectedBrokerId) setSelectedBrokerId(state.selectedBrokerId);
    setSelectedBriefingId(state.selectedBriefingId ?? "");
    setSelectedSignerId(state.selectedSignerId ?? "");
    if (state.signerReturnPage && pageKeys.includes(state.signerReturnPage)) setSignerReturnPage(state.signerReturnPage);
    if (state.workspaceTab && workspaceTabs.includes(state.workspaceTab)) setWorkspaceTab(state.workspaceTab);
    if (state.lastListPage && pageKeys.includes(state.lastListPage)) setLastListPage(state.lastListPage);
  }

  function browserViewState(overrides: Partial<BrowserViewState> = {}): BrowserViewState {
    return {
      __xtgViewState: true,
      page: currentViewRef.current.page,
      selectedBrokerId: currentViewRef.current.selectedBrokerId,
      selectedBriefingId: currentViewRef.current.selectedBriefingId,
      selectedSignerId: currentViewRef.current.selectedSignerId,
      signerReturnPage: currentViewRef.current.signerReturnPage,
      workspaceTab: currentViewRef.current.workspaceTab,
      lastListPage: currentViewRef.current.lastListPage,
      ...overrides
    };
  }

  function navigateToPage(nextPage: PageKey, overrides: Partial<BrowserViewState> = {}) {
    const nextState = browserViewState({ ...overrides, page: nextPage });
    applyBrowserViewState(nextState);
    window.history.pushState(nextState, "", window.location.pathname);
  }

  useEffect(() => {
    if (!isAuthenticated) return;
    const requiredPermission: Partial<Record<PageKey, SystemPermission>> = {
      dashboard: "dashboard",
      audit: "audit",
      stats: "stats",
      brokers: "brokers",
      brokerFission: "brokers",
      workspace: "workspace",
      briefingReview: "workspace",
      signerDetail: "workspace",
      financePending: "finance",
      financePaid: "finance",
      financeReport: "finance",
      operationLogs: "operationLogs",
      dataSync: "dataSync",
      dataBackup: "dataBackup"
    };
    const allowed = page === "guide"
      || page === "system" && currentRole === "super_admin"
      || Boolean(requiredPermission[page] && hasPermission(requiredPermission[page]!));
    if (!allowed) {
      const fallbackPermission = allSystemPermissions.find((permission) => hasPermission(permission));
      const fallbackPage: Partial<Record<SystemPermission, PageKey>> = {
        dashboard: "dashboard", audit: "audit", brokers: "brokers", workspace: "workspace", stats: "stats",
        finance: "financePending", operationLogs: "operationLogs", dataSync: "dataSync", dataBackup: "dataBackup"
      };
      setPage(fallbackPermission ? fallbackPage[fallbackPermission]! : "guide");
    }
  }, [currentAccount?.permissions, currentRole, isAuthenticated, page]);

  useEffect(() => {
    void refreshData();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    void syncLocalAccounts().then((nextAccounts) => {
      saveAccounts(nextAccounts);
      setAccounts(nextAccounts);
    }).catch(() => undefined);
  }, [isAuthenticated]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("xtg-theme", theme);
  }, [theme]);

  useEffect(() => {
    setReadReleaseNoteIds(loadReadReleaseNoteIds(currentAccountName));
  }, [currentAccountName]);

  useEffect(() => () => {
    if (updatesCloseTimerRef.current !== null) window.clearTimeout(updatesCloseTimerRef.current);
  }, []);

  useEffect(() => {
    currentViewRef.current = {
      page,
      selectedBrokerId,
      selectedBriefingId,
      selectedSignerId,
      signerReturnPage,
      workspaceTab,
      lastListPage
    };
  }, [page, selectedBrokerId, selectedBriefingId, selectedSignerId, workspaceTab, lastListPage, signerReturnPage]);

  useEffect(() => {
    window.history.replaceState(browserViewState(), "", window.location.pathname);
    function handlePopState(event: PopStateEvent) {
      if (isBrowserViewState(event.state)) {
        applyBrowserViewState(event.state);
      }
    }
    function handleBackspace(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key !== "Backspace" || isTextEditingTarget(event.target)) return;
      event.preventDefault();
      window.history.back();
    }
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("keydown", handleBackspace);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("keydown", handleBackspace);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(viewStateKey, JSON.stringify({
      page,
      selectedBrokerId,
      selectedBriefingId,
      selectedSignerId,
      signerReturnPage,
      workspaceTab,
      workspaceCycleByBroker,
      financeOrders
    }));
  }, [page, selectedBrokerId, selectedBriefingId, selectedSignerId, workspaceTab, workspaceCycleByBroker, financeOrders, signerReturnPage]);

  async function refreshData() {
    try {
      const [brokerResponse, batchResponse] = await Promise.all([
        fetch("/api/brokers"),
        fetch("/api/import-batches")
      ]);
      const nextBrokers = (await brokerResponse.json()) as Broker[];
      const nextBatches = (await batchResponse.json()) as ImportBatch[];
      setBrokerRows(nextBrokers);
      if (nextBrokers.length > 0) {
        setSelectedBrokerId((current) => nextBrokers.some((broker) => broker.id === current) ? current : nextBrokers[0].id);
      }
      setImportBatchRows(nextBatches);
      const briefingGroups = await Promise.all(
        nextBrokers.map((broker) => fetch(`/api/brokers/${broker.id}/briefings`).then((response) => response.json() as Promise<Briefing[]>))
      );
      setBriefingRows(briefingGroups.flat());
    } catch {
      setBrokerRows(brokers);
      setBriefingRows(briefings);
      setImportBatchRows(importBatches);
    }
  }

  function openBroker(broker: Broker) {
    const nextLastListPage = page === "workspace" ? "brokers" : page;
    setSelectedBrokerId(broker.id);
    setWorkspaceTab("briefings");
    setLastListPage(nextLastListPage);
    navigateToPage("workspace", {
      selectedBrokerId: broker.id,
      workspaceTab: "briefings",
      lastListPage: nextLastListPage
    });
  }

  function openBrokerSettlement(broker: Broker, cycleKey: string) {
    const nextLastListPage = page === "workspace" ? "brokers" : page;
    updateWorkspaceCycle(broker.id, cycleKey);
    setSelectedBrokerId(broker.id);
    setWorkspaceTab("settlement");
    setLastListPage(nextLastListPage);
    navigateToPage("workspace", {
      selectedBrokerId: broker.id,
      workspaceTab: "settlement",
      lastListPage: nextLastListPage
    });
  }

  async function promoteBroker(brokerId: string, promotedAt: string) {
    const response = await fetch(`/api/brokers/${brokerId}/promote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promotedAt })
    });
    const result = await response.json() as Broker | { error?: string };
    if (!response.ok || !("id" in result)) {
      throw new Error("error" in result ? result.error || "更新失败" : "更新失败");
    }
    const updated = result;
    setBrokerRows((current) => current.map((broker) => broker.id === brokerId ? updated : broker));
    return updated;
  }

  async function updateBrokerLevel(brokerId: string, payload: BrokerLevelUpdate) {
    const response = await fetch(`/api/brokers/${brokerId}/level`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json() as Broker | { error?: string };
    if (!response.ok || !("id" in result)) {
      throw new Error("error" in result ? result.error || "更新失败" : "更新失败");
    }
    setBrokerRows((current) => current.map((broker) => broker.id === brokerId ? result : broker));
    return result;
  }

  useEffect(() => {
    if (page !== "workspace") return;
    setWorkspaceCycleByBroker((current) => {
      if (current[selectedBroker.id]) return current;
      return { ...current, [selectedBroker.id]: workspaceCycleKey };
    });
  }, [page, selectedBroker.id, workspaceCycleKey]);

  async function refreshBrokerBriefings(brokerId: string) {
    const response = await fetch(`/api/brokers/${brokerId}/briefings`);
    const nextItems = (await response.json()) as Briefing[];
    setBriefingRows((current) => [
      ...current.filter((item) => item.brokerId !== brokerId),
      ...nextItems
    ]);
    return nextItems;
  }

  function openBriefingReview(item: Briefing, cycleKeyOverride?: string) {
    const itemBroker = brokerRows.find((broker) => broker.id === item.brokerId);
    const cycleKey = cycleKeyOverride ?? briefingCycleForEligibility(item, itemBroker ? brokerCurrentIncentiveStartAt(itemBroker) : null).key;
    updateWorkspaceCycle(item.brokerId, cycleKey);
    setSelectedBrokerId(item.brokerId);
    setWorkspaceTab("briefings");
    setSelectedBriefingId(item.id);
    navigateToPage("briefingReview", {
      selectedBrokerId: item.brokerId,
      selectedBriefingId: item.id,
      workspaceTab: "briefings"
    });
  }

  function openSignerDetail(signerId: string, returnPage: PageKey) {
    if (!signerId) return;
    setSelectedSignerId(signerId);
    setSignerReturnPage(returnPage);
    navigateToPage("signerDetail", { selectedSignerId: signerId, signerReturnPage: returnPage });
  }

  function submitFinanceOrder(order: Omit<FinanceOrder, "id" | "submittedAt" | "status">) {
    const submittedAt = new Date().toISOString();
    const orderId = `${order.brokerId}:${order.cycleKey}`;
    setFinanceOrders((current) => {
      const nextOrder: FinanceOrder = {
        ...order,
        id: orderId,
        submittedAt,
        approvedAt: undefined,
        paidAt: undefined,
        rejectedAt: undefined,
        rejectionReason: undefined,
        status: "pending"
      };
      return [...current.filter((item) => item.id !== orderId), nextOrder].sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
    });
    recordClientOperation("财务管理", "提交付款单", `${order.brokerNickname} · ${order.cycleLabel} · ¥${order.amount}`);
    navigateToPage("financePending");
  }

  function approveFinanceOrder(orderId: string) {
    setFinanceOrders((current) => current.map((order) => order.id === orderId ? {
      ...order,
      status: "approved",
      approvedAt: new Date().toISOString(),
      rejectedAt: undefined,
      rejectionReason: undefined
    } : order));
    recordClientOperation("财务管理", "财务审批通过", orderId);
  }

  function markFinanceOrderPaid(orderId: string) {
    setFinanceOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? { ...order, status: "paid", paidAt: new Date().toISOString() }
          : order
      )
    );
    recordClientOperation("财务管理", "确认付款", orderId);
    navigateToPage("financePaid");
  }

  function rejectFinanceOrder(orderId: string, reason: string) {
    setFinanceOrders((current) => current.map((order) => order.id === orderId ? {
      ...order,
      status: "rejected",
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason,
      approvedAt: undefined,
      paidAt: undefined
    } : order));
    recordClientOperation("财务管理", "驳回付款单", `${orderId} · ${reason}`);
  }

  function cancelFinanceOrder(orderId: string) {
    setFinanceOrders((current) => current.filter((order) => order.id !== orderId));
    recordClientOperation("财务管理", "撤回付款单", orderId);
  }

  async function updateSystemAccounts(nextAccounts: StoredAccount[]) {
    const changed = nextAccounts.find((next) => {
      const current = accounts.find((item) => item.account === next.account);
      const currentPermissions = current?.permissions ?? (current ? defaultPermissionsForRole(current.role) : []);
      const nextPermissions = next.permissions ?? defaultPermissionsForRole(next.role);
      return current && (
        current.role !== next.role
        || current.enabled !== next.enabled
        || currentPermissions.join(",") !== nextPermissions.join(",")
      );
    });
    const savedAccounts = changed
      ? await updateRemoteAccount(changed.account, { role: changed.role, enabled: changed.enabled, permissions: changed.permissions })
      : nextAccounts;
    saveAccounts(savedAccounts);
    setAccounts(savedAccounts);
  }

  async function updateSystemAccountAvatar(accountName: string, avatarDataUrl: string) {
    const savedAccounts = await updateRemoteAccount(accountName, { avatarDataUrl });
    saveAccounts(savedAccounts);
    setAccounts(savedAccounts);
  }

  function logout() {
    window.sessionStorage.removeItem("xtg-authenticated");
    window.sessionStorage.removeItem("xtg-current-account");
    setProfileOpen(false);
    setCurrentAccountName("");
    setIsAuthenticated(false);
  }

  function cancelUpdatesClose() {
    if (updatesCloseTimerRef.current === null) return;
    window.clearTimeout(updatesCloseTimerRef.current);
    updatesCloseTimerRef.current = null;
  }

  function scheduleUpdatesClose() {
    cancelUpdatesClose();
    updatesCloseTimerRef.current = window.setTimeout(() => {
      setUpdatesOpen(false);
      updatesCloseTimerRef.current = null;
    }, 180);
  }

  function openReleaseNote(releaseId: string) {
    cancelUpdatesClose();
    setSelectedReleaseId(releaseId);
    setUpdatesOpen(false);
    setReleaseDetailOpen(true);
    setReadReleaseNoteIds((current) => {
      if (current.includes(releaseId)) return current;
      const next = [...current, releaseId];
      window.localStorage.setItem(releaseReadStorageKey(currentAccountName), JSON.stringify(next));
      return next;
    });
  }

  if (!isAuthenticated) {
    return (
      <LoginScreen
        theme={theme}
        onThemeChange={setTheme}
        onLogin={(accountName) => {
          window.sessionStorage.setItem("xtg-authenticated", "true");
          window.sessionStorage.setItem("xtg-current-account", accountName);
          setAccounts(readAccounts());
          setCurrentAccountName(accountName);
          setIsAuthenticated(true);
        }}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div>
            <div className="brand-name">鑫通告</div>
            <div className="brand-subtitle">运营结算后台</div>
          </div>
        </div>

        <nav className="nav-list" aria-label="主导航">
          {canOperate ? <div className="nav-group broker-nav-group">
            <div className="nav-group-label">
              <UsersRound size={18} />
              <span>经纪人管理</span>
            </div>
            {visibleNavItems.filter((item) => item.key !== "system" && item.key !== "workspace").map((item) => (
              <div className="nav-entry" key={item.key}>
                <button
                  className={`nav-subitem ${page === item.key ? "active" : ""}`}
                  onClick={() => navigateToPage(item.key)}
                  type="button"
                >
                  {item.label}
                </button>
                {item.key === "brokers" ? (
                  <>
                    <button
                      className={`nav-subitem nav-tertiary ${page === "brokerFission" ? "active" : ""}`}
                      onClick={() => navigateToPage("brokerFission")}
                      type="button"
                    >
                      经纪人裂变图
                    </button>
                    {hasPermission("workspace") ? <button
                      className={`nav-subitem nav-tertiary ${page === "workspace" ? "active" : ""}`}
                      onClick={() => navigateToPage("workspace")}
                      type="button"
                    >
                      经纪人工作台
                    </button> : null}
                  </>
                ) : null}
              </div>
            ))}
            {hasPermission("workspace") && !hasPermission("brokers") ? (
              <button className={`nav-subitem ${page === "workspace" ? "active" : ""}`} onClick={() => navigateToPage("workspace")} type="button">经纪人工作台</button>
            ) : null}
          </div> : null}
          {canManageFinance ? <div className="nav-group">
            <div className="nav-group-label">
              <WalletCards size={18} />
              <span>财务管理</span>
            </div>
            <button
              className={`nav-subitem ${page === "financePending" ? "active" : ""}`}
              onClick={() => navigateToPage("financePending")}
              type="button"
            >
              待付款订单
            </button>
            <button
              className={`nav-subitem ${page === "financePaid" ? "active" : ""}`}
              onClick={() => navigateToPage("financePaid")}
              type="button"
            >
              已付款订单
            </button>
            <button
              className={`nav-subitem ${page === "financeReport" ? "active" : ""}`}
              onClick={() => navigateToPage("financeReport")}
              type="button"
            >
              财务报表
            </button>
          </div> : null}
          {(currentRole === "super_admin" || hasPermission("operationLogs") || hasPermission("dataSync") || hasPermission("dataBackup")) ? <div className="nav-group">
            <div className="nav-group-label">
              <Wrench size={18} />
              <span>系统工具</span>
            </div>
            {currentRole === "super_admin" ? <button className={`nav-subitem ${page === "system" ? "active" : ""}`} onClick={() => navigateToPage("system")} type="button">系统用户</button> : null}
            {hasPermission("operationLogs") ? <button className={`nav-subitem ${page === "operationLogs" ? "active" : ""}`} onClick={() => navigateToPage("operationLogs")} type="button">操作日志</button> : null}
            {hasPermission("dataSync") ? <button className={`nav-subitem ${page === "dataSync" ? "active" : ""}`} onClick={() => navigateToPage("dataSync")} type="button">数据同步</button> : null}
            {hasPermission("dataBackup") ? <button className={`nav-subitem ${page === "dataBackup" ? "active" : ""}`} onClick={() => navigateToPage("dataBackup")} type="button">数据备份</button> : null}
          </div> : null}
        </nav>

        <div className="sidebar-note">
          <span>ver {appVersion} (BY EWEN)</span>
        </div>
      </aside>

      <main className="main">
        <header className="top-app-bar">
          <div className="top-context">
            <strong>审核与结算</strong>
            <span>运营工作台</span>
          </div>
          <div className="top-tools">
            <label className="global-search">
              <Search size={16} />
              <input aria-label="全局搜索" onChange={(event) => setGlobalSearch(event.target.value)} placeholder="搜索经纪人、通告或签约者" value={globalSearch} />
              {globalSearch.trim() ? <div className="global-search-results">
                {globalSearchResults.brokers.length ? <div><span className="search-result-group">经纪人</span>{globalSearchResults.brokers.map((item) => <button key={item.id} onClick={() => { setGlobalSearch(""); openBroker(item); }} type="button"><strong>{item.nickname}</strong><small>#{item.miniProgramUserId}</small></button>)}</div> : null}
                {globalSearchResults.briefings.length ? <div><span className="search-result-group">通告</span>{globalSearchResults.briefings.map((item) => <button key={item.id} onClick={() => { setGlobalSearch(""); openBriefingReview(item); }} type="button"><strong>{item.title}</strong><small>#{item.jarvisBriefingId}</small></button>)}</div> : null}
                {globalSearchResults.signers.length ? <div><span className="search-result-group">签约者</span>{globalSearchResults.signers.map((item) => <button key={item.key} onClick={() => { if (!item.userId) return; setGlobalSearch(""); openSignerDetail(item.userId, page); }} type="button"><strong>{item.name}</strong><small>{item.userId ? `#${item.userId}` : item.phone}</small></button>)}</div> : null}
                {!globalSearchResults.brokers.length && !globalSearchResults.briefings.length && !globalSearchResults.signers.length ? <p>没有匹配结果</p> : null}
              </div> : null}
            </label>
            <button aria-label="系统使用白皮书" className="top-icon-button" onClick={() => navigateToPage("guide")} title="系统使用白皮书" type="button">
              <BookOpen size={18} />
            </button>
            <div className="updates-menu-wrap" onMouseEnter={cancelUpdatesClose} onMouseLeave={scheduleUpdatesClose}>
              <button
                aria-expanded={updatesOpen}
                aria-label={unreadReleaseCount > 0 ? `版本更新，${unreadReleaseCount} 条未读` : "版本更新，无未读内容"}
                className="top-icon-button notification-button"
                onClick={() => {
                  cancelUpdatesClose();
                  setUpdatesOpen((current) => !current);
                }}
                title="版本更新"
                type="button"
              >
                <Bell size={18} />
                {unreadReleaseCount > 0 ? (
                  <span aria-hidden="true" className="notification-badge">
                    {unreadReleaseCount > 99 ? "99+" : unreadReleaseCount}
                  </span>
                ) : null}
              </button>
              {updatesOpen ? (
                <div className="updates-popover">
                  <div className="updates-popover-heading">
                    <strong>版本更新</strong>
                    <span>{unreadReleaseCount > 0 ? `${unreadReleaseCount} 条未读` : "已全部阅读"}</span>
                  </div>
                  {releaseNotes.map((note) => {
                    const unread = !readReleaseNoteIds.includes(note.id);
                    return (
                      <button className={unread ? "unread" : ""} key={note.id} onClick={() => openReleaseNote(note.id)} type="button">
                        <span className="update-version">ver {note.version}{unread ? " · 未读" : ""}</span>
                        <strong>{note.title}</strong>
                        <small>{note.date} · 点击查看详情</small>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <button
              aria-label={theme === "light" ? "切换暗色模式" : "切换亮色模式"}
              className="top-icon-button"
              onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}
              title={theme === "light" ? "切换暗色模式" : "切换亮色模式"}
              type="button"
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <div className="account-menu-wrap">
              <button aria-expanded={profileOpen} className="account-menu-trigger" onClick={() => setProfileOpen((current) => !current)} type="button">
                <AccountAvatar account={currentAccount} fallback={currentAccountName} />
                <span className="account-menu-name">{currentAccountName}</span>
                <ChevronDown size={15} />
              </button>
              {profileOpen && currentAccount ? (
                <div className="account-popover">
                  <strong>{currentAccount.account}</strong>
                  <span>{roleLabels[currentAccount.role]}</span>
                  <p>{roleDescriptions[currentAccount.role]}</p>
                  <div className="account-popover-actions">
                    {currentAccount.role === "super_admin" ? <button onClick={() => { setProfileOpen(false); navigateToPage("system"); }} type="button">账户管理</button> : null}
                    <button onClick={logout} type="button">退出登录</button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </header>
        {page === "dashboard" && (
          <Dashboard
            brokersData={brokerRows}
            briefingsData={briefingRows}
            importBatchesData={importBatchRows}
            onOpenAudit={hasPermission("audit") ? () => navigateToPage("audit") : undefined}
            onOpenBroker={openBroker}
            onOpenBrokers={hasPermission("brokers") ? () => navigateToPage("brokers") : undefined}
            onOpenDataSync={hasPermission("dataSync") ? () => navigateToPage("dataSync") : undefined}
          />
        )}
        {page === "audit" && (
          <AuditCenter
            briefingsData={briefingRows}
            brokersData={brokerRows}
            financeOrders={financeOrders}
            onOpenBrokerSettlement={openBrokerSettlement}
            onOpenBriefing={openBriefingReview}
            onRefresh={refreshData}
          />
        )}
        {page === "stats" && <Stats brokersData={brokerRows} briefingsData={briefingRows} />}
        {page === "brokers" && (
          <BrokerList
            brokersData={brokerRows}
            onOpenBroker={openBroker}
            onPageChange={setBrokerListPage}
            onRefresh={refreshData}
            pageNumber={brokerListPage}
          />
        )}
        {page === "brokerFission" && (
          <BrokerFissionTree
            approvedSigningCounts={Object.fromEntries(brokerRows.map((broker) => [
              broker.id,
              buildRewardProfile(
                briefingRows.filter((briefing) => briefing.brokerId === broker.id),
                undefined,
                brokerSelfRewardStartAt(broker)
              ).bonusCompleteCount
            ]))}
            brokers={brokerRows}
            onOpenBroker={openBroker}
          />
        )}
        {page === "workspace" && (
          <BrokerWorkspace
            broker={selectedBroker}
            brokersData={brokerRows}
            briefingsData={briefingRows}
            tab={workspaceTab}
            selectedCycleKey={workspaceCycleKey}
            onCycleChange={(cycleKey) => updateWorkspaceCycle(selectedBroker.id, cycleKey)}
            onTabChange={setWorkspaceTab}
            onBack={() => navigateToPage(lastListPage === "workspace" ? "brokers" : lastListPage)}
            onPromoteBroker={promoteBroker}
            onBrokerLevelUpdate={updateBrokerLevel}
            onRefresh={refreshData}
            onBriefingsChange={setBriefingRows}
            onOpenBroker={openBroker}
            onOpenBriefingReview={(item) => openBriefingReview(item, workspaceCycleKey)}
            onOpenSigner={(signerId) => openSignerDetail(signerId, "workspace")}
            onSubmitFinanceOrder={submitFinanceOrder}
            onCancelFinanceOrder={cancelFinanceOrder}
            financeOrders={financeOrders}
          />
        )}
        {page === "briefingReview" && selectedBriefing && (
          <BriefingReviewPage
            broker={brokerRows.find((broker) => broker.id === selectedBriefing.brokerId) ?? selectedBroker}
            item={selectedBriefing}
            briefingsData={briefingRows}
            onBack={() => navigateToPage("workspace")}
            onBriefingSaved={(updated) => {
              setBriefingRows((current) => current.map((briefing) => briefing.id === updated.id ? updated : briefing));
            }}
            onOpenSigner={(signerId) => openSignerDetail(signerId, "briefingReview")}
            onRefreshBriefings={refreshBrokerBriefings}
          />
        )}
        {page === "signerDetail" && selectedSignerId && (
          <SignerDetailPage signerId={selectedSignerId} onBack={() => navigateToPage(signerReturnPage)} />
        )}
        {(page === "financePending" || page === "financePaid") && (
          <FinanceManagementPage
            activeTab={page === "financePaid" ? "paid" : "pending"}
            brokersData={brokerRows}
            onApprove={approveFinanceOrder}
            onMarkPaid={markFinanceOrderPaid}
            onReject={rejectFinanceOrder}
            orders={financeOrders}
          />
        )}
        {page === "financeReport" && <FinanceReport orders={financeOrders} />}
        {page === "guide" && <SystemGuide />}
        {page === "operationLogs" && hasPermission("operationLogs") && <OperationLogPage />}
        {page === "dataSync" && hasPermission("dataSync") && <DataSyncPage onSynced={refreshData} />}
        {page === "dataBackup" && hasPermission("dataBackup") && <DataBackupPage />}
        {page === "system" && currentRole === "super_admin" && currentAccount && (
          <SystemManagement
            accounts={accounts}
            currentAccount={currentAccount}
            onAccountsChange={updateSystemAccounts}
            onAvatarChange={updateSystemAccountAvatar}
          />
        )}
      </main>
      {releaseDetailOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="release-title" aria-modal="true" className="notice-modal release-modal" role="dialog">
            <div className="release-modal-heading">
              <span>VER {selectedRelease.version} · {selectedRelease.date}</span>
              <h2 id="release-title">{selectedRelease.title}</h2>
            </div>
            <div className="release-note-section feature">
              <strong>功能更新</strong>
              <ul>{selectedRelease.updates.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <div className="release-note-section fix">
              <strong>Bug 修复</strong>
              <ul>{selectedRelease.fixes.map((item) => <li key={item}>{item}</li>)}</ul>
            </div>
            <div className="notice-modal-actions">
              <button className="primary-action" onClick={() => setReleaseDetailOpen(false)} type="button">确认</button>
            </div>
          </section>
        </div>
      ) : null}
      <nav aria-label="移动端主导航" className="mobile-bottom-nav">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          return (
            <button className={page === item.key ? "active" : ""} key={item.key} onClick={() => navigateToPage(item.key)} type="button">
              <Icon size={19} />
              <span>{item.label.replace("经纪人", "经纪")}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function AuditCenter({
  briefingsData,
  brokersData,
  financeOrders,
  onOpenBrokerSettlement,
  onOpenBriefing,
  onRefresh
}: {
  briefingsData: Briefing[];
  brokersData: Broker[];
  financeOrders: FinanceOrder[];
  onOpenBrokerSettlement: (broker: Broker, cycleKey: string) => void;
  onOpenBriefing: (briefing: Briefing) => void;
  onRefresh: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<"all" | "pending" | "evidence" | "dispute" | "settlement" | "commission">("pending");
  const [query, setQuery] = useState("");
  const eligibleBriefings = programEligibleBriefings(brokersData, briefingsData);
  const rewardRows = new Map(brokersData.flatMap((broker) => buildRewardProfile(
    briefingsData.filter((briefing) => briefing.brokerId === broker.id),
    undefined,
    brokerCurrentIncentiveStartAt(broker)
  ).completeRows.map((row) => [row.briefing.id, row] as const)));
  const rows = eligibleBriefings.filter((item) => {
    const broker = brokersData.find((entry) => entry.id === item.brokerId);
    const brokerItems = eligibleBriefings.filter((briefing) => briefing.brokerId === item.brokerId);
    const matchesQuery = !query || `${item.title} ${item.jarvisBriefingId} ${broker?.nickname ?? ""}`.toLowerCase().includes(query.toLowerCase());
    if (!matchesQuery) return false;
    if (filter === "pending") return cappedPublishStatus(item, brokerItems) === "pending" || effectiveCompleteStatus(rewardRows.get(item.id) ?? { briefing: item, newModels: [], bonusEligible: false }) === "pending";
    if (filter === "evidence") return needsAdminEvidenceReview(item) && !hasMatchedEvidence(item);
    if (filter === "dispute") return hasEvidenceDispute(item);
    return true;
  });
  const pendingCount = eligibleBriefings.filter((item) => !sourceRejected(item) && manualReviewStatus(item).status === "pending").length;
  const missingEvidenceCount = eligibleBriefings.filter((item) => needsAdminEvidenceReview(item) && !hasMatchedEvidence(item)).length;
  const disputeCount = eligibleBriefings.filter(hasEvidenceDispute).length;
  const visibleRows = rows.slice(0, 25);

  return (
    <section className="page audit-center-page">
      <PageHeader eyebrow="Audit Center" title="审核中心" description="集中处理有效通告凭证与新增签约核验，审核结果将直接进入奖励结算。" />
      <div className="audit-summary-grid">
        <MetricCard label="待人工审核" value={pendingCount} delta="优先处理" />
        <MetricCard label="缺少匹配凭证" value={missingEvidenceCount} delta="阻塞有效通告" />
        <MetricCard label="凭证异议" value={disputeCount} delta="需要复核" />
        <MetricCard label="本期审核记录" value={briefingsData.length} delta="全部通告" />
      </div>
      <section className="panel table-panel audit-queue-panel">
        <div className="audit-filter-bar">
          <label className="audit-search"><Search size={16} /><input onChange={(event) => setQuery(event.target.value)} placeholder="搜索通告、经纪人或 ID" value={query} /></label>
          <div className="segmented">
            {([['pending', '我的待办'], ['evidence', '缺少凭证'], ['dispute', '凭证异议'], ['settlement', '争议通告'], ['commission', '提成结算'], ['all', '全部记录']] as const).map(([key, label]) => (
              <button className={filter === key ? "active" : ""} key={key} onClick={() => setFilter(key)} type="button">{label}</button>
            ))}
          </div>
        </div>
        {filter === "settlement" ? <SettlementDisputePanel briefingsData={briefingsData} financeOrders={financeOrders} onOpenBriefing={onOpenBriefing} onRefresh={onRefresh} /> : filter === "commission" ? <CommissionSettlementPanel briefingsData={briefingsData} brokersData={brokersData} financeOrders={financeOrders} onOpenSettlement={onOpenBrokerSettlement} /> : <div className="responsive-table-wrap">
          <table className="audit-queue-table">
            <thead><tr><th>通告 / 经纪人</th><th>发布时间</th><th>凭证</th><th>有效通告</th><th>新增签约</th><th>风险</th><th>操作</th></tr></thead>
            <tbody>
              {visibleRows.map((item) => {
                const broker = brokersData.find((entry) => entry.id === item.brokerId);
                const brokerItems = eligibleBriefings.filter((briefing) => briefing.brokerId === item.brokerId);
                const completeRow = rewardRows.get(item.id);
                return (
                  <tr key={item.id}>
                    <td data-label="通告"><div className="user-cell"><strong>{item.title}</strong><span>{broker ? brokerDisplayName(broker) : "-"} · #{item.jarvisBriefingId}</span></div></td>
                    <td data-label="发布时间">{item.publishedAt}</td>
                    <td data-label="凭证"><span className={`status-pill ${item.evidenceCount ? "success" : "warning"}`}>{item.evidenceCount ? `${item.evidenceCount} 个` : "待补充"}</span></td>
                    <td data-label="有效通告"><ReviewBadge label={cappedPublishLabel(item, brokerItems)} status={cappedPublishStatus(item, brokerItems)} /></td>
                    <td data-label="新增签约"><ReviewBadge label={completeRow ? signingStatusLabel(completeRow) : "待核验"} status={completeRow ? effectiveCompleteStatus(completeRow) : "pending"} /></td>
                    <td data-label="风险">{hasEvidenceDispute(item) ? <span className="status-pill danger">凭证异议</span> : <span className="muted">正常</span>}</td>
                    <td data-label="操作"><button className="secondary-action compact-action" onClick={() => onOpenBriefing(item)} type="button">进入审核</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>}
        {filter !== "settlement" && filter !== "commission" && rows.length === 0 ? <p className="empty-state">当前筛选条件下没有审核任务。</p> : null}
        {filter !== "settlement" && filter !== "commission" && rows.length > visibleRows.length ? <p className="audit-result-note">当前显示前 {visibleRows.length} 条，共 {rows.length} 条；可通过搜索进一步缩小范围。</p> : null}
      </section>
    </section>
  );
}

type CommissionSettlementTask = {
  broker: Broker;
  cycleKey: string;
  cycleLabel: string;
  baseAmount: number;
  incrementAmount: number;
  totalAmount: number;
};

function CommissionSettlementPanel({ briefingsData, brokersData, financeOrders, onOpenSettlement }: {
  briefingsData: Briefing[];
  brokersData: Broker[];
  financeOrders: FinanceOrder[];
  onOpenSettlement: (broker: Broker, cycleKey: string) => void;
}) {
  const [tasks, setTasks] = useState<CommissionSettlementTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const referrers = brokersData.filter((broker) => (broker.refereeCount ?? 0) > 0);
    Promise.all(referrers.map(async (broker) => {
      const response = await fetch(`/api/brokers/${broker.id}/referrals`);
      const referrals = response.ok ? await response.json() as ReferralNode[] : [];
      const rewards = new Map<string, { baseAmount: number; incrementAmount: number }>();
      referrals.forEach((node) => {
        const nodeBriefings = briefingsData.filter((briefing) => briefing.brokerId === node.id);
        const baseCycle = referralBaseAwardCycle(node, nodeBriefings);
        if (baseCycle) {
          const current = rewards.get(baseCycle) ?? { baseAmount: 0, incrementAmount: 0 };
          current.baseAmount += 10;
          rewards.set(baseCycle, current);
        }
        const profile = buildRewardProfile(nodeBriefings, undefined, seedProgramStartAt(node));
        profile.bonusCompleteRows.forEach((row) => {
          const cycleKey = briefingBonusCycleKey(row.briefing);
          if (row.briefing.settlementDispute?.originalCycleKey === cycleKey) return;
          const current = rewards.get(cycleKey) ?? { baseAmount: 0, incrementAmount: 0 };
          current.incrementAmount += 1;
          rewards.set(cycleKey, current);
        });
        nodeBriefings.forEach((briefing) => {
          const dispute = briefing.settlementDispute;
          if (dispute?.status !== "approved" || !dispute.deferredCycleKey || !dispute.deferCompleteReward) return;
          const current = rewards.get(dispute.deferredCycleKey) ?? { baseAmount: 0, incrementAmount: 0 };
          current.incrementAmount += 1;
          rewards.set(dispute.deferredCycleKey, current);
        });
      });
      const ownBriefings = briefingsData.filter((briefing) => briefing.brokerId === broker.id);
      return Array.from(rewards.entries()).flatMap(([cycleKey, reward]) => {
        const hasOwnBriefing = ownBriefings.some((briefing) => weekCycleForDate(briefing.publishedAt).key === cycleKey);
        const financeOrder = financeOrders.find((order) => order.brokerId === broker.id && order.cycleKey === cycleKey);
        if (hasOwnBriefing || (financeOrder && financeOrder.status !== "rejected")) return [];
        const cycleIndex = cycleWeekIndex(cycleKey);
        const cycleDate = new Date(seedPlanStartDate.getTime() + (cycleIndex - 1) * 7 * 86400000);
        return [{
          broker,
          cycleKey,
          cycleLabel: weekCycleForDate(cycleDate.toISOString()).label,
          ...reward,
          totalAmount: reward.baseAmount + reward.incrementAmount
        }];
      });
    })).then((groups) => {
      if (!active) return;
      setTasks(groups.flat().sort((left, right) => cycleWeekIndex(right.cycleKey) - cycleWeekIndex(left.cycleKey)));
      setLoading(false);
    }).catch(() => {
      if (!active) return;
      setTasks([]);
      setLoading(false);
    });
    return () => { active = false; };
  }, [briefingsData, brokersData, financeOrders]);

  if (loading) return <p className="empty-state">正在核对下线奖励与上线结算...</p>;
  if (!tasks.length) return <p className="empty-state">暂无“本人无通告但有下线提成”的待结算经纪人。</p>;
  return <div className="responsive-table-wrap"><table className="commission-settlement-table">
    <thead><tr><th>上线经纪人</th><th>结算周期</th><th>基础达标奖</th><th>成交增量奖</th><th>应结算</th><th>操作</th></tr></thead>
    <tbody>{tasks.map((task) => <tr key={`${task.broker.id}-${task.cycleKey}`}>
      <td><div className="user-cell"><strong>{task.broker.nickname}</strong><span>#{task.broker.miniProgramUserId}</span></div></td>
      <td>{task.cycleLabel}</td>
      <td>{money(task.baseAmount)}</td>
      <td>{money(task.incrementAmount)}</td>
      <td><strong>{money(task.totalAmount)}</strong></td>
      <td><button className="primary-action compact-action" onClick={() => onOpenSettlement(task.broker, task.cycleKey)} type="button">处理结算</button></td>
    </tr>)}</tbody>
  </table></div>;
}

function SettlementDisputePanel({ briefingsData, financeOrders, onOpenBriefing, onRefresh }: {
  briefingsData: Briefing[];
  financeOrders: FinanceOrder[];
  onOpenBriefing: (briefing: Briefing) => void;
  onRefresh: () => Promise<void>;
}) {
  const [records, setRecords] = useState<SettlementDisputeRecord[]>([]);
  const [idsText, setIdsText] = useState("");
  const [reason, setReason] = useState("");
  const [cycleKey, setCycleKey] = useState("");
  const [resolutionById, setResolutionById] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [evidenceTargetId, setEvidenceTargetId] = useState("");
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const disputeEvidenceInputRef = useRef<HTMLInputElement>(null);
  const cycleOptions = useMemo(() => {
    const keys = Array.from(new Set(briefingsData.map((item) => weekCycleForDate(item.publishedAt).key))).filter((key) => key !== pastCycleKey);
    return keys.sort((left, right) => cycleWeekIndex(right) - cycleWeekIndex(left));
  }, [briefingsData]);

  async function loadRecords() {
    const response = await fetch("/api/settlement-disputes");
    setRecords(response.ok ? await response.json() : []);
  }

  useEffect(() => { void loadRecords(); }, []);
  useEffect(() => { if (!cycleKey && cycleOptions[0]) setCycleKey(cycleOptions[0]); }, [cycleKey, cycleOptions]);

  async function importRecords() {
    const requestedIds = idsText.split(/[\s,，]+/).map((item) => item.trim().replace(/^#/, "")).filter(Boolean);
    const paidIds = requestedIds.filter((jarvisBriefingId) => {
      const briefing = briefingsData.find((item) => item.jarvisBriefingId === jarvisBriefingId);
      return briefing && financeOrders.some((order) => order.brokerId === briefing.brokerId && order.cycleKey === cycleKey && order.status === "paid");
    });
    const jarvisBriefingIds = requestedIds.filter((item) => !paidIds.includes(item));
    if (paidIds.length) setNotice(`已付款周期不能直接转复审：${paidIds.map((item) => `#${item}`).join("、")}，请走下期抵扣流程。`);
    if (!jarvisBriefingIds.length || !cycleKey) return;
    const response = await fetch("/api/settlement-disputes/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jarvisBriefingIds, originalCycleKey: cycleKey, reason })
    });
    const result = await response.json();
    if (!response.ok) { setNotice(result.error || "导入失败"); return; }
    const failed = result.results.filter((item: any) => item.status !== "imported");
    setNotice(`${paidIds.length ? `${paidIds.length} 条已付款记录已拦截；` : ""}已加入 ${result.importedCount} 条${failed.length ? `，${failed.length} 条未导入：${failed.map((item: any) => `#${item.jarvisBriefingId} ${item.message}`).join("；")}` : ""}`);
    setIdsText("");
    await loadRecords();
    await onRefresh();
  }

  async function reviewRecord(record: SettlementDisputeRecord, status: "approved" | "rejected") {
    const resolution = (resolutionById[record.id] || "").trim();
    if (!resolution) { setNotice("请先填写明确的二审结论"); return; }
    const nextCycleKey = `week-${cycleWeekIndex(record.originalCycleKey) + 1}`;
    const response = await fetch(`/api/settlement-disputes/${record.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, resolution, deferredCycleKey: status === "approved" ? nextCycleKey : "" })
    });
    const result = await response.json();
    if (!response.ok) { setNotice(result.error || "复审保存失败"); return; }
    setNotice(status === "approved"
      ? `#${record.jarvisBriefingId} 二审通过，转入 ${weekCycleForKey(nextCycleKey).label} 补发 ${money(disputeRewardAmount(record))}`
      : `#${record.jarvisBriefingId} 二审不通过`);
    await loadRecords();
    await onRefresh();
  }

  function chooseDisputeEvidence(recordId: string) {
    setEvidenceTargetId(recordId);
    disputeEvidenceInputRef.current?.click();
  }

  async function uploadDisputeEvidence(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (!evidenceTargetId || files.length === 0) return;
    setUploadingEvidence(true);
    try {
      for (const file of files) {
        const response = await fetch(`/api/settlement-disputes/${evidenceTargetId}/evidences`, {
          method: "POST",
          headers: {
            "content-type": file.type || "application/octet-stream",
            "x-file-name": encodeURIComponent(file.name),
            "x-file-type": file.type || "application/octet-stream"
          },
          body: await file.arrayBuffer()
        });
        const result = await response.json();
        if (!response.ok) { setNotice(result.error || `${file.name} 上传失败`); return; }
      }
      setNotice(`已上传 ${files.length} 份二审凭证`);
      await loadRecords();
    } finally {
      setUploadingEvidence(false);
      setEvidenceTargetId("");
      if (disputeEvidenceInputRef.current) disputeEvidenceInputRef.current.value = "";
    }
  }

  async function deleteDisputeEvidence(recordId: string, evidenceId: string) {
    const response = await fetch(`/api/settlement-disputes/${recordId}/evidences/${evidenceId}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) { setNotice(result.error || "删除二审凭证失败"); return; }
    setNotice("二审凭证已删除");
    await loadRecords();
  }

  function openDisputeBriefing(record: SettlementDisputeRecord) {
    const item = briefingsData.find((briefing) => briefing.id === record.briefingId);
    if (item) onOpenBriefing(item);
  }

  return <div className="settlement-dispute-panel">
    <input accept="image/*,video/*,application/pdf" hidden multiple onChange={(event) => void uploadDisputeEvidence(event.target.files)} ref={disputeEvidenceInputRef} type="file" />
    <div className="dispute-import-grid">
      <label><span>通告ID（每行一个）</span><textarea onChange={(event) => setIdsText(event.target.value)} placeholder="粘贴一审不通过的鑫通告通告ID" rows={4} value={idsText} /></label>
      <div className="dispute-import-fields">
        <label><span>原结算周期</span><select onChange={(event) => setCycleKey(event.target.value)} value={cycleKey}>{cycleOptions.map((key) => <option key={key} value={key}>{weekCycleForKey(key).label}</option>)}</select></label>
        <label><span>异议说明</span><input onChange={(event) => setReason(event.target.value)} placeholder="例如：经纪人认为签约者未重复" value={reason} /></label>
        <button className="primary-action" disabled={!idsText.trim() || !cycleKey} onClick={() => void importRecords()} type="button"><Upload size={16} />导入争议通告</button>
      </div>
    </div>
    {notice ? <p className="form-status">{notice}</p> : null}
    <div className="responsive-table-wrap"><table className="dispute-table"><thead><tr><th>通告 / 经纪人</th><th>结算周期</th><th>异议说明</th><th>二审凭证</th><th>二审结论</th><th>状态</th><th>操作</th></tr></thead><tbody>
      {records.map((record) => <tr className="clickable-dispute-row" key={record.id} onClick={(event) => { if (!(event.target as HTMLElement).closest("button, a, textarea, input")) openDisputeBriefing(record); }} onKeyDown={(event) => { if (event.key === "Enter" && event.target === event.currentTarget) openDisputeBriefing(record); }} tabIndex={0}>
        <td><div className="dispute-identity"><strong>{record.briefingTitle}</strong><span className="copy-line">#{record.jarvisBriefingId}<CopyButton value={record.jarvisBriefingId} label="复制通告ID" /></span><small>{record.brokerNickname} · {record.brokerPhone || "-"}</small></div></td>
        <td><div className="dispute-cycle"><strong>{weekCycleForKey(record.originalCycleKey).label}</strong>{record.deferredCycleKey ? <><span>补发至 {weekCycleForKey(record.deferredCycleKey).label}</span><small>{record.deferCompleteReward ? "新增签约奖励" : "有效通告奖励"} {money(disputeRewardAmount(record))}</small></> : null}</div></td>
        <td>{record.reason || "-"}</td>
        <td><div className="dispute-evidence-cell">
          <button className="secondary-action compact-action dispute-upload-action" disabled={uploadingEvidence} onClick={() => chooseDisputeEvidence(record.id)} type="button"><Upload size={14} />{record.evidences.length ? "补充凭证" : "上传凭证"}</button>
          {record.evidences.map((evidence) => <div className="dispute-evidence-file" key={evidence.id}><a href={evidence.fileUrl} rel="noreferrer" target="_blank">{evidence.fileName}</a>{record.status === "pending" ? <button aria-label={`删除${evidence.fileName}`} onClick={() => void deleteDisputeEvidence(record.id, evidence.id)} title="删除二审凭证" type="button"><Trash2 size={13} /></button> : null}</div>)}
          {!record.evidences.length ? <small>通过前必须上传</small> : null}
        </div></td>
        <td>{record.status === "pending" ? <textarea onChange={(event) => setResolutionById((current) => ({ ...current, [record.id]: event.target.value }))} placeholder="填写二审依据与结论" rows={2} value={resolutionById[record.id] || ""} /> : record.resolution}</td>
        <td><span className={`status-pill ${record.status === "approved" ? "success" : record.status === "rejected" ? "danger" : "warning"}`}>{record.status === "approved" ? "二审通过" : record.status === "rejected" ? "二审不通过" : "待二审"}</span></td>
        <td><div className="dispute-review-actions">{record.status === "pending" ? <><button aria-label="二审通过" className="icon-only-button approve" disabled={!record.evidences.length} onClick={() => void reviewRecord(record, "approved")} title={!record.evidences.length ? "请先上传二审凭证" : "二审通过"} type="button"><Check size={17} /></button><button aria-label="二审不通过" className="icon-only-button reject" onClick={() => void reviewRecord(record, "rejected")} title="二审不通过" type="button"><XCircle size={17} /></button></> : <span className="muted">-</span>}</div></td>
      </tr>)}
    </tbody></table></div>
    {!records.length ? <p className="empty-state">暂无争议通告。</p> : null}
  </div>;
}

function Dashboard({
  brokersData,
  briefingsData,
  importBatchesData,
  onOpenAudit,
  onOpenBroker,
  onOpenBrokers,
  onOpenDataSync
}: {
  brokersData: Broker[];
  briefingsData: Briefing[];
  importBatchesData: ImportBatch[];
  onOpenAudit?: () => void;
  onOpenBroker: (broker: Broker) => void;
  onOpenBrokers?: () => void;
  onOpenDataSync?: () => void;
}) {
  const brokerPerformanceRows = buildBrokerPerformanceRows(brokersData, briefingsData);
  const eligibleBriefings = programEligibleBriefings(brokersData, briefingsData);
  const reviewSummary = buildProgramReviewSummary(brokersData, briefingsData);
  const validPublishCount = brokerPerformanceRows.reduce((total, row) => total + row.validPublishCount, 0);
  const bonusCompleteCount = brokerPerformanceRows.reduce((total, row) => total + row.bonusCompleteCount, 0);
  const signedSummary = buildSignedModelSummary(eligibleBriefings);
  const pendingPublishCount = reviewSummary.pendingPublishCount;
  const pendingCompleteCount = reviewSummary.pendingCompleteCount;
  const promotionReadyRows = brokerPerformanceRows
    .filter((row) => row.isPromotionReady
      && row.broker.brokerLevel === "normal"
      && Boolean(row.broker.seedPhase && row.broker.seedProgramJoinedAt))
    .sort((left, right) => right.rewardAmount - left.rewardAmount);
  const promotionCandidates = promotionReadyRows.slice(0, 5);
  const rewardLeaders = [...brokerPerformanceRows]
    .filter((row) => row.rewardAmount > 0)
    .sort((left, right) => right.rewardAmount - left.rewardAmount)
    .slice(0, 6);
  const estimatedRewardAmount = brokerPerformanceRows.reduce((total, row) => total + row.rewardAmount, 0);
  const pendingReviewCount = pendingPublishCount + pendingCompleteCount;
  const importedDetailCount = briefingsData.filter((item) => item.detailImported).length;
  const detailCoverage = briefingsData.length ? Math.round((importedDetailCount / briefingsData.length) * 100) : 100;
  const latestBatch = [...importBatchesData].sort((left, right) => dateValue(right.importedAt) - dateValue(left.importedAt))[0];

  return (
    <section className="page">
      <PageHeader
        eyebrow="Operations"
        title="运营工作总览"
        description="先处理审核与资料异常，再跟进晋升候选和奖励结果。"
      />

      <section className="operations-overview panel">
        <div className="operations-overview-primary">
          <span>当前首要任务</span>
          <div><strong>{pendingReviewCount}</strong><b>项待审核</b></div>
          <p>{pendingReviewCount ? `其中有效通告 ${pendingPublishCount} 项、新增签约 ${pendingCompleteCount} 项，建议优先处理。` : "当前没有待审核任务，可继续检查资料完整性与晋升候选。"}</p>
          {onOpenAudit ? <button className="operations-overview-action" onClick={onOpenAudit} type="button">进入审核中心<ExternalLink size={14} /></button> : null}
        </div>
        <div className="operations-signal-grid">
          <div className={reviewSummary.missingEvidenceCount ? "operations-signal warning" : "operations-signal success"}>
            <span>凭证缺口</span>
            <strong>{reviewSummary.missingEvidenceCount}</strong>
            <small>待审核且未上传凭证</small>
          </div>
          <div className={reviewSummary.missingDetailCount ? "operations-signal warning" : "operations-signal success"}>
            <span>资料完整度</span>
            <strong>{detailCoverage}%</strong>
            <small>{reviewSummary.missingDetailCount} 条通告待补详情</small>
          </div>
          <div className="operations-signal">
            <span>待晋升跟进</span>
            <strong>{promotionReadyRows.length}</strong>
            <small>已达到 6 + 2 条件</small>
          </div>
          <div className={latestBatch?.status === "失败" ? "operations-signal danger" : "operations-signal success"}>
            <span>最近数据同步</span>
            <strong>{latestBatch?.status ?? "暂无"}</strong>
            <small>{latestBatch ? latestBatch.importedAt : "尚无同步批次"}</small>
          </div>
        </div>
      </section>

      <div className="metric-grid operations-result-grid">
        <MetricCard label="有效通告" value={validPublishCount} delta="人工审核通过后计数" />
        <MetricCard label="新增签约" value={bonusCompleteCount} delta="审核通过且完成历史判重" />
        <MetricCard label="已签约模特" value={signedSummary.totalSignedModelCount} delta={`${signedSummary.newLatestModels.length} 位最近新增`} />
        <MetricCard label="种子经纪人" value={brokersData.filter((broker) => broker.brokerLevel === "seed").length} delta={`${brokersData.filter((broker) => broker.referralUnlocked).length} 位已开引荐`} />
        <MetricCard label="经纪人总数" value={brokersData.length} delta={`最近同步覆盖 ${latestBatch?.brokerCount ?? 0} 位`} />
        <MetricCard label="当前预估奖金" value={money(estimatedRewardAmount)} delta="发布奖 + 完成奖，结算前预估" />
      </div>

      <div className="two-column operations-workspace">
        <section className="panel">
          <PanelTitle icon={<ListChecks size={18} />} title="优先处理队列" />
          <div className="task-grid">
            <TaskCard label="有效通告待审核" value={pendingPublishCount} hint="核对视频凭证与通告详情" tone={pendingPublishCount ? "warning" : "default"} onAction={onOpenAudit} />
            <TaskCard label="新增签约待审核" value={pendingCompleteCount} hint="核对签约者并执行历史判重" tone={pendingCompleteCount ? "warning" : "default"} onAction={onOpenAudit} />
            <TaskCard label="缺少审核凭证" value={reviewSummary.missingEvidenceCount} hint="补齐凭证后才能完成审核" tone={reviewSummary.missingEvidenceCount ? "danger" : "default"} onAction={onOpenAudit} />
            <TaskCard label="通告详情待补" value={reviewSummary.missingDetailCount} hint="检查同步结果与缺失字段" tone={reviewSummary.missingDetailCount ? "warning" : "default"} onAction={onOpenDataSync} />
            <TaskCard label="晋升候选待跟进" value={promotionReadyRows.length} hint="已达到 6 个有效通告 + 2 个新增签约" onAction={onOpenBrokers} />
          </div>
        </section>

        <section className="panel">
          <PanelTitle icon={<Sprout size={18} />} title="晋升候选" />
          <div className="rank-list">
            {promotionCandidates.map((row) => (
              <button className="rank-row" key={row.broker.id} onClick={() => onOpenBroker(row.broker)} type="button">
                <div>
                  <strong>{row.broker.nickname}</strong>
                  <span>{row.broker.boundPhone} · #{row.broker.miniProgramUserId}</span>
                </div>
                <div className="rank-metrics">
                  <b>{row.validPublishCount}+{row.bonusCompleteCount}</b>
                  <span>有效通告/新增签约</span>
                </div>
              </button>
            ))}
            {promotionCandidates.length === 0 ? <p className="empty-state compact-empty">暂无新的晋升候选。</p> : null}
          </div>
        </section>
      </div>

      <div className="two-column">
        <section className="panel">
          <PanelTitle icon={<CircleDollarSign size={18} />} title="奖金贡献排行" />
          <div className="dashboard-table">
            <table>
              <thead>
                <tr>
                  <th>经纪人</th>
                  <th>有效通告</th>
                  <th>新增签约</th>
                  <th>预估奖金</th>
                </tr>
              </thead>
              <tbody>
                {rewardLeaders.map((row) => (
                  <tr className="clickable-row" key={row.broker.id} onClick={() => onOpenBroker(row.broker)}>
                    <td>
                      <strong>{row.broker.nickname}</strong>
                      <span>{row.broker.boundPhone}</span>
                    </td>
                    <td>{row.validPublishCount}</td>
                    <td>{row.bonusCompleteCount}</td>
                    <td>{money(row.rewardAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rewardLeaders.length === 0 ? <p className="empty-state compact-empty">暂无已形成奖金的数据。</p> : null}
          </div>
        </section>

        <section className="panel">
          <PanelTitle icon={<UsersRound size={18} />} title="最近导入批次" />
          <ImportBatchList batches={importBatchesData} />
        </section>
      </div>
    </section>
  );
}

function TaskCard({
  label,
  value,
  hint,
  tone = "default",
  onAction
}: {
  label: string;
  value: number;
  hint: string;
  tone?: "default" | "warning" | "danger";
  onAction?: () => void;
}) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
      {onAction ? <b className="task-card-action">前往处理<ExternalLink size={13} /></b> : null}
    </>
  );
  return onAction
    ? <button className={`task-card task-card-button ${tone}`} onClick={onAction} type="button">{content}</button>
    : <div className={`task-card ${tone}`}>{content}</div>;
}

function ImportBatchList({ batches }: { batches: ImportBatch[] }) {
  return (
    <div className="import-box">
      <div className="import-source">
        <div>
          <strong>鑫通告数据源</strong>
          <span>经纪人列表 / 通告列表 / 通告详情 / 已签约名单</span>
        </div>
      </div>
      <div className="timeline">
        {batches.slice(0, 4).map((batch, index) => (
          <TimelineItem
            key={batch.id}
            title={batch.title}
            detail={`经纪人 ${batch.brokerCount}；通告 ${batch.briefingCount}；新增 ${batch.newBriefingCount} 条 · ${batch.status}`}
            active={index === 0}
          />
        ))}
        {batches.length === 0 ? <p className="empty-state compact-empty">暂无导入批次。</p> : null}
      </div>
    </div>
  );
}

type AnalyticsTimeUnit = "week" | "month" | "quarter";

function analyticsPeriod(unit: AnalyticsTimeUnit, anchor = new Date()) {
  if (unit === "week") {
    const cycle = weekCycleForDate(anchor);
    const start = cycle.start ?? anchor;
    return { start, end: new Date(start.getTime() + 7 * 86400000), label: cycle.shortLabel };
  }
  if (unit === "month") {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    return { start, end: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1), label: `${anchor.getFullYear()}年${anchor.getMonth() + 1}月` };
  }
  const quarter = Math.floor(anchor.getMonth() / 3);
  const start = new Date(anchor.getFullYear(), quarter * 3, 1);
  return { start, end: new Date(anchor.getFullYear(), quarter * 3 + 3, 1), label: `${anchor.getFullYear()}年第${quarter + 1}季度` };
}

function previousAnalyticsPeriod(unit: AnalyticsTimeUnit, current: ReturnType<typeof analyticsPeriod>) {
  const anchor = unit === "week"
    ? new Date(current.start.getTime() - 86400000)
    : unit === "month"
      ? new Date(current.start.getFullYear(), current.start.getMonth() - 1, 15)
      : new Date(current.start.getFullYear(), current.start.getMonth() - 3, 15);
  return analyticsPeriod(unit, anchor);
}

function inAnalyticsPeriod(value: string | Date, period: ReturnType<typeof analyticsPeriod>) {
  const timestamp = dateValue(value);
  return timestamp >= period.start.getTime() && timestamp < period.end.getTime();
}

function analyticsPerformance(broker: Pick<Broker, "id" | "brokerLevel" | "seedPhase" | "seedProgramJoinedAt" | "seedQualifiedAt">, briefingsData: Briefing[], period: ReturnType<typeof analyticsPeriod>) {
  const brokerItems = briefingsData.filter((briefing) => briefing.brokerId === broker.id);
  const profile = buildRewardProfile(brokerItems, undefined, brokerSelfRewardStartAt(broker));
  const validPublishCount = profile.validPublishBriefings.filter((briefing) => inAnalyticsPeriod(briefing.publishedAt, period)).length;
  const bonusCompleteCount = profile.bonusCompleteRows.filter((row) => {
    const completedAt = activityEndAt(row.briefing.workDate, row.briefing.workTime) ?? row.briefing.publishedAt;
    return inAnalyticsPeriod(completedAt, period);
  }).length;
  return { validPublishCount, bonusCompleteCount };
}

function analyticsDelta(current: number, previous: number) {
  const amount = current - previous;
  const amountText = `${amount > 0 ? "+" : ""}${amount}`;
  if (previous === 0) return current === 0 ? "持平 0" : `由 0 增至 ${current}`;
  const rate = (amount / previous) * 100;
  return `${amountText} · ${rate > 0 ? "+" : ""}${rate.toFixed(1)}%`;
}

function Stats({ brokersData, briefingsData }: { brokersData: Broker[]; briefingsData: Briefing[] }) {
  const phases = Array.from(new Set(brokersData.map((broker) => broker.seedPhase).filter((phase): phase is number => Boolean(phase)))).sort((left, right) => left - right);
  const [selectedPhase, setSelectedPhase] = useState(phases[0] ?? 1);
  const [timeUnit, setTimeUnit] = useState<AnalyticsTimeUnit>("week");
  const [selectedSeedId, setSelectedSeedId] = useState("all");
  const [referralsBySeed, setReferralsBySeed] = useState<Record<string, ReferralNode[]>>({});
  const initialSeeds = brokersData.filter((broker) => broker.brokerLevel === "seed" && !broker.referrerBoundAt);
  const phaseSeeds = initialSeeds.filter((broker) => broker.seedPhase === selectedPhase);
  const selectedSeeds = selectedSeedId === "all" ? phaseSeeds : phaseSeeds.filter((broker) => broker.id === selectedSeedId);
  const currentPeriod = analyticsPeriod(timeUnit);
  const previousPeriod = previousAnalyticsPeriod(timeUnit, currentPeriod);

  useEffect(() => {
    let active = true;
    Promise.all(initialSeeds.map(async (broker) => {
      const response = await fetch(`/api/brokers/${broker.id}/referrals`);
      return [broker.id, response.ok ? await response.json() as ReferralNode[] : []] as const;
    })).then((entries) => {
      if (active) setReferralsBySeed(Object.fromEntries(entries));
    }).catch(() => {
      if (active) setReferralsBySeed({});
    });
    return () => { active = false; };
  }, [brokersData]);

  useEffect(() => {
    if (selectedSeedId !== "all" && !phaseSeeds.some((broker) => broker.id === selectedSeedId)) setSelectedSeedId("all");
  }, [phaseSeeds, selectedSeedId]);

  const sumPerformance = (brokers: Array<Pick<Broker, "id" | "brokerLevel" | "seedPhase" | "seedProgramJoinedAt" | "seedQualifiedAt">>, period: ReturnType<typeof analyticsPeriod>) => brokers.reduce((totals, broker) => {
    const performance = analyticsPerformance(broker, briefingsData, period);
    return { validPublishCount: totals.validPublishCount + performance.validPublishCount, bonusCompleteCount: totals.bonusCompleteCount + performance.bonusCompleteCount };
  }, { validPublishCount: 0, bonusCompleteCount: 0 });

  const selectedReferrals = selectedSeeds.flatMap((broker) => referralsBySeed[broker.id] ?? []);
  const uniqueReferrals = Array.from(new Map(selectedReferrals.map((node) => [node.id, node])).values());
  const currentOwn = sumPerformance(selectedSeeds, currentPeriod);
  const previousOwn = sumPerformance(selectedSeeds, previousPeriod);
  const currentReferral = sumPerformance(uniqueReferrals, currentPeriod);
  const previousReferral = sumPerformance(uniqueReferrals, previousPeriod);
  const activeReferralCount = uniqueReferrals.filter((node) => {
    const value = analyticsPerformance(node, briefingsData, currentPeriod);
    return value.validPublishCount > 0 || value.bonusCompleteCount > 0;
  }).length;
  const previousActiveReferralCount = uniqueReferrals.filter((node) => {
    const value = analyticsPerformance(node, briefingsData, previousPeriod);
    return value.validPublishCount > 0 || value.bonusCompleteCount > 0;
  }).length;
  const signedReferralCount = uniqueReferrals.filter((node) => analyticsPerformance(node, briefingsData, currentPeriod).bonusCompleteCount > 0).length;
  const promotedReferralCount = uniqueReferrals.filter((node) => node.brokerLevel === "seed").length;
  const qualifiedReferralCount = uniqueReferrals.filter((node) => node.validPublishCount >= 6 && node.validCompleteCount >= 2).length;
  const referralBaseCount = uniqueReferrals.filter((node) => {
    const cycleKey = referralBaseAwardCycle(node, briefingsData.filter((briefing) => briefing.brokerId === node.id));
    const cycle = cycleKey ? weekCycleForKey(cycleKey) : null;
    return Boolean(cycle?.start && inAnalyticsPeriod(cycle.start, currentPeriod));
  }).length;
  const commissionAmount = referralBaseCount * 10 + currentReferral.bonusCompleteCount;
  const totalValidPublish = currentOwn.validPublishCount + currentReferral.validPublishCount;
  const totalSigning = currentOwn.bonusCompleteCount + currentReferral.bonusCompleteCount;
  const previousTotalPublish = previousOwn.validPublishCount + previousReferral.validPublishCount;
  const previousTotalSigning = previousOwn.bonusCompleteCount + previousReferral.bonusCompleteCount;
  const activationRate = percentValue(activeReferralCount, uniqueReferrals.length);
  const promotionRate = percentValue(promotedReferralCount, uniqueReferrals.length);
  const referralContributionRate = percentValue(currentReferral.bonusCompleteCount, totalSigning);
  const costPerSigning = currentReferral.bonusCompleteCount ? commissionAmount / currentReferral.bonusCompleteCount : 0;
  const comparisonChartRows = [
    { label: "有效通告", current: totalValidPublish, previous: previousTotalPublish },
    { label: "新增签约", current: totalSigning, previous: previousTotalSigning },
    { label: "活跃下线", current: activeReferralCount, previous: previousActiveReferralCount }
  ];
  const comparisonChartMax = Math.max(1, ...comparisonChartRows.flatMap((row) => [row.current, row.previous]));
  const ownSigningRate = totalSigning ? (currentOwn.bonusCompleteCount / totalSigning) * 100 : 0;
  const referralSigningRate = totalSigning ? (currentReferral.bonusCompleteCount / totalSigning) * 100 : 0;

  const seedRows = selectedSeeds.map((broker) => {
    const own = analyticsPerformance(broker, briefingsData, currentPeriod);
    const referrals = referralsBySeed[broker.id] ?? [];
    const referral = sumPerformance(referrals, currentPeriod);
    const activeCount = referrals.filter((node) => {
      const performance = analyticsPerformance(node, briefingsData, currentPeriod);
      return performance.validPublishCount > 0 || performance.bonusCompleteCount > 0;
    }).length;
    const baseCount = referrals.filter((node) => {
      const cycleKey = referralBaseAwardCycle(node, briefingsData.filter((briefing) => briefing.brokerId === node.id));
      const cycle = cycleKey ? weekCycleForKey(cycleKey) : null;
      return Boolean(cycle?.start && inAnalyticsPeriod(cycle.start, currentPeriod));
    }).length;
    return { broker, own, referrals, referral, activeCount, commission: baseCount * 10 + referral.bonusCompleteCount };
  }).sort((left, right) => right.referral.bonusCompleteCount - left.referral.bonusCompleteCount || right.referrals.length - left.referrals.length);

  const phaseRows = phases.map((phase) => {
    const seeds = initialSeeds.filter((broker) => broker.seedPhase === phase);
    const referrals = Array.from(new Map(seeds.flatMap((broker) => referralsBySeed[broker.id] ?? []).map((node) => [node.id, node])).values());
    const own = sumPerformance(seeds, currentPeriod);
    const referral = sumPerformance(referrals, currentPeriod);
    return { phase, seeds, referrals, own, referral };
  });
  const comparisonPhase = phaseRows.find((row) => row.phase !== selectedPhase);
  const comparisonSigningPerSeed = comparisonPhase?.seeds.length ? (comparisonPhase.own.bonusCompleteCount + comparisonPhase.referral.bonusCompleteCount) / comparisonPhase.seeds.length : 0;
  const currentSigningPerSeed = selectedSeeds.length ? totalSigning / selectedSeeds.length : 0;
  const effectivenessText = uniqueReferrals.length === 0
    ? `第${selectedPhase}期当前没有已关联下线，暂时无法判断裂变成效。`
    : `${currentPeriod.label}共开发 ${uniqueReferrals.length} 位直接下线，${activeReferralCount} 位产生有效业务，下线激活率 ${activationRate}。下线贡献 ${currentReferral.bonusCompleteCount} 个新增签约，占本期总新增签约 ${referralContributionRate}；裂变提成 ${money(commissionAmount)}，每个下线新增签约成本 ${money(costPerSigning)}。`;
  const comparisonText = comparisonPhase
    ? `按每位初始种子计算，第${selectedPhase}期本周期新增签约 ${currentSigningPerSeed.toFixed(1)} 个，第${comparisonPhase.phase}期为 ${comparisonSigningPerSeed.toFixed(1)} 个，${currentSigningPerSeed >= comparisonSigningPerSeed ? `第${selectedPhase}期效率更高` : `第${comparisonPhase.phase}期效率更高`}。`
    : "当前只有一个种子期数，待新增下一期后可自动生成跨期对比。";

  return (
    <section className="page seed-analytics-page">
      <PageHeader
        eyebrow="Seed Growth Analytics"
        title="种子裂变经营分析"
        description="面向管理层审阅种子计划规模、业务产出、裂变质量与提成投入效率。"
      />
      <section className="panel analytics-toolbar">
        <label><span>种子期数</span><select value={selectedPhase} onChange={(event) => { setSelectedPhase(Number(event.target.value)); setSelectedSeedId("all"); }}>{phases.map((phase) => <option key={phase} value={phase}>第{phase}期</option>)}</select></label>
        <div><span>时间维度</span><div className="segmented">{([['week', '结算周'], ['month', '月'], ['quarter', '季度']] as const).map(([key, label]) => <button className={timeUnit === key ? "active" : ""} key={key} onClick={() => setTimeUnit(key)} type="button">{label}</button>)}</div></div>
        <label><span>统计对象</span><select value={selectedSeedId} onChange={(event) => setSelectedSeedId(event.target.value)}><option value="all">全部初始种子经纪人</option>{phaseSeeds.map((broker) => <option key={broker.id} value={broker.id}>{broker.nickname}</option>)}</select></label>
        <div className="analytics-period-label"><span>当前统计周期</span><strong>{currentPeriod.label}</strong><small>对比：{previousPeriod.label}</small></div>
      </section>

      <div className="metric-grid analytics-metric-grid">
        <MetricCard label="初始种子经纪人" value={selectedSeeds.length} delta={`第${selectedPhase}期 · 非裂变下线`} />
        <MetricCard label="有效通告" value={totalValidPublish} delta={analyticsDelta(totalValidPublish, previousTotalPublish)} />
        <MetricCard label="新增签约" value={totalSigning} delta={analyticsDelta(totalSigning, previousTotalSigning)} />
        <MetricCard label="直接下线 / 活跃" value={`${uniqueReferrals.length} / ${activeReferralCount}`} delta={`激活率 ${activationRate}`} />
        <MetricCard label="达标 / 已晋升" value={`${qualifiedReferralCount} / ${promotedReferralCount}`} delta={`晋升率 ${promotionRate}`} />
        <MetricCard label="裂变提成" value={money(commissionAmount)} delta={`签约成本 ${money(costPerSigning)}/个`} />
      </div>

      <div className="analytics-chart-grid">
        <section className="panel analytics-chart-panel">
          <PanelTitle icon={<BarChart3 size={18} />} title="周期数据对比" />
          <div className="analytics-chart-legend"><span className="current">当前：{currentPeriod.label}</span><span className="previous">上一周期：{previousPeriod.label}</span></div>
          <div className="comparison-bar-chart">
            {comparisonChartRows.map((row) => (
              <div className="comparison-bar-row" key={row.label}>
                <strong>{row.label}</strong>
                <div className="comparison-bars">
                  <div><span className="current-bar" style={{ width: `${(row.current / comparisonChartMax) * 100}%` }} /><b>{row.current}</b></div>
                  <div><span className="previous-bar" style={{ width: `${(row.previous / comparisonChartMax) * 100}%` }} /><b>{row.previous}</b></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel analytics-chart-panel">
          <PanelTitle icon={<GitBranch size={18} />} title="新增签约来源占比" />
          <div className="donut-chart-layout">
            <div
              aria-label={`本人贡献 ${ownSigningRate.toFixed(1)}%，下线贡献 ${referralSigningRate.toFixed(1)}%`}
              className={`analytics-donut ${totalSigning === 0 ? "empty" : ""}`}
              role="img"
              style={{ "--referral-rate": `${referralSigningRate}%` } as React.CSSProperties}
            >
              <div><strong>{totalSigning}</strong><span>新增签约</span></div>
            </div>
            <div className="donut-breakdown">
              <div><span className="donut-swatch own" /><p><small>种子本人</small><strong>{currentOwn.bonusCompleteCount} 个 · {ownSigningRate.toFixed(1)}%</strong></p></div>
              <div><span className="donut-swatch referral" /><p><small>直接下线</small><strong>{currentReferral.bonusCompleteCount} 个 · {referralSigningRate.toFixed(1)}%</strong></p></div>
              <p className="donut-note">下线贡献越高，代表种子计划越能形成持续裂变，而不是依赖初始种子本人产出。</p>
            </div>
          </div>
        </section>
      </div>

      <div className="two-column">
        <section className="panel analytics-insight-panel">
          <PanelTitle icon={<BarChart3 size={18} />} title="管理层分析摘要" />
          <p>{effectivenessText}</p>
          <p>{comparisonText}</p>
          <div className="analytics-callouts"><span>下线签约贡献 <strong>{referralContributionRate}</strong></span><span>人均新增签约 <strong>{currentSigningPerSeed.toFixed(1)}</strong></span><span>提成投入 <strong>{money(commissionAmount)}</strong></span></div>
        </section>

        <section className="panel">
          <PanelTitle icon={<GitBranch size={18} />} title="直接下线转化漏斗" />
          <div className="funnel-list">
            {[
              { label: "已关联直接下线", value: uniqueReferrals.length },
              { label: "本周期活跃下线", value: activeReferralCount },
              { label: "产生新增签约", value: signedReferralCount },
              { label: "累计达到 6 + 2", value: qualifiedReferralCount },
              { label: "已晋升种子经纪人", value: promotedReferralCount }
            ].map((row) => (
              <div className="funnel-row" key={row.label}>
                <div><strong>{row.label}</strong><span>{row.value} 人 · {percentValue(row.value, uniqueReferrals.length)}</span></div>
                <div className="mini-bar" aria-hidden="true"><span style={{ width: percentValue(row.value, uniqueReferrals.length) }} /></div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel table-panel">
        <PanelTitle icon={<UsersRound size={18} />} title={`第${selectedPhase}期种子经纪人个人表现`} />
        <table>
          <thead><tr><th>初始种子经纪人</th><th>本人有效通告 / 签约</th><th>直接下线 / 活跃</th><th>下线有效通告 / 签约</th><th>下线签约贡献</th><th>裂变提成</th></tr></thead>
          <tbody>
            {seedRows.map((row) => <tr key={row.broker.id}><td><div className="user-cell"><strong>{row.broker.nickname}</strong><span>{row.broker.boundPhone} · #{row.broker.miniProgramUserId}</span></div></td><td>{row.own.validPublishCount} / {row.own.bonusCompleteCount}</td><td>{row.referrals.length} / {row.activeCount}</td><td>{row.referral.validPublishCount} / {row.referral.bonusCompleteCount}</td><td>{percentValue(row.referral.bonusCompleteCount, row.own.bonusCompleteCount + row.referral.bonusCompleteCount)}</td><td><strong>{money(row.commission)}</strong></td></tr>)}
            {seedRows.length === 0 ? <tr><td colSpan={6}><p className="empty-state compact-empty">当前期数没有符合“无上线关系”的初始种子经纪人。</p></td></tr> : null}
          </tbody>
        </table>
      </section>

      <section className="panel table-panel">
        <PanelTitle icon={<Sprout size={18} />} title="种子期数横向对比" />
        <table><thead><tr><th>期数</th><th>初始种子</th><th>直接下线</th><th>有效通告</th><th>新增签约</th><th>人均签约</th><th>下线签约贡献</th></tr></thead><tbody>{phaseRows.map((row) => {
          const publishCount = row.own.validPublishCount + row.referral.validPublishCount;
          const signingCount = row.own.bonusCompleteCount + row.referral.bonusCompleteCount;
          return <tr className={row.phase === selectedPhase ? "analytics-selected-row" : ""} key={row.phase}><td><strong>第{row.phase}期</strong></td><td>{row.seeds.length}</td><td>{row.referrals.length}</td><td>{publishCount}</td><td>{signingCount}</td><td>{row.seeds.length ? (signingCount / row.seeds.length).toFixed(1) : "0.0"}</td><td>{percentValue(row.referral.bonusCompleteCount, signingCount)}</td></tr>;
        })}</tbody></table>
      </section>
    </section>
  );
}

function BrokerList({
  brokersData,
  onOpenBroker,
  onPageChange,
  pageNumber,
  onRefresh
}: {
  brokersData: Broker[];
  onOpenBroker: (broker: Broker) => void;
  onPageChange: (page: number) => void;
  pageNumber: number;
  onRefresh: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<BrokerFilter>("all");
  const [seedPhaseFilter, setSeedPhaseFilter] = useState<SeedPhaseFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [importTone, setImportTone] = useState<"neutral" | "success" | "error">("neutral");
  const [isImporting, setIsImporting] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ percent: 0, stage: "正在准备同步" });

  useEffect(() => {
    if (!isImporting) return;
    let active = true;
    const loadProgress = async () => {
      try {
        const response = await fetch("/api/data-sync/active");
        const run = await response.json() as { progressPercent?: number; progressStage?: string } | null;
        if (active && response.ok && run) {
          setSyncProgress({ percent: run.progressPercent ?? 0, stage: run.progressStage || "正在同步数据" });
        }
      } catch {
        // 同步请求仍会在自身流程中反馈错误，这里不覆盖当前进度提示。
      }
    };
    void loadProgress();
    const interval = window.setInterval(() => { void loadProgress(); }, 700);
    return () => { active = false; window.clearInterval(interval); };
  }, [isImporting]);

  useEffect(() => {
    if (importTone !== "success" || !importStatus) return;
    const timer = window.setTimeout(() => setImportStatus(""), 1500);
    return () => window.clearTimeout(timer);
  }, [importStatus, importTone]);

  const filteredBrokers = brokersData.filter((broker) => {
    const matchesFilter =
      filter === "all" ||
      (filter === "normal" && broker.brokerLevel === "normal" && Boolean(broker.seedPhase)) ||
      (filter === "seed" && broker.brokerLevel === "seed");
    const matchesSeedPhase =
      filter !== "seed" ||
      seedPhaseFilter === "all" ||
      (seedPhaseFilter === "none" && !broker.seedPhase) ||
      String(broker.seedPhase) === seedPhaseFilter;
    const normalizedKeyword = keyword.trim().toLowerCase();
    const matchesKeyword = !normalizedKeyword || [
      broker.nickname,
      broker.boundPhone,
      broker.wechatPhone,
      broker.miniProgramUserId
    ].some((value) => value.toLowerCase().includes(normalizedKeyword));
    return matchesFilter && matchesSeedPhase && matchesKeyword;
  });
  const brokerPage = paginate(filteredBrokers, pageNumber);

  function exportBrokers() {
    const header = ["昵称", "用户ID", "绑定手机号", "微信手机号", "实名", "级别", "种子期数", "引荐权限", "注册时间", "最后登录", "发布通告", "完成通告", "报名人次", "签约人次", "报名人数", "签约人数", "账号状态"];
    const rows = filteredBrokers.map((broker) => [
      broker.nickname,
      broker.miniProgramUserId,
      broker.boundPhone,
      broker.wechatPhone,
      broker.realNameStatus,
      broker.brokerLevel === "seed" ? "种子经纪人" : broker.seedPhase ? "普通经纪人（引荐）" : "无身份",
      broker.seedPhase ? `种子-${broker.seedPhase}` : "",
      broker.referralUnlocked ? "已开通" : "未开通",
      broker.registeredAt,
      broker.lastLoginAt,
      broker.publishedBriefings,
      broker.completedBriefings,
      broker.signupTotalTimes,
      broker.contractTotalTimes,
      broker.signupTotalPeople,
      broker.contractTotalPeople,
      broker.accountStatus
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `鑫通告经纪人数据-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function syncBrokersFromOpenApi() {
    setIsImporting(true);
    setImportTone("neutral");
    setImportStatus("");
    setSyncProgress({ percent: 0, stage: "正在准备同步" });
    try {
      const response = await fetch("/api/data-sync/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
      const result = await response.json() as { error?: string; brokerCount?: number; briefingCount?: number; participantCount?: number; modelCount?: number };
      if (!response.ok) {
        throw new Error(result.error || "鑫通告数据同步失败");
      }
      await onRefresh();
      recordClientOperation("用户管理", "点击“同步鑫通告数据”", `用户管理页面 · 经纪人 ${result.brokerCount ?? 0} 位 · 关联通告 ${result.briefingCount ?? 0} 条`);
      setImportTone("success");
      setImportStatus(`同步完成：经纪人 ${result.brokerCount ?? 0} 位、关联通告 ${result.briefingCount ?? 0} 条、报名/签约 ${result.participantCount ?? 0} 条、模特 ${result.modelCount ?? 0} 位。`);
    } catch (error) {
      recordClientOperation("用户管理", "点击“同步鑫通告数据”", error instanceof Error ? error.message : "鑫通告数据同步失败", "失败");
      setImportTone("error");
      setImportStatus(error instanceof Error ? error.message : "鑫通告数据同步失败");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <section className="page">
      <PageHeader
        eyebrow="Brokers"
        title="用户管理"
        description="这里管理小程序经纪人用户，支持导入、快照对比和进入个人工作台。数据来源：鑫通告管理系统。"
        action={(
          <div className="header-actions">
            <button className="secondary-action" onClick={exportBrokers} type="button">导出 Excel</button>
            <button className="primary-action" disabled={isImporting} onClick={syncBrokersFromOpenApi} type="button"><RefreshCw size={16} />{isImporting ? "同步中..." : "同步鑫通告数据"}</button>
          </div>
        )}
      />

      {isImporting ? <DinoLoader className="broker-sync-loader" label={syncProgress.stage} progress={syncProgress.percent} /> : null}
      {!isImporting && importStatus ? <p className={`form-status import-status ${importTone}`}>{importStatus}</p> : null}

      <section className="panel table-panel">
        <div className="table-toolbar">
          <div className="broker-filter-cluster">
            <div className="segmented">
              <button className={filter === "all" ? "active" : ""} onClick={() => { setFilter("all"); onPageChange(1); }} type="button">全部</button>
              <button className={filter === "normal" ? "active" : ""} onClick={() => { setFilter("normal"); onPageChange(1); }} type="button">普通经纪人</button>
              <button className={filter === "seed" ? "active" : ""} onClick={() => { setFilter("seed"); setSeedPhaseFilter("all"); setKeyword(""); onPageChange(1); }} type="button">种子经纪人</button>
            </div>
            {filter === "seed" ? (
              <div className="seed-phase-filter derived-filter" aria-label="种子期数筛选">
                <button className={seedPhaseFilter === "all" ? "active" : ""} onClick={() => { setSeedPhaseFilter("all"); onPageChange(1); }} type="button">全部</button>
                {[1, 2, 3, 4, 5, 6].map((phase) => (
                  <button className={seedPhaseFilter === String(phase) ? "active" : ""} key={phase} onClick={() => { setSeedPhaseFilter(String(phase) as SeedPhaseFilter); onPageChange(1); }} title={`第${phase}期种子经纪人`} type="button">
                    <Sprout size={16} /><span>{phase}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <input
            className="search-input"
            onChange={(event) => { setKeyword(event.target.value); onPageChange(1); }}
            placeholder="搜索手机号 / 昵称 / 用户ID"
            value={keyword}
          />
        </div>
        <table>
          <thead>
            <tr>
              <th>经纪人</th>
              <th>实名</th>
              <th>级别</th>
              <th>注册时间</th>
              <th>发布 / 新增签约</th>
              <th>报名 / 签约</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {brokerPage.rows.map((broker) => (
              <tr className="clickable-row" key={broker.id} onClick={() => onOpenBroker(broker)}>
                <td>
                  <div className="user-cell">
                    <strong>{broker.nickname}</strong>
                    <span className="copy-line">
                      {broker.boundPhone}
                      <CopyButton value={broker.boundPhone} label="复制手机号" />
                      · #{broker.miniProgramUserId}
                      <CopyButton value={broker.miniProgramUserId} label="复制用户ID" />
                    </span>
                  </div>
                </td>
                <td>{broker.realNameStatus}</td>
                <td><LevelBadge broker={broker} /></td>
                <td>{broker.registeredAt}</td>
                <td>{broker.publishedBriefings} / {broker.completedBriefings}</td>
                <td>
                  <div className="metric-pair">
                    <strong>{broker.signupTotalTimes} / {broker.contractTotalTimes}</strong>
                    <span>{broker.signupTotalPeople} / {broker.contractTotalPeople} 人</span>
                  </div>
                </td>
                <td>
                  <div className="broker-row-statuses">
                    <span className="status-pill success">{broker.accountStatus}</span>
                    {broker.lastBriefingImportedAt ? (
                      <span className="status-pill imported" title={`已导入 ${broker.briefingImportCount} 条通告`}>通告已导入 · {broker.lastBriefingImportedAt}</span>
                    ) : <span className="status-pill warning">通告未导入</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <TablePagination
          page={brokerPage.page}
          pageSize={brokerPage.pageSize}
          total={filteredBrokers.length}
          totalPages={brokerPage.totalPages}
          onPageChange={onPageChange}
        />
      </section>
    </section>
  );
}

function BrokerWorkspace({
  broker,
  brokersData,
  briefingsData,
  tab,
  selectedCycleKey,
  onCycleChange,
  onTabChange,
  onBack,
  onPromoteBroker,
  onBrokerLevelUpdate,
  onRefresh,
  onBriefingsChange,
  onOpenBroker,
  onOpenBriefingReview,
  onOpenSigner,
  onSubmitFinanceOrder,
  onCancelFinanceOrder,
  financeOrders
}: {
  broker: Broker;
  brokersData: Broker[];
  briefingsData: Briefing[];
  tab: WorkspaceTab;
  selectedCycleKey: string;
  onCycleChange: (cycleKey: string) => void;
  onTabChange: (tab: WorkspaceTab) => void;
  onBack: () => void;
  onPromoteBroker: (brokerId: string, promotedAt: string) => Promise<Broker>;
  onBrokerLevelUpdate: (brokerId: string, payload: BrokerLevelUpdate) => Promise<Broker>;
  onRefresh: () => Promise<void>;
  onBriefingsChange: React.Dispatch<React.SetStateAction<Briefing[]>>;
  onOpenBroker: (broker: Broker) => void;
  onOpenBriefingReview: (briefing: Briefing) => void;
  onOpenSigner: (signerId: string) => void;
  onSubmitFinanceOrder: (order: Omit<FinanceOrder, "id" | "submittedAt" | "status">) => void;
  onCancelFinanceOrder: (orderId: string) => void;
  financeOrders: FinanceOrder[];
}) {
  const brokerBriefings = briefingsData
    .filter((briefing) => briefing.brokerId === broker.id)
    .sort((left, right) => dateValue(right.publishedAt) - dateValue(left.publishedAt));
  const currentIncentiveStartAt = brokerCurrentIncentiveStartAt(broker);
  const weekCycles = buildWeekCycleOptions(brokerBriefings, currentIncentiveStartAt);
  const activeCycleKey = weekCycles.some((cycle) => cycle.key === selectedCycleKey)
    ? selectedCycleKey
    : latestWeekCycleKey(brokerBriefings, currentIncentiveStartAt);
  const activeCycle = weekCycles.find((cycle) => cycle.key === activeCycleKey);
  const scopedBriefings = cycleBriefings(brokerBriefings, activeCycleKey, currentIncentiveStartAt);
  const rewardProfile = buildRewardProfile(brokerBriefings, activeCycleKey, currentIncentiveStartAt);
  const cumulativeRewardProfile = buildRewardProfile(brokerBriefings, undefined, currentIncentiveStartAt);
  const previousCycleKey = previousWeekCycleKey(activeCycleKey);
  const previousScopedBriefings = previousCycleKey ? cycleBriefings(brokerBriefings, previousCycleKey, currentIncentiveStartAt) : [];
  const previousRewardProfile = previousCycleKey ? buildRewardProfile(brokerBriefings, previousCycleKey, currentIncentiveStartAt) : buildRewardProfile([], "", currentIncentiveStartAt);
  const validPublishCount = rewardProfile.validPublishCount;
  const validCompleteCount = rewardProfile.bonusCompleteCount;
  const pendingReviewCount = activeCycleKey === pastCycleKey ? 0 : scopedBriefings.filter((item) => needsAdminEvidenceReview(item)).length;
  const currentWeekBriefingCount = activeCycleKey === pastCycleKey ? 0 : scopedBriefings.filter((item) => weekCycleForDate(item.publishedAt).key === activeCycleKey).length;
  const previousWeekBriefingCount = previousCycleKey === pastCycleKey ? 0 : previousScopedBriefings.filter((item) => weekCycleForDate(item.publishedAt).key === previousCycleKey).length;
  const promotionValidPublishCount = cumulativeRewardProfile.validPublishCount;
  const promotionValidCompleteCount = cumulativeRewardProfile.bonusCompleteCount;
  const promotionEligible = promotionValidPublishCount >= 6 && promotionValidCompleteCount >= 2;
  const needsPromotion = promotionEligible
    && broker.brokerLevel === "normal"
    && Boolean(broker.seedPhase && broker.seedProgramJoinedAt);
  const [showPromotionModal, setShowPromotionModal] = useState(false);
  const [promotionQualifiedAt, setPromotionQualifiedAt] = useState(() => dateTimeInputValue(broker.seedQualifiedAt));
  const [promotionStatus, setPromotionStatus] = useState("");
  const [identityReviewActionStatus, setIdentityReviewActionStatus] = useState("");

  useEffect(() => {
    setPromotionQualifiedAt(dateTimeInputValue(broker.seedQualifiedAt ?? undefined));
    setPromotionStatus("");
    setShowPromotionModal(needsPromotion);
  }, [broker.id, broker.seedPhase, broker.seedQualifiedAt, needsPromotion]);

  useEffect(() => {
    if (broker.brokerLevel !== "seed") return;
    void fetch(`/api/brokers/${broker.id}/identity-review/reconcile`, { method: "POST" })
      .then((response) => {
        if (!response.ok) throw new Error("身份复核失败");
        return onRefresh();
      })
      .catch(() => undefined);
  }, [broker.id]);

  function openPromotionModal() {
    setPromotionQualifiedAt(dateTimeInputValue());
    setPromotionStatus("");
    setShowPromotionModal(true);
  }

  async function promoteBroker() {
    if (!promotionQualifiedAt) {
      setPromotionStatus("请选择身份变更日期和时间");
      return;
    }
    setPromotionStatus("保存中...");
    try {
      await onPromoteBroker(broker.id, new Date(promotionQualifiedAt).toISOString());
      setPromotionStatus("已晋升并开通引荐权限");
      setShowPromotionModal(false);
      await onRefresh();
    } catch {
      setPromotionStatus("晋升失败，请稍后重试");
    }
  }

  async function resolveIdentityReview(decision: "retain" | "demote") {
    setIdentityReviewActionStatus("保存中...");
    try {
      const response = await fetch(`/api/brokers/${broker.id}/identity-review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "身份复核保存失败");
      setIdentityReviewActionStatus(decision === "retain" ? "已保留种子身份" : "已降级为普通经纪人");
      await onRefresh();
    } catch (error) {
      setIdentityReviewActionStatus(error instanceof Error ? error.message : "身份复核保存失败");
    }
  }

  return (
    <section className="page">
      <header className="workspace-header compact">
        <button className="secondary-action return-action" onClick={onBack} type="button">返回</button>
      </header>

      <section className="workspace-profile panel">
        <div className="profile-heading">
          <div>
            <div className="workspace-title-row">
              <h1>{brokerDisplayName(broker)} · 经纪人工作台</h1>
              <LevelBadge broker={broker} />
              <span className="status-pill success">{broker.accountStatus}</span>
            </div>
            <p>{broker.boundPhone} · 用户ID #{broker.miniProgramUserId}</p>
          </div>
        </div>
        <div className="profile-grid">
          <InfoCopyItem label="用户ID" value={`#${broker.miniProgramUserId}`} copyValue={broker.miniProgramUserId} />
          <InfoCopyItem label="绑定手机号" value={broker.boundPhone || "-"} copyValue={broker.boundPhone} />
          <InfoCopyItem label="微信手机号" value={broker.wechatPhone || "-"} copyValue={broker.wechatPhone} />
          <InfoItem label="实名状态" value={broker.realNameStatus} />
          <InfoItem label="注册时间" value={broker.registeredAt} />
          <InfoItem label="最后登录" value={broker.lastLoginAt} />
          <InfoItem label="违规次数" value={`${broker.violationCount}`} danger={broker.violationCount > 0} />
          <InfoItem label="引荐权限" value={broker.referralUnlocked ? "已开通" : "未开通"} />
          <InfoItem label="关联上线时间" value={broker.referrerBoundAt ? `${broker.referrerNickname || "已关联"} · ${broker.referrerBoundAt}` : "-"} />
          <InfoItem label="最近关联下线" value={broker.latestRefereeBoundAt ? `${broker.refereeCount ?? 0} 人 · ${broker.latestRefereeBoundAt}` : "-"} />
          <InfoItem label="计划生效时间" value={broker.seedProgramJoinedAt ?? "-"} />
          <InfoItem label="晋升时间" value={broker.seedQualifiedAt ?? "-"} />
        </div>
        <div className="profile-summary">
          <MetricCard label="已发通告" value={broker.publishedBriefings} delta={`已导入 ${brokerBriefings.length} 条明细`} />
          <MetricCard label="新增通告" value={currentWeekBriefingCount} delta={activeCycleKey === pastCycleKey ? "往期通告不纳入结算" : deltaText(currentWeekBriefingCount, previousWeekBriefingCount)} />
          <MetricCard label="有效通告" value={validPublishCount} delta={activeCycleKey === pastCycleKey ? "往期数据不参与审核" : `${deltaText(validPublishCount, previousRewardProfile.validPublishCount)} · ${pendingReviewCount} 条待审核`} />
          <MetricCard label="新增签约" value={validCompleteCount} delta={`${deltaText(validCompleteCount, previousRewardProfile.bonusCompleteCount)} · 需人工核验身份`} />
          <MetricCard label="报名 / 签约" value={`${broker.signupTotalTimes} / ${broker.contractTotalTimes}`} delta={`${broker.signupTotalPeople} / ${broker.contractTotalPeople} 人`} />
        </div>
      </section>

      <div className="tabs" role="tablist">
        <button className={tab === "briefings" ? "active" : ""} onClick={() => onTabChange("briefings")} type="button">通告数据</button>
        <button className={tab === "signedModels" ? "active" : ""} onClick={() => onTabChange("signedModels")} type="button">已签约名单</button>
        <button className={tab === "level" ? "active" : ""} onClick={() => onTabChange("level")} type="button">用户级别</button>
        <button className={tab === "network" ? "active" : ""} onClick={() => onTabChange("network")} type="button">关系网络</button>
        <button className={tab === "settlement" ? "active" : ""} onClick={() => onTabChange("settlement")} type="button">费用结算</button>
        <button className={tab === "paymentStatus" ? "active" : ""} onClick={() => onTabChange("paymentStatus")} type="button">付款状态</button>
      </div>

      {tab === "briefings" && (
        <BriefingTab
          broker={broker}
          items={scopedBriefings}
          key={broker.id}
          allItems={brokerBriefings}
          weekCycles={weekCycles}
          selectedCycleKey={activeCycleKey}
          onCycleChange={onCycleChange}
          onBriefingsChange={onBriefingsChange}
          onOpenBriefingReview={onOpenBriefingReview}
        />
      )}
      {tab === "signedModels" && <SignedModelsTab items={brokerBriefings.filter((item) => isBriefingSeedEligible(item, currentIncentiveStartAt))} onOpenSigner={(signerId) => onOpenSigner(signerId)} />}
      {needsPromotion ? (
        <section className="promotion-banner">
          <div>
            <strong>该经纪人已满足 6 + 2 晋升条件</strong>
            <span>{promotionValidPublishCount} 条有效通告 · {promotionValidCompleteCount} 条新增签约，可晋升为种子经纪人并开通引荐权限。</span>
          </div>
          <button className="primary-action" onClick={openPromotionModal} type="button">处理晋升</button>
        </section>
      ) : null}
      {broker.identityReviewStatus === "pending" ? (
        <section className="identity-review-banner" role="status">
          <div>
            <strong>种子身份待复核</strong>
            <span>当前审核口径为 {broker.identityReviewValidPublishCount ?? 0}/6 条有效通告、{broker.identityReviewValidCompleteCount ?? 0}/2 条新增签约；新增引荐权限已暂停，既有关系和历史结算不受影响。</span>
            {identityReviewActionStatus ? <small>{identityReviewActionStatus}</small> : null}
          </div>
          <div className="identity-review-actions">
            <button className="secondary-action" onClick={() => void resolveIdentityReview("retain")} type="button">保留身份</button>
            <button className="danger-action" onClick={() => void resolveIdentityReview("demote")} type="button">确认降级</button>
          </div>
        </section>
      ) : broker.identityReviewStatus === "retained" ? (
        <section className="identity-review-banner retained" role="status">
          <div><strong>复核后保留种子身份</strong><span>运营已确认保留身份和引荐权限；既有关系及历史结算不变。</span></div>
        </section>
      ) : null}

      {tab === "level" && (
        <LevelTab
          broker={broker}
          rewardProfile={cumulativeRewardProfile}
          onBrokerLevelUpdate={onBrokerLevelUpdate}
        />
      )}
      {tab === "network" && <NetworkTab broker={broker} brokersData={brokersData} rewardProfile={cumulativeRewardProfile} onOpenBroker={onOpenBroker} onRefresh={onRefresh} />}
      {tab === "settlement" && (
        <SettlementTab
          broker={broker}
          briefingsData={briefingsData}
          cycleKey={activeCycleKey}
          cycleOptions={weekCycles}
          financeOrders={financeOrders}
          onCycleChange={onCycleChange}
          onSubmitFinanceOrder={onSubmitFinanceOrder}
          onCancelFinanceOrder={onCancelFinanceOrder}
        />
      )}
      {tab === "paymentStatus" && <PaymentStatusTab broker={broker} orders={financeOrders} onOpenSettlement={() => onTabChange("settlement")} />}

      {showPromotionModal ? (
        <div className="modal-backdrop" role="presentation">
          <section className="promotion-modal" role="dialog" aria-modal="true" aria-labelledby="promotion-title">
            <h2 id="promotion-title">经纪人可晋升</h2>
            <p>{broker.nickname} 已满足 {promotionValidPublishCount} 条有效通告 + {promotionValidCompleteCount} 条新增签约，可由管理员确认晋升为种子经纪人。</p>
            <p>裂变归属：种子-{broker.seedPhase}。晋升不会改变其继承的种子期数。</p>
            <label>
              <span>晋升日期和时间</span>
              <input
                onChange={(event) => setPromotionQualifiedAt(event.target.value)}
                required
                type="datetime-local"
                value={promotionQualifiedAt}
              />
            </label>
            {promotionStatus ? <p className="form-status">{promotionStatus}</p> : null}
            <div className="drawer-actions">
              <button className="secondary-action" onClick={() => setShowPromotionModal(false)} type="button">暂不处理</button>
              <button className="primary-action" onClick={() => void promoteBroker()} type="button">确认晋升并开通引荐</button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function BriefingTab({
  broker,
  items,
  allItems,
  weekCycles,
  selectedCycleKey,
  onCycleChange,
  onBriefingsChange,
  onOpenBriefingReview
}: {
  broker: Broker;
  items: Briefing[];
  allItems: Briefing[];
  weekCycles: ReturnType<typeof buildWeekCycleOptions>;
  selectedCycleKey: string;
  onCycleChange: (cycleKey: string) => void;
  onBriefingsChange: React.Dispatch<React.SetStateAction<Briefing[]>>;
  onOpenBriefingReview: (briefing: Briefing) => void;
}) {
  type BriefingListScope = "all" | "cycle";
  type BriefingStatusFilter = "all" | "pending" | "active" | "cancelled" | "finished" | "disputed";
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"neutral" | "success" | "error">("neutral");
  const [refreshNoticeVersion, setRefreshNoticeVersion] = useState(0);
  const [importNotice, setImportNotice] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const listScopeStorageKey = `xtg-briefing-list-scope:${broker.id}`;
  const [listScope, setListScope] = useState<BriefingListScope>(() => (
    window.sessionStorage.getItem(listScopeStorageKey) === "cycle" ? "cycle" : "all"
  ));
  const [briefingSearch, setBriefingSearch] = useState("");
  const [briefingStatusFilter, setBriefingStatusFilter] = useState<BriefingStatusFilter>("all");
  const [pageNumber, setPageNumber] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const visibleWeekCycles = weekCycles.filter((cycle) => (
    cycle.key === pastCycleKey
      ? allItems.some((item) => briefingCycleForEligibility(item, brokerCurrentIncentiveStartAt(broker)).key === pastCycleKey)
      : allItems.some((item) => weekCycleForDate(item.publishedAt).key === cycle.key)
  ));
  const availableWeekCycles = visibleWeekCycles.length ? visibleWeekCycles : [weekCycleForDate("")];
  const defaultBrowseCycleKey = availableWeekCycles.some((cycle) => cycle.key === selectedCycleKey)
    ? selectedCycleKey
    : availableWeekCycles[0].key;
  const activeCycle = weekCycles.find((cycle) => cycle.key === selectedCycleKey) ?? weekCycles[0];
  const rewardRowsByBriefingId = new Map(buildRewardProfile(allItems, listScope === "all" ? undefined : selectedCycleKey, brokerCurrentIncentiveStartAt(broker)).completeRows.map((row) => [row.briefing.id, row]));
  const carriedBriefingCount = items.filter((item) => weekCycleForDate(item.publishedAt).key !== selectedCycleKey).length;
  const normalizedSearch = briefingSearch.trim().toLowerCase();
  const scopeItems = listScope === "all" ? allItems : items;
  const filteredItems = scopeItems.filter((item) => {
    const matchesSearch = !normalizedSearch || `${item.title} ${item.jarvisBriefingId}`.toLowerCase().includes(normalizedSearch);
    const sourceText = `${item.sourceStatus} ${item.cancelReason}`;
    const isCancelled = /取消|下架/.test(sourceText);
    const isFinished = /结束|完成|关闭/.test(sourceText) && !isCancelled;
    const matchesStatus = briefingStatusFilter === "all"
      || (briefingStatusFilter === "pending" && needsAdminEvidenceReview(item))
      || (briefingStatusFilter === "active" && !isCancelled && !isFinished)
      || (briefingStatusFilter === "cancelled" && isCancelled)
      || (briefingStatusFilter === "finished" && isFinished)
      || (briefingStatusFilter === "disputed" && hasEvidenceDispute(item));
    return matchesSearch && matchesStatus;
  });
  const page = paginate(filteredItems, pageNumber);

  function changeListScope(nextScope: BriefingListScope) {
    setListScope(nextScope);
    window.sessionStorage.setItem(listScopeStorageKey, nextScope);
  }

  useEffect(() => {
    setPageNumber(1);
  }, [broker.id, listScope, selectedCycleKey, briefingSearch, briefingStatusFilter]);

  useEffect(() => {
    if (!status.startsWith("已刷新 ")) return;
    const timeoutId = window.setTimeout(() => setStatus(""), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [refreshNoticeVersion, status]);

  async function syncBriefingsFromOpenApi() {
    setIsImporting(true);
    setStatus("");
    setImportNotice(null);
    try {
      const response = await fetch("/api/data-sync/run", { method: "POST" });
      const result = await response.json() as {
        error?: string;
        briefingCount?: number;
        participantCount?: number;
        modelCount?: number;
      };
      if (!response.ok) {
        recordClientOperation("经纪人工作台", "点击“同步通告数据”", `${broker.nickname} · 经纪人ID ${broker.miniProgramUserId} · ${result.error ?? "同步失败"}`, "失败");
        setImportNotice({ tone: "error", message: result.error ?? "鑫通告数据同步失败" });
        return;
      }
      const nextItems = await refreshBriefings({ silent: true });
      recordClientOperation("经纪人工作台", "点击“同步通告数据”", `${broker.nickname} · 经纪人ID ${broker.miniProgramUserId} · 当前通告 ${nextItems.length} 条`);
      setImportNotice({
        tone: "success",
        message: `只读同步完成：当前经纪人通告 ${nextItems.length} 条；全局关联通告 ${result.briefingCount ?? 0} 条、报名/签约 ${result.participantCount ?? 0} 条、模特 ${result.modelCount ?? 0} 位。`
      });
    } catch {
      recordClientOperation("经纪人工作台", "点击“同步通告数据”", `${broker.nickname} · 经纪人ID ${broker.miniProgramUserId} · 请求失败`, "失败");
      setImportNotice({
        tone: "error",
        message: "鑫通告数据同步失败，请稍后重试或前往系统日志查看原因。"
      });
    } finally {
      setIsImporting(false);
    }
  }

  async function refreshBriefings(options?: { silent?: boolean }) {
    const response = await fetch(`/api/brokers/${broker.id}/briefings`);
    const nextItems = (await response.json()) as Briefing[];
    onBriefingsChange((current) => [
      ...current.filter((item) => item.brokerId !== broker.id),
      ...nextItems
    ]);
    if (!options?.silent) {
      setStatusTone("success");
      setStatus(`已刷新 ${nextItems.length} 条通告`);
      setRefreshNoticeVersion((current) => current + 1);
    }
    return nextItems;
  }

  async function clearBriefings() {
    setIsClearing(true);
    setStatus("");
    try {
      const response = await fetch(`/api/brokers/${broker.id}/briefings`, { method: "DELETE" });
      const result = await response.json() as { deletedCount?: number; error?: string };
      if (!response.ok) {
        setStatusTone("error");
        setStatus(result.error ?? "清除通告失败");
        return;
      }
      onBriefingsChange((current) => current.filter((item) => item.brokerId !== broker.id));
      setPageNumber(1);
      setStatusTone("success");
      setStatus(`已清除 ${result.deletedCount ?? 0} 条通告，可重新导入`);
      setShowClearConfirm(false);
    } catch {
      setStatusTone("error");
      setStatus("清除通告失败，请稍后重试");
    } finally {
      setIsClearing(false);
    }
  }

  function chooseEvidenceFiles() {
    fileInputRef.current?.click();
  }

  async function uploadEvidenceFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    setStatus(`正在上传 ${files.length} 个凭证文件到经纪人凭证库...`);
    for (const file of files) {
      const response = await fetch(`/api/brokers/${broker.id}/evidences`, {
        method: "POST",
        headers: {
          "content-type": file.type || "application/octet-stream",
          "x-file-name": encodeURIComponent(file.name),
          "x-file-type": file.type || "application/octet-stream"
        },
        body: await file.arrayBuffer()
      });
      if (!response.ok) {
        setStatusTone("error");
        setStatus(`${file.name} 上传失败`);
        return;
      }
    }
    setStatusTone("success");
    setStatus(`已上传 ${files.length} 个凭证文件到经纪人凭证库`);
    await refreshBriefings();
  }

  return (
    <section className="panel table-panel">
      <div className="panel-title with-actions">
        <div>
          <BriefcaseBusiness size={18} />
          <h2>发布通告审核</h2>
        </div>
        <div className="inline-actions">
          <button className="secondary-action" onClick={() => void refreshBriefings()} type="button">刷新</button>
          <button className="secondary-action" onClick={chooseEvidenceFiles} type="button"><Upload size={16} />上传凭证库</button>
          <button
            className="secondary-action danger-action"
            disabled={isClearing || allItems.length === 0}
            onClick={() => setShowClearConfirm(true)}
            title="测试功能：清除当前经纪人的通告数据"
            type="button"
          >
            <Trash2 size={16} />清除通告
          </button>
          <button className="primary-action" disabled={isImporting} onClick={syncBriefingsFromOpenApi} type="button"><RefreshCw size={16} />{isImporting ? "同步中..." : "同步通告数据"}</button>
        </div>
      </div>
      <div className="briefing-list-toolbar">
        <div className="briefing-scope-tabs" aria-label="通告查看范围" role="tablist">
          <button aria-selected={listScope === "all"} className={listScope === "all" ? "active" : ""} onClick={() => changeListScope("all")} role="tab" type="button">全部通告 <span>{allItems.length}</span></button>
          <button
            aria-selected={listScope === "cycle"}
            className={listScope === "cycle" ? "active" : ""}
            onClick={() => {
              changeListScope("cycle");
              if (defaultBrowseCycleKey !== selectedCycleKey) onCycleChange(defaultBrowseCycleKey);
            }}
            role="tab"
            type="button"
          >按发布周期查看</button>
        </div>
        <div className="briefing-list-filters">
          <label className="briefing-search-field">
            <Search aria-hidden="true" size={16} />
            <input aria-label="搜索通告名称或通告 ID" onChange={(event) => setBriefingSearch(event.target.value)} placeholder="搜索通告名称或 ID" type="search" value={briefingSearch} />
          </label>
          <select aria-label="筛选通告状态" className="compact-select" onChange={(event) => setBriefingStatusFilter(event.target.value as BriefingStatusFilter)} value={briefingStatusFilter}>
            <option value="all">全部状态</option>
            <option value="pending">待审核</option>
            <option value="active">进行中</option>
            <option value="cancelled">已取消</option>
            <option value="finished">已结束</option>
            <option value="disputed">凭证异议</option>
          </select>
          {listScope === "cycle" ? (
            <select aria-label="选择发布周期" className="compact-select cycle-filter-select" value={selectedCycleKey} onChange={(event) => onCycleChange(event.target.value)}>
              {availableWeekCycles.map((cycle) => (
                <option key={cycle.key} value={cycle.key}>{cycle.label}</option>
              ))}
            </select>
          ) : null}
        </div>
      </div>
      <p className="form-status briefing-list-summary">
        {listScope === "all"
          ? `共 ${allItems.length} 条通告，当前显示 ${filteredItems.length} 条。可直接按名称或通告 ID 查找。`
          : `发布周期：${activeCycle?.label ?? "暂无周期"}；周期内 ${items.length} 条（其中跨周延续 ${carriedBriefingCount} 条），当前显示 ${filteredItems.length} 条。`}
        周期仅用于查阅，凭证审核与结算判定规则保持不变。
      </p>
      {status ? <p className={`form-status import-status ${statusTone}`}>{status}</p> : null}
      {importNotice ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="import-notice-title"
            aria-modal="true"
            className={`notice-modal ${importNotice.tone}`}
            role="dialog"
          >
            <h2 id="import-notice-title">{importNotice.tone === "success" ? "导入完成" : "导入失败"}</h2>
            <p>{importNotice.message}</p>
            <div className="drawer-actions notice-modal-actions">
              <button className="primary-action" onClick={() => setImportNotice(null)} type="button">确定</button>
            </div>
          </section>
        </div>
      ) : null}
      {showClearConfirm ? (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="clear-briefings-title" aria-modal="true" className="notice-modal warning" role="dialog">
            <h2 id="clear-briefings-title">清除当前经纪人的通告？</h2>
            <p>
              将清除 {broker.nickname} 已导入的 {allItems.length} 条通告、审核记录和关联结算条目。
              已上传的视频凭证会保留在凭证库，但会解除与旧通告的匹配。此操作仅用于测试，且无法撤销。
            </p>
            <div className="drawer-actions notice-modal-actions">
              <button className="secondary-action" disabled={isClearing} onClick={() => setShowClearConfirm(false)} type="button">取消</button>
              <button className="secondary-action danger-action" disabled={isClearing} onClick={() => void clearBriefings()} type="button">
                <Trash2 size={16} />{isClearing ? "正在清除..." : "确认清除"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <input
        ref={fileInputRef}
        accept="image/*,video/*"
        hidden
        multiple
        onChange={(event) => void uploadEvidenceFiles(event.target.files)}
        type="file"
      />
      <table>
        <thead>
          <tr>
            <th>通告</th>
            <th>发布时间 / 活动日期</th>
            <th>报名 / 签约</th>
            <th>状态 / 取消原因</th>
            <th>凭证</th>
            <th>有效通告</th>
            <th>新增签约</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {page.rows.map((item) => (
            <tr className="clickable-row" key={item.id} onClick={() => onOpenBriefingReview(item)}>
              <td>
                <div className="user-cell">
                  <strong>{item.title}</strong>
                  <span>
                    {item.recruitmentType || "-"} · #{item.jarvisBriefingId}
                  </span>
                </div>
              </td>
              <td>
                <div className="briefing-time-cell">
                  <strong>{weekCycleForDate(item.publishedAt).shortLabel}</strong>
                  <span>发布：{item.publishedAt || "-"}</span>
                  <span>活动：{item.workDate || "-"}</span>
                  {listScope === "cycle" && weekCycleForDate(item.publishedAt).key !== selectedCycleKey ? <small>由发布周期延续至此</small> : null}
                </div>
              </td>
              <td>
                <div className="metric-pair">
                  <strong>{item.signupTimes} / {item.contractTimes}</strong>
                  <span>{item.signupPeople} / {item.contractPeople} 人</span>
                </div>
              </td>
              <td>
                <div className="user-cell">
                  <strong>{item.sourceStatus}</strong>
                  <span>{item.cancelReason || "-"}</span>
                </div>
              </td>
              <td className="evidence-col">
                <div className="evidence-cell">
                  <strong>{item.evidenceCount > 0 ? `${item.evidenceCount} 个` : "未上传"}</strong>
                  {hasEvidenceDispute(item) ? (
                    <span className="status-pill warning evidence-dispute-pill" title={item.invalidReason}>凭证异议</span>
                  ) : null}
                </div>
              </td>
              <td>{briefingCycleForEligibility(item, brokerCurrentIncentiveStartAt(broker)).key === pastCycleKey ? <ReviewBadge label="往期不计" status="pending" /> : <ReviewBadge label={cappedPublishLabel(item, allItems)} status={rewardRowsByBriefingId.get(item.id)?.publishStatus ?? cappedPublishStatus(item, allItems)} />}</td>
              <td>
                {briefingCycleForEligibility(item, brokerCurrentIncentiveStartAt(broker)).key === pastCycleKey ? (
                  <ReviewBadge label="往期不计" status="pending" />
                ) : rewardRowsByBriefingId.get(item.id) ? (
                  <div className="review-result-cell">
                    <ReviewBadge
                      label={signingStatusLabel(rewardRowsByBriefingId.get(item.id)!)}
                      status={effectiveCompleteStatus(rewardRowsByBriefingId.get(item.id)!)}
                    />
                    {effectiveCompleteStatus(rewardRowsByBriefingId.get(item.id)!) === "rejected" ? (
                      <small>原因：{signingFailureReason(rewardRowsByBriefingId.get(item.id)!)}</small>
                    ) : null}
                  </div>
                ) : (
                  <ReviewBadge status="pending" />
                )}
              </td>
              <td>
                {briefingCycleForEligibility(item, brokerCurrentIncentiveStartAt(broker)).key === pastCycleKey ? <ReviewBadge label="无需审核" status="pending" /> : <ReviewBadge label={manualReviewStatus(item).label} status={manualReviewStatus(item).status} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {page.rows.length === 0 ? <p className="empty-state">没有符合当前搜索或筛选条件的通告。</p> : null}
      <TablePagination
        page={page.page}
        pageSize={page.pageSize}
        total={filteredItems.length}
        totalPages={page.totalPages}
        onPageChange={setPageNumber}
      />
    </section>
  );
}

function SignedModelsTab({ items, onOpenSigner }: { items: Briefing[]; onOpenSigner: (signerId: string) => void }) {
  const signedSummary = buildSignedModelSummary(items);
  const signedRows = signedSummary.signedRows;

  return (
    <section className="panel table-panel">
      <PanelTitle icon={<UserRound size={18} />} title="已签约名单" />
      <div className="signed-model-toolbar">
        <MetricCard label="已签约模特" value={signedSummary.totalSignedModelCount} delta="按手机号累计去重" />
        <MetricCard
          label="新增已签约模特"
          value={signedSummary.newLatestModels.length}
          delta={signedSummary.latestImportDay ? `最新导入 ${signedSummary.latestImportDay}` : "暂无导入批次"}
        />
        <MetricCard label="签约通告记录" value={signedSummary.signingRecordCount} delta="用于新增签约判定" />
      </div>
      <table>
        <thead>
          <tr>
            <th>模特</th>
            <th>首次签约通告</th>
            <th>首次签约时间</th>
            <th>累计签约通告</th>
            <th>最近签约通告</th>
          </tr>
        </thead>
        <tbody>
          {signedRows.map((model) => (
            <tr key={model.key}>
              <td>
                <div className="user-cell">
                  <strong>
                    {model.userId ? (
                      <button className="inline-link" onClick={() => onOpenSigner(model.userId)} type="button">
                        {model.name}
                      </button>
                    ) : model.name}
                  </strong>
                  <span className="copy-line">
                    {model.phone || "-"}
                    {model.phone ? <CopyButton value={model.phone} label="复制手机号" /> : null}
                    {model.userId ? (
                      <>
                        · #{model.userId}
                        <CopyButton value={model.userId} label="复制用户ID" />
                      </>
                    ) : null}
                  </span>
                </div>
              </td>
              <td>{model.firstBriefingTitle}</td>
              <td>{model.firstBriefingAt}</td>
              <td>{model.briefingCount}</td>
              <td>
                <div className="user-cell">
                  <strong>{model.lastBriefingTitle}</strong>
                  <span>{model.lastBriefingAt}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {signedRows.length === 0 ? <p className="empty-state">暂无已签约模特，导入通告详情后会自动汇总。</p> : null}
    </section>
  );
}

function LevelTab({
  broker,
  rewardProfile,
  onBrokerLevelUpdate
}: {
  broker: Broker;
  rewardProfile: ReturnType<typeof buildRewardProfile>;
  onBrokerLevelUpdate: (brokerId: string, payload: BrokerLevelUpdate) => Promise<Broker>;
}) {
  const [directReferrers, setDirectReferrers] = useState<ReferralNode[] | null>(null);
  const [manualLevel, setManualLevel] = useState(broker.brokerLevel);
  const [manualSeedPhase, setManualSeedPhase] = useState(String(broker.seedPhase ?? ""));
  const [manualEffectiveAt, setManualEffectiveAt] = useState(() => dateTimeInputValue(broker.seedProgramJoinedAt ?? broker.seedQualifiedAt));
  const [manualReferralUnlocked, setManualReferralUnlocked] = useState(broker.referralUnlocked);
  const [manualStatus, setManualStatus] = useState("");
  const validPublishCount = rewardProfile.validPublishCount;
  const validCompleteCount = rewardProfile.bonusCompleteCount;
  const meetsUnlock = validPublishCount >= 6 && validCompleteCount >= 2;
  const hasSeedProgram = Boolean(broker.seedPhase && broker.seedProgramJoinedAt);
  const hasDirectReferrer = Boolean(directReferrers?.length);
  const statusTitle = broker.identityReviewStatus === "pending"
    ? "种子身份待复核"
    : broker.brokerLevel === "seed"
    ? "已晋升为种子经纪人"
    : hasSeedProgram
      ? "普通经纪人已加入种子计划"
      : "尚未加入种子计划";
  const statusText = broker.identityReviewStatus === "pending"
    ? "当前审核数据已低于 6 + 2，引荐权限暂停，等待运营确认保留身份或降级。"
    : broker.brokerLevel === "seed"
    ? "晋升由 6 + 2 达标提醒触发，已开通引荐权限；裂变期数保持不变。"
    : hasSeedProgram
      ? "达到 6 条有效通告和 2 条新增签约后，系统会提醒运营确认晋升并填写晋升时间。"
      : "请从具备引荐权限的种子经纪人关系网络中关联该用户；关联成功时自动继承期数并开始统计。";

  useEffect(() => {
    setDirectReferrers(null);
    fetch(`/api/brokers/${broker.id}/referrers`)
      .then((response) => response.json() as Promise<ReferralNode[]>)
      .then(setDirectReferrers)
      .catch(() => setDirectReferrers([]));
  }, [broker.id]);

  useEffect(() => {
    setManualLevel(broker.brokerLevel);
    setManualSeedPhase(String(broker.seedPhase ?? ""));
    setManualEffectiveAt(dateTimeInputValue(broker.seedProgramJoinedAt ?? broker.seedQualifiedAt));
    setManualReferralUnlocked(broker.referralUnlocked);
    setManualStatus("");
  }, [broker]);

  async function saveInitialSeedIdentity() {
    if (manualLevel === "seed" && !manualSeedPhase) {
      setManualStatus("请选择种子期数");
      return;
    }
    if (manualLevel === "seed" && !manualEffectiveAt) {
      setManualStatus("请选择种子身份生效日期和时间");
      return;
    }
    setManualStatus("保存中...");
    try {
      const effectiveAt = manualLevel === "seed" ? new Date(manualEffectiveAt).toISOString() : null;
      await onBrokerLevelUpdate(broker.id, {
        brokerLevel: manualLevel,
        seedPhase: manualLevel === "seed" ? Number(manualSeedPhase) : null,
        seedProgramJoinedAt: effectiveAt,
        seedQualifiedAt: effectiveAt,
        referralUnlocked: manualLevel === "seed" && manualReferralUnlocked
      });
      setManualStatus("身份已保存");
    } catch (error) {
      setManualStatus(error instanceof Error ? error.message : "保存失败");
    }
  }

  return (
    <div className="two-column">
      <section className="panel">
        <PanelTitle icon={<Sprout size={18} />} title={hasDirectReferrer ? "身份状态" : "级别管理"} />
        {directReferrers === null ? <p className="form-status">正在核对上下级关系...</p> : hasDirectReferrer ? (
          <>
            <div className="level-status-summary">
              <LevelBadge broker={broker} />
              <div><h3>{statusTitle}</h3><p>{statusText}</p></div>
            </div>
            <div className="detail-grid compact-detail-grid">
              <InfoItem label="种子期数 / 裂变来源" value={broker.seedPhase ? `种子-${broker.seedPhase}` : "无种子标签"} />
              <InfoItem label="种子计划生效时间" value={broker.seedProgramJoinedAt ?? "-"} />
              <InfoItem label="种子经纪人晋升时间" value={broker.seedQualifiedAt ?? "-"} />
              <InfoItem label="引荐权限" value={broker.referralUnlocked ? "已开通" : "未开通"} />
            </div>
          </>
        ) : (
          <div className="form-grid">
            <p className="form-helper">该经纪人没有上线，可由运营手动赋予第一期、第二期等初始种子身份。</p>
            <label>
              <span>经纪人级别</span>
              <select value={manualLevel} onChange={(event) => {
                const nextLevel = event.target.value as Broker["brokerLevel"];
                setManualLevel(nextLevel);
                if (nextLevel === "seed") {
                  if (!manualSeedPhase) setManualSeedPhase("1");
                  if (!manualEffectiveAt) setManualEffectiveAt(dateTimeInputValue());
                  setManualReferralUnlocked(true);
                } else {
                  setManualSeedPhase("");
                  setManualReferralUnlocked(false);
                }
              }}>
                <option value="normal">无身份 / 普通经纪人</option>
                <option value="seed">种子经纪人</option>
              </select>
            </label>
            {manualLevel === "seed" ? (
              <>
                <label>
                  <span>种子期数</span>
                  <select value={manualSeedPhase} onChange={(event) => setManualSeedPhase(event.target.value)}>
                    {[1, 2, 3, 4, 5, 6].map((phase) => <option key={phase} value={phase}>种子-{phase}</option>)}
                  </select>
                </label>
                <label>
                  <span>种子身份生效日期和时间</span>
                  <input onChange={(event) => setManualEffectiveAt(event.target.value)} required type="datetime-local" value={manualEffectiveAt} />
                  <small>该时间同时作为种子计划统计起点；未修改时使用选择身份时的当前时间。</small>
                </label>
                <label className="check-row">
                  <input checked={manualReferralUnlocked} onChange={(event) => setManualReferralUnlocked(event.target.checked)} type="checkbox" />
                  <span>开通引荐权限</span>
                </label>
              </>
            ) : null}
            <button className="primary-action" onClick={() => void saveInitialSeedIdentity()} type="button">保存级别</button>
            {manualStatus ? <p className="form-status">{manualStatus}</p> : null}
          </div>
        )}
      </section>
      <section className="panel">
        <PanelTitle icon={<Users size={18} />} title={hasDirectReferrer ? "6 + 2 晋升进度" : "初始种子说明"} />
        <div className="network-card">
          <PermissionBadge unlocked={broker.referralUnlocked} />
          {directReferrers === null ? (
            <><h3>正在核对身份来源</h3><p>系统正在确认该经纪人是否已有上线关系。</p></>
          ) : !hasDirectReferrer ? (
            <>
              <h3>手动赋予种子身份</h3>
              <p>第一期、第二期等初始种子经纪人没有上线，由运营直接设置种子期数和生效时间，用于后续观察其小程序裂变链路。</p>
            </>
          ) : broker.brokerLevel === "seed" ? (
            <>
              <h3>已完成种子经纪人晋升</h3>
              <p>晋升时间为 {broker.seedQualifiedAt ?? "-"}，已开通引荐权限；奖励与签约去重仍从原计划生效时间开始计算。</p>
            </>
          ) : (
            <>
              <h3>{meetsUnlock ? "已满足 6 + 2 条件" : "尚未满足 6 + 2 条件"}</h3>
              <p>计划身份生效后，通告立即参与本人奖励、签约去重和 6 + 2 统计，同时贡献直属上线收益；达到条件后系统提醒运营确认晋升。</p>
              <div className="progress-track"><span style={{ width: `${Math.min(100, ((validPublishCount / 6) + (validCompleteCount / 2)) * 50)}%` }} /></div>
              <div className="progress-copy">{validPublishCount}/6 有效通告 · {validCompleteCount}/2 新增签约</div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function NetworkTab({
  broker,
  brokersData,
  rewardProfile,
  onOpenBroker,
  onRefresh
}: {
  broker: Broker;
  brokersData: Broker[];
  rewardProfile: ReturnType<typeof buildRewardProfile>;
  onOpenBroker: (broker: Broker) => void;
  onRefresh: () => Promise<void>;
}) {
  const validPublishCount = rewardProfile.validPublishCount;
  const validCompleteCount = rewardProfile.bonusCompleteCount;
  const progress = Math.min(100, ((validCompleteCount / 2) + (validPublishCount / 6)) * 50);
  const [brokerUserId, setBrokerUserId] = useState("");
  const [referralAt, setReferralAt] = useState(() => dateTimeInputValue());
  const [relations, setRelations] = useState<ReferralNode[]>([]);
  const [referrers, setReferrers] = useState<ReferralNode[]>([]);
  const [message, setMessage] = useState("");
  const candidate = brokersData.find((item) => brokerUserId && item.miniProgramUserId === brokerUserId.trim());

  useEffect(() => {
    Promise.all([
      fetch(`/api/brokers/${broker.id}/referrals`).then((response) => response.json() as Promise<ReferralNode[]>),
      fetch(`/api/brokers/${broker.id}/referrers`).then((response) => response.json() as Promise<ReferralNode[]>)
    ])
      .then(([nextRelations, nextReferrers]) => {
        setRelations(nextRelations);
        setReferrers(nextReferrers);
      })
      .catch(() => {
        setRelations([]);
        setReferrers([]);
      });
  }, [broker.id]);

  function openRelatedBroker(node: ReferralNode) {
    const target = brokersData.find((item) => item.id === node.id);
    if (target) onOpenBroker(target);
  }

  function handleRelationKeyDown(event: React.KeyboardEvent<HTMLDivElement>, node: ReferralNode) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    openRelatedBroker(node);
  }

  function relationLevelBadge(node: ReferralNode) {
    return <LevelBadge broker={{ ...broker, brokerLevel: node.brokerLevel, seedPhase: node.seedPhase, referralUnlocked: node.referralUnlocked }} />;
  }

  async function bindReferral() {
    setMessage("关联中...");
    try {
      const response = await fetch(`/api/brokers/${broker.id}/referrals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brokerUserId: brokerUserId.trim(), boundAt: referralAt })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error ?? "关联失败");
      setRelations(result);
      setBrokerUserId("");
      setReferralAt(dateTimeInputValue());
      setMessage(`已关联；下线从 ${referralAt.replace("T", " ")} 起纳入节点统计`);
      await onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "关联失败");
    }
  }

  async function unbindReferral(refereeId: string) {
    setMessage("解除关联中...");
    try {
      const response = await fetch(`/api/brokers/${broker.id}/referrals/${refereeId}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error ?? "解除关联失败");
      setRelations(result);
      setMessage("已解除关联");
      await onRefresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "解除关联失败");
    }
  }

  return (
    <div className="network-redesign-stack">
      <section className="panel relationship-graph-panel">
        <div className="panel-title with-actions">
          <div><GitBranch size={18} /><h2>关系网络图谱</h2></div>
          <span className="graph-legend">上线 {referrers.length} · 直接下线 {relations.length}</span>
        </div>
        <div className="relationship-canvas">
          <div className="graph-level graph-referrers">
            {referrers.map((node) => (
              <button className="relationship-node" key={node.id} onClick={() => openRelatedBroker(node)} type="button">
                <span>我的上线</span><strong>{node.nickname}</strong><small>{node.validPublishCount} 条通告 · {node.validCompleteCount} 条签约</small>
              </button>
            ))}
            {referrers.length === 0 ? <div className="graph-empty-node">暂无上线</div> : null}
          </div>
          <div className="graph-connector" />
          <button className="relationship-node current-node" type="button">
            <span>当前经纪人</span><strong>{broker.nickname}</strong><small>{validPublishCount}/6 有效通告 · {validCompleteCount}/2 新增签约</small>
          </button>
          <div className="graph-connector down" />
          <div className="graph-level graph-relations">
            {relations.map((node) => (
              <button className="relationship-node" key={node.id} onClick={() => openRelatedBroker(node)} type="button">
                <span>直接下线</span><strong>{node.nickname}</strong><small>{node.validPublishCount}/6 通告 · {node.validCompleteCount}/2 签约</small>
              </button>
            ))}
            {relations.length === 0 ? <div className="graph-empty-node">暂无直接下线</div> : null}
          </div>
        </div>
      </section>
      <div className="two-column">
      <section className="panel">
        <PanelTitle icon={<GitBranch size={18} />} title="身份与解锁进度" />
        <div className="network-card">
          <LevelBadge broker={broker} />
          <PermissionBadge unlocked={broker.referralUnlocked} />
          <h3>{broker.referralUnlocked ? "已解锁引荐权限" : "暂未解锁引荐权限"}</h3>
          <p>累计 6 条有效通告 + 2 条新增签约后，可发展下线经纪人。</p>
          <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
          <div className="progress-copy">{validPublishCount}/6 有效通告 · {validCompleteCount}/2 新增签约</div>
        </div>
      </section>
      <section className="panel">
        <PanelTitle icon={<Link size={18} />} title="关联经纪人" />
        <div className="relation-form">
          <input inputMode="numeric" value={brokerUserId} onChange={(event) => setBrokerUserId(event.target.value)} placeholder="输入经纪人ID精确查找" />
        </div>
        {candidate ? (
          <div className="candidate-card">
            <strong>{candidate.nickname}</strong>
            <span>{candidate.boundPhone} · #{candidate.miniProgramUserId}</span>
            <LevelBadge broker={candidate} />
            <label className="referral-time-field">
              <span>成为下线的日期和时间</span>
              <input max={dateTimeInputValue()} onChange={(event) => setReferralAt(event.target.value)} type="datetime-local" value={referralAt} />
            </label>
            <button className="primary-action" disabled={!referralAt} onClick={bindReferral} type="button">确认关联</button>
          </div>
        ) : brokerUserId ? <p className="form-status">未在当前导入数据中找到该经纪人ID</p> : null}
        {message ? <p className="form-status">{message}</p> : null}
      </section>
      <section className="panel wide-panel">
        <PanelTitle icon={<Link size={18} />} title="我的上线" />
        <div className="rank-list">
          {referrers.map((node) => (
            <div
              className="rank-row relation-row"
              key={node.id}
              onClick={() => openRelatedBroker(node)}
              onKeyDown={(event) => handleRelationKeyDown(event, node)}
              role="button"
              tabIndex={0}
            >
              <div>
                <strong>{node.nickname}</strong>
                <span>{node.phone}</span>
              </div>
              {relationLevelBadge(node)}
              <div className="rank-metrics">
                <b>{node.validPublishCount}+{node.validCompleteCount}</b>
                <span>有效</span>
              </div>
            </div>
          ))}
          {referrers.length === 0 ? <p className="empty-state">暂无上线经纪人。</p> : null}
        </div>
      </section>
      <section className="panel wide-panel">
        <PanelTitle icon={<UsersRound size={18} />} title="直接下线" />
        <div className="rank-list">
          {relations.map((node) => (
            <div
              className="rank-row relation-row"
              key={node.id}
              onClick={() => openRelatedBroker(node)}
              onKeyDown={(event) => handleRelationKeyDown(event, node)}
              role="button"
              tabIndex={0}
            >
              <div>
                <strong>{node.nickname}</strong>
                <span>{node.phone}</span>
              </div>
              {relationLevelBadge(node)}
              <div className="rank-metrics">
                <b>{node.validPublishCount}+{node.validCompleteCount}</b>
                <span>有效</span>
              </div>
              <button className="text-button danger-action" onClick={(event) => { event.stopPropagation(); void unbindReferral(node.id); }} type="button">解除关联</button>
            </div>
          ))}
          {relations.length === 0 ? <p className="empty-state">暂无直接下线，可通过经纪人ID关联。</p> : null}
        </div>
      </section>
      </div>
    </div>
  );
}

function PaymentStatusTab({ broker, orders, onOpenSettlement }: { broker: Broker; orders: FinanceOrder[]; onOpenSettlement: () => void }) {
  const brokerOrders = orders
    .filter((order) => order.brokerId === broker.id)
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
  const statusText: Record<FinanceOrderStatus, string> = {
    pending: "财务审批中",
    approved: "财务审批通过",
    paid: "财务已付款",
    rejected: "财务驳回"
  };

  return (
    <section className="panel table-panel">
      <PanelTitle icon={<WalletCards size={18} />} title="付款单状态" />
      {brokerOrders.length ? (
        <table>
          <thead><tr><th>结算周期</th><th>提交时间</th><th>结算金额</th><th>付款状态</th><th>说明</th><th>操作</th></tr></thead>
          <tbody>
            {brokerOrders.map((order) => (
              <tr key={order.id}>
                <td>{order.cycleLabel}</td>
                <td>{new Date(order.submittedAt).toLocaleString("zh-CN", { hour12: false })}</td>
                <td>{money(order.amount)}</td>
                <td><span className={`status-pill ${order.status === "paid" ? "success" : order.status === "rejected" ? "danger" : "warning"}`}>{statusText[order.status]}</span></td>
                <td>{order.status === "rejected" ? order.rejectionReason || "财务未填写驳回理由" : order.status === "paid" && order.paidAt ? `付款于 ${new Date(order.paidAt).toLocaleString("zh-CN", { hour12: false })}` : order.status === "approved" ? "费用已准备，短期内将付款" : "等待财务审核"}</td>
                <td>{order.status === "rejected" ? <button className="secondary-action compact-action" onClick={onOpenSettlement} type="button">重新核对费用</button> : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="empty-state">该经纪人暂无已提交的付款单。</p>}
    </section>
  );
}

function SettlementTab({
  broker,
  briefingsData,
  cycleKey,
  cycleOptions,
  financeOrders,
  onCycleChange,
  onSubmitFinanceOrder,
  onCancelFinanceOrder
}: {
  broker: Broker;
  briefingsData: Briefing[];
  cycleKey: string;
  cycleOptions: ReturnType<typeof buildWeekCycleOptions>;
  financeOrders: FinanceOrder[];
  onCycleChange: (cycleKey: string) => void;
  onSubmitFinanceOrder: (order: Omit<FinanceOrder, "id" | "submittedAt" | "status">) => void;
  onCancelFinanceOrder: (orderId: string) => void;
}) {
  const [referrals, setReferrals] = useState<ReferralNode[]>([]);
  const [expandedReward, setExpandedReward] = useState("");
  const [submitStatus, setSubmitStatus] = useState("");
  const [showSettlementPreview, setShowSettlementPreview] = useState(false);
  const brokerBriefings = briefingsData.filter((briefing) => briefing.brokerId === broker.id);
  const selfRewardStartAt = brokerSelfRewardStartAt(broker);
  const canReceiveSelfRewards = Boolean(selfRewardStartAt);
  const cycle = cycleOptions.find((item) => item.key === cycleKey);
  const rewardProfile = buildRewardProfile(brokerBriefings, cycleKey, selfRewardStartAt);
  const referralProfiles = referrals.map((node) => {
    const nodeBriefings = briefingsData.filter((briefing) => briefing.brokerId === node.id);
    const programStartAt = seedProgramStartAt(node);
    return {
      node,
      profile: buildRewardProfile(nodeBriefings, cycleKey, programStartAt),
      baseAwardCycle: referralBaseAwardCycle(node, nodeBriefings)
    };
  });
  const referralBaseDetails = referralProfiles.filter(({ baseAwardCycle }) => baseAwardCycle === cycleKey);
  const referralIncrementDetails = referralProfiles.flatMap(({ node, profile }) =>
    profile.bonusCompleteRows.map((row) => ({ node, row }))
  );
  const deferredOwnerAwards = brokerBriefings.flatMap((briefing) => {
    const dispute = briefing.settlementDispute;
    if (dispute?.status !== "approved" || dispute.deferredCycleKey !== cycleKey) return [];
    const amount = disputeRewardAmount(dispute);
    return amount ? [{ briefing, amount }] : [];
  });
  const deferredReferralAwards = referrals.flatMap((node) => {
    const nodeBriefings = briefingsData.filter((briefing) => briefing.brokerId === node.id);
    return nodeBriefings.flatMap((briefing) => {
      const dispute = briefing.settlementDispute;
      if (dispute?.status !== "approved" || dispute.deferredCycleKey !== cycleKey) return [];
      return dispute.deferCompleteReward ? [{ node, briefing }] : [];
    });
  });
  const referralBaseCount = referralBaseDetails.length;
  const referralIncrementCount = referralProfiles.reduce((total, { profile }) => total + profile.bonusCompleteCount, 0);
  const settlementLedger = buildSettlementLedger({
    brokerBriefings,
    brokerRewardStartAt: selfRewardStartAt,
    allBriefings: briefingsData,
    referrals,
    cycleKey
  });
  const rows: SettlementLineItem[] = [
    { id: "validPublish", title: "有效通告奖励", quantity: rewardProfile.validPublishCount, rule: "1 元/条", amount: rewardProfile.validPublishCount, basis: "本周期发布且人工审核通过的有效通告", details: rewardProfile.validPublishBriefings.map((item) => ({ id: item.id, object: item.title, description: `发布于 ${item.publishedAt}`, amount: 1 })) },
    { id: "clawback", title: "历史有效通告抵扣", quantity: rewardProfile.clawbackCount, rule: "-1 元/条", amount: -rewardProfile.clawbackCount, basis: "历史周期已结算通告，在本周期抓取到手动/举报取消", details: rewardProfile.clawbackBriefings.map((item) => ({ id: item.id, object: item.title, description: item.cancelReason || item.sourceStatus, amount: -1 })) },
    { id: "validComplete", title: "新增签约奖励", quantity: rewardProfile.bonusCompleteCount, rule: "2 元/条", amount: rewardProfile.bonusCompleteCount * 2, basis: "有效通告通过，且签约者未出现在种子计划生效后的其他通告中", details: rewardProfile.bonusCompleteRows.map((item) => ({ id: item.briefing.id, object: item.briefing.title, description: `新增签约：${item.newModels.map((model) => model.label).join("、")}`, amount: 2 })) },
    { id: "completeClawback", title: "历史新增签约抵扣", quantity: rewardProfile.completeClawbackCount, rule: "-2 元/条", amount: -rewardProfile.completeClawbackCount * 2, basis: "已获新增签约奖励的通告，在本周期因手动/举报取消而失效", details: rewardProfile.completeClawbackBriefings.map((item) => ({ id: item.id, object: item.title, description: item.cancelReason || item.sourceStatus, amount: -2 })) },
    { id: "referralBase", title: "引荐基础达标奖", quantity: referralBaseCount, rule: "10 元/人，仅一次", amount: referralBaseCount * 10, basis: "直接下线累计满足 6 + 2 且已由运营确认晋升为种子经纪人", details: referralBaseDetails.map(({ node }) => ({ id: node.id, object: node.nickname, description: `已达标并晋升 · ${node.phone}`, amount: 10 })) },
    { id: "referralIncrement", title: "引荐成交增量奖", quantity: referralIncrementCount, rule: "1 元/条", amount: referralIncrementCount, basis: "每个直接下线独立按日 3 条、周 12 条上限计算新增签约通告", details: referralIncrementDetails.map(({ node, row }) => ({ id: `${node.id}-${row.briefing.id}`, object: `${node.nickname} · ${row.briefing.title}`, description: row.newModels.map((model) => model.label).join("、"), amount: 1 })) },
    { id: "disputeCarry", title: "争议复审补发", quantity: deferredOwnerAwards.length + deferredReferralAwards.length, rule: "按原周期奖励补发", amount: deferredOwnerAwards.reduce((total, item) => total + item.amount, 0) + deferredReferralAwards.length, basis: "二审通过后转入本周期补发，不占用本周期奖励上限", details: [...deferredOwnerAwards.map((item) => ({ id: item.briefing.id, object: item.briefing.title, description: `原第 ${cycleWeekIndex(item.briefing.settlementDispute!.originalCycleKey)} 周争议复审通过`, amount: item.amount })), ...deferredReferralAwards.map((item) => ({ id: `${item.node.id}-${item.briefing.id}`, object: `${item.node.nickname} · ${item.briefing.title}`, description: "下线争议通告的引荐奖励补发", amount: 1 }))] }
  ];
  const rowCalculation: Record<string, string> = {
    validPublish: `${rewardProfile.validPublishCount} 条 × ¥1`,
    clawback: `${rewardProfile.clawbackCount} 条 × -¥1`,
    validComplete: `${rewardProfile.bonusCompleteCount} 条 × ¥2`,
    completeClawback: `${rewardProfile.completeClawbackCount} 条 × -¥2`,
    referralBase: `${referralBaseCount} 人 × ¥10`,
    referralIncrement: `${referralIncrementCount} 条 × ¥1`,
    disputeCarry: `${deferredOwnerAwards.length + deferredReferralAwards.length} 项`
  };
  const settlementGroups = [
    { key: "self", label: "本人奖励", rowIds: ["validPublish", "clawback", "validComplete", "completeClawback"] },
    { key: "referral", label: "引荐奖励", rowIds: ["referralBase", "referralIncrement"] },
    { key: "adjustment", label: "调整与补发", rowIds: ["disputeCarry"] }
  ].map((group) => ({
    ...group,
    rows: group.rowIds.map((rowId) => rows.find((row) => row.id === rowId)).filter((row): row is SettlementLineItem => Boolean(row))
  }));
  const financeOrder = financeOrders.find((order) => order.brokerId === broker.id && order.cycleKey === cycleKey);
  const eligibleBrokerBriefings = brokerBriefings.filter((briefing) => isBriefingSeedEligible(briefing, selfRewardStartAt));
  const publishCapState = buildPublishCapState(eligibleBrokerBriefings);
  const validPublishIds = new Set(rewardProfile.validPublishBriefings.map((briefing) => briefing.id));
  const publishReportRows: SettlementReportRow[] = eligibleBrokerBriefings
    .filter((briefing) => weekCycleForDate(briefing.publishedAt).key === cycleKey)
    .map((briefing) => {
      const disputed = briefing.settlementDispute?.originalCycleKey === cycleKey;
      const rewarded = !disputed && validPublishIds.has(briefing.id);
      const capped = publishCapState.cappedIds.has(briefing.id);
      const status = capped ? "pending" : effectivePublishStatus(briefing);
      return {
        id: `publish-${briefing.id}`,
        briefingId: briefing.jarvisBriefingId,
        category: "有效通告奖励",
        object: briefing.title,
        decision: disputed ? "待审核" : settlementDecision(status, rewarded),
        description: disputed ? "争议通告转下期复审，本期暂不发放" : publishSettlementReason(briefing, rewarded, capped),
        amount: rewarded ? 1 : 0
      };
    });
  const signingReportRows: SettlementReportRow[] = rewardProfile.completeRows
    .filter((row) => briefingBonusCycleKey(row.briefing) === cycleKey)
    .map((row) => ({
      id: `signing-${row.briefing.id}`,
      briefingId: row.briefing.jarvisBriefingId,
      category: "新增签约奖励",
      object: row.briefing.title,
      decision: row.briefing.settlementDispute?.originalCycleKey === cycleKey ? "待审核" : settlementDecision(effectiveCompleteStatus(row), row.bonusEligible),
      description: row.briefing.settlementDispute?.originalCycleKey === cycleKey ? "争议通告转下期复审，本期暂不发放" : signingSettlementReason(row),
      amount: row.briefing.settlementDispute?.originalCycleKey === cycleKey ? 0 : row.bonusEligible ? 2 : 0
    }));
  const adjustmentReportRows: SettlementReportRow[] = [
    ...rewardProfile.clawbackBriefings.map((briefing) => ({ id: `publish-clawback-${briefing.id}`, briefingId: briefing.jarvisBriefingId, category: "历史有效通告抵扣", object: briefing.title, decision: "抵扣" as const, description: briefing.cancelReason || briefing.sourceStatus, amount: -1 })),
    ...rewardProfile.completeClawbackBriefings.map((briefing) => ({ id: `signing-clawback-${briefing.id}`, briefingId: briefing.jarvisBriefingId, category: "历史新增签约抵扣", object: briefing.title, decision: "抵扣" as const, description: briefing.cancelReason || briefing.sourceStatus, amount: -2 }))
  ];
  const referralBaseReportRows: SettlementReportRow[] = referralProfiles.map(({ node, baseAwardCycle }) => {
    const rewarded = baseAwardCycle === cycleKey;
    const alreadySettled = Boolean(baseAwardCycle && cycleWeekIndex(baseAwardCycle) < cycleWeekIndex(cycleKey));
    return {
      id: `referral-base-${node.id}`,
      briefingId: "",
      category: "引荐基础达标奖",
      object: `${node.nickname} · ${node.phone}`,
      decision: rewarded ? "计奖" : "不计奖",
      description: rewarded
        ? "该下线已满足 6+2 条件并完成种子经纪人晋升"
        : alreadySettled
          ? `该下线的 10 元单次奖励已在第 ${cycleWeekIndex(baseAwardCycle!)} 周结算`
          : "尚未同时满足 6+2 条件并完成种子经纪人晋升",
      amount: rewarded ? 10 : 0
    };
  });
  const referralSigningReportRows: SettlementReportRow[] = referralProfiles.flatMap(({ node, profile }) => profile.completeRows
    .filter((row) => briefingBonusCycleKey(row.briefing) === cycleKey)
    .map((row) => ({
      id: `referral-signing-${node.id}-${row.briefing.id}`,
      briefingId: row.briefing.jarvisBriefingId,
      category: "引荐成交增量奖",
      object: `${node.nickname} · ${row.briefing.title}`,
      decision: row.briefing.settlementDispute?.originalCycleKey === cycleKey ? "待审核" : settlementDecision(effectiveCompleteStatus(row), row.bonusEligible),
      description: row.briefing.settlementDispute?.originalCycleKey === cycleKey ? "下线争议通告转下期复审，本期引荐奖励暂不发放" : signingSettlementReason(row),
      amount: row.briefing.settlementDispute?.originalCycleKey === cycleKey ? 0 : row.bonusEligible ? 1 : 0
    })));
  const deferredReportRows: SettlementReportRow[] = [
    ...deferredOwnerAwards.map((item) => ({ id: `dispute-carry-${item.briefing.id}`, briefingId: item.briefing.jarvisBriefingId, category: "争议复审补发", object: item.briefing.title, decision: "计奖" as const, description: `原第 ${cycleWeekIndex(item.briefing.settlementDispute!.originalCycleKey)} 周通告二审通过，本周期补发且不占奖励上限`, amount: item.amount })),
    ...deferredReferralAwards.map((item) => ({ id: `dispute-referral-${item.node.id}-${item.briefing.id}`, briefingId: item.briefing.jarvisBriefingId, category: "引荐奖励复审补发", object: `${item.node.nickname} · ${item.briefing.title}`, decision: "计奖" as const, description: "下线争议通告二审通过，本周期补发引荐奖励", amount: 1 }))
  ];
  const settlementReportRows = [
    ...publishReportRows,
    ...signingReportRows,
    ...adjustmentReportRows,
    ...referralBaseReportRows,
    ...referralSigningReportRows,
    ...deferredReportRows
  ];
  const weekSubtotal = settlementReportRows.reduce((total, row) => total + row.amount, 0);
  const settlementTotal = settlementLedger.carryForward + weekSubtotal;
  const settlementPayout = Math.max(0, settlementTotal);
  const rewardedReportCount = settlementReportRows.filter((row) => row.decision === "计奖").length;
  const excludedReportCount = settlementReportRows.filter((row) => row.decision === "不计奖").length;
  const pendingReportCount = settlementReportRows.filter((row) => row.decision === "待审核").length;
  const settlementPreviewGroups = [
    { key: "self", label: "本人奖励", rows: settlementReportRows.filter((row) => !row.category.includes("引荐") && !row.category.includes("复审补发")) },
    { key: "referral", label: "引荐奖励", rows: settlementReportRows.filter((row) => row.category.includes("引荐") && !row.category.includes("复审补发")) },
    { key: "adjustment", label: "调整与补发", rows: settlementReportRows.filter((row) => row.category.includes("复审补发")) }
  ].filter((group) => group.rows.length > 0);

  useEffect(() => {
    fetch(`/api/brokers/${broker.id}/referrals`)
      .then((response) => response.json() as Promise<ReferralNode[]>)
      .then(setReferrals)
      .catch(() => setReferrals([]));
  }, [broker.id]);

  function toggleReward(rowId: string) {
    setExpandedReward((current) => current === rowId ? "" : rowId);
  }

  function exportSettlementDetails() {
    const opened = exportSettlementReportPdf({
      brokerName: broker.nickname,
      brokerPhone: broker.boundPhone || broker.wechatPhone,
      brokerUserId: broker.miniProgramUserId,
      cycleLabel: cycle?.label ?? "未选择周期",
      generatedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
      rows: settlementReportRows,
      weekSubtotal,
      carryForward: settlementLedger.carryForward,
      total: settlementTotal,
      payout: settlementPayout
    });
    if (!opened) setSubmitStatus("浏览器拦截了 PDF 窗口，请允许弹出窗口后重试。");
  }

  function submitPayment() {
    if (!canReceiveSelfRewards) {
      setSubmitStatus("该经纪人尚未加入种子激励计划，不生成本人奖励付款单。");
      return;
    }
    if (!cycle || cycle.key === pastCycleKey) {
      setSubmitStatus("往期通告不生成付款订单，请选择具体结算周期。");
      return;
    }
    onSubmitFinanceOrder({
      brokerId: broker.id,
      brokerNickname: broker.nickname,
      brokerPhone: broker.boundPhone || broker.wechatPhone,
      cycleKey,
      cycleLabel: cycle.label,
      amount: settlementTotal,
      rows,
      carryForward: settlementLedger.carryForward,
      weekSubtotal,
      settlementTotal
    });
    setSubmitStatus(`已提交 ${broker.nickname} ${cycle.shortLabel} 的付款单到财务管理。`);
  }

  function renderRewardDetails(rowId: string) {
    if (rowId === "validPublish") {
      const rows = [...rewardProfile.validPublishBriefings].reverse();
      return rows.length ? (
        <table className="nested-table">
          <thead>
            <tr>
              <th>通告</th>
              <th>发布时间</th>
              <th>报名 / 签约</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((briefing) => (
              <tr key={briefing.id}>
                <td>{briefing.title}</td>
                <td>{briefing.publishedAt}</td>
                <td>{briefing.signupPeople} / {briefing.contractPeople} 人</td>
                <td><ReviewBadge status={effectivePublishStatus(briefing)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="empty-state compact-empty">暂无符合条件的有效通告。</p>;
    }

    if (rowId === "clawback") {
      const rows = [...rewardProfile.clawbackBriefings].reverse();
      return rows.length ? (
        <table className="nested-table">
          <thead>
            <tr>
              <th>通告</th>
              <th>原发布周</th>
              <th>取消原因</th>
              <th>抵扣</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((briefing) => (
              <tr key={briefing.id}>
                <td>{briefing.title}</td>
                <td>{weekCycleForDate(briefing.publishedAt).shortLabel}</td>
                <td>{briefing.cancelReason || briefing.invalidReason || briefing.sourceStatus}</td>
                <td>{money(-1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="empty-state compact-empty">本周期无历史有效通告抵扣。</p>;
    }

    if (rowId === "validComplete") {
      const rows = [...rewardProfile.bonusCompleteRows].reverse();
      return rows.length ? (
        <table className="nested-table">
          <thead>
            <tr>
              <th>通告</th>
              <th>发布时间</th>
              <th>新增签约模特</th>
              <th>奖励</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.briefing.id}>
                <td>{row.briefing.title}</td>
                <td>{row.briefing.publishedAt}</td>
                <td>{row.newModels.map((model) => model.label).join("、")}</td>
                <td>{money(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="empty-state compact-empty">暂无符合新增签约奖励条件的通告。</p>;
    }

    if (rowId === "completeClawback") {
      const rows = [...rewardProfile.completeClawbackBriefings].reverse();
      return rows.length ? (
        <table className="nested-table">
          <thead>
            <tr>
              <th>通告</th>
              <th>原签约奖励周</th>
              <th>取消原因</th>
              <th>抵扣</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((briefing) => (
              <tr key={briefing.id}>
                <td>{briefing.title}</td>
                <td>{weekCycleForDate(briefing.firstSignedAt || briefing.importedAt || briefing.publishedAt).shortLabel}</td>
                <td>{briefing.cancelReason || briefing.invalidReason || briefing.sourceStatus}</td>
                <td>{money(-2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="empty-state compact-empty">本周期无历史新增签约奖励抵扣。</p>;
    }

    if (rowId === "referralBase") {
      return referralBaseDetails.length ? (
        <table className="nested-table">
          <thead>
            <tr>
              <th>下线经纪人</th>
              <th>手机号</th>
              <th>有效通告</th>
              <th>新增签约</th>
              <th>奖励</th>
            </tr>
          </thead>
          <tbody>
            {referralBaseDetails.map(({ node, profile }) => (
              <tr key={node.id}>
                <td>{node.nickname}</td>
                <td>{node.phone}</td>
                <td>{profile.validPublishCount}</td>
                <td>{profile.bonusCompleteCount}</td>
                <td>{money(10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : <p className="empty-state compact-empty">暂无达成 6+2 的直接下线。</p>;
    }

    if (rowId === "disputeCarry") {
      const details = rows.find((row) => row.id === rowId)?.details ?? [];
      return details.length ? (
        <table className="nested-table">
          <thead><tr><th>明细对象</th><th>复审说明</th><th>补发金额</th></tr></thead>
          <tbody>{details.map((detail) => (
            <tr key={detail.id}><td>{detail.object}</td><td>{detail.description}</td><td>{money(detail.amount)}</td></tr>
          ))}</tbody>
        </table>
      ) : <p className="empty-state compact-empty">本周期无争议复审补发。</p>;
    }

    return referralIncrementDetails.length ? (
      <table className="nested-table">
        <thead>
          <tr>
            <th>下线经纪人</th>
            <th>通告</th>
            <th>新增签约模特</th>
            <th>奖励</th>
          </tr>
        </thead>
        <tbody>
          {referralIncrementDetails.map(({ node, row }) => (
            <tr key={`${node.id}-${row.briefing.id}`}>
              <td>{node.nickname}</td>
              <td>{row.briefing.title}</td>
              <td>{row.newModels.map((model) => model.label).join("、")}</td>
              <td>{money(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ) : <p className="empty-state compact-empty">暂无直接下线新增签约增量。</p>;
  }

  return (
    <div className="settlement-stack">
      <section className="panel table-panel">
        <div className="panel-title with-actions">
          <div>
            <CircleDollarSign size={18} />
            <h2>{`当前周期费用结算${cycle ? ` · ${cycle.shortLabel}` : ""}`}</h2>
          </div>
          <div className="inline-actions">
            <button className="secondary-action" onClick={() => setShowSettlementPreview(true)} type="button"><ListChecks size={16} />预览明细</button>
            <select className="compact-select" value={cycleKey} onChange={(event) => onCycleChange(event.target.value)}>
              {cycleOptions.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
            <button className="primary-action" disabled={!canReceiveSelfRewards || financeOrder?.status === "pending" || financeOrder?.status === "approved" || financeOrder?.status === "paid"} onClick={submitPayment} type="button">
              <ListChecks size={16} />
              {!canReceiveSelfRewards ? "未加入计划" : financeOrder?.status === "pending" ? "财务审批中" : financeOrder?.status === "approved" ? "财务审批通过" : financeOrder?.status === "paid" ? "财务已付款" : financeOrder?.status === "rejected" ? "重新提交付款" : "提交付款"}
            </button>
            {financeOrder && financeOrder.status !== "paid" ? (
              <button className="secondary-action danger-action" onClick={() => onCancelFinanceOrder(financeOrder.id)} type="button">撤销付款</button>
            ) : null}
          </div>
        </div>
        {!canReceiveSelfRewards ? <p className="form-status">该经纪人尚未获得种子期数及计划生效时间，不计算本人奖励。</p> : null}
        <table className="settlement-list-table">
          <thead><tr><th>奖励项目</th><th>计算</th><th>本期金额</th></tr></thead>
          <tbody>{settlementGroups.map((group) => (
            <Fragment key={group.key}>
              <tr className={`settlement-list-group group-${group.key}`}>
                <th colSpan={2}>{group.label}</th>
                <th>小计 {money(group.rows.reduce((total, row) => total + row.amount, 0))}</th>
              </tr>
              {group.rows.map((row) => (
                <Fragment key={row.id}>
                  <tr className="expandable-settlement-row" onClick={() => toggleReward(row.id)}>
                    <td>
                      <button className={`settlement-chevron ${expandedReward === row.id ? "expanded" : ""}`} type="button" aria-label={expandedReward === row.id ? "收起" : "展开"}>
                        <span>{row.title}</span><ChevronDown size={15} />
                      </button>
                    </td>
                    <td>{rowCalculation[row.id]}</td>
                    <td className={row.amount === 0 ? "muted-amount" : ""}>{money(row.amount)}</td>
                  </tr>
                  {expandedReward === row.id ? <tr className="settlement-detail-row"><td colSpan={3}>{renderRewardDetails(row.id)}</td></tr> : null}
                </Fragment>
              ))}
            </Fragment>
          ))}</tbody>
        </table>
        <div className="settlement-footer settlement-footer-stack">
          <div className="settlement-footer-line">
            <span>本周小计</span>
            <strong>{money(weekSubtotal)}</strong>
          </div>
          {settlementLedger.carryForward < 0 ? (
            <div className="settlement-footer-line muted">
              <span>上期结转</span>
              <strong>{money(settlementLedger.carryForward)}</strong>
            </div>
          ) : null}
          <div className="settlement-footer-line total">
            <span>合计应付</span>
            <strong className={settlementTotal < 0 ? "negative-amount" : ""}>{money(settlementTotal)}</strong>
          </div>
          {settlementTotal < 0 ? (
            <p className="form-status">本周合计为负，差额将结转至后续周期，待累计为正后再发放。</p>
          ) : settlementPayout > 0 ? (
            <p className="form-status">本周可发放 {money(settlementPayout)}。</p>
          ) : null}
          {financeOrder ? (
            <p className={`form-status ${financeOrder.status === "rejected" ? "error" : ""}`}>
              该周期付款单状态：{financeOrder.status === "paid" ? "财务已付款" : financeOrder.status === "approved" ? "财务审批通过，费用已准备" : financeOrder.status === "rejected" ? `财务驳回${financeOrder.rejectionReason ? `：${financeOrder.rejectionReason}` : ""}` : "财务审批中"}。
            </p>
          ) : null}
          {submitStatus ? <p className="form-status">{submitStatus}</p> : null}
        </div>
      </section>

      {showSettlementPreview ? (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="settlement-preview-title" aria-modal="true" className="notice-modal settlement-preview-modal" role="dialog">
            <div className="panel-title with-actions settlement-preview-heading">
              <div><ReceiptText size={18} /><h2 id="settlement-preview-title">结算明细预览</h2></div>
              <div className="inline-actions">
                <button className="primary-action" onClick={exportSettlementDetails} type="button"><Download size={16} />导出 PDF</button>
                <button className="secondary-action" onClick={() => setShowSettlementPreview(false)} type="button">关闭</button>
              </div>
            </div>
            <div className="settlement-preview-meta">
              <strong>{broker.nickname}</strong>
              <span>{cycle?.label ?? "未选择周期"}</span>
            </div>
            <div className="settlement-report-summary">
              <div><span>判定记录</span><strong>{settlementReportRows.length}</strong></div>
              <div><span>计奖</span><strong>{rewardedReportCount}</strong></div>
              <div><span>不计奖</span><strong>{excludedReportCount}</strong></div>
              <div><span>待审核</span><strong>{pendingReportCount}</strong></div>
              <div><span>合计应付</span><strong>{money(settlementTotal)}</strong></div>
            </div>
            <div className="settlement-preview-table-wrap">
              <table className="settlement-report-table">
                <thead><tr><th>奖励项</th><th>通告ID</th><th>明细对象</th><th>判定</th><th>判定说明</th><th>金额</th></tr></thead>
                <tbody>{settlementPreviewGroups.map((group) => (
                  <Fragment key={group.key}>
                    <tr className={`settlement-report-group group-${group.key}`}><th colSpan={6}>{group.label}<span>{group.rows.length} 条</span></th></tr>
                    {group.rows.map((item) => (
                      <tr key={item.id}>
                        <td>{item.category}</td>
                        <td><span className="copy-line settlement-briefing-id">{item.briefingId || "-"}{item.briefingId ? <CopyButton value={item.briefingId} label="复制通告ID" /> : null}</span></td>
                        <td>{item.object}</td>
                        <td><span className={`settlement-decision-pill ${item.decision === "计奖" ? "approved" : item.decision === "待审核" ? "pending" : item.decision === "抵扣" ? "deduction" : "rejected"}`}>{item.decision}</span></td>
                        <td>{item.description}</td>
                        <td className={item.amount === 0 ? "muted-amount" : ""}>{money(item.amount)}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}</tbody>
              </table>
            </div>
            {settlementReportRows.length === 0 ? <p className="empty-state">本周期暂无结算判定记录。</p> : null}
          </section>
        </div>
      ) : null}

      <section className="panel table-panel">
        <PanelTitle icon={<CheckCircle2 size={18} />} title="新增签约奖励判定明细" />
        <table>
          <thead>
            <tr>
              <th>通告</th>
              <th>签约名单</th>
              <th>新增签约模特</th>
              <th>重复签约模特</th>
              <th>奖励判定</th>
            </tr>
          </thead>
          <tbody>
            {[...rewardProfile.completeRows].reverse().map((row) => (
              <tr key={row.briefing.id}>
                <td>
                  <div className="user-cell">
                    <strong>{row.briefing.title}</strong>
                    <span>{row.briefing.publishedAt}</span>
                  </div>
                </td>
                <td>{signedModelsForBriefing(row.briefing).length} 人</td>
                <td>{row.newModels.length ? row.newModels.map((model) => model.label).join("、") : "-"}</td>
                <td>{row.repeatedModels.length ? row.repeatedModels.map((model) => model.label).join("、") : "-"}</td>
                <td>
                  <div className="user-cell">
                    <ReviewBadge status={row.bonusEligible ? "approved" : "rejected"} />
                    <span>{row.reason}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function BriefingReviewPage({
  broker,
  item,
  briefingsData,
  onBack,
  onBriefingSaved,
  onOpenSigner,
  onRefreshBriefings
}: {
  broker: Broker;
  item: Briefing;
  briefingsData: Briefing[];
  onBack: () => void;
  onBriefingSaved: (briefing: Briefing) => void;
  onOpenSigner: (signerId: string) => void;
  onRefreshBriefings: (brokerId: string) => Promise<Briefing[]>;
}) {
  const currentIncentiveStartAt = brokerCurrentIncentiveStartAt(broker);
  const sourceInvalid = sourceRejected(item);
  const clawbackCycle = parseClawbackCycle(item.invalidReason);
  const salaryItems = salaryDetailItems(item.salaryText);
  const requirementItems = requirementValueMap(item.requirementText);
  const previousSignedNames = useMemo(() => {
    const currentTime = dateValue(item.publishedAt);
    return new Set(
      briefingsData
        .filter((briefing) => (
          briefing.brokerId === item.brokerId
          && briefing.id !== item.id
          && isBriefingSeedEligible(briefing, currentIncentiveStartAt)
          && dateValue(briefing.publishedAt) < currentTime
        ))
        .flatMap((briefing) => briefing.signedModelNames)
        .map((name) => parseSignedModelName(name).key)
    );
  }, [briefingsData, item.brokerId, item.id, item.publishedAt, currentIncentiveStartAt]);
  const previousSignedBriefingsByKey = useMemo(() => {
    const currentTime = dateValue(item.publishedAt);
    const rows = new Map<string, Briefing[]>();
    briefingsData
      .filter((briefing) => (
        briefing.brokerId === item.brokerId
        && briefing.id !== item.id
        && isBriefingSeedEligible(briefing, currentIncentiveStartAt)
        && dateValue(briefing.publishedAt) < currentTime
      ))
      .forEach((briefing) => {
        signedModelsForBriefing(briefing).forEach((model) => {
          rows.set(model.key, [...(rows.get(model.key) ?? []), briefing]);
        });
      });
    return rows;
  }, [briefingsData, item.brokerId, item.id, item.publishedAt, currentIncentiveStartAt]);
  const currentRelationshipByKey = new Map(
    (item.signedModels ?? []).map((relationship) => {
      const model = parseSignedModelName(`${relationship.name}${relationship.phone ? `（${relationship.phone}）` : ""}${relationship.userId ? ` · #${relationship.userId}` : ""}`);
      return [model.key, relationship] as const;
    })
  );
  const signedReviewRows = signedModelsForBriefing(item).map((model) => {
    const relationship = currentRelationshipByKey.get(model.key);
    const isActive = relationship?.active ?? true;
    return {
      model,
      history: previousSignedBriefingsByKey.get(model.key) ?? [],
      isActive,
      sourceStatus: relationship ? signerRelationshipStatusLabel(relationship) : "已签约",
      cancelledAt: relationship?.cancelledAt ?? "",
      cancelReason: relationship?.cancelReason ?? "",
      isNew: isActive && !previousSignedNames.has(model.key)
    };
  });
  const newSignedModelNames = signedReviewRows.filter((row) => row.isNew);
  const repeatedSignedModelNames = signedReviewRows.filter((row) => row.isActive && !row.isNew);
  const inactiveSignedModelNames = signedReviewRows.filter((row) => !row.isActive);
  const hasSignedModels = signedReviewRows.some((row) => row.isActive);
  const initialModelReviewDecisions = useMemo(() => signedModelReviewDecisions(item.invalidReason), [item.invalidReason]);
  const brokerBriefings = briefingsData.filter((briefing) => briefing.brokerId === item.brokerId);
  const seedEligible = isBriefingSeedEligible(item, currentIncentiveStartAt);
  const eligibleBrokerBriefings = brokerBriefings.filter((briefing) => isBriefingSeedEligible(briefing, currentIncentiveStartAt));
  const publishCapBlocked = buildPublishCapState(eligibleBrokerBriefings).cappedIds.has(item.id);
  const currentRewardRow = buildRewardProfile(brokerBriefings, undefined, currentIncentiveStartAt).completeRows.find((row) => row.briefing.id === item.id);
  const initialPublishStatus = sourceInvalid ? "rejected" as ReviewStatus : currentRewardRow?.publishStatus ?? effectivePublishStatus(item);
  const initialCompleteStatus = sourceInvalid || !hasSignedModels
    ? "rejected" as ReviewStatus
    : currentRewardRow
      ? effectiveCompleteStatus(currentRewardRow)
      : item.validCompleteStatus;
  const [reviewDraft, setReviewDraft] = useState({
    validPublishStatus: initialPublishStatus,
    validCompleteStatus: initialCompleteStatus,
    invalidReason: stripSignedModelReviewMarkers(item.invalidReason) || item.cancelReason || ""
  });
  const [modelReviewDecisions, setModelReviewDecisions] = useState<Map<string, SignedModelReviewDecision>>(initialModelReviewDecisions);
  const modelReviewIssueCount = Array.from(modelReviewDecisions.values()).filter(isSignedModelReviewIssue).length;
  const [expandedSignedKey, setExpandedSignedKey] = useState("");
  const [evidenceRows, setEvidenceRows] = useState<EvidenceFile[]>([]);
  const [activeEvidenceId, setActiveEvidenceId] = useState(item.evidenceFiles[0]?.id ?? "");
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState("");
  const [evidenceUploadStatus, setEvidenceUploadStatus] = useState("");
  const [isUploadingEvidence, setIsUploadingEvidence] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const evidenceInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const activeEvidence =
    evidenceRows.find((evidence) => evidence.id === activeEvidenceId) ??
    item.evidenceFiles.find((evidence) => evidence.id === activeEvidenceId) ??
    evidenceRows.find((evidence) => !evidence.briefingId || evidence.briefingId === item.id) ??
    item.evidenceFiles[0];
  const availableEvidenceRows = evidenceRows.filter((evidence) => !evidence.briefingId);
  const matchedEvidenceRows = evidenceRows.filter((evidence) => evidence.briefingId === item.id);
  const activeEvidenceIsImage = Boolean(activeEvidence && (
    activeEvidence.fileType.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|heic)$/i.test(activeEvidence.fileName)
  ));

  useEffect(() => {
    void refreshEvidenceRows();
  }, [broker.id, item.id]);

  useEffect(() => {
    setReviewDraft({
      validPublishStatus: initialPublishStatus,
      validCompleteStatus: initialCompleteStatus,
      invalidReason: stripSignedModelReviewMarkers(item.invalidReason) || item.cancelReason || ""
    });
    setModelReviewDecisions(initialModelReviewDecisions);
    setExpandedSignedKey("");
  }, [item.id, item.validPublishStatus, item.validCompleteStatus, item.invalidReason, item.cancelReason, sourceInvalid, initialPublishStatus, initialCompleteStatus, initialModelReviewDecisions]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!activeEvidence || activeEvidenceIsImage) {
      video.removeAttribute("src");
      video.load();
      setIsVideoPlaying(false);
      return;
    }
    if (video.dataset.sourceUrl === activeEvidence.fileUrl) return;
    video.pause();
    setIsVideoPlaying(false);
    video.dataset.sourceUrl = activeEvidence.fileUrl;
    video.src = activeEvidence.fileUrl;
    video.load();
  }, [activeEvidence?.fileUrl, activeEvidenceIsImage]);

  useEffect(() => {
    function handleKeydown(event: KeyboardEvent) {
      if (event.code !== "Space" || !videoRef.current) return;
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      event.preventDefault();
      if (videoRef.current.paused) {
        void videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, []);

  async function refreshEvidenceRows() {
    const response = await fetch(`/api/brokers/${broker.id}/evidences`);
    const rows = (await response.json()) as EvidenceFile[];
    setEvidenceRows(rows);
    const nextActive = rows.find((evidence) => evidence.briefingId === item.id)?.id ?? rows.find((evidence) => !evidence.briefingId)?.id ?? "";
    setActiveEvidenceId((current) => current || nextActive);
  }

  function chooseEvidenceFiles() {
    evidenceInputRef.current?.click();
  }

  async function uploadEvidenceFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    setIsUploadingEvidence(true);
    setEvidenceUploadStatus(`正在上传 ${files.length} 个凭证文件到经纪人凭证库...`);
    try {
      const uploadedRows: EvidenceFile[] = [];
      for (const file of files) {
        const response = await fetch(`/api/brokers/${broker.id}/evidences`, {
          method: "POST",
          headers: {
            "content-type": file.type || "application/octet-stream",
            "x-file-name": encodeURIComponent(file.name),
            "x-file-type": file.type || "application/octet-stream"
          },
          body: await file.arrayBuffer()
        });
        const result = (await response.json()) as EvidenceFile | { error?: string };
        if (!response.ok) {
          const errorMessage = "error" in result ? result.error : "";
          setEvidenceUploadStatus(`${file.name} 上传失败：${errorMessage || "请稍后重试"}`);
          return;
        }
        if ("id" in result) {
          uploadedRows.push(result);
        }
      }
      setEvidenceUploadStatus(`已上传 ${files.length} 个凭证文件到经纪人凭证库`);
      if (uploadedRows[0]) {
        setActiveEvidenceId(uploadedRows[0].id);
      }
      await refreshEvidenceRows();
      await onRefreshBriefings(broker.id);
    } catch {
      setEvidenceUploadStatus("上传失败：网络响应异常");
    } finally {
      setIsUploadingEvidence(false);
      if (evidenceInputRef.current) {
        evidenceInputRef.current.value = "";
      }
    }
  }

  async function matchEvidence(evidenceId = activeEvidence?.id) {
    if (!evidenceId) {
      setStatus("请先从经纪人凭证库选择文件");
      return;
    }
    const response = await fetch(`/api/briefings/${item.id}/evidence/${evidenceId}`, { method: "PATCH" });
    if (!response.ok) {
      setStatus("凭证添加失败");
      return;
    }
    setStatus("凭证已添加至当前通告凭证库");
    setSelectedEvidenceIds((current) => {
      const next = new Set(current);
      next.delete(evidenceId);
      return next;
    });
    await refreshEvidenceRows();
    await onRefreshBriefings(broker.id);
  }

  async function matchSelectedEvidence() {
    const ids = Array.from(selectedEvidenceIds);
    if (ids.length === 0) {
      setStatus("请先勾选需要添加的凭证文件");
      return;
    }
    setStatus(`正在添加 ${ids.length} 个凭证文件...`);
    for (const evidenceId of ids) {
      const response = await fetch(`/api/briefings/${item.id}/evidence/${evidenceId}`, { method: "PATCH" });
      if (!response.ok) {
        setStatus("部分凭证添加失败，请检查后重试");
        await refreshEvidenceRows();
        return;
      }
    }
    setSelectedEvidenceIds(new Set());
    setStatus(`已确认 ${ids.length} 个凭证有效，并添加至当前通告凭证库`);
    await refreshEvidenceRows();
    await onRefreshBriefings(broker.id);
  }

  async function unmatchEvidence(evidenceId: string) {
    const response = await fetch(`/api/briefings/${item.id}/evidence/${evidenceId}`, { method: "DELETE" });
    if (!response.ok) {
      setStatus("凭证移回失败");
      return;
    }
    setStatus("凭证已移回经纪人凭证库，可重新选择");
    setActiveEvidenceId(evidenceId);
    await refreshEvidenceRows();
    await onRefreshBriefings(broker.id);
  }

  async function saveReview() {
    const briefingHasMatchedEvidence =
      evidenceRows.some((evidence) => evidence.briefingId === item.id) ||
      item.evidenceFiles.some((evidence) => evidence.briefingId === item.id);

    if (!seedEligible) {
      setSaveNotice("该通告发布于种子身份生效前，属于往期通告，不进入裂变计划奖励审核。");
      return;
    }

    if (reviewDraft.validCompleteStatus === "approved" && reviewDraft.validPublishStatus !== "approved") {
      setSaveNotice("请先审核通告是否符合有效通告发布条件，通过后才能审核新增签约。");
      return;
    }

    if (
      !sourceInvalid &&
      reviewDraft.validPublishStatus === "approved" &&
      !briefingHasMatchedEvidence
    ) {
      setSaveNotice("有效通告已设为「通过」，但当前通告凭证库仍为空。请先从经纪人凭证库添加至少一个截图或视频，再保存审核结果。");
      return;
    }

    if (reviewDraft.validCompleteStatus === "approved" && newSignedModelNames.length === 0) {
      setSaveNotice(hasSignedModels
        ? "该通告没有历史未合作的新增签约者，不能审核为新增签约通过。"
        : "该通告没有当前有效签约者；已解约人员只保留为历史记录，不能审核为新增签约通过。");
      return;
    }

    const nextDraft = {
      ...reviewDraft,
      validCompleteStatus: hasSignedModels ? reviewDraft.validCompleteStatus : "rejected" as ReviewStatus,
      invalidReason: composeInvalidReasonWithModelReviews(
        reviewDraft.validPublishStatus === "approved" && reviewDraft.invalidReason.startsWith("凭证异议")
          ? ""
          : reviewDraft.invalidReason,
        modelReviewDecisions
      )
    };

    setStatus("审核保存中...");
    try {
      const response = await fetch(`/api/briefings/${item.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextDraft)
      });
      const result = (await response.json()) as Briefing | { error?: string } | null;
      if (!response.ok) {
        const errorMessage = result && "error" in result ? result.error : "";
        setStatus(`审核保存失败：${errorMessage || "请稍后重试"}`);
        return;
      }
      if (result && "id" in result) {
        onBriefingSaved(result);
      }
      await onRefreshBriefings(broker.id).catch(() => undefined);
      onBack();
    } catch {
      setStatus("审核保存失败：网络响应异常");
    }
  }

  async function clearEvidenceDispute() {
    setStatus("正在清除凭证异议...");
    try {
      const response = await fetch(`/api/briefings/${item.id}/review/evidence-dispute`, { method: "DELETE" });
      const result = (await response.json()) as Briefing | { error?: string } | null;
      if (!response.ok) {
        const errorMessage = result && "error" in result ? result.error : "";
        setStatus(`清除凭证异议失败：${errorMessage || "请稍后重试"}`);
        return;
      }
      if (result && "id" in result) onBriefingSaved(result);
      await onRefreshBriefings(broker.id).catch(() => undefined);
      onBack();
    } catch {
      setStatus("清除凭证异议失败：网络响应异常");
    }
  }

  function signingStatusFromModelReviews(decisions: Map<string, SignedModelReviewDecision>, publishStatus: ReviewStatus) {
    const newSignerRows = signedReviewRows.filter((row) => row.isNew);
    if (newSignerRows.length === 0) return "rejected" as ReviewStatus;
    const values = newSignerRows.map((row) => decisions.get(row.model.key));
    if (values.some((value) => isSignedModelReviewIssue(value))) return "rejected" as ReviewStatus;
    if (values.every((value) => value === "APPROVED") && publishStatus === "approved") return "approved" as ReviewStatus;
    return "pending" as ReviewStatus;
  }

  async function updateModelReview(modelKey: string, decision: SignedModelReviewDecision | "") {
    const nextDecisions = new Map(modelReviewDecisions);
    if (decision) nextDecisions.set(modelKey, decision);
    else nextDecisions.delete(modelKey);
    setModelReviewDecisions(nextDecisions);
    setReviewDraft((current) => ({
      ...current,
      validCompleteStatus: signingStatusFromModelReviews(nextDecisions, current.validPublishStatus)
    }));
    setStatus(decision ? `已选择：${signedModelReviewLabels[decision]}，请在下方保存审核` : "已清除该签约者人工审核选项");
  }

  async function confirmEvidencePassed() {
    if (matchedEvidenceRows.length === 0) {
      setStatus("当前通告凭证库为空，请先添加凭证");
      return;
    }
    const nextDraft = {
      ...reviewDraft,
      validPublishStatus: "approved" as ReviewStatus,
      validCompleteStatus: signingStatusFromModelReviews(modelReviewDecisions, "approved"),
      invalidReason: reviewDraft.invalidReason.startsWith("凭证异议") ? "" : reviewDraft.invalidReason
    };
    setStatus("正在确认凭证通过...");
    const response = await fetch(`/api/briefings/${item.id}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...nextDraft,
        invalidReason: composeInvalidReasonWithModelReviews(nextDraft.invalidReason, modelReviewDecisions)
      })
    });
    const result = (await response.json()) as Briefing | { error?: string } | null;
    if (!response.ok) {
      const errorMessage = result && "error" in result ? result.error : "";
      setStatus(`凭证通过保存失败：${errorMessage || "请稍后重试"}`);
      return;
    }
    setReviewDraft(nextDraft);
    if (result && "id" in result) onBriefingSaved(result);
    setStatus("凭证已确认通过；请继续完成新增签约人工审核并保存");
    await onRefreshBriefings(broker.id).catch(() => undefined);
  }

  async function markEvidenceDispute() {
    const nextDraft = {
      ...reviewDraft,
      validPublishStatus: "pending" as ReviewStatus,
      validCompleteStatus: hasSignedModels ? "pending" as ReviewStatus : "rejected" as ReviewStatus,
      invalidReason: reviewDraft.invalidReason.startsWith("凭证异议")
        ? reviewDraft.invalidReason
        : `凭证异议：${reviewDraft.invalidReason || "录屏凭证与通告详情存在个别信息差异，待与经纪人确认。"}`
    };
    setReviewDraft(nextDraft);
    const response = await fetch(`/api/briefings/${item.id}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...nextDraft,
        invalidReason: composeInvalidReasonWithModelReviews(nextDraft.invalidReason, modelReviewDecisions)
      })
    });
    if (!response.ok) {
      setStatus("凭证异议保存失败");
      return;
    }
    const result = (await response.json()) as Briefing | null;
    if (result) onBriefingSaved(result);
    setStatus("已记录凭证异议，该通告暂缓结算");
    await onRefreshBriefings(broker.id);
  }

  async function syncBriefingDetailFromOpenApi() {
    setStatus("正在通过鑫通告只读接口同步通告和签约者...");
    try {
      const response = await fetch("/api/data-sync/run", { method: "POST" });
      const result = await response.json() as { error?: string; participantCount?: number };
      if (!response.ok) {
        recordClientOperation("通告审核", "点击“同步签约者信息”", `${item.title} · 通告ID ${item.jarvisBriefingId} · ${result.error ?? "同步失败"}`, "失败");
        setStatus(result.error ?? "鑫通告数据同步失败");
        return;
      }
      const nextItems = await onRefreshBriefings(broker.id);
      const updatedItem = nextItems.find((briefing) => briefing.jarvisBriefingId === item.jarvisBriefingId);
      if (updatedItem) onBriefingSaved(updatedItem);
      recordClientOperation("通告审核", "点击“同步签约者信息”", `${item.title} · 通告ID ${item.jarvisBriefingId} · 经纪人 ${broker.nickname} · 当前签约者 ${updatedItem?.signedModelCount ?? 0} 人`);
      setStatus(`只读同步完成，通告详情和签约者已更新；本次共同步 ${result.participantCount ?? 0} 条报名/签约记录。`);
    } catch {
      recordClientOperation("通告审核", "点击“同步签约者信息”", `${item.title} · 通告ID ${item.jarvisBriefingId} · 请求失败`, "失败");
      setStatus("鑫通告数据同步失败，请稍后重试或前往系统日志查看原因。");
    }
  }

  function selectEvidence(evidenceId: string) {
    setActiveEvidenceId((current) => (current === evidenceId ? current : evidenceId));
  }

  function toggleEvidenceSelection(evidenceId: string) {
    setSelectedEvidenceIds((current) => {
      const next = new Set(current);
      if (next.has(evidenceId)) next.delete(evidenceId);
      else next.add(evidenceId);
      return next;
    });
  }

  function toggleVideoPlayback() {
    const video = videoRef.current;
    if (!video || !activeEvidence || activeEvidenceIsImage) return;
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  }

  return (
    <section className="page review-page">
      <div className="review-page-topbar">
        <button className="review-back-button" onClick={onBack} type="button">
          <ChevronLeft size={16} />
          返回工作台
        </button>
      </div>
      <div className="review-content-scroll">
      <div className="review-content-shell">
        <header className="review-page-header">
          <div>
            <span className="eyebrow">Briefing Review</span>
            <div className="review-title-row">
              <h2>{item.title}</h2>
              {hasEvidenceDispute(item) ? <span className="status-pill warning">凭证异议</span> : null}
            </div>
            <p>{broker.nickname} · #{item.jarvisBriefingId} · {item.sourceStatus}</p>
          </div>
          <div className="inline-actions">
            <ReviewBadge label={cappedPublishLabel(item, brokerBriefings)} status={currentRewardRow?.publishStatus ?? cappedPublishStatus(item, brokerBriefings)} />
            {currentRewardRow ? (
              <ReviewBadge label={signingStatusLabel(currentRewardRow)} status={effectiveCompleteStatus(currentRewardRow)} />
            ) : (
              <ReviewBadge status="pending" />
            )}
          </div>
        </header>

        <div className="review-workspace">
        <section className="briefing-detail-stack">
          <section className="xtg-detail-card">
            <div className="xtg-detail-title">
              <h3>鑫通告详情</h3>
              <span>{item.sourceStatus}</span>
            </div>
            <div className="xtg-detail-grid">
              <InfoItem label="招聘类型" value={item.recruitmentType || "-"} />
              <InfoItem label="性别" value={item.genderRequirement || "-"} />
              <InfoItem label="招聘人数" value={`${item.recruitCount}`} />
              <InfoItem label="报名 / 签约人数" value={`${item.signupPeople} / ${item.contractPeople}`} />
              <InfoItem label="发布人" value={item.publisherText || "-"} />
              <InfoItem label="发布时间" value={item.publishedAt} />
              <InfoItem label="取消原因" value={item.cancelReason || "-"} danger={Boolean(item.cancelReason)} />
            </div>
          </section>

          <section className="xtg-detail-card">
            <h3>工作时间 & 地点</h3>
            <div className="xtg-detail-grid">
              <InfoItem label="工作日期" value={splitDetailValues(item.workDate).join("  ")} />
              <InfoItem label="工作时段" value={splitDetailValues(item.workTime).join("  ")} />
              <InfoItem label="工作地点" value={item.workAddress || "-"} />
            </div>
          </section>

          <section className="xtg-detail-card">
            <h3>薪资</h3>
            <div className="xtg-detail-grid salary-detail-grid">
              {salaryItems.map((salaryItem) => (
                <InfoItem key={salaryItem.label} label={salaryItem.label} value={salaryItem.value} />
              ))}
            </div>
          </section>

          <section className="xtg-detail-card">
            <h3>工作要求</h3>
            <div className="xtg-detail-grid requirement-detail-grid">
              <InfoItem label="要求描述" value={requirementItems["要求描述"] || "-"} />
              <InfoItem label="年龄" value={requirementItems["年龄"] || "-"} />
              <InfoItem label="身高" value={requirementItems["身高"] || "-"} />
              <InfoItem label="体重" value={requirementItems["体重"] || "-"} />
              <InfoItem label="纹身" value={requirementItems["纹身"] || "-"} />
              <InfoItem label="头发颜色" value={requirementItems["头发颜色"] || "-"} />
              <InfoItem label="头发长度" value={requirementItems["头发长度"] || "-"} />
              <InfoItem label="胸围" value={requirementItems["胸围"] || "-"} />
              <InfoItem label="腰围" value={requirementItems["腰围"] || "-"} />
              <InfoItem label="臀围" value={requirementItems["臀围"] || "-"} />
              <InfoItem label="肩宽" value={requirementItems["肩宽"] || "-"} />
              <InfoItem label="鞋码" value={requirementItems["鞋码"] || "-"} />
              <InfoItem label="衣服尺码" value={requirementItems["衣服尺码"] || "-"} />
              <InfoItem label="语言" value={requirementItems["语言"] || "-"} />
            </div>
          </section>

          <section className="xtg-detail-card">
            <div className="xtg-detail-title">
              <h3>新增签约核验</h3>
              <span>有效签约 {signedReviewRows.length - inactiveSignedModelNames.length} / 记录 {signedReviewRows.length}</span>
            </div>
            <div className="section-inline-actions">
              <button className="secondary-action compact-action" onClick={() => void syncBriefingDetailFromOpenApi()} type="button">
                <RefreshCw size={15} />同步签约者信息
              </button>
              <a className="secondary-action compact-action" href={item.detailUrl} rel="noreferrer" target="_blank">打开鑫通告详情</a>
            </div>
            <div className="signed-model-summary">
              <InfoItem label="奖励新增" value={`${newSignedModelNames.length} 人`} />
              <InfoItem label="历史重复" value={`${repeatedSignedModelNames.length} 人`} />
              <InfoItem label="已解约/无效" value={`${inactiveSignedModelNames.length} 人`} />
              <InfoItem label="人工异常" value={`${modelReviewIssueCount} 人`} />
            </div>
            {signedReviewRows.length > 0 ? (
              <div className="signed-review-list">
                {signedReviewRows.map(({ model, history, isActive, sourceStatus, cancelledAt, cancelReason, isNew }) => {
                  const modelReviewDecision = modelReviewDecisions.get(model.key);
                  const modelReviewIssue = isSignedModelReviewIssue(modelReviewDecision);
                  return (
                    <div
                      className={`signed-review-row ${!isActive ? "inactive" : isNew ? "new" : "repeat"} ${modelReviewIssue ? "mismatch" : ""} ${model.userId ? "is-clickable" : ""}`}
                      key={model.key}
                      onClick={() => model.userId && onOpenSigner(model.userId)}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget || !model.userId || (event.key !== "Enter" && event.key !== " ")) return;
                        event.preventDefault();
                        onOpenSigner(model.userId);
                      }}
                      role={model.userId ? "link" : undefined}
                      tabIndex={model.userId ? 0 : undefined}
                    >
                      <div className="signed-review-main">
                        <div className="user-cell">
                          <strong>{model.name}</strong>
                          <span className="copy-line">
                            <span className="signed-identity-token">
                              {model.phone || "-"}
                              {model.phone ? <CopyButton value={model.phone} label="复制手机号" /> : null}
                            </span>
                            {model.userId ? (
                              <span className="signed-identity-token">
                                · #{model.userId}
                                <CopyButton value={model.userId} label="复制用户ID" />
                              </span>
                            ) : null}
                          </span>
                          {!isActive ? <small className="signed-relationship-note">{cancelReason || (cancelledAt ? `解约时间：${cancelledAt}` : "该签约关系当前已失效")}</small> : null}
                        </div>
                        <div className="signed-review-actions">
                          <span className={`status-pill ${isActive ? "success" : "danger"}`}>{sourceStatus}</span>
                          {isActive ? (
                            <select
                              aria-label={`${model.name}人工审核`}
                              className="signer-review-select"
                              onChange={(event) => void updateModelReview(model.key, event.target.value as SignedModelReviewDecision | "")}
                              onClick={(event) => event.stopPropagation()}
                              value={modelReviewDecision ?? ""}
                            >
                              <option value="">人工审核</option>
                              {signedModelReviewOptions.map((option) => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          ) : <span className="status-pill danger">不计入新增签约</span>}
                          {isActive && !isNew ? (
                            <button
                              className="text-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setExpandedSignedKey(expandedSignedKey === model.key ? "" : model.key);
                              }}
                              type="button"
                            >
                              {expandedSignedKey === model.key ? "收起历史" : "查看历史"}
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {expandedSignedKey === model.key ? (
                        <div className="signed-history-list">
                          {history.map((briefing) => (
                            <div key={briefing.id}>
                              <strong>{briefing.title}</strong>
                              <span>{briefing.publishedAt}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="empty-state compact-empty">暂无已签约人员名单，请点击“同步签约者信息”通过鑫通告只读接口获取。</p>
            )}
          </section>
        </section>

        <div className="evidence-preview-stack">
        <section className="review-section video-stage">
          <h3>凭证预览</h3>
          <div className={`video-frame ${activeEvidenceIsImage ? "image-preview-frame" : ""}`} onClick={toggleVideoPlayback} role="presentation">
            {activeEvidence && activeEvidenceIsImage ? (
              <img alt={decodeURIComponent(activeEvidence.fileName)} src={activeEvidence.fileUrl} />
            ) : null}
            <video
              controls
              hidden={!activeEvidence || activeEvidenceIsImage}
              onPause={() => setIsVideoPlaying(false)}
              onPlay={() => setIsVideoPlaying(true)}
              preload="metadata"
              ref={videoRef}
            />
            {activeEvidence && !activeEvidenceIsImage && !isVideoPlaying ? (
              <button
                className="video-play-overlay"
                onClick={(event) => {
                  event.stopPropagation();
                  toggleVideoPlayback();
                }}
                type="button"
                aria-label="播放视频"
              >
                <span />
              </button>
            ) : null}
            {!activeEvidence ? <p className="video-placeholder">凭证库暂无可预览文件</p> : null}
          </div>
          {activeEvidence ? (
            <>
              <div className="video-meta">
                <strong>{decodeURIComponent(activeEvidence.fileName)}</strong>
                <span>{activeEvidence.briefingId === item.id ? "已在当前通告凭证库" : "经纪人凭证库待选"} · {activeEvidence.uploadedAt}</span>
              </div>
              <div className="inline-actions">
                <button className="primary-action" disabled={activeEvidence.briefingId === item.id} onClick={() => void matchEvidence()} type="button">
                  <Check size={16} />
                  添加到通告凭证库
                </button>
                {activeEvidence.briefingId === item.id ? (
                  <button className="secondary-action" onClick={() => void unmatchEvidence(activeEvidence.id)} type="button">移回经纪人凭证库</button>
                ) : null}
              </div>
            </>
          ) : (
            <p className="empty-state">请先上传截图或视频到经纪人凭证库。</p>
          )}
          {status ? <p className="form-status">{status}</p> : null}
        </section>

        <section className="review-section briefing-evidence-library">
          <div className="review-section-title">
            <div>
              <h3>当前通告凭证库</h3>
              <small>已确认有效 {matchedEvidenceRows.length} 个文件</small>
            </div>
          </div>
          <div className="briefing-evidence-list">
            {matchedEvidenceRows.map((evidence) => (
              <div className={`briefing-evidence-item ${activeEvidenceId === evidence.id ? "active" : ""}`} key={evidence.id}>
                <button className="briefing-evidence-preview" onClick={() => selectEvidence(evidence.id)} type="button">
                  <strong>{decodeURIComponent(evidence.fileName)}</strong>
                  <span>{evidence.fileType.startsWith("image/") ? "截图" : "视频"} · 点击预览</span>
                </button>
                <button className="secondary-action compact-action" onClick={() => void unmatchEvidence(evidence.id)} type="button">移回经纪人库</button>
              </div>
            ))}
            {matchedEvidenceRows.length === 0 ? <p className="empty-state compact-empty">尚未向当前通告添加凭证。</p> : null}
          </div>
          {!sourceInvalid ? (
            <div className="briefing-evidence-verdicts">
              <button
                className="primary-action"
                disabled={matchedEvidenceRows.length === 0 || publishCapBlocked || !seedEligible}
                onClick={() => void confirmEvidencePassed()}
                type="button"
              >
                <Check size={16} />确认凭证通过
              </button>
              <button className="secondary-action" onClick={() => void markEvidenceDispute()} type="button">凭证异议</button>
            </div>
          ) : null}
          {reviewDraft.validPublishStatus === "approved" && !reviewDraft.invalidReason.startsWith("凭证异议") ? (
            <p className="form-status success-status">当前凭证结论：通过</p>
          ) : null}
          {reviewDraft.invalidReason.startsWith("凭证异议") ? (
            <p className="form-status warning-status">当前凭证结论：凭证异议，暂缓结算</p>
          ) : null}
        </section>
        </div>

        <section className="review-section evidence-library">
          <div className="review-section-title">
            <h3>经纪人凭证库</h3>
            <button className="secondary-action compact-action" disabled={isUploadingEvidence} onClick={chooseEvidenceFiles} type="button">
              <Upload size={15} />
              上传凭证
            </button>
          </div>
          <input
            ref={evidenceInputRef}
            accept="image/*,video/*"
            hidden
            multiple
            onChange={(event) => void uploadEvidenceFiles(event.target.files)}
            type="file"
          />
          {evidenceUploadStatus ? <p className="form-status">{evidenceUploadStatus}</p> : null}
          <p className="evidence-library-help">截图和视频会先保存在经纪人凭证库。勾选确认后，再加入当前通告。</p>
          {availableEvidenceRows.length > 0 ? (
            <div className="evidence-library-actions">
              <label>
                <input
                  checked={selectedEvidenceIds.size === availableEvidenceRows.length}
                  onChange={(event) => setSelectedEvidenceIds(event.target.checked ? new Set(availableEvidenceRows.map((evidence) => evidence.id)) : new Set())}
                  type="checkbox"
                />
                全选未匹配凭证
              </label>
              <button className="primary-action compact-action" disabled={selectedEvidenceIds.size === 0} onClick={() => void matchSelectedEvidence()} type="button">
                <Check size={15} />全部确认凭证有效（{selectedEvidenceIds.size}）
              </button>
            </div>
          ) : null}
          <div className="evidence-picker-list">
            {availableEvidenceRows.map((evidence) => (
              <div
                className={`evidence-picker-item ${activeEvidenceId === evidence.id ? "active" : ""}`}
                key={evidence.id}
                onClick={() => selectEvidence(evidence.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") selectEvidence(evidence.id);
                }}
              >
                <input
                  aria-label={`选择${decodeURIComponent(evidence.fileName)}`}
                  checked={selectedEvidenceIds.has(evidence.id)}
                  onChange={() => toggleEvidenceSelection(evidence.id)}
                  onClick={(event) => event.stopPropagation()}
                  type="checkbox"
                />
                <div>
                  <strong>{decodeURIComponent(evidence.fileName)}</strong>
                  <span>{evidence.fileType.startsWith("image/") ? "截图" : "视频"} · {evidence.uploadedAt}</span>
                </div>
                <button className="text-button" onClick={(event) => { event.stopPropagation(); void matchEvidence(evidence.id); }} type="button">添加</button>
              </div>
            ))}
            {availableEvidenceRows.length === 0 ? <p className="empty-state">经纪人凭证库没有未匹配文件。</p> : null}
          </div>
        </section>

        <section className="review-section review-action-panel">
          <h3>人工审核</h3>
          {sourceInvalid ? (
            <p className="form-status warning-status">
              系统已根据鑫通告来源判定为「{publishReviewLabel(item)}」：{item.cancelReason || item.sourceStatus}。
              有效通告无需凭证审核；如认为误判，请人工复核来源字段后重新导入。
              {clawbackCycle ? ` 本通告将在第 ${clawbackCycle.replace("week-", "")} 周结算中抵扣 1 元。` : ""}
            </p>
          ) : (
            <p className="form-status">仅对待审核通告进行凭证审核；进行中且跨周发布的通告，可在发布当周结算日凭凭证判定为有效。</p>
          )}
          {publishCapBlocked ? (
            <p className="form-status warning-status">该通告已超出每日 3 条或每周 12 条有效通告上限，当前作为奖励候选待定；前序通告审核不通过并释放名额后，方可继续审核。</p>
          ) : null}
          {!seedEligible ? <p className="form-status warning-status">该通告发布于 {currentIncentiveStartAt || "当前激励阶段生效"} 前，已归入往期通告，不参与计划审核。</p> : null}
          <div className="review-form">
            <label>
              <span>有效通告</span>
              <select
                disabled={sourceInvalid || publishCapBlocked || !seedEligible}
                value={sourceInvalid || !seedEligible ? "rejected" : publishCapBlocked ? "pending" : reviewDraft.validPublishStatus}
                onChange={(event) => {
                  const validPublishStatus = event.target.value as ReviewStatus;
                  setReviewDraft({
                    ...reviewDraft,
                    validPublishStatus,
                    validCompleteStatus: !hasSignedModels
                      ? "rejected"
                      : validPublishStatus === "approved"
                        ? reviewDraft.validCompleteStatus
                        : validPublishStatus === "rejected" ? "rejected" : "pending"
                  });
                }}
              >
                <option value="pending">待审核</option>
                <option value="approved">通过</option>
                <option value="rejected">不通过</option>
              </select>
            </label>
            <label>
              <span>新增签约</span>
              <select
                disabled={sourceInvalid || !seedEligible || !hasSignedModels || reviewDraft.validPublishStatus !== "approved"}
                value={!hasSignedModels || sourceInvalid || !seedEligible ? "rejected" : reviewDraft.validPublishStatus === "approved" ? reviewDraft.validCompleteStatus : reviewDraft.validPublishStatus === "rejected" ? "rejected" : "pending"}
                onChange={(event) => setReviewDraft({ ...reviewDraft, validCompleteStatus: event.target.value as ReviewStatus })}
              >
                <option value="pending">待审核</option>
                <option value="approved">通过</option>
                <option value="rejected">不通过</option>
              </select>
            </label>
            <label className="wide-panel">
              <span>审核说明 / 不通过原因</span>
              <textarea
                onChange={(event) => setReviewDraft({ ...reviewDraft, invalidReason: event.target.value })}
                placeholder="例如：管理员判定举报成立，自动下架；录屏内容与鑫通告详情不一致。"
                value={reviewDraft.invalidReason}
              />
            </label>
          </div>
          <div className="drawer-actions">
            {!sourceInvalid ? <button className="secondary-action" onClick={() => void markEvidenceDispute()} type="button">凭证异议</button> : null}
            {!sourceInvalid && reviewDraft.invalidReason.startsWith("凭证异议") ? (
              <button className="secondary-action" onClick={() => void clearEvidenceDispute()} type="button">清除凭证异议</button>
            ) : null}
            <button className="primary-action" disabled={sourceInvalid || !seedEligible} onClick={() => void saveReview()} type="button">{sourceInvalid ? "已由系统判定" : !seedEligible ? "往期通告" : "保存审核"}</button>
          </div>
        </section>
        </div>
      </div>
      </div>
      {saveNotice ? (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="save-notice-title"
            aria-modal="true"
            className="notice-modal warning"
            role="dialog"
          >
            <h2 id="save-notice-title">凭证尚未审核通过</h2>
            <p>{saveNotice}</p>
            <div className="drawer-actions notice-modal-actions">
              <button className="primary-action" onClick={() => setSaveNotice(null)} type="button">我知道了</button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function InfoItem({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className={`info-item ${danger ? "danger" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InfoCopyItem({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
  return (
    <div className="info-item">
      <span>{label}</span>
      <strong className="copy-line">
        <span className="copy-line-text">{value}</span>
        {copyValue ? <CopyButton value={copyValue} label={`复制${label}`} /> : null}
      </strong>
    </div>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  async function copyValue(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!value) return;
    try {
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(value);
          copied = true;
        } catch {
          // 局域网 HTTP 页面在 Windows 浏览器中可能拒绝 Clipboard API，继续使用兼容复制。
        }
      }
      if (!copied) {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.left = "-9999px";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, value.length);
        copied = document.execCommand("copy");
        textarea.remove();
      }
      if (!copied) throw new Error("copy failed");
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopyStatus("idle"), 1600);
  }

  return (
    <button
      aria-label={copyStatus === "copied" ? "已复制" : copyStatus === "failed" ? "复制失败" : label}
      className={`copy-button ${copyStatus}`}
      onClick={copyValue}
      title={copyStatus === "copied" ? "已复制" : copyStatus === "failed" ? "复制失败，请重试" : label}
      type="button"
    >
      {copyStatus === "copied" ? <Check size={13} /> : <Copy size={13} />}
      {copyStatus !== "idle" ? <span className="copy-feedback" role="status">{copyStatus === "copied" ? "已复制" : "复制失败"}</span> : null}
    </button>
  );
}

function TablePagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div className="table-pagination">
      <span>共 {total} 条 · {start}-{end} · 第 {page} / {totalPages} 页</span>
      <div className="inline-actions">
        <button className="secondary-action" disabled={page <= 1} onClick={() => onPageChange(page - 1)} type="button">上一页</button>
        <button className="secondary-action" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} type="button">下一页</button>
      </div>
    </div>
  );
}

function paginate<T>(rows: T[], page: number, pageSize = 10) {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    pageSize,
    totalPages,
    rows: rows.slice(start, start + pageSize)
  };
}

type OperationLogRow = {
  id: string;
  actor: string;
  action: string;
  module: string;
  result: string;
  detail?: string;
  createdAt: string;
};

type DataSyncRunRow = {
  id: string;
  triggerType: string;
  status: string;
  startedAt: string;
  finishedAt?: string;
  brokerCount: number;
  briefingCount: number;
  participantCount: number;
  modelCount: number;
  changedCount: number;
  message?: string;
};

type SystemBackupRow = {
  name: string;
  createdAt: string;
  actor: string;
  reason: string;
  sizeBytes: number;
};

function localDateTime(value?: string) {
  return value ? new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }) : "-";
}

function recordClientOperation(module: string, action: string, detail: string, result = "成功") {
  void fetch("/api/operation-logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ module, action, detail, result })
  }).catch(() => undefined);
}

function OperationLogPage() {
  const [rows, setRows] = useState<OperationLogRow[]>([]);
  const [status, setStatus] = useState("正在读取日志...");

  async function load() {
    try {
      const response = await fetch("/api/operation-logs?limit=500");
      const data = await response.json() as OperationLogRow[] | { error?: string };
      if (!response.ok || !Array.isArray(data)) throw new Error("error" in data ? data.error : "日志读取失败");
      setRows(data);
      setStatus(data.length ? "" : "暂无操作记录");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "日志读取失败");
    }
  }

  useEffect(() => { void load(); }, []);
  return (
    <section className="page">
      <PageHeader eyebrow="System Logs" title="操作日志" description="记录系统用户操作、数据同步、备份和还原结果，方便管理员追溯。" action={<button className="secondary-action" onClick={() => void load()} type="button"><RefreshCw size={16} />刷新日志</button>} />
      <section className="panel table-panel">
        <PanelTitle icon={<History size={18} />} title="最近 500 条记录" />
        {status ? <p className="form-status">{status}</p> : null}
        <div className="table-scroll"><table><thead><tr><th>时间</th><th>操作人</th><th>模块</th><th>操作</th><th>结果</th><th>说明</th></tr></thead><tbody>
          {rows.map((row) => <tr key={row.id}><td>{localDateTime(row.createdAt)}</td><td>{row.actor}</td><td>{row.module}</td><td>{row.action}</td><td><span className={`status-pill ${row.result === "成功" ? "approved" : row.result === "进行中" ? "pending" : "rejected"}`}>{row.result}</span></td><td>{row.detail || "-"}</td></tr>)}
        </tbody></table></div>
      </section>
    </section>
  );
}

function DataSyncPage({ onSynced }: { onSynced: () => Promise<void> }) {
  const [runs, setRuns] = useState<DataSyncRunRow[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [notice, setNotice] = useState("");

  async function loadRuns() {
    const response = await fetch("/api/data-sync/runs");
    const data = await response.json();
    if (response.ok && Array.isArray(data)) setRuns(data);
  }

  useEffect(() => { void loadRuns(); }, []);
  async function syncNow() {
    setIsSyncing(true);
    setNotice("正在通过鑫通告只读接口同步，请勿重复点击...");
    try {
      const response = await fetch("/api/data-sync/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await response.json() as { error?: string; brokerCount?: number; briefingCount?: number; modelCount?: number };
      if (!response.ok) throw new Error(result.error || "同步失败");
      recordClientOperation("系统工具 / 数据同步", "点击“立即同步”", `经纪人 ${result.brokerCount ?? 0} 位 · 通告 ${result.briefingCount ?? 0} 条 · 模特 ${result.modelCount ?? 0} 位`);
      setNotice(`同步完成：${result.brokerCount ?? 0} 位经纪人、${result.briefingCount ?? 0} 条通告、${result.modelCount ?? 0} 位模特。`);
      await Promise.all([loadRuns(), onSynced()]);
    } catch (error) {
      recordClientOperation("系统工具 / 数据同步", "点击“立即同步”", error instanceof Error ? error.message : "同步失败", "失败");
      setNotice(error instanceof Error ? error.message : "同步失败");
      await loadRuns();
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <section className="page">
      <PageHeader eyebrow="Data Sync" title="鑫通告数据同步" description="每天 09:00 和 21:00 自动同步；也可以在需要时手动同步。所有鑫通告请求均为只读 GET，不会修改或删除鑫通告数据。" action={<button className="primary-action" disabled={isSyncing} onClick={() => void syncNow()} type="button"><RefreshCw size={16} />{isSyncing ? "同步中..." : "立即同步"}</button>} />
      {notice ? <p className="form-status import-status">{notice}</p> : null}
      <section className="panel table-panel">
        <PanelTitle icon={<RefreshCw size={18} />} title="同步记录" />
        <div className="table-scroll"><table><thead><tr><th>开始时间</th><th>触发方式</th><th>状态</th><th>经纪人</th><th>通告</th><th>报名/签约</th><th>模特</th><th>说明</th></tr></thead><tbody>
          {runs.map((run) => <tr key={run.id}><td>{localDateTime(run.startedAt)}</td><td>{run.triggerType === "scheduled" ? "定时同步" : "手动同步"}</td><td>{run.status === "SUCCESS" ? "成功" : run.status === "FAILED" ? "失败" : "进行中"}</td><td>{run.brokerCount}</td><td>{run.briefingCount}</td><td>{run.participantCount}</td><td>{run.modelCount}</td><td>{run.message || "-"}</td></tr>)}
        </tbody></table></div>
      </section>
    </section>
  );
}

function DataBackupPage() {
  const [rows, setRows] = useState<SystemBackupRow[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/system-backups");
    const data = await response.json();
    if (response.ok && Array.isArray(data)) setRows(data);
  }

  useEffect(() => { void load(); }, []);
  async function createBackup() {
    setBusy(true);
    setStatus("正在备份数据库、系统账户和上传资料...");
    try {
      const response = await fetch("/api/system-backups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: "管理员手动备份" }) });
      const result = await response.json() as { error?: string; name?: string };
      if (!response.ok) throw new Error(result.error || "备份失败");
      setStatus(`备份完成：${result.name}`);
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "备份失败");
    } finally { setBusy(false); }
  }

  async function restoreBackup(row: SystemBackupRow) {
    const confirmation = window.prompt(`还原前系统会自动再做一次保护备份。\n请输入“确认还原”以还原：${row.name}`) || "";
    if (confirmation !== "确认还原") return;
    setBusy(true);
    setStatus(`正在还原 ${row.name}...`);
    try {
      const response = await fetch(`/api/system-backups/${encodeURIComponent(row.name)}/restore`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "还原失败");
      setStatus("数据还原完成，请刷新页面确认。");
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "还原失败");
    } finally { setBusy(false); }
  }

  return (
    <section className="page">
      <PageHeader eyebrow="Backup & Restore" title="数据备份" description="备份本系统数据库、系统账户及上传资料。备份名称包含北京时间，执行还原前会自动创建保护备份。" action={<button className="primary-action" disabled={busy} onClick={() => void createBackup()} type="button"><Database size={16} />{busy ? "处理中..." : "新建完整备份"}</button>} />
      {status ? <p className="form-status import-status">{status}</p> : null}
      <section className="panel table-panel"><PanelTitle icon={<Database size={18} />} title="可用备份" />
        <div className="table-scroll"><table><thead><tr><th>备份时间</th><th>备份名称</th><th>操作人</th><th>原因</th><th>数据库大小</th><th>操作</th></tr></thead><tbody>
          {rows.map((row) => <tr key={row.name}><td>{localDateTime(row.createdAt)}</td><td>{row.name}</td><td>{row.actor}</td><td>{row.reason}</td><td>{(row.sizeBytes / 1024 / 1024).toFixed(2)} MB</td><td><button className="secondary-action" disabled={busy} onClick={() => void restoreBackup(row)} type="button">还原此备份</button></td></tr>)}
        </tbody></table></div>
      </section>
    </section>
  );
}

function SystemManagement({
  accounts,
  currentAccount,
  onAccountsChange,
  onAvatarChange
}: {
  accounts: StoredAccount[];
  currentAccount: StoredAccount;
  onAccountsChange: (accounts: StoredAccount[]) => void;
  onAvatarChange: (accountName: string, avatarDataUrl: string) => Promise<void>;
}) {
  const [avatarStatus, setAvatarStatus] = useState<Record<string, string>>({});
  const [uploadingAccount, setUploadingAccount] = useState("");

  function updateAccount(accountName: string, changes: Partial<Pick<StoredAccount, "role" | "enabled" | "permissions">>) {
    onAccountsChange(accounts.map((account) => account.account === accountName ? { ...account, ...changes } : account));
  }

  async function uploadAvatar(accountName: string, file?: File) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setAvatarStatus((current) => ({ ...current, [accountName]: "仅支持 PNG、JPG 或 WebP 格式" }));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setAvatarStatus((current) => ({ ...current, [accountName]: "头像文件不能超过 2MB" }));
      return;
    }
    setUploadingAccount(accountName);
    setAvatarStatus((current) => ({ ...current, [accountName]: "" }));
    try {
      const avatarDataUrl = await readFileAsDataUrl(file);
      await onAvatarChange(accountName, avatarDataUrl);
      setAvatarStatus((current) => ({ ...current, [accountName]: "头像已更新" }));
    } catch (error) {
      setAvatarStatus((current) => ({
        ...current,
        [accountName]: error instanceof Error ? error.message : "头像上传失败"
      }));
    } finally {
      setUploadingAccount("");
    }
  }

  return (
    <section className="page">
      <PageHeader
        eyebrow="Accounts"
        title="账户管理"
        description="管理使用运营结算后台的系统用户、职能与权限。这里的账户不包含经纪人。"
      />
      <section className="panel">
        <PanelTitle icon={<UserCog size={18} />} title="系统用户" />
        <div className="account-admin-list">
          {accounts.map((account) => {
            const isSelf = account.account === currentAccount.account;
            const accountPermissions = account.permissions ?? defaultPermissionsForRole(account.role);
            return (
              <div className="account-admin-row" key={account.account}>
                <div className="account-admin-identity">
                  <AccountAvatar account={account} />
                  <div>
                    <strong>{account.account}{isSelf ? "（当前账号）" : ""}</strong>
                    <span>注册于 {new Date(account.createdAt).toLocaleString("zh-CN", { hour12: false })}</span>
                    <label className="avatar-upload-action">
                      <Upload size={14} />
                      <span>{uploadingAccount === account.account ? "上传中..." : account.avatarUrl ? "更换头像" : "上传头像"}</span>
                      <input
                        accept="image/png,image/jpeg,image/webp"
                        disabled={Boolean(uploadingAccount)}
                        onChange={(event) => {
                          void uploadAvatar(account.account, event.target.files?.[0]);
                          event.target.value = "";
                        }}
                        type="file"
                      />
                    </label>
                    {avatarStatus[account.account] ? <span className="avatar-upload-status">{avatarStatus[account.account]}</span> : null}
                  </div>
                </div>
                <div className="account-admin-controls">
                  <label>
                    <span>职能</span>
                    <select
                      disabled={isSelf}
                      onChange={(event) => {
                        const role = event.target.value as SystemRole;
                        updateAccount(account.account, { role, permissions: defaultPermissionsForRole(role) });
                      }}
                      value={account.role}
                    >
                      <option value="super_admin">超级管理员</option>
                      <option value="operations">运营</option>
                      <option value="finance">财务</option>
                    </select>
                  </label>
                  <label className="account-enabled-control">
                    <input checked={account.enabled} disabled={isSelf} onChange={(event) => updateAccount(account.account, { enabled: event.target.checked })} type="checkbox" />
                    <span>{account.enabled ? "已启用" : "已停用"}</span>
                  </label>
                </div>
                <fieldset className="account-permission-panel" disabled={isSelf || account.role === "super_admin"}>
                  <legend>允许使用的系统板块</legend>
                  <div className="account-permission-grid">
                    {allSystemPermissions.map((permission) => {
                      const checked = account.role === "super_admin" || accountPermissions.includes(permission);
                      return (
                        <label key={permission}>
                          <input
                            checked={checked}
                            onChange={(event) => {
                              const permissions = event.target.checked
                                ? [...accountPermissions, permission]
                                : accountPermissions.filter((item) => item !== permission);
                              updateAccount(account.account, { permissions: allSystemPermissions.filter((item) => permissions.includes(item)) });
                            }}
                            type="checkbox"
                          />
                          <span><strong>{permissionLabels[permission].label}</strong><small>{permissionLabels[permission].description}</small></span>
                        </label>
                      );
                    })}
                  </div>
                  {isSelf ? <p>当前账号不能在登录期间修改自身权限。</p> : account.role === "super_admin" ? <p>超级管理员固定拥有全部板块权限。</p> : null}
                </fieldset>
              </div>
            );
          })}
        </div>
      </section>
      <section className="panel">
        <PanelTitle icon={<ShieldCheck size={18} />} title="角色权限" />
        <div className="role-grid">
          {(Object.keys(roleLabels) as SystemRole[]).map((role) => (
            <div className="role-card" key={role}>
              <strong>{roleLabels[role]}</strong>
              <span>{roleDescriptions[role]}</span>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}

function FinanceReport({ orders }: { orders: FinanceOrder[] }) {
  const [selectedBrokerId, setSelectedBrokerId] = useState("");
  const [expandedOrderId, setExpandedOrderId] = useState("");
  const paidOrders = orders.filter((order) => order.status === "paid");
  const pendingOrders = orders.filter((order) => order.status === "pending" || order.status === "approved");
  const rejectedOrders = orders.filter((order) => order.status === "rejected");
  const paidAmount = paidOrders.reduce((sum, order) => sum + order.amount, 0);
  const pendingAmount = pendingOrders.reduce((sum, order) => sum + order.amount, 0);
  const brokerRows = Array.from(new Set(orders.map((order) => order.brokerId))).map((brokerId) => {
    const brokerOrders = orders.filter((order) => order.brokerId === brokerId);
    return {
      brokerId,
      name: brokerOrders[0]?.brokerNickname ?? "-",
      paidCount: brokerOrders.filter((order) => order.status === "paid").length,
      paidAmount: brokerOrders.filter((order) => order.status === "paid").reduce((sum, order) => sum + order.amount, 0),
      pendingCount: brokerOrders.filter((order) => order.status === "pending" || order.status === "approved").length,
      pendingAmount: brokerOrders.filter((order) => order.status === "pending" || order.status === "approved").reduce((sum, order) => sum + order.amount, 0)
    };
  }).sort((left, right) => right.paidAmount - left.paidAmount);
  const selectedBrokerOrders = orders
    .filter((order) => order.brokerId === selectedBrokerId)
    .sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
  const reportStatusText: Record<FinanceOrderStatus, string> = {
    pending: "财务审批中",
    approved: "财务审批通过",
    paid: "财务已付款",
    rejected: "财务驳回"
  };

  return (
    <section className="page">
      <PageHeader eyebrow="Finance Report" title="财务报表" description="汇总结算付款单的待付、已付金额与经纪人结算情况。" />
      <div className="metric-grid finance-report-metrics">
        <MetricCard label="待付款金额" value={money(pendingAmount)} delta={`${pendingOrders.length} 笔待处理`} />
        <MetricCard label="已付款金额" value={money(paidAmount)} delta={`${paidOrders.length} 笔已完成`} />
        <MetricCard label="结算总额" value={money(pendingAmount + paidAmount)} delta={`${pendingOrders.length + paidOrders.length} 笔有效付款单`} />
        <MetricCard label="财务驳回" value={rejectedOrders.length} delta="待运营重新核对" />
      </div>
      <section className="panel">
        <PanelTitle icon={<BarChart3 size={18} />} title="经纪人结算汇总" />
        {brokerRows.length ? (
          <table>
            <thead><tr><th>经纪人</th><th>待付款</th><th>待付金额</th><th>已付款</th><th>已付金额</th></tr></thead>
            <tbody>
              {brokerRows.map((row) => (
                <tr className="clickable-row" key={row.brokerId} onClick={() => setSelectedBrokerId(row.brokerId)}>
                  <td>{row.name}</td><td>{row.pendingCount}</td><td>{money(row.pendingAmount)}</td><td>{row.paidCount}</td><td>{money(row.paidAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="empty-state">尚无结算付款单，运营提交后将在这里形成报表。</p>}
      </section>
      {selectedBrokerId ? (
        <section className="panel table-panel">
          <PanelTitle icon={<ReceiptText size={18} />} title={`${selectedBrokerOrders[0]?.brokerNickname ?? "经纪人"} · 付款明细`} />
          <table>
            <thead><tr><th>结算周期</th><th>状态</th><th>金额</th><th>提交时间</th><th>审批 / 付款时间</th><th>操作</th></tr></thead>
            <tbody>
              {selectedBrokerOrders.map((order) => (
                <Fragment key={order.id}>
                  <tr>
                    <td>{order.cycleLabel}</td>
                    <td><span className={`status-pill ${order.status === "paid" ? "success" : order.status === "rejected" ? "danger" : "warning"}`}>{reportStatusText[order.status]}</span></td>
                    <td>{money(order.amount)}</td>
                    <td>{new Date(order.submittedAt).toLocaleString("zh-CN", { hour12: false })}</td>
                    <td>{order.paidAt ? new Date(order.paidAt).toLocaleString("zh-CN", { hour12: false }) : order.approvedAt ? new Date(order.approvedAt).toLocaleString("zh-CN", { hour12: false }) : "-"}</td>
                    <td><button className="text-button" onClick={() => setExpandedOrderId((current) => current === order.id ? "" : order.id)} type="button">{expandedOrderId === order.id ? "收起明细" : "查看明细"}</button></td>
                  </tr>
                  {expandedOrderId === order.id ? (
                    <tr className="settlement-detail-row">
                      <td colSpan={6}>
                        <table className="nested-table">
                          <thead><tr><th>奖励项</th><th>数量</th><th>规则</th><th>金额</th><th>口径</th></tr></thead>
                          <tbody>{order.rows.map((row) => <tr key={row.id}><td><div className="user-cell"><strong>{row.title}</strong>{row.details?.map((item) => <span key={item.id}>{item.object} · {money(item.amount)}</span>)}</div></td><td>{row.quantity}</td><td>{row.rule}</td><td>{money(row.amount)}</td><td>{row.basis}</td></tr>)}</tbody>
                        </table>
                        {order.rejectionReason ? <p className="form-status error">驳回原因：{order.rejectionReason}</p> : null}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </section>
  );
}

function FinanceManagementPage({
  orders,
  activeTab,
  onApprove,
  onMarkPaid,
  onReject,
  brokersData
}: {
  orders: FinanceOrder[];
  activeTab: "pending" | "paid";
  onApprove: (orderId: string) => void;
  onMarkPaid: (orderId: string) => void;
  onReject: (orderId: string, reason: string) => void;
  brokersData: Broker[];
}) {
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [rejectingOrderId, setRejectingOrderId] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const filteredOrders = orders
    .filter((order) => activeTab === "pending" ? order.status === "pending" || order.status === "approved" : order.status === "paid")
    .sort((left, right) => {
      const leftTime = activeTab === "paid" ? left.paidAt ?? left.submittedAt : left.submittedAt;
      const rightTime = activeTab === "paid" ? right.paidAt ?? right.submittedAt : right.submittedAt;
      return rightTime.localeCompare(leftTime);
    });
  const selectedOrder = filteredOrders.find((order) => order.id === selectedOrderId) ?? filteredOrders[0];
  const relatedBroker = brokersData.find((broker) => broker.id === selectedOrder?.brokerId);

  useEffect(() => {
    if (!filteredOrders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(filteredOrders[0]?.id ?? "");
    }
  }, [filteredOrders, selectedOrderId]);

  return (
    <section className="page">
      <PageHeader
        eyebrow="Finance"
        title={activeTab === "pending" ? "待付款订单" : "已付款订单"}
        description={activeTab === "pending" ? "管理员提交的周结算付款单会先进入待付款订单，等待财务确认。" : "财务确认付款后的结算单会归档到已付款订单中。"}
      />
      <div className="two-column finance-layout">
        <section className="panel">
          <PanelTitle icon={<WalletCards size={18} />} title={activeTab === "pending" ? "待付款订单" : "已付款订单"} />
          <div className="rank-list">
            {filteredOrders.map((order) => (
              <button
                className={`rank-row finance-order-row ${selectedOrder?.id === order.id ? "active" : ""}`}
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                type="button"
              >
                <div>
                  <strong>{order.brokerNickname}</strong>
                  <span>{order.cycleLabel} · {order.brokerPhone || "未留手机号"}</span>
                </div>
                <div className="rank-metrics">
                  <b>{money(order.amount)}</b>
                  <span>{order.status === "paid" ? "已付款" : order.status === "approved" ? "审批通过" : "待审核"}</span>
                </div>
              </button>
            ))}
            {filteredOrders.length === 0 ? <p className="empty-state">当前没有订单。</p> : null}
          </div>
        </section>
        <section className="panel">
          <PanelTitle icon={<ListChecks size={18} />} title="结算详情" />
          {selectedOrder ? (
            <div className="finance-detail">
              <div className="finance-detail-head">
                <div>
                  <h3>{selectedOrder.brokerNickname}</h3>
                  <p>{selectedOrder.cycleLabel} · 提交时间 {new Date(selectedOrder.submittedAt).toLocaleString("zh-CN", { hour12: false })}</p>
                  {selectedOrder.approvedAt ? <p>审批时间 {new Date(selectedOrder.approvedAt).toLocaleString("zh-CN", { hour12: false })}</p> : null}
                  {selectedOrder.paidAt ? <p>付款时间 {new Date(selectedOrder.paidAt).toLocaleString("zh-CN", { hour12: false })}</p> : null}
                </div>
                {activeTab === "pending" ? (
                  <div className="inline-actions">
                    <button className="secondary-action danger-action" onClick={() => { setRejectingOrderId(selectedOrder.id); setRejectionReason(""); }} type="button">驳回</button>
                    {selectedOrder.status === "approved" ? (
                      <button className="primary-action" onClick={() => onMarkPaid(selectedOrder.id)} type="button">标记已付款</button>
                    ) : (
                      <button className="primary-action" onClick={() => onApprove(selectedOrder.id)} type="button">审核通过</button>
                    )}
                  </div>
                ) : (
                  <span className="status-pill success">已付款</span>
                )}
              </div>
              <table>
                <thead>
                  <tr>
                    <th>奖励项</th>
                    <th>数量</th>
                    <th>规则</th>
                    <th>金额</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.rows.map((row) => (
                    <tr key={row.id}>
                      <td><div className="user-cell"><strong>{row.title}</strong>{row.details?.map((item) => <span key={item.id}>{item.object} · {item.description}</span>)}</div></td>
                      <td>{row.quantity}</td>
                      <td>{row.rule}</td>
                      <td>{money(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="settlement-footer settlement-footer-stack">
                <div className="settlement-footer-line muted">
                  <span>本周小计</span>
                  <strong>{money(selectedOrder.weekSubtotal)}</strong>
                </div>
                {selectedOrder.carryForward < 0 ? (
                  <div className="settlement-footer-line muted">
                    <span>上期结转</span>
                    <strong>{money(selectedOrder.carryForward)}</strong>
                  </div>
                ) : null}
                <div className="settlement-footer-line total">
                  <span>合计应付</span>
                  <strong className={selectedOrder.settlementTotal < 0 ? "negative-amount" : ""}>{money(selectedOrder.settlementTotal)}</strong>
                </div>
              </div>
              {relatedBroker ? <p className="form-status">当前关联经纪人：{relatedBroker.nickname} · {relatedBroker.boundPhone || relatedBroker.wechatPhone}</p> : null}
            </div>
          ) : (
            <p className="empty-state">请选择一条订单查看详情。</p>
          )}
        </section>
      </div>
      {rejectingOrderId ? (
        <div className="modal-backdrop" role="presentation">
          <section className="notice-modal finance-reject-modal" role="dialog" aria-modal="true" aria-labelledby="finance-reject-title">
            <h2 id="finance-reject-title">驳回付款订单</h2>
            <p>请填写明确的驳回理由，运营将在经纪人工作台中看到该说明，并重新核对通告与费用。</p>
            <label>
              <span>驳回理由</span>
              <textarea autoFocus onChange={(event) => setRejectionReason(event.target.value)} placeholder="例如：通告有效性有变化，需要重新审核结算金额" rows={4} value={rejectionReason} />
            </label>
            <div className="drawer-actions">
              <button className="secondary-action" onClick={() => setRejectingOrderId("")} type="button">取消</button>
              <button className="primary-action" disabled={!rejectionReason.trim()} onClick={() => { onReject(rejectingOrderId, rejectionReason.trim()); setRejectingOrderId(""); }} type="button">提交驳回</button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function PageHeader({
  eyebrow,
  title,
  description,
  action
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className="page-action">{action}</div> : null}
    </header>
  );
}

function MetricCard({ label, value, delta }: { label: string; value: string | number; delta: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{delta}</small>
    </div>
  );
}

function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="panel-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

function TimelineItem({ title, detail, active = false }: { title: string; detail: string; active?: boolean }) {
  return (
    <div className={`timeline-item ${active ? "active" : ""}`}>
      <span />
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}

function LevelBadge({ broker }: { broker: Pick<Broker, "brokerLevel" | "seedPhase" | "referralUnlocked"> }) {
  const isSeed = broker.brokerLevel === "seed";
  const phase = broker.seedPhase;
  const hasReferralSeed = !isSeed && Boolean(phase);
  const hasAnyIdentity = isSeed || hasReferralSeed || broker.referralUnlocked;
  const label = isSeed ? (phase ? `种子经纪人｜种子${phase}` : "种子经纪人") : hasReferralSeed ? `普通经纪人｜种子${phase}` : "无身份";
  if (!hasAnyIdentity) {
    return <span className="level-empty">无身份</span>;
  }
  return (
    <span className={`level-badge ${isSeed ? "seed" : "normal"} ${hasReferralSeed ? "combined" : ""}`} aria-label={label} title={label}>
      {hasReferralSeed ? (
        <span className="level-main-icon normal-icon">
          <UserRound size={24} />
        </span>
      ) : null}
      {isSeed ? (
        <span className="level-main-icon seed-broker-icon" aria-label="种子经纪人" title="种子经纪人">
          <img alt="" src="/assets/seed-broker-icon.png" />
        </span>
      ) : null}
      {(isSeed || hasReferralSeed) ? (
        <span className="level-main-icon seed-icon" aria-label={phase ? `第${phase}期种子标签` : "种子标签"}>
          <Sprout size={24} />
          {phase ? <span className="level-phase">{phase}</span> : null}
        </span>
      ) : null}
      {broker.referralUnlocked ? (
        <span className="level-main-icon referral-icon" aria-label="引荐权限" title="引荐权限">
          <Handshake size={20} />
        </span>
      ) : null}
    </span>
  );
}

function PermissionBadge({ unlocked }: { unlocked: boolean }) {
  return (
    <span className={`permission-badge ${unlocked ? "unlocked" : ""}`}>
      <Users size={14} />
      引荐权限
    </span>
  );
}

function ReviewBadge({ status, label }: { status: ReviewStatus; label?: string }) {
  const Icon = status === "approved" ? CheckCircle2 : status === "rejected" ? XCircle : Gauge;
  return (
    <span className={`review-badge ${status}`}>
      <Icon size={14} />
      {label ?? reviewText[status]}
    </span>
  );
}
