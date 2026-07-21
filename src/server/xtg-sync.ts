import { prisma } from "./prisma";
import { writeOperationLog } from "./operation-log";
import { completeClawbackMarker, weekCycleKeyFromDate } from "../lib/briefing-rules";
import { stripSignedModelReviewMarkers } from "../lib/signer-review";
import { isActiveSignerRelationship } from "../lib/signer-status";

const defaultBaseUrl = "https://jarvis.tong-gao.com/api";
const pageSize = 200;
let activeSync: Promise<unknown> | null = null;

type ApiEnvelope<T> = { code: number; message: string; data: T };
type PageData<T> = { total: number; pageCount: number; list: T[] };

function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}

function shanghaiDate(value: unknown) {
  const source = text(value);
  if (!source) return null;
  const iso = source.includes("T") ? source : source.replace(" ", "T");
  const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(iso) ? iso : `${iso}+08:00`;
  const date = new Date(withZone);
  return Number.isNaN(date.getTime()) ? null : date;
}

function apiConfig() {
  const apiKey = text(process.env.XTG_OPEN_API_KEY);
  if (!apiKey) throw new Error("尚未配置鑫通告只读 API Key（XTG_OPEN_API_KEY）");
  return { apiKey, baseUrl: text(process.env.XTG_OPEN_API_BASE_URL) || defaultBaseUrl };
}

async function xtgGet<T>(pathname: string, params: Record<string, string | number | undefined> = {}) {
  const { apiKey, baseUrl } = apiConfig();
  const url = new URL(`${baseUrl.replace(/\/$/, "")}${pathname}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, {
    method: "GET",
    headers: { "X-API-Key": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000)
  });
  const body = await response.json() as ApiEnvelope<T>;
  if (!response.ok || body.code !== 200) throw new Error(body.message || `鑫通告接口请求失败（${response.status}）`);
  return body.data;
}

async function allPages<T>(pathname: string, params: Record<string, string | number | undefined> = {}) {
  const rows: T[] = [];
  for (let page = 1; ; page += 1) {
    const data = await xtgGet<PageData<T>>(pathname, { ...params, page, pageSize });
    rows.push(...data.list);
    if (page >= data.pageCount || data.list.length === 0) return rows;
  }
}

function realNameStatus(value: number) {
  return value === 1 ? "PENDING" : value === 2 ? "VERIFIED" : value === 3 ? "FAILED" : "UNVERIFIED";
}

function accountStatus(value: number) {
  return value === 2 ? "LIMITED" : value === 3 ? "TEMP_BANNED" : value === 4 ? "PERM_BANNED" : "NORMAL";
}

function briefingStatus(value: number, label: unknown) {
  return text(label) || (value === 30 ? "已结束" : value === 40 ? "已取消" : "进行中");
}

function genderLabel(value: unknown) {
  return Number(value) === 1 ? "男" : Number(value) === 2 ? "女" : "";
}

function tattooLabel(value: unknown) {
  return Number(value) === 1 ? "有" : Number(value) === 2 ? "无" : "不限";
}

function salaryText(salary: any) {
  if (!salary) return null;
  if (Number(salary.type) === 1) return "面议";
  const unit = Number(salary.unit) === 1 ? "小时" : "天";
  const amount = Number(salary.type) === 3 ? `${salary.min ?? "-"}-${salary.max ?? "-"}` : salary.value;
  const overtime = Number(salary.hasOvertime) === 1 ? `，加班 ${salary.overtimeValue ?? "-"}元` : "";
  return `${amount ?? "-"}元/${unit}${overtime}`;
}

function workAddress(location: any) {
  return [location?.address, location?.name, location?.userInput].map(text).filter(Boolean).join(" · ") || null;
}

function sameDate(left: Date | null | undefined, right: Date | null | undefined) {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null);
}

function detailPayload(row: any) {
  return JSON.stringify({
    __xtgDetail: 1,
    cancelReason: text(row.cancelReason),
    requirementText: text(row.requireDescription),
    publisherText: text(row.publisherName),
    workDateText: Array.isArray(row.workDates) ? row.workDates.join("、") : text(row.workDateBegin),
    workTimeText: Array.isArray(row.workTimes) ? row.workTimes.map((item: any) => `${text(item.begin)}-${text(item.end)}`).join("、") : "",
    signedModelNames: []
  });
}

async function performSync(triggerType: "scheduled" | "manual", actor: string) {
  const run = await prisma.dataSyncRun.create({ data: { triggerType, status: "RUNNING" } });
  let lastProgressPercent = -1;
  async function updateProgress(progressPercent: number, progressStage: string) {
    const nextPercent = Math.max(0, Math.min(100, Math.round(progressPercent)));
    if (nextPercent === lastProgressPercent) return;
    lastProgressPercent = nextPercent;
    await prisma.dataSyncRun.update({ where: { id: run.id }, data: { progressPercent: nextPercent, progressStage } });
  }
  const action = triggerType === "scheduled" ? "定时同步" : "手动同步";
  await writeOperationLog({
    actor,
    action: `${action}开始`,
    module: "数据同步",
    result: "进行中",
    detail: `同步任务 ${run.id} 已启动`
  });
  let brokerCount = 0;
  let briefingCount = 0;
  let sourceBriefingCount = 0;
  let skippedBriefingCount = 0;
  let participantCount = 0;
  let modelCount = 0;
  let unavailableModelCount = 0;
  let changedCount = 0;
  try {
    await updateProgress(2, "正在读取经纪人列表");
    const brokerRows = await allPages<any>("/open/v1/brokers");
    brokerCount = brokerRows.length;
    const brokerIdMap = new Map<string, string>();
    for (const [index, row] of brokerRows.entries()) {
      const sourceId = text(row.brokerId);
      const existing = await prisma.broker.findUnique({ where: { miniProgramUserId: sourceId } });
      const sourceData = {
        nickname: text(row.nickName) || "未命名经纪人",
        wechatPhone: text(row.mobile) || null,
        boundPhone: text(row.bindMobile) || null,
        realNameStatus: realNameStatus(Number(row.verifyStatus)),
        accountStatus: accountStatus(Number(row.accountStatus)),
        registeredAt: shanghaiDate(row.registerTime),
        lastLoginAt: shanghaiDate(row.lastLoginTime),
        violationCount: Number(row.breachCount) || 0
      } as const;
      const changed = !existing
        || existing.nickname !== sourceData.nickname
        || existing.wechatPhone !== sourceData.wechatPhone
        || existing.boundPhone !== sourceData.boundPhone
        || existing.realNameStatus !== sourceData.realNameStatus
        || existing.accountStatus !== sourceData.accountStatus
        || !sameDate(existing.registeredAt, sourceData.registeredAt)
        || !sameDate(existing.lastLoginAt, sourceData.lastLoginAt)
        || existing.violationCount !== sourceData.violationCount;
      const broker = existing
        ? changed ? await prisma.broker.update({ where: { id: existing.id }, data: sourceData }) : existing
        : await prisma.broker.create({ data: { miniProgramUserId: sourceId, ...sourceData } });
      brokerIdMap.set(sourceId, broker.id);
      if (changed) changedCount += 1;
      await updateProgress(5 + ((index + 1) / Math.max(brokerRows.length, 1)) * 15, "正在同步经纪人资料");
    }

    const batch = await prisma.importBatch.create({
      data: { title: `鑫通告开放接口同步 ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}`, source: "MANUAL", operatorName: actor }
    });
    for (const row of brokerRows) {
      const brokerId = brokerIdMap.get(text(row.brokerId));
      if (!brokerId) continue;
      await prisma.brokerSnapshot.upsert({
        where: { brokerId_importBatchId: { brokerId, importBatchId: batch.id } },
        update: {},
        create: {
          brokerId,
          importBatchId: batch.id,
          publishedBriefings: Number(row.briefingPublishedCount) || 0,
          completedBriefings: Number(row.briefingFinishedCount) || 0,
          signupTotalTimes: Number(row.signupRecordCount) || 0,
          contractTotalTimes: Number(row.signRecordCount) || 0,
          signupTotalPeople: Number(row.distinctSignupModelCount) || 0,
          contractTotalPeople: Number(row.distinctSignModelCount) || 0,
          violationCount: Number(row.breachCount) || 0
        }
      });
    }

    await updateProgress(21, "正在读取通告列表");
    const briefingRows = await allPages<any>("/open/v1/briefings");
    sourceBriefingCount = briefingRows.length;
    const briefingIdMap = new Map<string, string>();
    for (const [index, summary] of briefingRows.entries()) {
      const sourceId = text(summary.briefingId);
      const brokerId = brokerIdMap.get(text(summary.brokerId));
      if (!brokerId) {
        skippedBriefingCount += 1;
        continue;
      }
      briefingCount += 1;
      const detail = await xtgGet<any>(`/open/v1/briefings/${encodeURIComponent(sourceId)}`);
      const existing = await prisma.briefing.findUnique({ where: { jarvisBriefingId: sourceId } });
      const data = {
        brokerId,
        title: text(detail.title ?? summary.title) || "未命名通告",
        recruitmentType: text(detail.recruitType) || null,
        genderRequirement: Number(detail.genderRequire) === 1 ? "男" : Number(detail.genderRequire) === 2 ? "女" : "不限",
        recruitCount: Number(detail.peopleCount) || null,
        workAddress: workAddress(detail.location),
        workStartAt: shanghaiDate(detail.workDateBegin),
        workEndAt: shanghaiDate(summary.workDatetimeEnd ?? detail.workDateEnd),
        publishedAt: shanghaiDate(summary.publishTime),
        finishedAt: Number(summary.status) === 30 ? shanghaiDate(summary.workDatetimeEnd) : null,
        salaryText: salaryText(detail.salary),
        requirementText: detailPayload({ ...detail, cancelReason: summary.cancelReason }),
        sourceStatus: briefingStatus(Number(summary.status), summary.statusText)
      };
      const changed = !existing
        || existing.brokerId !== data.brokerId
        || existing.title !== data.title
        || existing.recruitmentType !== data.recruitmentType
        || existing.genderRequirement !== data.genderRequirement
        || existing.recruitCount !== data.recruitCount
        || existing.workAddress !== data.workAddress
        || !sameDate(existing.workStartAt, data.workStartAt)
        || !sameDate(existing.workEndAt, data.workEndAt)
        || !sameDate(existing.publishedAt, data.publishedAt)
        || !sameDate(existing.finishedAt, data.finishedAt)
        || existing.salaryText !== data.salaryText
        || existing.requirementText !== data.requirementText
        || existing.sourceStatus !== data.sourceStatus;
      const briefing = existing
        ? changed ? await prisma.briefing.update({ where: { id: existing.id }, data }) : existing
        : await prisma.briefing.create({ data: { jarvisBriefingId: sourceId, ...data } });
      briefingIdMap.set(sourceId, briefing.id);
      await prisma.briefingSnapshot.upsert({
        where: { briefingId_importBatchId: { briefingId: briefing.id, importBatchId: batch.id } },
        update: {},
        create: {
          briefingId: briefing.id,
          importBatchId: batch.id,
          signupTimes: Number(summary.signupRecordCount) || 0,
          contractTimes: Number(summary.signRecordCount) || 0,
          signupPeople: Number(summary.distinctSignupModelCount) || 0,
          contractPeople: Number(summary.distinctSignModelCount) || 0,
          sourceStatus: data.sourceStatus
        }
      });
      if (changed) changedCount += 1;
      await updateProgress(25 + ((index + 1) / Math.max(briefingRows.length, 1)) * 43, "正在同步通告明细");
    }
    await prisma.importBatch.update({ where: { id: batch.id }, data: { brokerCount, briefingCount } });

    const participantRows: any[] = [];
    const sourceBrokerIds = [...brokerIdMap.keys()];
    for (const [index, sourceBrokerId] of sourceBrokerIds.entries()) {
      participantRows.push(...await allPages<any>("/open/v1/participants", { brokerId: sourceBrokerId }));
      await updateProgress(68 + ((index + 1) / Math.max(sourceBrokerIds.length, 1)) * 10, "正在读取报名和签约记录");
    }
    participantCount = participantRows.length;
    const modelIds = [...new Set(participantRows.map((row) => text(row.modelUserId)).filter(Boolean))];
    for (const [index, modelUserId] of modelIds.entries()) {
      const participant = participantRows.find((row) => text(row.modelUserId) === modelUserId) ?? {};
      const profile = await xtgGet<any>(`/open/v1/models/${encodeURIComponent(modelUserId)}`).catch(() => {
        unavailableModelCount += 1;
        return {
          modelUserId,
          displayName: participant.displayName,
          mobile: participant.mobile,
          gender: participant.gender,
          age: participant.age,
          accountStatusText: "资料暂不可用"
        };
      });
      await prisma.signerProfile.upsert({
        where: { jarvisUserId: modelUserId },
        update: {
          nickname: text(profile.displayName) || "未命名签约者",
          phone: text(profile.mobile ?? participant.mobile) || null,
          accountStatus: text(profile.accountStatusText) || "正常",
          gender: genderLabel(profile.gender) || null,
          age: Number(profile.age) || null,
          birthDate: shanghaiDate(profile.birthday),
          region: text(profile.region) || null,
          heightCm: Number(profile.heightCm) || null,
          weightKg: Number(profile.weightKg) || null,
          bustCm: Number(profile.bustCm) || null,
          waistCm: Number(profile.waistCm) || null,
          hipCm: Number(profile.hipsCm) || null,
          shoulderCm: Number(profile.shoulderWidthCm) || null,
          shoeSize: text(profile.shoeSize) || null,
          clothingSize: text(profile.clothingSize) || null,
          tattoo: tattooLabel(profile.hasTattoos),
          hairColor: text(profile.hairColor) || null,
          hairLength: text(profile.hairLength) || null,
          languages: Array.isArray(profile.languages) ? profile.languages.join("、") : null,
          bio: text(profile.introduction) || null,
          registeredAt: shanghaiDate(profile.registerTime),
          lastLoginAt: shanghaiDate(profile.lastLoginTime),
          violationCount: Number(profile.breachCount) || 0,
          avatarUrl: null,
          imageUrls: []
        },
        create: {
          jarvisUserId: modelUserId,
          nickname: text(profile.displayName) || "未命名签约者",
          phone: text(profile.mobile ?? participant.mobile) || null,
          accountStatus: text(profile.accountStatusText) || "正常",
          gender: genderLabel(profile.gender) || null,
          age: Number(profile.age) || null,
          birthDate: shanghaiDate(profile.birthday),
          region: text(profile.region) || null,
          heightCm: Number(profile.heightCm) || null,
          weightKg: Number(profile.weightKg) || null,
          bio: text(profile.introduction) || null,
          registeredAt: shanghaiDate(profile.registerTime),
          lastLoginAt: shanghaiDate(profile.lastLoginTime),
          violationCount: Number(profile.breachCount) || 0
        }
      });
      modelCount += 1;
      await updateProgress(78 + ((index + 1) / Math.max(modelIds.length, 1)) * 17, "正在同步签约者资料");
    }
    for (const [index, row] of participantRows.entries()) {
      const participantStatus = text(row.status).toUpperCase();
      // 仅曾完成签约的人员进入签约历史；报名、待签、拒绝和撤回不能参与新增签约判定。
      if (!["SIGNED", "CANCELLED"].includes(participantStatus)) continue;
      const briefingId = briefingIdMap.get(text(row.briefingId));
      const signer = await prisma.signerProfile.findUnique({ where: { jarvisUserId: text(row.modelUserId) } });
      if (!briefingId || !signer) continue;
      const sourceRecordId = `${text(row.briefingId)}:${String(row.recordId)}:${text(row.modelUserId)}`;
      const participantData = {
        sourceRecordId,
        briefingId,
        signerId: signer.id,
        signedUpAt: shanghaiDate(row.signupTime),
        signedAt: shanghaiDate(row.signTime),
        cancelledAt: shanghaiDate(row.cancelTime),
        cancelReason: text(row.cancelReason) || null,
        sourceStatus: text(row.statusText ?? row.status),
        sourceUpdatedAt: new Date()
      };
      await prisma.briefingSigner.upsert({
        where: { briefingId_signerId: { briefingId, signerId: signer.id } },
        update: participantData,
        create: participantData
      });
      await updateProgress(95 + ((index + 1) / Math.max(participantRows.length, 1)) * 4, "正在整理签约记录");
    }
    const syncedBriefings = await prisma.briefing.findMany({
      where: { id: { in: [...briefingIdMap.values()] }, review: { validCompleteStatus: "APPROVED" } },
      include: { review: true, signers: true }
    });
    for (const briefing of syncedBriefings) {
      if (!briefing.signers.length || briefing.signers.some(isActiveSignerRelationship) || !briefing.review) continue;
      const reason = "签约者已解约，当前无有效签约";
      const visibleReason = stripSignedModelReviewMarkers(briefing.review.invalidReason ?? "");
      const clawback = `${completeClawbackMarker}@${weekCycleKeyFromDate(new Date())}：${reason}`;
      await prisma.briefingReview.update({
        where: { briefingId: briefing.id },
        data: {
          validCompleteStatus: "REJECTED",
          invalidReason: [visibleReason, clawback].filter(Boolean).join("\n"),
          reviewerName: "系统自动校验",
          reviewedAt: new Date()
        }
      });
      changedCount += 1;
    }
    const summary = { brokerCount, briefingCount, participantCount, modelCount, changedCount };
    const message = unavailableModelCount
      ? `同步完成；接口返回 ${sourceBriefingCount} 条通告，${briefingCount} 条已关联当前经纪人，${skippedBriefingCount} 条属于未出现在经纪人列表中的历史发布人，暂不导入；${unavailableModelCount} 位历史人员详情暂不可用，已保留报名签约基础资料；鑫通告端未执行任何写入、修改或删除操作`
      : `同步完成；接口返回 ${sourceBriefingCount} 条通告，${briefingCount} 条已关联当前经纪人，${skippedBriefingCount} 条属于未出现在经纪人列表中的历史发布人，暂不导入；鑫通告端未执行任何写入、修改或删除操作`;
    await prisma.dataSyncRun.update({ where: { id: run.id }, data: { ...summary, progressPercent: 100, progressStage: "同步完成", status: "SUCCESS", finishedAt: new Date(), message } });
    await writeOperationLog({
      actor,
      action: `${action}完成`,
      module: "数据同步",
      result: "成功",
      detail: `同步任务 ${run.id} · 经纪人 ${brokerCount} 位 · 通告 ${briefingCount} 条 · 报名/签约 ${participantCount} 条 · 模特 ${modelCount} 位 · 更新 ${changedCount} 条`
    });
    return { id: run.id, ...summary, message: "同步完成" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步失败";
    await prisma.dataSyncRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), brokerCount, briefingCount, participantCount, modelCount, changedCount, message } });
    await writeOperationLog({ actor, action: `${action}失败`, module: "数据同步", result: "失败", detail: `同步任务 ${run.id} · ${message}` });
    throw error;
  }
}

export function startXtgSync(triggerType: "scheduled" | "manual", actor = "系统") {
  if (activeSync) throw new Error("已有数据同步任务正在运行，请稍后再试");
  activeSync = performSync(triggerType, actor).finally(() => { activeSync = null; });
  return activeSync;
}

export function startXtgSyncScheduler() {
  let lastSlot = "";
  const check = () => {
    const now = new Date();
    const shanghai = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Shanghai" }));
    const slot = `${shanghai.getFullYear()}-${shanghai.getMonth()}-${shanghai.getDate()}-${shanghai.getHours()}`;
    const target = [9, 21].includes(shanghai.getHours()) && shanghai.getMinutes() === 0;
    if (target && slot !== lastSlot && !activeSync) {
      lastSlot = slot;
      void startXtgSync("scheduled").catch((error) => console.error("鑫通告定时同步失败", error));
    }
  };
  check();
  return setInterval(check, 60_000);
}

export async function currentModelMedia(modelUserId: string) {
  const data = await xtgGet<any>(`/open/v1/models/${encodeURIComponent(modelUserId)}`);
  return { avatarUrl: text(data.avatarUrl), imageUrls: Array.isArray(data.photoUrls) ? data.photoUrls.map(text).filter(Boolean) : [] };
}
