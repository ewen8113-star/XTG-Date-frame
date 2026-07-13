import {
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Copy,
  ExternalLink,
  Gauge,
  GitBranch,
  Check,
  Link,
  LayoutDashboard,
  ListChecks,
  Moon,
  Search,
  Sprout,
  ShieldCheck,
  Sun,
  Bell,
  BookOpen,
  Handshake,
  WalletCards,
  UserRound,
  Users,
  Upload,
  UserCog,
  UsersRound,
  XCircle
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { LoginScreen } from "./components/LoginScreen";
import { SystemGuide } from "./components/SystemGuide";
import { briefings, brokers, importBatches, referralNodes } from "./data/mockData";
import { readAccounts, roleDescriptions, roleLabels, saveAccounts, syncLocalAccounts, updateRemoteAccount, type StoredAccount, type SystemRole } from "./lib/auth";
import {
  isSourceInvalidForPublish,
  parseClawbackCycle,
  sourceRejectLabel
} from "./lib/briefing-rules";
import type { Briefing, Broker, BrokerLevelUpdate, EvidenceFile, ImportBatch, ReferralNode, ReviewStatus } from "./types";

type PageKey = "dashboard" | "audit" | "stats" | "brokers" | "workspace" | "briefingReview" | "financePending" | "financePaid" | "financeReport" | "system" | "guide";
type WorkspaceTab = "briefings" | "signedModels" | "level" | "network" | "settlement" | "paymentStatus";
type BrokerFilter = "all" | "normal" | "seed";
type SeedPhaseFilter = "all" | "none" | `${number}`;
type FinanceOrderStatus = "pending" | "paid" | "rejected";
type SettlementLineItem = {
  id: string;
  title: string;
  quantity: number;
  rule: string;
  amount: number;
  basis: string;
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

const reviewText: Record<ReviewStatus, string> = {
  pending: "待审核",
  approved: "通过",
  rejected: "不通过"
};

const viewStateKey = "xtg-review-admin-view-state";
const pageKeys: PageKey[] = ["dashboard", "audit", "stats", "brokers", "workspace", "briefingReview", "financePending", "financePaid", "financeReport", "system", "guide"];
const workspaceTabs: WorkspaceTab[] = ["briefings", "signedModels", "level", "network", "settlement", "paymentStatus"];
const seedPlanStartDate = new Date("2026-04-01T00:00:00");
const pastCycleKey = "past";

function money(value: number) {
  return `¥${value.toLocaleString("zh-CN")}`;
}

function dateValue(value: string) {
  const date = new Date(value.replace(/\//g, "-"));
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
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

function weekCycleForDate(value: string) {
  const timestamp = dateValue(value);
  if (!timestamp || timestamp < seedPlanStartDate.getTime()) {
    return {
      key: pastCycleKey,
      label: "过往通告",
      shortLabel: "过往通告",
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
  return {
    key: `week-${weekIndex + 1}`,
    label: `第 ${weekIndex + 1} 周（${format(start)} - ${format(end)}）`,
    shortLabel: `第 ${weekIndex + 1} 周`,
    start,
    end
  };
}

function buildWeekCycleOptions(briefings: Briefing[]) {
  const cycleMap = new Map<string, ReturnType<typeof weekCycleForDate>>();
  briefings.forEach((briefing) => {
    const cycle = weekCycleForDate(briefing.publishedAt);
    cycleMap.set(cycle.key, cycle);
  });
  return Array.from(cycleMap.values()).sort((left, right) => {
    if (left.key === pastCycleKey) return 1;
    if (right.key === pastCycleKey) return -1;
    return (right.start?.getTime() ?? 0) - (left.start?.getTime() ?? 0);
  });
}

function latestWeekCycleKey(briefings: Briefing[]) {
  return buildWeekCycleOptions(briefings).find((cycle) => cycle.key !== pastCycleKey)?.key ?? pastCycleKey;
}

function previousWeekCycleKey(cycleKey: string) {
  const match = cycleKey.match(/^week-(\d+)$/);
  if (!match) return "";
  const weekNumber = Number(match[1]);
  return weekNumber > 1 ? `week-${weekNumber - 1}` : pastCycleKey;
}

function cycleBriefings(briefings: Briefing[], cycleKey: string) {
  return briefings.filter((briefing) => weekCycleForDate(briefing.publishedAt).key === cycleKey);
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

function jarvisUserUrl(userId: string) {
  return `https://jarvis.tong-gao.com/user/detail/${userId}`;
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

const signedModelMismatchPrefix = "[SIGNED_MODEL_MISMATCH:";
const signedModelMismatchSuffix = "]";

function normalizeSignedModelKey(key: string) {
  if (key.includes(":")) return key;
  if (/^\d{12,}$/.test(key)) return `id:${key}`;
  if (/^\d{6,15}$/.test(key)) return `phone:${key}`;
  return `name:${key.toLowerCase()}`;
}

function signedModelMismatchKeys(invalidReason: string) {
  const keys = new Set<string>();
  const pattern = /\[SIGNED_MODEL_MISMATCH:([^\]]+)\]/g;
  for (const match of invalidReason.matchAll(pattern)) {
    try {
      keys.add(normalizeSignedModelKey(decodeURIComponent(match[1])));
    } catch {
      keys.add(normalizeSignedModelKey(match[1]));
    }
  }
  return keys;
}

function stripSignedModelMismatchMarkers(invalidReason: string) {
  return invalidReason
    .replace(/\n?\[SIGNED_MODEL_MISMATCH:[^\]]+\]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function composeInvalidReasonWithModelFlags(invalidReason: string, flaggedKeys: Set<string>) {
  const visibleReason = stripSignedModelMismatchMarkers(invalidReason);
  const markers = Array.from(flaggedKeys).map((key) => `${signedModelMismatchPrefix}${encodeURIComponent(key)}${signedModelMismatchSuffix}`);
  return [visibleReason, ...markers].filter(Boolean).join("\n");
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
      if (status === "rejected") return;
      const dayKey = `${briefing.brokerId}:${calendarDayKey(briefing.publishedAt)}`;
      const weekKey = `${briefing.brokerId}:${weekCycleForDate(briefing.publishedAt).key}`;
      const dailyCount = dailyCounts.get(dayKey) ?? 0;
      const weeklyCount = weeklyCounts.get(weekKey) ?? 0;
      const capped = dailyCount >= dailyPublishRewardLimit || weeklyCount >= weeklyPublishRewardLimit;
      if (capped) {
        cappedIds.add(briefing.id);
        return;
      }
      if (status === "approved") {
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
  if (briefing.reviewedAt) {
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
  briefing.signedModelNames.map(parseSignedModelName).forEach((model) => uniqueItems.set(model.key, model));
  return Array.from(uniqueItems.values());
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

function buildRewardProfile(briefings: Briefing[], cycleKey?: string) {
  const orderedBriefings = [...briefings].sort((left, right) => dateValue(left.publishedAt) - dateValue(right.publishedAt));
  const publishCapState = buildPublishCapState(orderedBriefings);
  const signedHistory = new Set<string>();
  const completeRows: RewardCompleteRow[] = orderedBriefings.map((briefing) => {
    const models = signedModelsForBriefing(briefing);
    const newModels = models.filter((model) => !signedHistory.has(model.key));
    const repeatedModels = models.filter((model) => signedHistory.has(model.key));
    const rawPublishStatus = effectivePublishStatus(briefing);
    const publishStatus = rawPublishStatus === "approved" && !publishCapState.eligibleApprovedIds.has(briefing.id) ? "pending" : rawPublishStatus;
    const publishApproved = publishStatus === "approved";
    const completeApproved = briefing.validCompleteStatus === "approved" && Boolean(briefing.reviewedAt);
    const bonusEligible = publishApproved && completeApproved && newModels.length > 0;
    models.forEach((model) => signedHistory.add(model.key));
    return {
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
    };
  });
  const scopedBriefings = cycleKey ? orderedBriefings.filter((briefing) => weekCycleForDate(briefing.publishedAt).key === cycleKey) : orderedBriefings;
  const scopedIds = new Set(scopedBriefings.map((briefing) => briefing.id));
  const validPublishBriefings = scopedBriefings.filter((briefing) => publishCapState.eligibleApprovedIds.has(briefing.id));
  const clawbackBriefings = buildClawbackBriefings(orderedBriefings, cycleKey);
  const bonusCompleteRows = completeRows.filter((row) => scopedIds.has(row.briefing.id) && row.bonusEligible);
  return {
    validPublishCount: validPublishBriefings.length,
    bonusCompleteCount: bonusCompleteRows.length,
    validPublishBriefings,
    clawbackBriefings,
    clawbackCount: clawbackBriefings.length,
    completeRows: completeRows.filter((row) => scopedIds.has(row.briefing.id)),
    bonusCompleteRows,
    signedModelRows: buildSignedModelRows(briefings)
  };
}

function buildReviewSummary(briefings: Briefing[]) {
  const rewardProfile = buildRewardProfile(briefings);
  const completeRows = rewardProfile.completeRows;
  const pendingPublishCount = completeRows.filter((row) => row.publishStatus === "pending").length;
  const pendingCompleteCount = completeRows.filter((row) => effectiveCompleteStatus(row) === "pending").length;
  const rejectedPublishCount = briefings.filter((briefing) => effectivePublishStatus(briefing) === "rejected").length;
  const rejectedCompleteCount = completeRows.filter((row) => effectiveCompleteStatus(row) === "rejected").length;
  const manualReviewedCount = briefings.filter((briefing) => Boolean(briefing.reviewedAt)).length;
  const manualPendingCount = briefings.length - manualReviewedCount;
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

function buildSettlementLedger({
  brokerBriefings,
  allBriefings,
  referrals,
  cycleKey
}: {
  brokerBriefings: Briefing[];
  allBriefings: Briefing[];
  referrals: ReferralNode[];
  cycleKey: string;
}) {
  const cycles = buildWeekCycleOptions(brokerBriefings)
    .filter((cycle) => cycle.key !== pastCycleKey)
    .sort((left, right) => (left.start?.getTime() ?? 0) - (right.start?.getTime() ?? 0));
  let carryForward = 0;

  for (const cycle of cycles) {
    const rewardProfile = buildRewardProfile(brokerBriefings, cycle.key);
    const referralProfiles = referrals.map((node) => ({
      node,
      profile: buildRewardProfile(allBriefings.filter((briefing) => briefing.brokerId === node.id), cycle.key)
    }));
    const referralBaseCount = referralProfiles.filter(({ profile }) => profile.validPublishCount >= 6 && profile.bonusCompleteCount >= 2).length;
    const referralIncrementCount = referralProfiles.reduce((total, { profile }) => total + profile.bonusCompleteCount, 0);
    const gross = computeCycleRewardGross(rewardProfile, referralBaseCount, referralIncrementCount);
    const clawbackAmount = rewardProfile.clawbackCount;
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

function percentValue(value: number, total: number) {
  return total === 0 ? "0.0%" : `${((value / total) * 100).toFixed(1)}%`;
}

function brokerBriefings(broker: Broker, briefingsData: Briefing[]) {
  return briefingsData.filter((briefing) => briefing.brokerId === broker.id);
}

function buildBrokerPerformanceRows(brokersData: Broker[], briefingsData: Briefing[]) {
  return brokersData.map((broker) => {
    const brokerItems = brokerBriefings(broker, briefingsData);
    const rewardProfile = buildRewardProfile(brokerItems);
    const reviewSummary = buildReviewSummary(brokerItems);
    const signedSummary = buildSignedModelSummary(brokerItems);
    const publishRewardAmount = rewardProfile.validPublishCount;
    const completeRewardAmount = rewardProfile.bonusCompleteCount * 2;
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

function latestImportTitle(importBatchesData: ImportBatch[]) {
  const latest = [...importBatchesData].sort((left, right) => dateValue(right.importedAt) - dateValue(left.importedAt))[0];
  return latest ? `${latest.title} · ${latest.importedAt}` : "暂无导入批次";
}

function readSavedViewState(): SavedViewState {
  try {
    const rawValue = window.localStorage.getItem(viewStateKey);
    if (!rawValue) return {};
    const savedValue = JSON.parse(rawValue) as SavedViewState;
    return {
      page: savedValue.page && pageKeys.includes(savedValue.page) ? savedValue.page : undefined,
      selectedBrokerId: savedValue.selectedBrokerId,
      selectedBriefingId: savedValue.selectedBriefingId,
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
  const [selectedBriefingId, setSelectedBriefingId] = useState(savedViewState.selectedBriefingId ?? "");
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
  const currentViewRef = useRef({
    page: savedViewState.page ?? "dashboard" as PageKey,
    selectedBrokerId: savedViewState.selectedBrokerId ?? brokers[0].id,
    selectedBriefingId: savedViewState.selectedBriefingId ?? "",
    workspaceTab: savedViewState.workspaceTab ?? "briefings" as WorkspaceTab,
    lastListPage: "brokers" as PageKey
  });
  const currentAccount = accounts.find((account) => account.account === currentAccountName);
  const currentRole = currentAccount?.role ?? "operations";
  const canOperate = currentRole === "super_admin" || currentRole === "operations";
  const canManageFinance = currentRole === "super_admin" || currentRole === "finance";
  const visibleNavItems = navItems.filter((item) => item.key === "dashboard" || (item.key === "system" ? currentRole === "super_admin" : canOperate));
  const mobileNavItems = currentRole === "finance"
    ? [
        navItems[0],
        { key: "financePending" as const, label: "待付款", icon: WalletCards },
        { key: "financePaid" as const, label: "已付款", icon: CheckCircle2 },
        { key: "financeReport" as const, label: "财务报表", icon: BarChart3 }
      ]
    : visibleNavItems.slice(0, 4);

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
    const weekCycles = buildWeekCycleOptions(selectedBrokerBriefings);
    const latestCycleKey = latestWeekCycleKey(selectedBrokerBriefings);
    if (savedCycleKey && weekCycles.some((cycle) => cycle.key === savedCycleKey)) {
      return savedCycleKey;
    }
    return latestCycleKey;
  }, [selectedBroker.id, selectedBrokerBriefings, workspaceCycleByBroker]);

  function updateWorkspaceCycle(brokerId: string, cycleKey: string) {
    setWorkspaceCycleByBroker((current) => ({ ...current, [brokerId]: cycleKey }));
  }

  function applyBrowserViewState(state: BrowserViewState) {
    setPage(state.page);
    if (state.selectedBrokerId) setSelectedBrokerId(state.selectedBrokerId);
    setSelectedBriefingId(state.selectedBriefingId ?? "");
    if (state.workspaceTab && workspaceTabs.includes(state.workspaceTab)) setWorkspaceTab(state.workspaceTab);
    if (state.lastListPage && pageKeys.includes(state.lastListPage)) setLastListPage(state.lastListPage);
  }

  function browserViewState(overrides: Partial<BrowserViewState> = {}): BrowserViewState {
    return {
      __xtgViewState: true,
      page: currentViewRef.current.page,
      selectedBrokerId: currentViewRef.current.selectedBrokerId,
      selectedBriefingId: currentViewRef.current.selectedBriefingId,
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
    const allowed = page === "guide"
      || canOperate && ["dashboard", "audit", "stats", "brokers", "workspace", "briefingReview"].includes(page)
      || (canManageFinance && ["financePending", "financePaid", "financeReport"].includes(page))
      || (currentRole === "super_admin" && page === "system");
    if (!allowed) setPage(canManageFinance ? "financePending" : "dashboard");
  }, [canManageFinance, canOperate, currentRole, isAuthenticated, page]);

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
    currentViewRef.current = {
      page,
      selectedBrokerId,
      selectedBriefingId,
      workspaceTab,
      lastListPage
    };
  }, [page, selectedBrokerId, selectedBriefingId, workspaceTab, lastListPage]);

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
      workspaceTab,
      workspaceCycleByBroker,
      financeOrders
    }));
  }, [page, selectedBrokerId, selectedBriefingId, workspaceTab, workspaceCycleByBroker, financeOrders]);

  async function refreshData() {
    try {
      const [brokerResponse, batchResponse] = await Promise.all([
        fetch("/api/brokers"),
        fetch("/api/import-batches")
      ]);
      const nextBrokers = (await brokerResponse.json()) as Broker[];
      const nextBatches = (await batchResponse.json()) as ImportBatch[];
      if (nextBrokers.length > 0) {
        setBrokerRows(nextBrokers);
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

  async function updateBrokerLevel(brokerId: string, payload: BrokerLevelUpdate) {
    const response = await fetch(`/api/brokers/${brokerId}/level`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const updated = (await response.json()) as Broker;
    setBrokerRows((current) => current.map((broker) => broker.id === brokerId ? updated : broker));
    return updated;
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

  function openBriefingReview(item: Briefing) {
    const cycleKey = weekCycleForDate(item.publishedAt).key;
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

  function submitFinanceOrder(order: Omit<FinanceOrder, "id" | "submittedAt" | "status">) {
    const submittedAt = new Date().toISOString();
    const orderId = `${order.brokerId}:${order.cycleKey}`;
    setFinanceOrders((current) => {
      const nextOrder: FinanceOrder = {
        ...order,
        id: orderId,
        submittedAt,
        paidAt: undefined,
        rejectedAt: undefined,
        rejectionReason: undefined,
        status: "pending"
      };
      return [...current.filter((item) => item.id !== orderId), nextOrder].sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
    });
    navigateToPage("financePending");
  }

  function markFinanceOrderPaid(orderId: string) {
    setFinanceOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? { ...order, status: "paid", paidAt: new Date().toISOString() }
          : order
      )
    );
    navigateToPage("financePaid");
  }

  function rejectFinanceOrder(orderId: string, reason: string) {
    setFinanceOrders((current) => current.map((order) => order.id === orderId ? {
      ...order,
      status: "rejected",
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason,
      paidAt: undefined
    } : order));
  }

  function cancelFinanceOrder(orderId: string) {
    setFinanceOrders((current) => current.filter((order) => order.id !== orderId));
  }

  async function updateSystemAccounts(nextAccounts: StoredAccount[]) {
    const changed = nextAccounts.find((next) => {
      const current = accounts.find((item) => item.account === next.account);
      return current && (current.role !== next.role || current.enabled !== next.enabled);
    });
    const savedAccounts = changed
      ? await updateRemoteAccount(changed.account, { role: changed.role, enabled: changed.enabled })
      : nextAccounts;
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
            {navItems.filter((item) => item.key !== "system" && item.key !== "workspace").map((item) => (
              <div className="nav-entry" key={item.key}>
                <button
                  className={`nav-subitem ${page === item.key ? "active" : ""}`}
                  onClick={() => navigateToPage(item.key)}
                  type="button"
                >
                  {item.label}
                </button>
                {item.key === "brokers" ? (
                  <button
                    className={`nav-subitem nav-tertiary ${page === "workspace" ? "active" : ""}`}
                    onClick={() => navigateToPage("workspace")}
                    type="button"
                  >
                    经纪人工作台
                  </button>
                ) : null}
              </div>
            ))}
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
          {currentRole === "super_admin" ? <div className="nav-group">
            <div className="nav-group-label">
              <UserCog size={18} />
              <span>账户管理</span>
            </div>
            <button className={`nav-subitem ${page === "system" ? "active" : ""}`} onClick={() => navigateToPage("system")} type="button">系统用户</button>
          </div> : null}
        </nav>

        <div className="sidebar-note">
          <span>ver 1.03 (BY EWEN)</span>
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
              <input aria-label="全局搜索" placeholder="搜索经纪人或通告 ID" />
            </label>
            <button aria-label="系统使用白皮书" className="top-icon-button" onClick={() => navigateToPage("guide")} title="系统使用白皮书" type="button">
              <BookOpen size={18} />
            </button>
            <div className="updates-menu-wrap">
              <button
                aria-expanded={updatesOpen}
                aria-label="版本更新"
                className="top-icon-button notification-button"
                onClick={() => setUpdatesOpen((current) => !current)}
                title="版本更新"
                type="button"
              >
                <Bell size={18} />
                <span className="notification-dot" />
              </button>
              {updatesOpen ? (
                <div className="updates-popover">
                  <div className="updates-popover-heading"><strong>版本更新</strong><span>1 条</span></div>
                  <button onClick={() => { setUpdatesOpen(false); setReleaseDetailOpen(true); }} type="button">
                    <span className="update-version">ver 1.03</span>
                    <strong>白皮书与奖励规则更新</strong>
                    <small>2026-07-13 · 点击查看详情</small>
                  </button>
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
                <span className="admin-avatar">{currentAccountName.slice(0, 1).toUpperCase()}</span>
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
            onOpenBroker={openBroker}
          />
        )}
        {page === "audit" && (
          <AuditCenter
            briefingsData={briefingRows}
            brokersData={brokerRows}
            onOpenBriefing={openBriefingReview}
          />
        )}
        {page === "stats" && <Stats brokersData={brokerRows} briefingsData={briefingRows} />}
        {page === "brokers" && <BrokerList brokersData={brokerRows} onOpenBroker={openBroker} onRefresh={refreshData} />}
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
            onBrokerLevelUpdate={updateBrokerLevel}
            onRefresh={refreshData}
            onBriefingsChange={setBriefingRows}
            onOpenBroker={openBroker}
            onOpenBriefingReview={openBriefingReview}
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
            onRefreshBriefings={refreshBrokerBriefings}
          />
        )}
        {(page === "financePending" || page === "financePaid") && (
          <FinanceManagementPage
            activeTab={page === "financePaid" ? "paid" : "pending"}
            brokersData={brokerRows}
            onMarkPaid={markFinanceOrderPaid}
            onReject={rejectFinanceOrder}
            orders={financeOrders}
          />
        )}
        {page === "financeReport" && <FinanceReport orders={financeOrders} />}
        {page === "guide" && <SystemGuide />}
        {page === "system" && currentAccount && (
          <SystemManagement accounts={accounts} currentAccount={currentAccount} onAccountsChange={updateSystemAccounts} />
        )}
      </main>
      {releaseDetailOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section aria-labelledby="release-title" aria-modal="true" className="notice-modal release-modal" role="dialog">
            <div className="release-modal-heading">
              <span>VER 1.03 · 2026-07-13</span>
              <h2 id="release-title">版本更新详情</h2>
            </div>
            <div className="release-note-section feature">
              <strong>功能更新</strong>
              <p>新增系统白皮书与版本更新中心，并完善唯一上线、有效通告候选递补、付款状态追踪和财务驳回协作规则。</p>
            </div>
            <div className="release-note-section fix">
              <strong>Bug 修复</strong>
              <p>修复移动端登录布局与账户同步、深色模式详情页、搜索框白底及多处界面交互适配问题。</p>
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
  onOpenBriefing
}: {
  briefingsData: Briefing[];
  brokersData: Broker[];
  onOpenBriefing: (briefing: Briefing) => void;
}) {
  const [filter, setFilter] = useState<"all" | "pending" | "evidence" | "dispute">("pending");
  const [query, setQuery] = useState("");
  const rewardRows = new Map(buildRewardProfile(briefingsData).completeRows.map((row) => [row.briefing.id, row]));
  const rows = briefingsData.filter((item) => {
    const broker = brokersData.find((entry) => entry.id === item.brokerId);
    const matchesQuery = !query || `${item.title} ${item.jarvisBriefingId} ${broker?.nickname ?? ""}`.toLowerCase().includes(query.toLowerCase());
    if (!matchesQuery) return false;
    if (filter === "pending") return cappedPublishStatus(item, briefingsData) === "pending" || effectiveCompleteStatus(rewardRows.get(item.id) ?? { briefing: item, newModels: [], bonusEligible: false }) === "pending";
    if (filter === "evidence") return needsAdminEvidenceReview(item) && !hasMatchedEvidence(item);
    if (filter === "dispute") return hasEvidenceDispute(item);
    return true;
  });
  const pendingCount = briefingsData.filter((item) => manualReviewStatus(item).status === "pending").length;
  const missingEvidenceCount = briefingsData.filter((item) => needsAdminEvidenceReview(item) && !hasMatchedEvidence(item)).length;
  const disputeCount = briefingsData.filter(hasEvidenceDispute).length;
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
            {([['pending', '我的待办'], ['evidence', '缺少凭证'], ['dispute', '凭证异议'], ['all', '全部记录']] as const).map(([key, label]) => (
              <button className={filter === key ? "active" : ""} key={key} onClick={() => setFilter(key)} type="button">{label}</button>
            ))}
          </div>
        </div>
        <div className="responsive-table-wrap">
          <table className="audit-queue-table">
            <thead><tr><th>通告 / 经纪人</th><th>发布时间</th><th>凭证</th><th>有效通告</th><th>新增签约</th><th>风险</th><th>操作</th></tr></thead>
            <tbody>
              {visibleRows.map((item) => {
                const broker = brokersData.find((entry) => entry.id === item.brokerId);
                const completeRow = rewardRows.get(item.id);
                return (
                  <tr key={item.id}>
                    <td data-label="通告"><div className="user-cell"><strong>{item.title}</strong><span>{broker?.nickname ?? "-"} · #{item.jarvisBriefingId}</span></div></td>
                    <td data-label="发布时间">{item.publishedAt}</td>
                    <td data-label="凭证"><span className={`status-pill ${item.evidenceCount ? "success" : "warning"}`}>{item.evidenceCount ? `${item.evidenceCount} 个` : "待补充"}</span></td>
                    <td data-label="有效通告"><ReviewBadge label={cappedPublishLabel(item, briefingsData)} status={cappedPublishStatus(item, briefingsData)} /></td>
                    <td data-label="新增签约"><ReviewBadge label={completeRow ? signingStatusLabel(completeRow) : "待核验"} status={completeRow ? effectiveCompleteStatus(completeRow) : "pending"} /></td>
                    <td data-label="风险">{hasEvidenceDispute(item) ? <span className="status-pill danger">凭证异议</span> : <span className="muted">正常</span>}</td>
                    <td data-label="操作"><button className="secondary-action compact-action" onClick={() => onOpenBriefing(item)} type="button">进入审核</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? <p className="empty-state">当前筛选条件下没有审核任务。</p> : null}
        {rows.length > visibleRows.length ? <p className="audit-result-note">当前显示前 {visibleRows.length} 条，共 {rows.length} 条；可通过搜索进一步缩小范围。</p> : null}
      </section>
    </section>
  );
}

function Dashboard({
  brokersData,
  briefingsData,
  importBatchesData,
  onOpenBroker
}: {
  brokersData: Broker[];
  briefingsData: Briefing[];
  importBatchesData: ImportBatch[];
  onOpenBroker: (broker: Broker) => void;
}) {
  const brokerPerformanceRows = buildBrokerPerformanceRows(brokersData, briefingsData);
  const reviewSummary = buildReviewSummary(briefingsData);
  const rewardProfile = reviewSummary.rewardProfile;
  const signedSummary = buildSignedModelSummary(briefingsData);
  const pendingPublishCount = reviewSummary.pendingPublishCount;
  const pendingCompleteCount = reviewSummary.pendingCompleteCount;
  const promotionCandidates = brokerPerformanceRows
    .filter((row) => row.isPromotionReady && (row.broker.brokerLevel !== "seed" || !row.broker.referralUnlocked))
    .sort((left, right) => right.rewardAmount - left.rewardAmount)
    .slice(0, 5);
  const rewardLeaders = [...brokerPerformanceRows]
    .filter((row) => row.rewardAmount > 0)
    .sort((left, right) => right.rewardAmount - left.rewardAmount)
    .slice(0, 6);
  const estimatedRewardAmount = brokerPerformanceRows.reduce((total, row) => total + row.rewardAmount, 0);

  return (
    <section className="page">
      <PageHeader
        eyebrow="Dashboard"
        title="仪表盘"
        description={`运营总览：${latestImportTitle(importBatchesData)}。`}
      />

      <div className="metric-grid">
        <MetricCard label="经纪人总数" value={brokersData.length} delta={`${brokersData.filter((broker) => broker.accountStatus === "正常").length} 位正常`} />
        <MetricCard label="种子经纪人" value={brokersData.filter((broker) => broker.brokerLevel === "seed").length} delta={`${brokersData.filter((broker) => broker.referralUnlocked).length} 位已开引荐`} />
        <MetricCard label="已导入通告" value={briefingsData.length} delta={`${briefingsData.filter((item) => item.detailImported).length} 条详情已入库`} />
        <MetricCard label="有效通告" value={rewardProfile.validPublishCount} delta="人工审核通过" />
        <MetricCard label="新增签约" value={rewardProfile.bonusCompleteCount} delta="按签约者用户ID判重" />
        <MetricCard label="待审核" value={pendingPublishCount + pendingCompleteCount} delta={`${pendingPublishCount} 发布 / ${pendingCompleteCount} 完成`} />
        <MetricCard label="人工已审核" value={reviewSummary.manualReviewedCount} delta={`${reviewSummary.manualPendingCount} 条未人工保存`} />
        <MetricCard label="已签约模特" value={signedSummary.totalSignedModelCount} delta={`${signedSummary.newLatestModels.length} 位最近新增`} />
        <MetricCard label="当前预估奖金" value={money(estimatedRewardAmount)} delta="发布奖 + 完成奖" />
      </div>

      <div className="two-column">
        <section className="panel">
          <PanelTitle icon={<Gauge size={18} />} title="运营待办" />
          <div className="task-grid">
            <TaskCard label="有效通告待审核" value={pendingPublishCount} hint="需要核对视频凭证与通告详情" />
            <TaskCard label="新增签约待审核" value={pendingCompleteCount} hint="按签约者用户ID与历史订单判重" />
            <TaskCard label="待晋升处理" value={promotionCandidates.length} hint="已达到 6 + 2 条件" />
            <TaskCard label="未导入详情" value={reviewSummary.missingDetailCount} hint="需补抓通告详情字段" />
            <TaskCard label="待审核且未上传凭证" value={reviewSummary.missingEvidenceCount} hint="仅统计仍需人工凭证审核的通告" />
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

function TaskCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="task-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
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

function Stats({ brokersData, briefingsData }: { brokersData: Broker[]; briefingsData: Briefing[] }) {
  const brokerPerformanceRows = buildBrokerPerformanceRows(brokersData, briefingsData);
  const reviewSummary = buildReviewSummary(briefingsData);
  const rewardProfile = reviewSummary.rewardProfile;
  const signedSummary = buildSignedModelSummary(briefingsData);
  const publishRate = percentValue(rewardProfile.validPublishCount, briefingsData.length);
  const completeRate = percentValue(rewardProfile.bonusCompleteCount, rewardProfile.validPublishCount);
  const promotionReadyCount = brokerPerformanceRows.filter((row) => row.isPromotionReady).length;
  const topRows = [...brokerPerformanceRows]
    .sort((left, right) => right.validPublishCount - left.validPublishCount || right.bonusCompleteCount - left.bonusCompleteCount)
    .slice(0, 8);
  const statusRows = [
    { label: "已导入通告", value: briefingsData.length, rate: percentValue(briefingsData.length, briefingsData.length) },
    { label: "有效通告", value: rewardProfile.validPublishCount, rate: publishRate },
    { label: "新增签约奖励", value: rewardProfile.bonusCompleteCount, rate: completeRate },
    { label: "有效通告待审核", value: reviewSummary.pendingPublishCount, rate: percentValue(reviewSummary.pendingPublishCount, briefingsData.length) },
    { label: "新增签约待审核", value: reviewSummary.pendingCompleteCount, rate: percentValue(reviewSummary.pendingCompleteCount, briefingsData.length) },
    { label: "有效通告不通过", value: reviewSummary.rejectedPublishCount, rate: percentValue(reviewSummary.rejectedPublishCount, briefingsData.length) },
    { label: "新增签约不通过", value: reviewSummary.rejectedCompleteCount, rate: percentValue(reviewSummary.rejectedCompleteCount, briefingsData.length) }
  ];
  const sourceStatusRows = Array.from(briefingsData.reduce((map, briefing) => {
    const key = briefing.sourceStatus || "-";
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map<string, number>())).sort((left, right) => right[1] - left[1]);

  return (
    <section className="page">
      <PageHeader
        eyebrow="Analytics"
        title="数据统计"
        description="围绕经纪人增长、有效通告、新增签约和奖励预算做运营判断。"
      />
      <div className="metric-grid">
        <MetricCard label="有效通告率" value={publishRate} delta={`${rewardProfile.validPublishCount}/${briefingsData.length} 条`} />
        <MetricCard label="新增签约率" value={completeRate} delta={`${rewardProfile.bonusCompleteCount}/${rewardProfile.validPublishCount} 条`} />
        <MetricCard label="已签约模特" value={signedSummary.totalSignedModelCount} delta={`${signedSummary.signingRecordCount} 条签约记录`} />
        <MetricCard label="新增签约模特" value={signedSummary.newLatestModels.length} delta="优先按签约者用户ID判重" />
        <MetricCard label="可晋升经纪人" value={promotionReadyCount} delta="满足 6 + 2 条件" />
        <MetricCard label="待处理审核" value={reviewSummary.pendingAnyCount} delta={`${reviewSummary.pendingPublishCount} 发布 / ${reviewSummary.pendingCompleteCount} 签约`} />
        <MetricCard label="人工已审核" value={reviewSummary.manualReviewedCount} delta={`${reviewSummary.manualPendingCount} 条未人工保存`} />
      </div>

      <div className="two-column">
        <section className="panel">
          <PanelTitle icon={<BarChart3 size={18} />} title="审核漏斗" />
          <div className="funnel-list">
            {statusRows.map((row) => (
              <div className="funnel-row" key={row.label}>
                <div>
                  <strong>{row.label}</strong>
                  <span>{row.value} 条 · {row.rate}</span>
                </div>
                <div className="mini-bar" aria-hidden="true">
                  <span style={{ width: row.value === 0 ? "0%" : row.rate }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <PanelTitle icon={<BriefcaseBusiness size={18} />} title="通告状态分布" />
          <div className="source-status-grid">
            {sourceStatusRows.map(([label, value]) => (
              <div className="source-status-card" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{percentValue(value, briefingsData.length)}</small>
              </div>
            ))}
            {sourceStatusRows.length === 0 ? <p className="empty-state compact-empty">暂无通告状态数据。</p> : null}
          </div>
        </section>
      </div>

      <section className="panel table-panel">
        <PanelTitle icon={<UsersRound size={18} />} title="经纪人表现排行" />
        <table>
          <thead>
            <tr>
              <th>经纪人</th>
              <th>已导入通告</th>
              <th>有效通告</th>
              <th>新增签约奖励</th>
              <th>签约模特</th>
              <th>预估奖金</th>
            </tr>
          </thead>
          <tbody>
            {topRows.map((row) => (
              <tr key={row.broker.id}>
                <td>
                  <strong>{row.broker.nickname}</strong>
                  <span>{row.broker.boundPhone} · #{row.broker.miniProgramUserId}</span>
                </td>
                <td>{row.briefingCount}</td>
                <td>{row.validPublishCount}</td>
                <td>{row.bonusCompleteCount}</td>
                <td>{row.signedModelCount}</td>
                <td>{money(row.rewardAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </section>
  );
}

function BrokerList({
  brokersData,
  onOpenBroker,
  onRefresh
}: {
  brokersData: Broker[];
  onOpenBroker: (broker: Broker) => void;
  onRefresh: () => Promise<void>;
}) {
  const [filter, setFilter] = useState<BrokerFilter>("all");
  const [seedPhaseFilter, setSeedPhaseFilter] = useState<SeedPhaseFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [importTone, setImportTone] = useState<"neutral" | "success" | "error">("neutral");
  const [isImporting, setIsImporting] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);

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

  useEffect(() => {
    setPageNumber(1);
  }, [filter, seedPhaseFilter, keyword]);

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

  async function importBrokersFromChrome() {
    setIsImporting(true);
    setImportTone("neutral");
    setImportStatus("正在通过已登录 Chrome 抓取鑫通告经纪人列表，请等待系统自动返回本页...");
    try {
      const response = await fetch("/api/import/jarvis-brokers/chrome", { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setImportTone("error");
        setImportStatus(result?.error ?? "导入经纪人数据失败");
        return;
      }
      await onRefresh();
      setImportTone("success");
      setImportStatus(`导入完成：本次抓取 ${result.scrapedCount ?? result.importedCount} 位经纪人，写入 ${result.importedCount} 位，新增 ${result.newBrokerCount} 位。`);
    } catch {
      setImportTone("error");
      setImportStatus("导入失败，请确认 Chrome 已登录鑫通告并保持用户管理页可访问。");
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
            <button className="primary-action" disabled={isImporting} onClick={importBrokersFromChrome} type="button"><Upload size={16} />{isImporting ? "导入中..." : "导入经纪人数据"}</button>
          </div>
        )}
      />

      <section className="panel table-panel">
        <div className="table-toolbar">
          <div className="broker-filter-cluster">
            <div className="segmented">
              <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")} type="button">全部</button>
              <button className={filter === "normal" ? "active" : ""} onClick={() => setFilter("normal")} type="button">普通经纪人</button>
              <button className={filter === "seed" ? "active" : ""} onClick={() => setFilter("seed")} type="button">种子经纪人</button>
            </div>
            {filter === "seed" ? (
              <div className="seed-phase-filter derived-filter" aria-label="种子期数筛选">
                <button className={seedPhaseFilter === "all" ? "active" : ""} onClick={() => setSeedPhaseFilter("all")} type="button">全部</button>
                {[1, 2, 3, 4, 5, 6].map((phase) => (
                  <button className={seedPhaseFilter === String(phase) ? "active" : ""} key={phase} onClick={() => setSeedPhaseFilter(String(phase) as SeedPhaseFilter)} title={`第${phase}期种子经纪人`} type="button">
                    <Sprout size={16} /><span>{phase}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <input
            className="search-input"
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索手机号 / 昵称 / 用户ID"
            value={keyword}
          />
        </div>
        {importStatus ? <p className={`form-status import-status ${importTone}`}>{importStatus}</p> : null}
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
                <td><span className="status-pill success">{broker.accountStatus}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        <TablePagination
          page={brokerPage.page}
          pageSize={brokerPage.pageSize}
          total={filteredBrokers.length}
          totalPages={brokerPage.totalPages}
          onPageChange={setPageNumber}
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
  onBrokerLevelUpdate,
  onRefresh,
  onBriefingsChange,
  onOpenBroker,
  onOpenBriefingReview,
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
  onBrokerLevelUpdate: (brokerId: string, payload: BrokerLevelUpdate) => Promise<Broker>;
  onRefresh: () => Promise<void>;
  onBriefingsChange: React.Dispatch<React.SetStateAction<Briefing[]>>;
  onOpenBroker: (broker: Broker) => void;
  onOpenBriefingReview: (briefing: Briefing) => void;
  onSubmitFinanceOrder: (order: Omit<FinanceOrder, "id" | "submittedAt" | "status">) => void;
  onCancelFinanceOrder: (orderId: string) => void;
  financeOrders: FinanceOrder[];
}) {
  const brokerBriefings = briefingsData
    .filter((briefing) => briefing.brokerId === broker.id)
    .sort((left, right) => dateValue(right.publishedAt) - dateValue(left.publishedAt));
  const weekCycles = buildWeekCycleOptions(brokerBriefings);
  const activeCycleKey = weekCycles.some((cycle) => cycle.key === selectedCycleKey)
    ? selectedCycleKey
    : latestWeekCycleKey(brokerBriefings);
  const activeCycle = weekCycles.find((cycle) => cycle.key === activeCycleKey);
  const scopedBriefings = brokerBriefings.filter((briefing) => weekCycleForDate(briefing.publishedAt).key === activeCycleKey);
  const rewardProfile = buildRewardProfile(brokerBriefings, activeCycleKey);
  const previousCycleKey = previousWeekCycleKey(activeCycleKey);
  const previousScopedBriefings = previousCycleKey ? cycleBriefings(brokerBriefings, previousCycleKey) : [];
  const previousRewardProfile = previousCycleKey ? buildRewardProfile(brokerBriefings, previousCycleKey) : buildRewardProfile([], "");
  const validPublishCount = rewardProfile.validPublishCount;
  const validCompleteCount = rewardProfile.bonusCompleteCount;
  const pendingReviewCount = scopedBriefings.filter((item) => needsAdminEvidenceReview(item)).length;
  const currentWeekBriefingCount = activeCycleKey === pastCycleKey ? 0 : scopedBriefings.length;
  const previousWeekBriefingCount = previousCycleKey === pastCycleKey ? 0 : previousScopedBriefings.length;
  const promotionEligible = validPublishCount >= 6 && validCompleteCount >= 2;
  const needsPromotion = promotionEligible && (broker.brokerLevel !== "seed" || !broker.referralUnlocked);
  const [showPromotionModal, setShowPromotionModal] = useState(false);
  const [promotionPhase, setPromotionPhase] = useState(String(broker.seedPhase ?? 1));
  const [promotionStatus, setPromotionStatus] = useState("");

  useEffect(() => {
    setPromotionPhase(String(broker.seedPhase ?? 1));
    setPromotionStatus("");
    setShowPromotionModal(needsPromotion);
  }, [broker.id, broker.seedPhase, needsPromotion]);

  async function promoteBroker() {
    setPromotionStatus("保存中...");
    try {
      await onBrokerLevelUpdate(broker.id, {
        brokerLevel: "seed",
        seedPhase: Number(promotionPhase),
        referralUnlocked: true
      });
      setPromotionStatus("已晋升并开通引荐权限");
      setShowPromotionModal(false);
      await onRefresh();
    } catch {
      setPromotionStatus("晋升失败，请稍后重试");
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
              <h1>{broker.nickname} · 经纪人工作台</h1>
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
        </div>
        <div className="profile-summary">
          <MetricCard label="已发通告" value={broker.publishedBriefings} delta={`已导入 ${brokerBriefings.length} 条明细`} />
          <MetricCard label="新增通告" value={currentWeekBriefingCount} delta={activeCycleKey === pastCycleKey ? "过往通告不纳入结算" : deltaText(currentWeekBriefingCount, previousWeekBriefingCount)} />
          <MetricCard label="有效通告" value={validPublishCount} delta={`${deltaText(validPublishCount, previousRewardProfile.validPublishCount)} · ${pendingReviewCount} 条待审核`} />
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
          allItems={brokerBriefings}
          weekCycles={weekCycles}
          selectedCycleKey={activeCycleKey}
          onCycleChange={onCycleChange}
          onBriefingsChange={onBriefingsChange}
          onOpenBriefingReview={onOpenBriefingReview}
        />
      )}
      {tab === "signedModels" && <SignedModelsTab items={brokerBriefings} />}
      {needsPromotion ? (
        <section className="promotion-banner">
          <div>
            <strong>该经纪人已满足 6 + 2 晋升条件</strong>
            <span>{validPublishCount} 条有效通告 · {validCompleteCount} 条新增签约，可晋升为种子经纪人并开通引荐权限。</span>
          </div>
          <button className="primary-action" onClick={() => setShowPromotionModal(true)} type="button">处理晋升</button>
        </section>
      ) : null}

      {tab === "level" && (
        <LevelTab
          broker={broker}
          rewardProfile={rewardProfile}
          onBrokerLevelUpdate={onBrokerLevelUpdate}
        />
      )}
      {tab === "network" && <NetworkTab broker={broker} brokersData={brokersData} onOpenBroker={onOpenBroker} onRefresh={onRefresh} />}
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
            <p>{broker.nickname} 已满足 {validPublishCount} 条有效通告 + {validCompleteCount} 条新增签约，可由管理员确认晋升为种子经纪人。</p>
            <label>
              <span>种子期数</span>
              <select value={promotionPhase} onChange={(event) => setPromotionPhase(event.target.value)}>
                {[1, 2, 3, 4, 5, 6].map((phase) => (
                  <option key={phase} value={phase}>种子-{phase}</option>
                ))}
              </select>
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
  const [status, setStatus] = useState("");
  const [statusTone, setStatusTone] = useState<"neutral" | "success" | "error">("neutral");
  const [importNotice, setImportNotice] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const page = paginate(items, pageNumber);
  const visibleWeekCycles = weekCycles.length ? weekCycles : [weekCycleForDate("")];
  const activeCycle = visibleWeekCycles.find((cycle) => cycle.key === selectedCycleKey) ?? visibleWeekCycles[0];
  const rewardRowsByBriefingId = new Map(buildRewardProfile(allItems, selectedCycleKey).completeRows.map((row) => [row.briefing.id, row]));

  useEffect(() => {
    setPageNumber(1);
  }, [broker.id]);

  async function createBriefingImport() {
    setIsImporting(true);
    setStatus("");
    setImportNotice(null);
    try {
      const response = await fetch("/api/import/jarvis-briefings/chrome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brokerId: broker.id,
          brokerMiniProgramUserId: broker.miniProgramUserId,
          title: `${new Date().toISOString().slice(0, 10)} ${broker.nickname} 通告导入`
        })
      });
      const result = await response.json();
      if (!response.ok) {
        setImportNotice({ tone: "error", message: result?.error ?? "导入失败" });
        return;
      }
      const nextItems = await refreshBriefings({ silent: true });
      setImportNotice({
        tone: "success",
        message: `本次抓取 ${result.scrapedCount ?? result.importedCount} 条，写入 ${result.importedCount} 条，新增 ${result.newBriefingCount} 条，详情 ${result.detailImportedCount} 条。当前列表 ${nextItems.length} 条。`
      });
    } catch {
      setImportNotice({
        tone: "error",
        message: "导入失败，请确认 Chrome 已登录鑫通告并保持页面可访问。"
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
    }
    return nextItems;
  }

  function chooseEvidenceFiles() {
    fileInputRef.current?.click();
  }

  async function uploadEvidenceFiles(fileList: FileList | null) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;
    setStatus(`正在上传 ${files.length} 个视频到凭证库...`);
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
    setStatus(`已上传 ${files.length} 个视频到凭证库`);
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
          <select className="compact-select" value={selectedCycleKey} onChange={(event) => onCycleChange(event.target.value)}>
            {visibleWeekCycles.map((cycle) => (
              <option key={cycle.key} value={cycle.key}>{cycle.label}</option>
            ))}
          </select>
          <button className="secondary-action" onClick={() => void refreshBriefings()} type="button">刷新</button>
          <button className="secondary-action" onClick={chooseEvidenceFiles} type="button"><Upload size={16} />上传凭证库</button>
          <button className="primary-action" disabled={isImporting} onClick={createBriefingImport} type="button"><Upload size={16} />{isImporting ? "导入中..." : "导入通告数据"}</button>
        </div>
      </div>
      <p className="form-status">当前周期：{activeCycle?.label ?? "暂无周期"}；本周期 {items.length} 条，全部已导入 {allItems.length} 条。每次导入会重新读取全部通告来源状态；手动取消、举报取消将自动判定为有效通告不通过，仅对待审核通告做凭证审核。4 月 1 日前通告归入过往通告，不纳入结算。</p>
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
      <input
        ref={fileInputRef}
        accept="video/*"
        hidden
        multiple
        onChange={(event) => void uploadEvidenceFiles(event.target.files)}
        type="file"
      />
      <table>
        <thead>
          <tr>
            <th>通告</th>
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
            <tr className={`clickable-row${hasEvidenceDispute(item) ? " row-has-dispute" : ""}`} key={item.id} onClick={() => onOpenBriefingReview(item)}>
              <td>
                <div className="user-cell">
                  <strong>{item.title}</strong>
                  <span>{item.recruitmentType || "-"} · #{item.jarvisBriefingId}</span>
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
              <td><ReviewBadge label={cappedPublishLabel(item, allItems)} status={rewardRowsByBriefingId.get(item.id)?.publishStatus ?? cappedPublishStatus(item, allItems)} /></td>
              <td>
                {rewardRowsByBriefingId.get(item.id) ? (
                  <ReviewBadge
                    label={signingStatusLabel(rewardRowsByBriefingId.get(item.id)!)}
                    status={effectiveCompleteStatus(rewardRowsByBriefingId.get(item.id)!)}
                  />
                ) : (
                  <ReviewBadge status="pending" />
                )}
              </td>
              <td>
                <ReviewBadge label={manualReviewStatus(item).label} status={manualReviewStatus(item).status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <TablePagination
        page={page.page}
        pageSize={page.pageSize}
        total={items.length}
        totalPages={page.totalPages}
        onPageChange={setPageNumber}
      />
    </section>
  );
}

function SignedModelsTab({ items }: { items: Briefing[] }) {
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
                      <a className="inline-link" href={jarvisUserUrl(model.userId)} rel="noreferrer" target="_blank">
                        {model.name}
                        <ExternalLink size={13} />
                      </a>
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
  const [brokerLevel, setBrokerLevel] = useState(broker.brokerLevel);
  const [seedPhase, setSeedPhase] = useState(String(broker.seedPhase ?? ""));
  const [referralUnlocked, setReferralUnlocked] = useState(broker.referralUnlocked);
  const [status, setStatus] = useState("");

  useEffect(() => {
    setBrokerLevel(broker.brokerLevel);
    setSeedPhase(String(broker.seedPhase ?? ""));
    setReferralUnlocked(broker.referralUnlocked);
  }, [broker]);

  async function saveLevel() {
    setStatus("保存中...");
    try {
      await onBrokerLevelUpdate(broker.id, {
        brokerLevel,
        seedPhase: seedPhase ? Number(seedPhase) : null,
        referralUnlocked
      });
      setStatus("已保存");
    } catch {
      setStatus("保存失败");
    }
  }

  const validPublishCount = rewardProfile.validPublishCount;
  const validCompleteCount = rewardProfile.bonusCompleteCount;
  const meetsUnlock = validPublishCount >= 6 && validCompleteCount >= 2;

  return (
    <div className="two-column">
      <section className="panel">
        <PanelTitle icon={<Sprout size={18} />} title="级别管理" />
        <div className="form-grid">
          <label>
            <span>经纪人级别</span>
            <select value={brokerLevel} onChange={(event) => setBrokerLevel(event.target.value as Broker["brokerLevel"])}>
              <option value="normal">无身份 / 普通经纪人</option>
              <option value="seed">种子经纪人</option>
            </select>
          </label>
          <label>
            <span>种子期数 / 裂变来源</span>
            <select value={seedPhase} onChange={(event) => setSeedPhase(event.target.value)}>
              <option value="">无种子标签</option>
              {[1, 2, 3, 4, 5, 6].map((phase) => (
                <option key={phase} value={phase}>种子-{phase}</option>
              ))}
            </select>
          </label>
          <label className="check-row">
            <input checked={referralUnlocked} onChange={(event) => setReferralUnlocked(event.target.checked)} type="checkbox" />
            <span>开通引荐权限</span>
          </label>
          <button className="primary-action" onClick={saveLevel} type="button">保存级别</button>
          {status ? <p className="form-status">{status}</p> : null}
        </div>
      </section>
      <section className="panel">
        <PanelTitle icon={<Users size={18} />} title="自动达标参考" />
        <div className="network-card">
          <PermissionBadge unlocked={referralUnlocked} />
          <h3>{meetsUnlock ? "已满足 6 + 2 条件" : "尚未满足 6 + 2 条件"}</h3>
          <p>有效通告达到 6 条，且新增签约达到 2 条后，可成为种子经纪人并开通引荐权限。首批 30 位种子可由运营手动赋予。</p>
          <div className="progress-track"><span style={{ width: `${Math.min(100, ((validPublishCount / 6) + (validCompleteCount / 2)) * 50)}%` }} /></div>
          <div className="progress-copy">{validPublishCount}/6 有效通告 · {validCompleteCount}/2 新增签约</div>
        </div>
      </section>
    </div>
  );
}

function NetworkTab({
  broker,
  brokersData,
  onOpenBroker,
  onRefresh
}: {
  broker: Broker;
  brokersData: Broker[];
  onOpenBroker: (broker: Broker) => void;
  onRefresh: () => Promise<void>;
}) {
  const progress = Math.min(100, ((broker.completedBriefings / 2) + (broker.publishedBriefings / 6)) * 50);
  const [phone, setPhone] = useState("");
  const [relations, setRelations] = useState<ReferralNode[]>([]);
  const [referrers, setReferrers] = useState<ReferralNode[]>([]);
  const [message, setMessage] = useState("");
  const candidate = brokersData.find((item) => phone && (item.boundPhone === phone || item.wechatPhone === phone));

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
        body: JSON.stringify({ phone })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error ?? "关联失败");
      setRelations(result);
      setPhone("");
      setMessage("已关联");
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
            <span>当前经纪人</span><strong>{broker.nickname}</strong><small>{broker.publishedBriefings}/6 通告 · {broker.completedBriefings}/2 签约</small>
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
          <div className="progress-copy">{broker.publishedBriefings}/6 有效通告 · {broker.completedBriefings}/2 新增签约</div>
        </div>
      </section>
      <section className="panel">
        <PanelTitle icon={<Link size={18} />} title="关联经纪人" />
        <div className="relation-form">
          <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="输入手机号筛选经纪人" />
          <button className="primary-action" disabled={!phone} onClick={bindReferral} type="button">关联</button>
        </div>
        {candidate ? (
          <div className="candidate-card">
            <strong>{candidate.nickname}</strong>
            <span>{candidate.boundPhone} · #{candidate.miniProgramUserId}</span>
            <LevelBadge broker={candidate} />
          </div>
        ) : phone ? <p className="form-status">未在当前导入数据中找到该手机号</p> : null}
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
          {relations.length === 0 ? <p className="empty-state">暂无直接下线，可通过手机号关联。</p> : null}
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
    paid: "订单已付款",
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
                <td>{order.status === "rejected" ? order.rejectionReason || "财务未填写驳回理由" : order.status === "paid" && order.paidAt ? `付款于 ${new Date(order.paidAt).toLocaleString("zh-CN", { hour12: false })}` : "等待财务处理"}</td>
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
  const brokerBriefings = briefingsData.filter((briefing) => briefing.brokerId === broker.id);
  const cycle = buildWeekCycleOptions(brokerBriefings).find((item) => item.key === cycleKey);
  const rewardProfile = buildRewardProfile(brokerBriefings, cycleKey);
  const referralProfiles = referrals.map((node) => ({
    node,
    profile: buildRewardProfile(briefingsData.filter((briefing) => briefing.brokerId === node.id), cycleKey)
  }));
  const referralBaseDetails = referralProfiles.filter(({ profile }) => profile.validPublishCount >= 6 && profile.bonusCompleteCount >= 2);
  const referralIncrementDetails = referralProfiles.flatMap(({ node, profile }) =>
    profile.bonusCompleteRows.map((row) => ({ node, row }))
  );
  const referralBaseCount = referralProfiles.filter(({ profile }) => profile.validPublishCount >= 6 && profile.bonusCompleteCount >= 2).length;
  const referralIncrementCount = referralProfiles.reduce((total, { profile }) => total + profile.bonusCompleteCount, 0);
  const settlementLedger = buildSettlementLedger({
    brokerBriefings,
    allBriefings: briefingsData,
    referrals,
    cycleKey
  });
  const rows = [
    { id: "validPublish", title: "有效通告奖励", quantity: rewardProfile.validPublishCount, rule: "1 元/条", amount: rewardProfile.validPublishCount, basis: "本周期发布且人工审核通过的有效通告" },
    { id: "clawback", title: "历史有效通告抵扣", quantity: rewardProfile.clawbackCount, rule: "-1 元/条", amount: -rewardProfile.clawbackCount, basis: "历史周期已结算通告，在本周期抓取到手动/举报取消" },
    { id: "validComplete", title: "新增签约奖励", quantity: rewardProfile.bonusCompleteCount, rule: "2 元/条", amount: rewardProfile.bonusCompleteCount * 2, basis: "有效通告通过，且签约名单含历史未合作模特" },
    { id: "referralBase", title: "引荐基础达标奖", quantity: referralBaseCount, rule: "10 元/人", amount: referralBaseCount * 10, basis: "直接下线达成 6 条有效通告 + 2 条新增签约" },
    { id: "referralIncrement", title: "引荐成交增量奖", quantity: referralIncrementCount, rule: "1 元/条", amount: referralIncrementCount, basis: "直接下线新增签约通告增量" }
  ];
  const weekSubtotal = rows.reduce((total, row) => total + row.amount, 0);
  const financeOrder = financeOrders.find((order) => order.brokerId === broker.id && order.cycleKey === cycleKey);

  useEffect(() => {
    fetch(`/api/brokers/${broker.id}/referrals`)
      .then((response) => response.json() as Promise<ReferralNode[]>)
      .then(setReferrals)
      .catch(() => setReferrals([]));
  }, [broker.id]);

  function toggleReward(rowId: string) {
    setExpandedReward((current) => current === rowId ? "" : rowId);
  }

  function submitPayment() {
    if (!cycle || cycle.key === pastCycleKey) {
      setSubmitStatus("过往通告不生成付款订单，请选择具体结算周期。");
      return;
    }
    onSubmitFinanceOrder({
      brokerId: broker.id,
      brokerNickname: broker.nickname,
      brokerPhone: broker.boundPhone || broker.wechatPhone,
      cycleKey,
      cycleLabel: cycle.label,
      amount: settlementLedger.total,
      rows,
      carryForward: settlementLedger.carryForward,
      weekSubtotal,
      settlementTotal: settlementLedger.total
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
            <select className="compact-select" value={cycleKey} onChange={(event) => onCycleChange(event.target.value)}>
              {cycleOptions.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
            <button className="primary-action" disabled={financeOrder?.status === "pending" || financeOrder?.status === "paid"} onClick={submitPayment} type="button">
              <ListChecks size={16} />
              {financeOrder?.status === "pending" ? "已提交付款" : financeOrder?.status === "paid" ? "订单已付款" : financeOrder?.status === "rejected" ? "重新提交付款" : "提交付款"}
            </button>
            {financeOrder && financeOrder.status !== "paid" ? (
              <button className="secondary-action danger-action" onClick={() => onCancelFinanceOrder(financeOrder.id)} type="button">撤销付款</button>
            ) : null}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>奖励项</th>
              <th>数量</th>
              <th>规则</th>
              <th>金额</th>
              <th>口径</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment key={row.id}>
                <tr className="expandable-settlement-row" key={row.id} onClick={() => toggleReward(row.id)}>
                  <td>
                    <button className="icon-only-button inline-icon" type="button" aria-label={expandedReward === row.id ? "收起" : "展开"}>
                      {expandedReward === row.id ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    {row.title}
                  </td>
                  <td>{row.quantity}</td>
                  <td>{row.rule}</td>
                  <td>{money(row.amount)}</td>
                  <td>{row.basis}</td>
                </tr>
                {expandedReward === row.id ? (
                  <tr className="settlement-detail-row" key={`${row.id}-detail`}>
                    <td colSpan={5}>{renderRewardDetails(row.id)}</td>
                  </tr>
                ) : null}
              </Fragment>
            ))}
          </tbody>
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
            <strong className={settlementLedger.total < 0 ? "negative-amount" : ""}>{money(settlementLedger.total)}</strong>
          </div>
          {settlementLedger.total < 0 ? (
            <p className="form-status">本周合计为负，差额将结转至后续周期，待累计为正后再发放。</p>
          ) : settlementLedger.payout > 0 ? (
            <p className="form-status">本周可发放 {money(settlementLedger.payout)}。</p>
          ) : null}
          {financeOrder ? (
            <p className={`form-status ${financeOrder.status === "rejected" ? "error" : ""}`}>
              该周期付款单状态：{financeOrder.status === "paid" ? "订单已付款" : financeOrder.status === "rejected" ? `财务驳回${financeOrder.rejectionReason ? `：${financeOrder.rejectionReason}` : ""}` : "财务审批中"}。
            </p>
          ) : null}
          {submitStatus ? <p className="form-status">{submitStatus}</p> : null}
        </div>
      </section>

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
  onRefreshBriefings
}: {
  broker: Broker;
  item: Briefing;
  briefingsData: Briefing[];
  onBack: () => void;
  onBriefingSaved: (briefing: Briefing) => void;
  onRefreshBriefings: (brokerId: string) => Promise<Briefing[]>;
}) {
  const sourceInvalid = sourceRejected(item);
  const clawbackCycle = parseClawbackCycle(item.invalidReason);
  const salaryItems = salaryDetailItems(item.salaryText);
  const requirementItems = requirementValueMap(item.requirementText);
  const previousSignedNames = useMemo(() => {
    const currentTime = dateValue(item.publishedAt);
    return new Set(
      briefingsData
        .filter((briefing) => briefing.brokerId === item.brokerId && briefing.id !== item.id && dateValue(briefing.publishedAt) < currentTime)
        .flatMap((briefing) => briefing.signedModelNames)
        .map((name) => parseSignedModelName(name).key)
    );
  }, [briefingsData, item.brokerId, item.id, item.publishedAt]);
  const previousSignedBriefingsByKey = useMemo(() => {
    const currentTime = dateValue(item.publishedAt);
    const rows = new Map<string, Briefing[]>();
    briefingsData
      .filter((briefing) => briefing.brokerId === item.brokerId && briefing.id !== item.id && dateValue(briefing.publishedAt) < currentTime)
      .forEach((briefing) => {
        signedModelsForBriefing(briefing).forEach((model) => {
          rows.set(model.key, [...(rows.get(model.key) ?? []), briefing]);
        });
      });
    return rows;
  }, [briefingsData, item.brokerId, item.id, item.publishedAt]);
  const signedReviewRows = signedModelsForBriefing(item).map((model) => ({
    model,
    history: previousSignedBriefingsByKey.get(model.key) ?? [],
    isNew: !previousSignedNames.has(model.key)
  }));
  const newSignedModelNames = signedReviewRows.filter((row) => row.isNew);
  const repeatedSignedModelNames = signedReviewRows.filter((row) => !row.isNew);
  const initialModelMismatchKeys = useMemo(() => signedModelMismatchKeys(item.invalidReason), [item.invalidReason]);
  const brokerBriefings = briefingsData.filter((briefing) => briefing.brokerId === item.brokerId);
  const publishCapBlocked = buildPublishCapState(brokerBriefings).cappedIds.has(item.id);
  const currentRewardRow = buildRewardProfile(brokerBriefings).completeRows.find((row) => row.briefing.id === item.id);
  const initialPublishStatus = sourceInvalid ? "rejected" as ReviewStatus : currentRewardRow?.publishStatus ?? effectivePublishStatus(item);
  const initialCompleteStatus = sourceInvalid
    ? "rejected" as ReviewStatus
    : currentRewardRow
      ? effectiveCompleteStatus(currentRewardRow)
      : item.validCompleteStatus;
  const [reviewDraft, setReviewDraft] = useState({
    validPublishStatus: initialPublishStatus,
    validCompleteStatus: initialCompleteStatus,
    invalidReason: stripSignedModelMismatchMarkers(item.invalidReason) || item.cancelReason || ""
  });
  const [modelMismatchKeys, setModelMismatchKeys] = useState<Set<string>>(initialModelMismatchKeys);
  const [invalidReasonPreset, setInvalidReasonPreset] = useState("");
  const [expandedSignedKey, setExpandedSignedKey] = useState("");
  const [evidenceRows, setEvidenceRows] = useState<EvidenceFile[]>([]);
  const [activeEvidenceId, setActiveEvidenceId] = useState(item.evidenceFiles[0]?.id ?? "");
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
  const availableEvidenceRows = evidenceRows.filter((evidence) => !evidence.briefingId || evidence.briefingId === item.id);
  const matchedEvidenceRows = evidenceRows.filter((evidence) => evidence.briefingId === item.id);

  useEffect(() => {
    void refreshEvidenceRows();
  }, [broker.id, item.id]);

  useEffect(() => {
    setReviewDraft({
      validPublishStatus: initialPublishStatus,
      validCompleteStatus: initialCompleteStatus,
      invalidReason: stripSignedModelMismatchMarkers(item.invalidReason) || item.cancelReason || ""
    });
    setModelMismatchKeys(initialModelMismatchKeys);
    setInvalidReasonPreset("");
    setExpandedSignedKey("");
  }, [item.id, item.validPublishStatus, item.validCompleteStatus, item.invalidReason, item.cancelReason, sourceInvalid, initialPublishStatus, initialCompleteStatus, initialModelMismatchKeys]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!activeEvidence) {
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
  }, [activeEvidence?.fileUrl]);

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
    setEvidenceUploadStatus(`正在上传 ${files.length} 个视频到凭证库...`);
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
      setEvidenceUploadStatus(`已上传 ${files.length} 个视频到凭证库`);
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

  async function matchEvidence() {
    if (!activeEvidence) {
      setStatus("请先在右侧选择一个视频");
      return;
    }
    const response = await fetch(`/api/briefings/${item.id}/evidence/${activeEvidence.id}`, { method: "PATCH" });
    if (!response.ok) {
      setStatus("视频匹配失败");
      return;
    }
    setStatus("视频已匹配到当前通告");
    await refreshEvidenceRows();
    await onRefreshBriefings(broker.id);
  }

  async function unmatchEvidence(evidenceId: string) {
    const response = await fetch(`/api/briefings/${item.id}/evidence/${evidenceId}`, { method: "DELETE" });
    if (!response.ok) {
      setStatus("撤销匹配失败");
      return;
    }
    setStatus("已撤销视频匹配");
    setActiveEvidenceId(evidenceId);
    await refreshEvidenceRows();
    await onRefreshBriefings(broker.id);
  }

  async function saveReview() {
    const briefingHasMatchedEvidence =
      evidenceRows.some((evidence) => evidence.briefingId === item.id) ||
      item.evidenceFiles.some((evidence) => evidence.briefingId === item.id);

    if (
      !sourceInvalid &&
      reviewDraft.validPublishStatus === "approved" &&
      !briefingHasMatchedEvidence
    ) {
      setSaveNotice("有效通告已设为「通过」，但凭证尚未点击「审核通过」完成匹配。请先在右侧视频预览区选择凭证视频并点击「审核通过」，再保存审核结果。");
      return;
    }

    const nextDraft = {
      ...reviewDraft,
      invalidReason: composeInvalidReasonWithModelFlags(
        reviewDraft.validPublishStatus === "approved" && reviewDraft.invalidReason.startsWith("凭证异议")
          ? ""
          : reviewDraft.invalidReason,
        modelMismatchKeys
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

  function clearEvidenceDispute() {
    setReviewDraft((current) => ({
      ...current,
      invalidReason: current.invalidReason.startsWith("凭证异议") ? "" : current.invalidReason
    }));
  }

  async function toggleModelMismatch(modelKey: string) {
    const nextKeys = new Set(modelMismatchKeys);
    if (nextKeys.has(modelKey)) {
      nextKeys.delete(modelKey);
    } else {
      nextKeys.add(modelKey);
    }
    setModelMismatchKeys(nextKeys);
    setStatus("签约者标记保存中...");
    const response = await fetch(`/api/briefings/${item.id}/review`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...reviewDraft,
        invalidReason: composeInvalidReasonWithModelFlags(reviewDraft.invalidReason, nextKeys)
      })
    });
    const result = (await response.json()) as Briefing | { error?: string } | null;
    if (!response.ok) {
      setModelMismatchKeys(modelMismatchKeys);
      const errorMessage = result && "error" in result ? result.error : "";
      setStatus(`签约者标记保存失败：${errorMessage || "请稍后重试"}`);
      return;
    }
    if (result && "id" in result) {
      onBriefingSaved(result);
    }
    setStatus(nextKeys.has(modelKey) ? "已标记该签约者资料不符" : "已取消该签约者资料不符标记");
    await onRefreshBriefings(broker.id).catch(() => undefined);
  }

  async function markEvidenceDispute() {
    const nextDraft = {
      ...reviewDraft,
      validPublishStatus: "pending" as ReviewStatus,
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
        invalidReason: composeInvalidReasonWithModelFlags(nextDraft.invalidReason, modelMismatchKeys)
      })
    });
    if (!response.ok) {
      setStatus("凭证异议保存失败");
      return;
    }
    await onRefreshBriefings(broker.id);
    onBack();
  }

  async function importBriefingDetail() {
    setStatus("正在导入当前通告详情...");
    const response = await fetch("/api/import/jarvis-briefing-detail/local-package", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brokerMiniProgramUserId: broker.miniProgramUserId,
        jarvisBriefingId: item.jarvisBriefingId
      })
    });
    const result = await response.json();
    if (!response.ok) {
      setStatus(result?.error ?? "通告详情导入失败");
      return;
    }
    setStatus(`已导入当前通告详情，详情字段 ${result.detailImported ? "已更新" : "未变化"}。`);
    await onRefreshBriefings(broker.id);
  }

  function selectEvidence(evidenceId: string) {
    setActiveEvidenceId((current) => (current === evidenceId ? current : evidenceId));
  }

  function toggleVideoPlayback() {
    const video = videoRef.current;
    if (!video || !activeEvidence) return;
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
              <span>新增 {newSignedModelNames.length} / 共 {item.signedModelNames.length}</span>
            </div>
            <div className="section-inline-actions">
              <button className="secondary-action compact-action" onClick={() => void importBriefingDetail()} type="button">
                导入签约者信息
              </button>
              <a className="secondary-action compact-action" href={item.detailUrl} rel="noreferrer" target="_blank">打开鑫通告详情</a>
            </div>
            <div className="signed-model-summary">
              <InfoItem label="奖励新增" value={`${newSignedModelNames.length} 人`} />
              <InfoItem label="历史重复" value={`${repeatedSignedModelNames.length} 人`} />
              <InfoItem label="资料不符" value={`${modelMismatchKeys.size} 人`} />
            </div>
            {signedReviewRows.length > 0 ? (
              <div className="signed-review-list">
                {signedReviewRows.map(({ model, history, isNew }) => (
                  <div className={`signed-review-row ${isNew ? "new" : "repeat"} ${modelMismatchKeys.has(model.key) ? "mismatch" : ""}`} key={model.key}>
                    <div className="signed-review-main">
                      <div className="user-cell">
                        <strong>
                          {model.userId ? (
                            <a className="inline-link" href={jarvisUserUrl(model.userId)} rel="noreferrer" target="_blank">
                              {model.name}
                              <ExternalLink size={13} />
                            </a>
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
                      <span className={`status-pill ${isNew ? "success" : "warning"}`}>{isNew ? "新增" : "重复"}</span>
                      {modelMismatchKeys.has(model.key) ? <span className="status-pill danger">资料不符</span> : null}
                      {model.userId ? (
                        <a className="secondary-action compact-action" href={jarvisUserUrl(model.userId)} rel="noreferrer" target="_blank">核对身份</a>
                      ) : null}
                      <button className="secondary-action compact-action" onClick={() => void toggleModelMismatch(model.key)} type="button">
                        {modelMismatchKeys.has(model.key) ? "取消标记" : "标记资料不符"}
                      </button>
                      {!isNew ? (
                        <button className="text-button" onClick={() => setExpandedSignedKey(expandedSignedKey === model.key ? "" : model.key)} type="button">
                          {expandedSignedKey === model.key ? "收起历史" : "查看历史"}
                        </button>
                      ) : null}
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
                ))}
              </div>
            ) : (
              <p className="empty-state compact-empty">暂无已签约人员名单，请点击“导入签约者信息”从鑫通告详情页读取。</p>
            )}
          </section>
        </section>

        <section className="review-section video-stage">
          <h3>视频预览</h3>
          <div className="video-frame" onClick={toggleVideoPlayback} role="presentation">
            <video
              controls
              hidden={!activeEvidence}
              onPause={() => setIsVideoPlaying(false)}
              onPlay={() => setIsVideoPlaying(true)}
              preload="metadata"
              ref={videoRef}
            />
            {activeEvidence && !isVideoPlaying ? (
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
            {!activeEvidence ? <p className="video-placeholder">凭证库暂无可匹配视频</p> : null}
          </div>
          {activeEvidence ? (
            <>
              <div className="video-meta">
                <strong>{decodeURIComponent(activeEvidence.fileName)}</strong>
                <span>{activeEvidence.briefingId === item.id ? "视频与通告内容相符" : "待审核视频"} · {activeEvidence.uploadedAt}</span>
              </div>
              <div className="inline-actions">
                <button className="primary-action" disabled={activeEvidence.briefingId === item.id} onClick={matchEvidence} type="button">
                  <Check size={16} />
                  审核通过
                </button>
                {activeEvidence.briefingId === item.id ? (
                  <button className="secondary-action" onClick={() => unmatchEvidence(activeEvidence.id)} type="button">撤销匹配</button>
                ) : null}
              </div>
            </>
          ) : (
            <p className="empty-state">请先在经纪人工作台批量上传视频。</p>
          )}
          {status ? <p className="form-status">{status}</p> : null}
        </section>

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
            accept="video/*"
            hidden
            multiple
            onChange={(event) => void uploadEvidenceFiles(event.target.files)}
            type="file"
          />
          {evidenceUploadStatus ? <p className="form-status">{evidenceUploadStatus}</p> : null}
          <div className="evidence-picker-list">
            {availableEvidenceRows.map((evidence) => (
              <button
                className={`evidence-picker-item ${activeEvidenceId === evidence.id ? "active" : ""}`}
                key={evidence.id}
                onClick={() => selectEvidence(evidence.id)}
                type="button"
              >
                <strong>{decodeURIComponent(evidence.fileName)}</strong>
                <span>{evidence.briefingId === item.id ? "已匹配当前通告" : "未匹配"} · {evidence.uploadedAt}</span>
              </button>
            ))}
            {availableEvidenceRows.length === 0 ? <p className="empty-state">没有未匹配视频。</p> : null}
          </div>
          {matchedEvidenceRows.length > 0 ? (
            <div className="matched-list">
              <strong>当前通告已匹配</strong>
              {matchedEvidenceRows.map((evidence) => (
                <button className="text-button" key={evidence.id} onClick={() => unmatchEvidence(evidence.id)} type="button">
                  撤销 {decodeURIComponent(evidence.fileName)}
                </button>
              ))}
            </div>
          ) : null}
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
          <div className="review-form">
            <label>
              <span>有效通告</span>
              <select
                disabled={sourceInvalid || publishCapBlocked}
                value={sourceInvalid ? "rejected" : publishCapBlocked ? "pending" : reviewDraft.validPublishStatus}
                onChange={(event) => setReviewDraft({ ...reviewDraft, validPublishStatus: event.target.value as ReviewStatus })}
              >
                <option value="pending">待审核</option>
                <option value="approved">通过</option>
                <option value="rejected">不通过</option>
              </select>
            </label>
            <label>
              <span>新增签约</span>
              <select
                disabled={sourceInvalid}
                value={sourceInvalid ? "rejected" : reviewDraft.validCompleteStatus}
                onChange={(event) => setReviewDraft({ ...reviewDraft, validCompleteStatus: event.target.value as ReviewStatus })}
              >
                <option value="pending">待审核</option>
                <option value="approved">通过</option>
                <option value="rejected">不通过</option>
              </select>
            </label>
            <label className="wide-panel">
              <span>新增签约无效原因</span>
              <select
                value={invalidReasonPreset}
                onChange={(event) => {
                  const value = event.target.value;
                  setInvalidReasonPreset(value);
                  if (value && value !== "其他") {
                    setReviewDraft({ ...reviewDraft, validCompleteStatus: "rejected", invalidReason: value });
                  }
                  if (value === "其他") {
                    setReviewDraft({ ...reviewDraft, validCompleteStatus: "rejected", invalidReason: "" });
                  }
                }}
              >
                <option value="">不选择</option>
                <option value="身份信息不完整">身份信息不完整</option>
                <option value="照片与身份不符">照片与身份不符</option>
                <option value="其他">其他</option>
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
              <button className="secondary-action" onClick={clearEvidenceDispute} type="button">清除凭证异议</button>
            ) : null}
            <button className="primary-action" disabled={sourceInvalid} onClick={() => void saveReview()} type="button">{sourceInvalid ? "已由系统判定" : "保存审核"}</button>
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
  async function copyValue(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (!value) return;
    await navigator.clipboard.writeText(value);
  }

  return (
    <button className="copy-button" onClick={copyValue} title={label} type="button">
      <Copy size={13} />
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

function SystemManagement({
  accounts,
  currentAccount,
  onAccountsChange
}: {
  accounts: StoredAccount[];
  currentAccount: StoredAccount;
  onAccountsChange: (accounts: StoredAccount[]) => void;
}) {
  function updateAccount(accountName: string, changes: Partial<Pick<StoredAccount, "role" | "enabled">>) {
    onAccountsChange(accounts.map((account) => account.account === accountName ? { ...account, ...changes } : account));
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
            return (
              <div className="account-admin-row" key={account.account}>
                <div className="account-admin-identity">
                  <span className="admin-avatar">{account.account.slice(0, 1).toUpperCase()}</span>
                  <div>
                    <strong>{account.account}{isSelf ? "（当前账号）" : ""}</strong>
                    <span>注册于 {new Date(account.createdAt).toLocaleString("zh-CN", { hour12: false })}</span>
                  </div>
                </div>
                <div className="account-admin-controls">
                  <label>
                    <span>职能</span>
                    <select disabled={isSelf} onChange={(event) => updateAccount(account.account, { role: event.target.value as SystemRole })} value={account.role}>
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
  const paidOrders = orders.filter((order) => order.status === "paid");
  const pendingOrders = orders.filter((order) => order.status === "pending");
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
      pendingCount: brokerOrders.filter((order) => order.status === "pending").length,
      pendingAmount: brokerOrders.filter((order) => order.status === "pending").reduce((sum, order) => sum + order.amount, 0)
    };
  }).sort((left, right) => right.paidAmount - left.paidAmount);

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
                <tr key={row.brokerId}>
                  <td>{row.name}</td><td>{row.pendingCount}</td><td>{money(row.pendingAmount)}</td><td>{row.paidCount}</td><td>{money(row.paidAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="empty-state">尚无结算付款单，运营提交后将在这里形成报表。</p>}
      </section>
    </section>
  );
}

function FinanceManagementPage({
  orders,
  activeTab,
  onMarkPaid,
  onReject,
  brokersData
}: {
  orders: FinanceOrder[];
  activeTab: "pending" | "paid";
  onMarkPaid: (orderId: string) => void;
  onReject: (orderId: string, reason: string) => void;
  brokersData: Broker[];
}) {
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [rejectingOrderId, setRejectingOrderId] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const filteredOrders = orders
    .filter((order) => order.status === activeTab)
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
                  <span>{order.status === "paid" ? "已付款" : "待付款"}</span>
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
                  {selectedOrder.paidAt ? <p>付款时间 {new Date(selectedOrder.paidAt).toLocaleString("zh-CN", { hour12: false })}</p> : null}
                </div>
                {activeTab === "pending" ? (
                  <div className="inline-actions">
                    <button className="secondary-action danger-action" onClick={() => { setRejectingOrderId(selectedOrder.id); setRejectionReason(""); }} type="button">驳回</button>
                    <button className="primary-action" onClick={() => onMarkPaid(selectedOrder.id)} type="button">确认付款</button>
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
                      <td>{row.title}</td>
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
  const label = isSeed ? (phase ? `第${phase}期种子经纪人` : "种子经纪人") : hasReferralSeed ? `普通经纪人 · 种子-${phase} 引荐` : "无身份";
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
