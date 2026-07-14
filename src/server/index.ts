import cors from "cors";
import express from "express";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { briefings, brokers, importBatches, referralNodes, settlementSummary } from "../data/mockData";
import { clearEvidenceDisputeReason, isSourceInvalidForPublish, resolveImportReview } from "../lib/briefing-rules";
import { resolveStoredCompleteStatus } from "../lib/signer-review";
import { importedSignerDisplayNickname, importedSignerNickname, isImportedSignerPlaceholder } from "../lib/signed-model-import";
import { prisma } from "./prisma";

const app = express();
const port = Number(process.env.API_PORT ?? 3131);
const uploadRoot = path.resolve(process.cwd(), "uploads");
const accountFile = path.join(uploadRoot, "system-accounts.json");
const execFileAsync = promisify(execFile);

app.use(cors());
app.use("/uploads", express.static(uploadRoot));
app.use(express.json({ limit: "20mb" }));
app.disable("etag");
app.use("/api", (_req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

async function withFallback<T>(query: () => Promise<unknown>, fallback: T): Promise<unknown | T> {
  try {
    return await query();
  } catch {
    return fallback;
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "xtg-review-admin-api" });
});

type BrowserImportMode = "brokers" | "briefings" | "briefing-detail";
type BrowserImportJob = {
  id: string;
  mode: BrowserImportMode;
  payload: Record<string, unknown>;
  status: "pending" | "claimed" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
  workerId?: string;
  result?: unknown;
  error?: string;
};

const browserImportJobs = new Map<string, BrowserImportJob>();

app.post("/api/browser-import/jobs", (req, res) => {
  const mode = safeText(req.body?.mode) as BrowserImportMode;
  if (!["brokers", "briefings", "briefing-detail"].includes(mode)) {
    res.status(400).json({ error: "不支持的浏览器导入类型" });
    return;
  }
  const now = new Date().toISOString();
  const job: BrowserImportJob = {
    id: randomUUID(),
    mode,
    payload: typeof req.body === "object" && req.body ? req.body : {},
    status: "pending",
    createdAt: now,
    updatedAt: now
  };
  browserImportJobs.set(job.id, job);
  cleanupBrowserImportJobs();
  res.status(201).json(job);
});

app.get("/api/browser-import/jobs/next", (req, res) => {
  const workerId = safeText(req.query.workerId);
  if (!workerId) {
    res.status(400).json({ error: "workerId is required" });
    return;
  }
  const now = Date.now();
  for (const job of browserImportJobs.values()) {
    if (job.status === "claimed" && now - new Date(job.updatedAt).getTime() > 10 * 60 * 1000) {
      job.status = "pending";
      job.workerId = undefined;
    }
  }
  const job = [...browserImportJobs.values()]
    .filter((item) => item.status === "pending")
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
  if (!job) {
    res.status(204).end();
    return;
  }
  job.status = "claimed";
  job.workerId = workerId;
  job.updatedAt = new Date().toISOString();
  res.json(job);
});

app.get("/api/browser-import/jobs/:id", (req, res) => {
  const job = browserImportJobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "导入任务不存在或已过期" });
    return;
  }
  res.json(job);
});

app.post("/api/browser-import/jobs/:id/complete", (req, res) => {
  const job = browserImportJobs.get(req.params.id);
  if (!job) {
    res.status(404).json({ error: "导入任务不存在或已过期" });
    return;
  }
  const workerId = safeText(req.body?.workerId);
  if (job.workerId && job.workerId !== workerId) {
    res.status(409).json({ error: "导入任务已由其他扩展领取" });
    return;
  }
  job.status = req.body?.error ? "failed" : "completed";
  job.error = safeText(req.body?.error) || undefined;
  job.result = req.body?.result;
  job.updatedAt = new Date().toISOString();
  res.json(job);
});

function cleanupBrowserImportJobs() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [id, job] of browserImportJobs) {
    if (new Date(job.createdAt).getTime() < cutoff) browserImportJobs.delete(id);
  }
}

type AuthRole = "super_admin" | "operations" | "finance";
type AuthAccount = {
  account: string;
  avatarUrl?: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  role: AuthRole;
  enabled: boolean;
};

async function readAuthAccounts(): Promise<AuthAccount[]> {
  try {
    const value = JSON.parse(await fs.readFile(accountFile, "utf8")) as AuthAccount[];
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

async function writeAuthAccounts(accounts: AuthAccount[]) {
  await fs.mkdir(uploadRoot, { recursive: true });
  await fs.writeFile(accountFile, JSON.stringify(accounts, null, 2), "utf8");
}

function passwordDigest(password: string, salt: string) {
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

app.get("/api/auth/status", async (_req, res) => {
  res.json({ hasAccounts: (await readAuthAccounts()).length > 0 });
});

app.post("/api/auth/import-local", async (req, res) => {
  const existing = await readAuthAccounts();
  if (existing.length > 0) {
    res.json(existing);
    return;
  }
  const incoming = Array.isArray(req.body?.accounts) ? req.body.accounts : [];
  const accounts: AuthAccount[] = incoming
    .filter((item: any) => item?.account && item?.passwordHash && item?.salt && item?.createdAt)
    .map((item: any, index: number) => ({
      account: String(item.account).trim().toLowerCase(),
      avatarUrl: typeof item.avatarUrl === "string" ? item.avatarUrl : undefined,
      passwordHash: String(item.passwordHash),
      salt: String(item.salt),
      createdAt: String(item.createdAt),
      role: index === 0 ? "super_admin" : item.role === "finance" ? "finance" : "operations",
      enabled: item.enabled !== false
    }));
  if (accounts.length) await writeAuthAccounts(accounts);
  res.json(accounts);
});

app.post("/api/auth/register", async (req, res) => {
  const account = String(req.body?.account ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const accounts = await readAuthAccounts();
  if (account.length < 3 || password.length < 6) {
    res.status(400).json({ error: "账号或密码不符合要求" });
    return;
  }
  if (accounts.some((item) => item.account === account)) {
    res.status(409).json({ error: "该账号已存在，请直接登录" });
    return;
  }
  const salt = randomUUID();
  const created: AuthAccount = {
    account,
    passwordHash: passwordDigest(password, salt),
    salt,
    createdAt: new Date().toISOString(),
    role: accounts.length === 0 ? "super_admin" : "operations",
    enabled: true
  };
  await writeAuthAccounts([...accounts, created]);
  res.status(201).json(created);
});

app.post("/api/auth/login", async (req, res) => {
  const account = String(req.body?.account ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");
  const found = (await readAuthAccounts()).find((item) => item.account === account);
  if (!found || found.passwordHash !== passwordDigest(password, found.salt)) {
    res.status(401).json({ error: "账号或密码错误" });
    return;
  }
  if (!found.enabled) {
    res.status(403).json({ error: "该账号已停用，请联系超级管理员" });
    return;
  }
  res.json(found);
});

app.get("/api/auth/accounts", async (_req, res) => {
  res.json(await readAuthAccounts());
});

app.patch("/api/auth/accounts/:account", async (req, res) => {
  const accounts = await readAuthAccounts();
  const accountName = String(req.params.account).toLowerCase();
  let avatarUrl: string | undefined;
  if (typeof req.body?.avatarDataUrl === "string") {
    const match = req.body.avatarDataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      res.status(400).json({ error: "头像仅支持 PNG、JPG 或 WebP 格式" });
      return;
    }
    const image = Buffer.from(match[2], "base64");
    if (!image.length || image.length > 2 * 1024 * 1024) {
      res.status(400).json({ error: "头像文件不能超过 2MB" });
      return;
    }
    const extension = match[1] === "jpeg" ? "jpg" : match[1];
    const avatarDirectory = path.join(uploadRoot, "system-avatars");
    const avatarName = `${createHash("sha256").update(accountName).digest("hex").slice(0, 20)}.${extension}`;
    await fs.mkdir(avatarDirectory, { recursive: true });
    await fs.writeFile(path.join(avatarDirectory, avatarName), image);
    avatarUrl = `/uploads/system-avatars/${avatarName}?v=${Date.now()}`;
  }
  const next = accounts.map((item) => item.account === accountName ? {
    ...item,
    avatarUrl: avatarUrl ?? item.avatarUrl,
    role: (["super_admin", "operations", "finance"] as string[]).includes(req.body?.role) ? req.body.role as AuthRole : item.role,
    enabled: typeof req.body?.enabled === "boolean" ? req.body.enabled : item.enabled
  } : item);
  await writeAuthAccounts(next);
  res.json(next);
});

app.get("/api/dashboard", async (_req, res) => {
  const brokerCount = await withFallback(() => prisma.broker.count(), 0);
  const briefingCount = await withFallback(() => prisma.briefing.count(), 0);
  res.json({
    brokerCount,
    briefingCount,
    seedBrokerCount: await withFallback(() => prisma.broker.count({ where: { brokerLevel: "SEED" } }), 0),
    pendingReviewCount: await withFallback(() => prisma.briefingReview.count({ where: { validPublishStatus: "PENDING" } }), 0),
    weeklySettlementAmount: settlementSummary.totalAmount,
    currentCycle: settlementSummary.cycleTitle
  });
});

app.get("/api/brokers", async (_req, res) => {
  const data = await withFallback(
    () =>
      prisma.broker.findMany({
        orderBy: { updatedAt: "desc" },
        take: 100,
        include: {
          snapshots: {
            orderBy: { capturedAt: "desc" },
          },
          promotions: { where: { toLevel: "SEED" }, orderBy: { promotedAt: "desc" }, take: 1 },
          refereeRelations: {
            orderBy: { boundAt: "desc" },
            take: 1,
            include: { referrer: { select: { nickname: true } } }
          },
          referrerRelations: { orderBy: { boundAt: "desc" }, take: 1, select: { boundAt: true } },
          _count: { select: { referrerRelations: true } },
          briefings: {
            include: {
              snapshots: true
            }
          }
        }
      }),
    []
  );
  if (Array.isArray(data) && data.length > 0 && "miniProgramUserId" in data[0] && "createdAt" in data[0]) {
    res.json(data.map(mapBroker));
    return;
  }
  res.json(data);
});

app.get("/api/brokers/:id", async (req, res) => {
  const fallback = null;
  const data = await withFallback(
    () =>
      prisma.broker.findUnique({
        where: { id: req.params.id }
      }),
    fallback
  );
  res.json(data ?? fallback);
});

app.patch("/api/brokers/:id/level", async (req, res) => {
  const brokerLevel = req.body?.brokerLevel === "seed" ? "SEED" : "NORMAL";
  const rawSeedPhase = req.body?.seedPhase;
  const requestedSeedPhase = rawSeedPhase == null || rawSeedPhase === "" ? null : Math.max(1, Math.min(6, Number(rawSeedPhase)));
  const seedQualifiedAt = parseNullableDate(req.body?.seedQualifiedAt);
  const requestedProgramJoinedAt = parseNullableDate(req.body?.seedProgramJoinedAt);
  const referralUnlocked = brokerLevel === "SEED" && Boolean(req.body?.referralUnlocked);

  try {
    const currentBroker = await prisma.broker.findUnique({ where: { id: req.params.id } });
    if (!currentBroker) {
      res.status(404).json({ error: "经纪人不存在" });
      return;
    }
    const directReferrer = await prisma.referralRelation.findFirst({
      where: { refereeId: req.params.id },
      include: { referrer: { select: { seedPhase: true } } }
    });
    if (directReferrer && currentBroker.brokerLevel !== "SEED" && brokerLevel === "SEED") {
      res.status(409).json({ error: "被引荐经纪人请通过 6 + 2 达标提醒确认晋升" });
      return;
    }
    const inheritedPhase = directReferrer?.referrer.seedPhase ?? null;
    const seedPhase = requestedSeedPhase ? inheritedPhase ?? requestedSeedPhase : null;
    const seedProgramJoinedAt = seedPhase ? requestedProgramJoinedAt ?? (brokerLevel === "SEED" ? seedQualifiedAt : null) : null;
    if (brokerLevel === "SEED" && !seedPhase) {
      res.status(400).json({ error: "请选择种子期数" });
      return;
    }
    if (seedPhase && !seedProgramJoinedAt) {
      res.status(400).json({ error: "请选择种子计划生效日期和时间" });
      return;
    }
    if (brokerLevel === "SEED" && !seedQualifiedAt) {
      res.status(400).json({ error: "请选择种子经纪人晋升日期和时间" });
      return;
    }
    const broker = await prisma.$transaction(async (transaction) => {
      const updatedBroker = await transaction.broker.update({
        where: { id: req.params.id },
        data: { brokerLevel, seedPhase, seedProgramJoinedAt, referralUnlocked }
      });
      if (brokerLevel === "SEED" && seedQualifiedAt) {
        const latestPromotion = currentBroker.brokerLevel === "SEED"
          ? await transaction.promotionRecord.findFirst({
              where: { brokerId: req.params.id, toLevel: "SEED" },
              orderBy: { promotedAt: "desc" }
            })
          : null;
        if (latestPromotion) {
          await transaction.promotionRecord.update({
            where: { id: latestPromotion.id },
            data: { promotedAt: seedQualifiedAt }
          });
        } else {
          await transaction.promotionRecord.create({
            data: {
              brokerId: req.params.id,
              fromLevel: currentBroker.brokerLevel,
              toLevel: "SEED",
              promotedAt: seedQualifiedAt,
              reason: safeText(req.body?.reason, "运营确认种子经纪人身份"),
              operator: safeText(req.body?.operator, "开发预览账号")
            }
          });
        }
      }
      return updatedBroker;
    });
    const mappedBroker = await prisma.broker.findUnique({
      where: { id: broker.id },
      include: {
        snapshots: { orderBy: { capturedAt: "desc" } },
        promotions: { where: { toLevel: "SEED" }, orderBy: { promotedAt: "desc" }, take: 1 },
        briefings: { include: { snapshots: true } }
      }
    });
    res.json(mappedBroker ? mapBroker(mappedBroker) : null);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "更新失败" });
  }
});

app.post("/api/brokers/:id/promote", async (req, res) => {
  const promotedAt = parseNullableDate(req.body?.promotedAt);
  if (!promotedAt) {
    res.status(400).json({ error: "请选择晋升日期和时间" });
    return;
  }

  try {
    const currentBroker = await prisma.broker.findUnique({ where: { id: req.params.id } });
    if (!currentBroker) {
      res.status(404).json({ error: "经纪人不存在" });
      return;
    }
    if (!currentBroker.seedPhase || !currentBroker.seedProgramJoinedAt) {
      res.status(409).json({ error: "该经纪人尚未通过关系网络加入种子计划" });
      return;
    }
    const directReferrer = await prisma.referralRelation.findFirst({ where: { refereeId: req.params.id } });
    if (!directReferrer) {
      res.status(409).json({ error: "只有关系网络中的被引荐经纪人可以通过达标提醒晋升" });
      return;
    }
    if (currentBroker.brokerLevel === "SEED" || currentBroker.referralUnlocked) {
      res.status(409).json({ error: "该经纪人已经完成晋升" });
      return;
    }
    if (promotedAt.getTime() < currentBroker.seedProgramJoinedAt.getTime()) {
      res.status(400).json({ error: "晋升时间不能早于加入种子计划的时间" });
      return;
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.broker.update({
        where: { id: req.params.id },
        data: { brokerLevel: "SEED", referralUnlocked: true }
      });
      await transaction.promotionRecord.create({
        data: {
          brokerId: req.params.id,
          fromLevel: currentBroker.brokerLevel,
          toLevel: "SEED",
          promotedAt,
          reason: safeText(req.body?.reason, "运营确认满足 6 + 2 后晋升"),
          operator: safeText(req.body?.operator, "开发预览账号")
        }
      });
    });

    const mappedBroker = await prisma.broker.findUnique({
      where: { id: req.params.id },
      include: {
        snapshots: { orderBy: { capturedAt: "desc" } },
        promotions: { where: { toLevel: "SEED" }, orderBy: { promotedAt: "desc" }, take: 1 },
        briefings: { include: { snapshots: true } }
      }
    });
    res.json(mappedBroker ? mapBroker(mappedBroker) : null);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "晋升失败" });
  }
});

app.get("/api/brokers/:id/briefings", async (req, res) => {
  const fallback: unknown[] = [];
  const data = await withFallback(
    () =>
      prisma.briefing.findMany({
        where: { brokerId: req.params.id },
        orderBy: { publishedAt: "desc" },
        include: {
          review: true,
          evidences: true,
          snapshots: { orderBy: { capturedAt: "desc" } }
        }
      }),
    fallback
  );
  if (Array.isArray(data) && data.length > 0 && "jarvisBriefingId" in data[0] && "createdAt" in data[0]) {
    res.json(data.map(mapBriefing));
    return;
  }
  res.json(data);
});

app.delete("/api/brokers/:id/briefings", async (req, res) => {
  try {
    const broker = await prisma.broker.findUnique({ where: { id: req.params.id }, select: { id: true } });
    if (!broker) {
      res.status(404).json({ error: "经纪人不存在" });
      return;
    }
    const briefingIds = (await prisma.briefing.findMany({
      where: { brokerId: broker.id },
      select: { id: true }
    })).map((item) => item.id);
    if (!briefingIds.length) {
      res.json({ deletedCount: 0 });
      return;
    }
    await prisma.$transaction([
      prisma.evidenceFile.updateMany({
        where: { briefingId: { in: briefingIds } },
        data: { briefingId: null, matchedAt: null }
      }),
      prisma.settlementItem.deleteMany({ where: { briefingId: { in: briefingIds } } }),
      prisma.briefingReview.deleteMany({ where: { briefingId: { in: briefingIds } } }),
      prisma.briefingSnapshot.deleteMany({ where: { briefingId: { in: briefingIds } } }),
      prisma.briefing.deleteMany({ where: { id: { in: briefingIds } } })
    ]);
    res.json({ deletedCount: briefingIds.length });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "清除通告失败" });
  }
});

app.get("/api/brokers/:id/evidences", async (req, res) => {
  try {
    const evidences = await prisma.evidenceFile.findMany({
      where: { brokerId: req.params.id },
      orderBy: { uploadedAt: "desc" }
    });
    res.json(evidences.map(mapEvidence));
  } catch {
    res.json([]);
  }
});

app.post("/api/brokers/:id/evidences", express.raw({ type: "*/*", limit: "800mb" }), async (req, res) => {
  const fileName = sanitizeFileName(decodeHeaderText(safeText(req.header("x-file-name"), `evidence-${Date.now()}.mp4`)));
  const fileType = safeText(req.header("x-file-type"), "application/octet-stream");
  const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
  if (bytes.length === 0) {
    res.status(400).json({ error: "未收到视频文件" });
    return;
  }

  try {
    const broker = await prisma.broker.findUnique({ where: { id: req.params.id } });
    if (!broker) {
      res.status(404).json({ error: "经纪人不存在" });
      return;
    }
    const folder = path.join(uploadRoot, "evidence", broker.id);
    await fs.mkdir(folder, { recursive: true });
    const storedName = `${Date.now()}-${fileName}`;
    await fs.writeFile(path.join(folder, storedName), bytes);
    const evidence = await prisma.evidenceFile.create({
      data: {
        brokerId: broker.id,
        fileName,
        fileUrl: `/uploads/evidence/${broker.id}/${storedName}`,
        fileType
      }
    });
    res.status(201).json(mapEvidence(evidence));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "上传失败" });
  }
});

app.get("/api/brokers/:id/referrals", (_req, res) => {
  prisma.referralRelation
    .findMany({
      where: { referrerId: _req.params.id },
      orderBy: { boundAt: "desc" },
      include: {
        referee: {
          include: {
            snapshots: { orderBy: { capturedAt: "desc" } },
            promotions: { where: { toLevel: "SEED" }, orderBy: { promotedAt: "desc" }, take: 1 },
            briefings: { include: { snapshots: true } }
          }
        }
      }
    })
    .then((relations) => res.json(relations.map((relation) => mapReferralNode(relation.referee))))
    .catch(() => res.json([]));
});

app.get("/api/brokers/:id/referrers", (_req, res) => {
  prisma.referralRelation
    .findMany({
      where: { refereeId: _req.params.id },
      orderBy: { boundAt: "desc" },
      include: {
        referrer: {
          include: {
            snapshots: { orderBy: { capturedAt: "desc" } },
            promotions: { where: { toLevel: "SEED" }, orderBy: { promotedAt: "desc" }, take: 1 },
            briefings: { include: { snapshots: true } }
          }
        }
      }
    })
    .then((relations) => res.json(relations.map((relation) => mapReferralNode(relation.referrer))))
    .catch(() => res.json([]));
});

app.post("/api/brokers/:id/referrals", async (req, res) => {
  const phone = safeText(req.body?.phone);
  if (!phone) {
    res.status(400).json({ error: "请输入手机号" });
    return;
  }

  try {
    const referrer = await prisma.broker.findUnique({ where: { id: req.params.id } });
    if (!referrer) {
      res.status(404).json({ error: "上线经纪人不存在" });
      return;
    }
    if (referrer.brokerLevel !== "SEED" || !referrer.referralUnlocked || !referrer.seedPhase) {
      res.status(403).json({ error: "该经纪人尚未晋升并开通引荐权限" });
      return;
    }

    const referee = await prisma.broker.findFirst({
      where: {
        OR: [{ boundPhone: phone }, { wechatPhone: phone }]
      }
    });
    if (!referee) {
      res.status(404).json({ error: "未找到该手机号对应经纪人" });
      return;
    }
    if (referee.id === referrer.id) {
      res.status(400).json({ error: "不能关联自己" });
      return;
    }

    const existingReferrer = await prisma.referralRelation.findFirst({
      where: { refereeId: referee.id },
      include: { referrer: { select: { nickname: true } } }
    });
    if (existingReferrer && existingReferrer.referrerId !== referrer.id) {
      res.status(409).json({ error: `该经纪人已关联上线 ${existingReferrer.referrer.nickname}，不能重复关联其他上线` });
      return;
    }

    const inheritedPhase = referrer.seedPhase;
    if (!existingReferrer && (referee.seedPhase || referee.brokerLevel === "SEED")) {
      res.status(409).json({ error: "该经纪人已有种子计划身份，不能重复加入其他裂变链路" });
      return;
    }
    const boundAtText = safeText(req.body?.boundAt);
    const requestedBoundAt = parseNullableDate(boundAtText);
    if (boundAtText && !requestedBoundAt) {
      res.status(400).json({ error: "引荐时间格式无效" });
      return;
    }
    const joinedAt = requestedBoundAt ?? new Date();
    if (joinedAt.getTime() > Date.now()) {
      res.status(400).json({ error: "引荐时间不能晚于当前时间" });
      return;
    }
    await prisma.$transaction(async (transaction) => {
      await transaction.referralRelation.upsert({
        where: {
          referrerId_refereeId: {
            referrerId: referrer.id,
            refereeId: referee.id
          }
        },
        update: {
          bindPhone: phone,
          boundAt: joinedAt,
          notes: `由 ${referrer.nickname} 引荐，继承第 ${inheritedPhase} 期种子链路`
        },
        create: {
          referrerId: referrer.id,
          refereeId: referee.id,
          bindPhone: phone,
          boundAt: joinedAt,
          notes: `由 ${referrer.nickname} 引荐，继承第 ${inheritedPhase} 期种子链路`
        }
      });
      await transaction.broker.update({
        where: { id: referee.id },
        data: {
          seedPhase: inheritedPhase,
          seedProgramJoinedAt: joinedAt,
          ...(referee.brokerLevel === "SEED" ? {} : { brokerLevel: "NORMAL", referralUnlocked: false })
        }
      });
    });

    const relations = await prisma.referralRelation.findMany({
      where: { referrerId: referrer.id },
      orderBy: { boundAt: "desc" },
      include: {
        referee: {
          include: {
            snapshots: { orderBy: { capturedAt: "desc" } },
            promotions: { where: { toLevel: "SEED" }, orderBy: { promotedAt: "desc" }, take: 1 },
            briefings: { include: { snapshots: true } }
          }
        }
      }
    });

    res.json(relations.map((relation) => mapReferralNode(relation.referee)));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "关联失败" });
  }
});

app.get("/api/brokers/:id/settlement", (_req, res) => {
  res.json(settlementSummary);
});

app.get("/api/signers/:jarvisUserId", async (req, res) => {
  try {
    const signer = await prisma.signerProfile.findUnique({
      where: { jarvisUserId: req.params.jarvisUserId },
      include: {
        briefings: {
          orderBy: { signedAt: "desc" },
          include: { briefing: { include: { broker: { select: { nickname: true } } } } }
        }
      }
    });
    if (!signer) {
      res.status(404).json({ error: "尚未同步该签约者资料" });
      return;
    }
    const recoveredNicknames = signer.briefings
      .flatMap((item) => unpackBriefingDetails(item.briefing.requirementText).signedModelNames)
      .map(parseSignedModelIdentity)
      .filter((identity) => identity.jarvisUserId === signer.jarvisUserId)
      .map((identity) => identity.nickname);
    const nickname = importedSignerDisplayNickname(signer.nickname, signer.accountStatus, recoveredNicknames);
    res.json(mapSignerProfile({ ...signer, nickname }));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "签约者资料读取失败" });
  }
});

app.post("/api/import/jarvis-signer-profile", async (req, res) => {
  const row = req.body?.row ?? req.body ?? {};
  const jarvisUserId = safeText(row.jarvisUserId ?? row.userId);
  if (!jarvisUserId) {
    res.status(400).json({ error: "jarvisUserId is required" });
    return;
  }
  const data = signerProfileData(row);
  try {
    const signer = await prisma.signerProfile.upsert({
      where: { jarvisUserId },
      update: data,
      create: { jarvisUserId, ...data }
    });
    res.json(mapSignerProfile({ ...signer, briefings: [] }));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "签约者资料导入失败" });
  }
});

app.post("/api/briefings/:id/evidence", express.raw({ type: "*/*", limit: "800mb" }), async (req, res) => {
  const fileName = sanitizeFileName(decodeHeaderText(safeText(req.header("x-file-name"), `evidence-${Date.now()}`)));
  const fileType = safeText(req.header("x-file-type"), "application/octet-stream");
  const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
  if (bytes.length === 0) {
    res.status(400).json({ error: "未收到视频文件" });
    return;
  }

  try {
    const briefing = await prisma.briefing.findUnique({ where: { id: req.params.id } });
    if (!briefing) {
      res.status(404).json({ error: "通告不存在" });
      return;
    }
    const folder = path.join(uploadRoot, "evidence", req.params.id);
    await fs.mkdir(folder, { recursive: true });
    const storedName = `${Date.now()}-${fileName}`;
    const filePath = path.join(folder, storedName);
    await fs.writeFile(filePath, bytes);
    const evidence = await prisma.evidenceFile.create({
      data: {
        brokerId: briefing.brokerId,
        briefingId: req.params.id,
        matchedAt: new Date(),
        fileName,
        fileUrl: `/uploads/evidence/${req.params.id}/${storedName}`,
        fileType
      }
    });
    res.status(201).json(mapEvidence(evidence));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "上传失败" });
  }
});

app.patch("/api/briefings/:id/evidence/:evidenceId", async (req, res) => {
  try {
    const briefing = await prisma.briefing.findUnique({ where: { id: req.params.id } });
    if (!briefing) {
      res.status(404).json({ error: "通告不存在" });
      return;
    }
    const evidence = await prisma.evidenceFile.findUnique({ where: { id: req.params.evidenceId } });
    if (!evidence || evidence.brokerId !== briefing.brokerId) {
      res.status(404).json({ error: "凭证不存在或不属于该经纪人" });
      return;
    }
    const matched = await prisma.evidenceFile.update({
      where: { id: evidence.id },
      data: {
        briefingId: briefing.id,
        matchedAt: new Date()
      }
    });
    res.json(mapEvidence(matched));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "匹配失败" });
  }
});

app.delete("/api/briefings/:id/evidence/:evidenceId", async (req, res) => {
  try {
    const evidence = await prisma.evidenceFile.findUnique({ where: { id: req.params.evidenceId } });
    if (!evidence || evidence.briefingId !== req.params.id) {
      res.status(404).json({ error: "该通告未绑定此凭证" });
      return;
    }
    const updated = await prisma.evidenceFile.update({
      where: { id: req.params.evidenceId },
      data: {
        briefingId: null,
        matchedAt: null
      }
    });
    res.json(mapEvidence(updated));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "撤销失败" });
  }
});

app.delete("/api/brokers/:id/referrals/:refereeId", async (req, res) => {
  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.referralRelation.delete({
        where: {
          referrerId_refereeId: {
            referrerId: req.params.id,
            refereeId: req.params.refereeId
          }
        }
      });
      await transaction.broker.update({
        where: { id: req.params.refereeId },
        data: {
          brokerLevel: "NORMAL",
          seedPhase: null,
          seedProgramJoinedAt: null,
          referralUnlocked: false
        }
      });
    });
    const relations = await prisma.referralRelation.findMany({
      where: { referrerId: req.params.id },
      orderBy: { boundAt: "desc" },
      include: {
        referee: {
          include: {
            snapshots: { orderBy: { capturedAt: "desc" } },
            promotions: { where: { toLevel: "SEED" }, orderBy: { promotedAt: "desc" }, take: 1 },
            briefings: { include: { snapshots: true } }
          }
        }
      }
    });
    res.json(relations.map((relation) => mapReferralNode(relation.referee)));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "解除关联失败" });
  }
});

app.patch("/api/briefings/:id/review", async (req, res) => {
  const validPublishStatus = toReviewStatus(req.body?.validPublishStatus);
  const validCompleteStatus = toReviewStatus(req.body?.validCompleteStatus);
  const invalidReason = safeText(req.body?.invalidReason);

  try {
    const briefing = await prisma.briefing.findUnique({ where: { id: req.params.id } });
    if (!briefing) {
      res.status(404).json({ error: "通告不存在" });
      return;
    }
    const reviewStartAt = await findSeedReviewStartAt(briefing.brokerId);
    if (!reviewStartAt || !briefing.publishedAt || briefing.publishedAt < reviewStartAt) {
      res.status(400).json({ error: "该通告发布于当前激励阶段生效前，属于往期通告，不能进入计划审核" });
      return;
    }
    const details = unpackBriefingDetails(briefing.requirementText);
    const hasSignedModels = details.signedModelNames.length > 0;
    if (validCompleteStatus === "APPROVED" && !hasSignedModels) {
      res.status(400).json({ error: "该通告没有已签约人员，新增签约不能审核为通过" });
      return;
    }
    if (validCompleteStatus === "APPROVED" && validPublishStatus !== "APPROVED") {
      res.status(400).json({ error: "请先审核通告是否符合有效通告，再审核新增签约" });
      return;
    }
    const cancelReason = details.cancelReason || briefing.sourceStatus || "";
    if (validPublishStatus === "APPROVED" && isSourceInvalidForPublish(briefing.sourceStatus ?? "", cancelReason)) {
      res.status(400).json({ error: "该通告已手动取消或被举报取消，不能审核为有效通告" });
      return;
    }

    let isDailyLimitExceeded = false;
    let isWeeklyLimitExceeded = false;
    if (validPublishStatus === "APPROVED" && briefing.publishedAt) {
      const publishedAt = new Date(briefing.publishedAt);
      const dayStart = new Date(publishedAt.getFullYear(), publishedAt.getMonth(), publishedAt.getDate());
      const seedPlanStart = new Date("2026-04-01T00:00:00");
      const weekIndex = Math.max(0, Math.floor((dayStart.getTime() - seedPlanStart.getTime()) / (7 * 86400000)));
      const weekStart = new Date(seedPlanStart.getTime() + weekIndex * 7 * 86400000);
      const eligibleDayStart = reviewStartAt > dayStart ? reviewStartAt : dayStart;
      const eligibleWeekStart = reviewStartAt > weekStart ? reviewStartAt : weekStart;
      const approvedFilter = {
        brokerId: briefing.brokerId,
        id: { not: briefing.id },
        review: { validPublishStatus: "APPROVED" as const }
      };
      const [dailyApprovedCount, weeklyApprovedCount] = await Promise.all([
        prisma.briefing.count({ where: { ...approvedFilter, publishedAt: { gte: eligibleDayStart, lt: publishedAt } } }),
        prisma.briefing.count({ where: { ...approvedFilter, publishedAt: { gte: eligibleWeekStart, lt: publishedAt } } })
      ]);
      isDailyLimitExceeded = dailyApprovedCount >= 3;
      isWeeklyLimitExceeded = weeklyApprovedCount >= 12;
    }

    const isPublishCandidate = isDailyLimitExceeded || isWeeklyLimitExceeded;
    const storedPublishStatus = isPublishCandidate ? "PENDING" : validPublishStatus;
    const storedCompleteStatus = resolveStoredCompleteStatus(storedPublishStatus, validCompleteStatus, hasSignedModels);

    await prisma.briefingReview.upsert({
      where: { briefingId: req.params.id },
      update: {
        validPublishStatus: storedPublishStatus,
        validCompleteStatus: storedCompleteStatus,
        invalidReason,
        isDailyLimitExceeded,
        isWeeklyLimitExceeded,
        reviewerName: "开发预览账号",
        reviewedAt: new Date()
      },
      create: {
        briefingId: req.params.id,
        validPublishStatus: storedPublishStatus,
        validCompleteStatus: storedCompleteStatus,
        invalidReason,
        isDailyLimitExceeded,
        isWeeklyLimitExceeded,
        reviewerName: "开发预览账号",
        reviewedAt: new Date()
      }
    });
    const updated = await prisma.briefing.findUnique({
      where: { id: req.params.id },
      include: {
        review: true,
        evidences: true,
        snapshots: { orderBy: { capturedAt: "desc" } }
      }
    });
    res.json(updated ? mapBriefing(updated) : null);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "审核失败" });
  }
});

app.delete("/api/briefings/:id/review/evidence-dispute", async (req, res) => {
  try {
    const briefing = await prisma.briefing.findUnique({
      where: { id: req.params.id },
      include: { review: true }
    });
    if (!briefing) {
      res.status(404).json({ error: "通告不存在" });
      return;
    }
    if (!briefing.review) {
      res.status(404).json({ error: "该通告没有凭证异议记录" });
      return;
    }

    const invalidReason = clearEvidenceDisputeReason(briefing.review.invalidReason ?? "");
    await prisma.briefingReview.update({
      where: { briefingId: briefing.id },
      data: { invalidReason: invalidReason || null }
    });
    const updated = await prisma.briefing.findUnique({
      where: { id: briefing.id },
      include: {
        review: true,
        evidences: true,
        snapshots: { orderBy: { capturedAt: "desc" } }
      }
    });
    res.json(updated ? mapBriefing(updated) : null);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "清除凭证异议失败" });
  }
});

app.get("/api/import-batches", (_req, res) => {
  prisma.importBatch
    .findMany({ orderBy: { importedAt: "desc" }, take: 20 })
    .then((batches) => {
      if (batches.length === 0) {
        res.json([]);
        return;
      }
      res.json(
        batches.map((batch) => ({
          id: batch.id,
          title: batch.title,
          importedAt: formatDateTime(batch.importedAt),
          source: batch.source,
          operatorName: batch.operatorName,
          brokerCount: batch.brokerCount,
          briefingCount: batch.briefingCount,
          newBrokerCount: 0,
          newBriefingCount: 0,
          status: "已导入"
        }))
      );
    })
    .catch(() => res.json([]));
});

app.post("/api/import-batches", async (req, res) => {
  const now = new Date();
  const batch = {
    id: `batch-${now.getTime()}`,
    title: req.body?.title ?? `${now.toISOString().slice(0, 10)} 鑫通告导入`,
    importedAt: now.toLocaleString("zh-CN", { hour12: false }),
    source: "JARVIS_CHROME" as const,
    operatorName: "开发预览账号",
    brokerCount: Number(req.body?.brokerCount ?? brokers.length),
    briefingCount: Number(req.body?.briefingCount ?? briefings.length),
    newBrokerCount: Number(req.body?.newBrokerCount ?? 0),
    newBriefingCount: Number(req.body?.newBriefingCount ?? 0),
    status: "预览" as const
  };

  try {
    const saved = await prisma.importBatch.create({
      data: {
        id: batch.id,
        title: batch.title,
        importedAt: now,
        source: batch.source,
        operatorName: batch.operatorName,
        brokerCount: batch.brokerCount,
        briefingCount: batch.briefingCount,
        notes: "导入预览，等待真实抓取任务写入明细"
      }
    });
    res.status(201).json({
      ...batch,
      importedAt: formatDateTime(saved.importedAt)
    });
  } catch {
    importBatches.unshift(batch);
    res.status(201).json(batch);
  }
});

async function importJarvisBrokerRows({ rows, title }: { rows: any[]; title?: string }) {
  if (rows.length === 0) {
    throw new Error("rows is required");
  }

  const now = new Date();
  let newBrokerCount = 0;
  const batch = await prisma.importBatch.create({
    data: {
      title: title || `${now.toISOString().slice(0, 10)} 鑫通告经纪人导入`,
      source: "JARVIS_CHROME",
      importedAt: now,
      operatorName: "Chrome 导入",
      brokerCount: rows.length,
      briefingCount: 0,
      notes: "从鑫通告用户管理页导入经纪人列表"
    }
  });

  for (const row of rows) {
    const miniProgramUserId = String(row.miniProgramUserId ?? "").trim();
    if (!miniProgramUserId) continue;

    const existing = await prisma.broker.findUnique({ where: { miniProgramUserId } });
    if (!existing) newBrokerCount += 1;

    const broker = await prisma.broker.upsert({
      where: { miniProgramUserId },
      update: {
        nickname: safeText(row.nickname, "未命名经纪人"),
        wechatPhone: safeText(row.wechatPhone),
        boundPhone: safeText(row.boundPhone),
        realNameStatus: toRealNameStatus(row.realNameStatus),
        accountStatus: toAccountStatus(row.accountStatus),
        registeredAt: parseNullableDate(row.registeredAt),
        lastLoginAt: parseNullableDate(row.lastLoginAt),
        violationCount: toNumber(row.violationCount)
      },
      create: {
        miniProgramUserId,
        nickname: safeText(row.nickname, "未命名经纪人"),
        wechatPhone: safeText(row.wechatPhone),
        boundPhone: safeText(row.boundPhone),
        realNameStatus: toRealNameStatus(row.realNameStatus),
        accountStatus: toAccountStatus(row.accountStatus),
        registeredAt: parseNullableDate(row.registeredAt),
        lastLoginAt: parseNullableDate(row.lastLoginAt),
        violationCount: toNumber(row.violationCount)
      }
    });

    await prisma.brokerSnapshot.upsert({
      where: {
        brokerId_importBatchId: {
          brokerId: broker.id,
          importBatchId: batch.id
        }
      },
      update: {
        publishedBriefings: toNumber(row.publishedBriefings),
        completedBriefings: toNumber(row.completedBriefings),
        signupTotalTimes: toNumber(row.signupTotalTimes),
        contractTotalTimes: toNumber(row.contractTotalTimes),
        signupTotalPeople: toNumber(row.signupTotalPeople),
        contractTotalPeople: toNumber(row.contractTotalPeople),
        violationCount: toNumber(row.violationCount)
      },
      create: {
        brokerId: broker.id,
        importBatchId: batch.id,
        publishedBriefings: toNumber(row.publishedBriefings),
        completedBriefings: toNumber(row.completedBriefings),
        signupTotalTimes: toNumber(row.signupTotalTimes),
        contractTotalTimes: toNumber(row.contractTotalTimes),
        signupTotalPeople: toNumber(row.signupTotalPeople),
        contractTotalPeople: toNumber(row.contractTotalPeople),
        violationCount: toNumber(row.violationCount)
      }
    });
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      brokerCount: rows.length,
      notes: `从鑫通告导入，经纪人 ${rows.length} 个，新增 ${newBrokerCount} 个`
    }
  });

  return {
    batchId: batch.id,
    importedCount: rows.length,
    newBrokerCount
  };
}

app.post("/api/import/jarvis-brokers", async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  try {
    const result = await importJarvisBrokerRows({ rows, title: req.body?.title });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "经纪人导入失败" });
  }
});

app.post("/api/import/jarvis-brokers/chrome", async (_req, res) => {
  try {
    const rows = await scrapeJarvisBrokersWithChrome();
    if (rows.length === 0) {
      res.status(400).json({ error: "Chrome 已打开鑫通告用户列表，但没有抓取到经纪人数据。请确认 Chrome 已登录，并且用户管理页可正常显示。" });
      return;
    }
    const result = await importJarvisBrokerRows({
      rows,
      title: `${new Date().toISOString().slice(0, 10)} 鑫通告经纪人导入`
    });
    res.json({ ...result, scrapedCount: rows.length });
  } catch (error) {
    res.status(400).json({
      error: formatChromeScrapeError(error)
    });
  }
});

app.post("/api/import/jarvis-briefings", async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  const brokerMiniProgramUserId = safeText(req.body?.brokerMiniProgramUserId);
  const brokerId = safeText(req.body?.brokerId);
  if (rows.length === 0) {
    res.status(400).json({ error: "rows is required" });
    return;
  }

  const broker = brokerId
    ? await prisma.broker.findUnique({ where: { id: brokerId } })
    : await prisma.broker.findUnique({ where: { miniProgramUserId: brokerMiniProgramUserId } });
  if (!broker) {
    res.status(404).json({ error: "经纪人不存在" });
    return;
  }

  const now = new Date();
  const batch = await prisma.importBatch.create({
    data: {
      title: req.body?.title ?? `${now.toISOString().slice(0, 10)} ${broker.nickname} 通告导入`,
      source: "JARVIS_CHROME",
      importedAt: now,
      operatorName: "Chrome 导入",
      brokerCount: 1,
      briefingCount: rows.length,
      notes: `从鑫通告经纪人详情页导入 ${rows.length} 条通告`
    }
  });

  let importedCount = 0;
  let newBriefingCount = 0;
  let detailImportedCount = 0;
  for (const row of rows) {
    const jarvisBriefingId = safeText(row.jarvisBriefingId);
    if (!jarvisBriefingId) continue;

    const signupPeople = toNumber(row.signupPeople);
    const contractPeople = toNumber(row.contractPeople);
    const sourceStatus = safeText(row.sourceStatus);
    const cancelReason = safeText(row.cancelReason);
    const detailText = packBriefingDetails(row);
    const existingBriefing = await findBriefingForImport(jarvisBriefingId);
    if (isUserManagedBriefing(existingBriefing)) {
      importedCount += 1;
      continue;
    }
    if (!existingBriefing) newBriefingCount += 1;
    if (detailText) detailImportedCount += 1;
    const briefing = await prisma.briefing.upsert({
      where: { jarvisBriefingId },
      update: {
        brokerId: broker.id,
        title: safeText(row.title, "未命名通告"),
        recruitmentType: safeText(row.recruitmentType),
        genderRequirement: safeText(row.genderRequirement),
        recruitCount: toNumber(row.recruitCount),
        workAddress: safeText(row.workAddress),
        workStartAt: parseNullableDate(row.workStartAt ?? row.workDate),
        workEndAt: parseNullableDate(row.workEndAt),
        publishedAt: parseNullableDate(row.publishedAt),
        finishedAt: parseNullableDate(row.finishedAt),
        salaryText: safeText(row.salaryText),
        requirementText: detailText,
        sourceStatus
      },
      create: {
        jarvisBriefingId,
        brokerId: broker.id,
        title: safeText(row.title, "未命名通告"),
        recruitmentType: safeText(row.recruitmentType),
        genderRequirement: safeText(row.genderRequirement),
        recruitCount: toNumber(row.recruitCount),
        workAddress: safeText(row.workAddress),
        workStartAt: parseNullableDate(row.workStartAt ?? row.workDate),
        workEndAt: parseNullableDate(row.workEndAt),
        publishedAt: parseNullableDate(row.publishedAt),
        finishedAt: parseNullableDate(row.finishedAt),
        salaryText: safeText(row.salaryText),
        requirementText: detailText,
        sourceStatus
      }
    });

    await prisma.briefingSnapshot.upsert({
      where: {
        briefingId_importBatchId: {
          briefingId: briefing.id,
          importBatchId: batch.id
        }
      },
      update: {
        signupTimes: toNumber(row.signupTimes),
        contractTimes: toNumber(row.contractTimes),
        signupPeople,
        contractPeople,
        sourceStatus
      },
      create: {
        briefingId: briefing.id,
        importBatchId: batch.id,
        signupTimes: toNumber(row.signupTimes),
        contractTimes: toNumber(row.contractTimes),
        signupPeople,
        contractPeople,
        sourceStatus
      }
    });

    await upsertBriefingReviewFromImport(briefing.id, sourceStatus, cancelReason, now);
    await syncBriefingSigners(briefing.id, unpackBriefingDetails(detailText).signedModelNames, now);

    importedCount += 1;
  }

  res.json({
    batchId: batch.id,
    brokerId: broker.id,
    importedCount,
    newBriefingCount,
    detailImportedCount
  });
});

app.post("/api/import/jarvis-briefings/local-package", async (req, res) => {
  const brokerMiniProgramUserId = safeText(req.body?.brokerMiniProgramUserId);
  if (!brokerMiniProgramUserId) {
    res.status(400).json({ error: "brokerMiniProgramUserId is required" });
    return;
  }

  const packagePath = path.join(process.cwd(), ".tmp", `briefings-${brokerMiniProgramUserId}-import.json`);
  try {
    const payload = JSON.parse(await fs.readFile(packagePath, "utf8"));
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    if (rows.length === 0) {
      res.status(400).json({ error: "导入包中没有通告数据" });
      return;
    }
    await importJarvisBriefingRows({
      brokerMiniProgramUserId,
      rows,
      title: safeText(payload.title, req.body?.title ?? "")
    }).then((result) => res.json({ ...result, packagePath }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      res.status(404).json({ error: "还没有该经纪人的通告抓取包，请先通过已登录 Chrome 抓取鑫通告通告列表。" });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : "本地导入包读取失败" });
  }
});

app.post("/api/import/jarvis-briefings/chrome", async (req, res) => {
  const brokerMiniProgramUserId = safeText(req.body?.brokerMiniProgramUserId);
  const brokerId = safeText(req.body?.brokerId);
  const broker = brokerId
    ? await prisma.broker.findUnique({ where: { id: brokerId } })
    : await prisma.broker.findUnique({ where: { miniProgramUserId: brokerMiniProgramUserId } });
  if (!broker) {
    res.status(404).json({ error: "经纪人不存在" });
    return;
  }

  try {
    const packageRows = await scrapeJarvisBriefingsWithChrome(broker.miniProgramUserId);
    if (packageRows.length === 0) {
      res.status(400).json({ error: "Chrome 已打开鑫通告页面，但没有抓取到通告行。请确认 Chrome 已登录，并且该经纪人发布通告页可正常显示。" });
      return;
    }
    const title = `${new Date().toISOString().slice(0, 10)} ${broker.nickname} 通告导入`;
    await fs.mkdir(path.join(process.cwd(), ".tmp"), { recursive: true });
    const packagePath = path.join(process.cwd(), ".tmp", `briefings-${broker.miniProgramUserId}-import.json`);
    await fs.writeFile(
      packagePath,
      JSON.stringify(
        {
          brokerMiniProgramUserId: broker.miniProgramUserId,
          title,
          generatedAt: new Date().toISOString(),
          rows: packageRows
        },
        null,
        2
      )
    );
    const result = await importJarvisBriefingRows({
      brokerId: broker.id,
      rows: packageRows,
      title
    });
    res.json({ ...result, packagePath, scrapedCount: packageRows.length });
  } catch (error) {
    res.status(400).json({
      error: formatChromeScrapeError(error)
    });
  }
});

app.post("/api/import/jarvis-briefing-detail/local-package", async (req, res) => {
  const brokerMiniProgramUserId = safeText(req.body?.brokerMiniProgramUserId);
  const jarvisBriefingId = safeText(req.body?.jarvisBriefingId);
  if (!brokerMiniProgramUserId || !jarvisBriefingId) {
    res.status(400).json({ error: "brokerMiniProgramUserId and jarvisBriefingId are required" });
    return;
  }

  const packagePath = path.join(process.cwd(), ".tmp", `briefings-${brokerMiniProgramUserId}-import.json`);
  try {
    const payload = JSON.parse(await fs.readFile(packagePath, "utf8"));
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const row = rows.find((item: any) => safeText(item.jarvisBriefingId) === jarvisBriefingId);
    if (!row) {
      res.status(404).json({ error: "该通告不在当前经纪人的本地抓取包中，请先重新抓取通告列表。" });
      return;
    }
    const result = await importJarvisBriefingRows({
      brokerMiniProgramUserId,
      rows: [row],
      title: `${new Date().toISOString().slice(0, 10)} ${safeText(row.title, "通告")} 详情导入`
    });
    res.json({ ...result, packagePath, detailImported: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      res.status(404).json({ error: "还没有该经纪人的通告抓取包，请先通过已登录 Chrome 抓取鑫通告通告列表。" });
      return;
    }
    res.status(400).json({ error: error instanceof Error ? error.message : "本地通告详情导入失败" });
  }
});

app.post("/api/import/jarvis-briefing-detail", async (req, res) => {
  const row = req.body?.row ?? req.body ?? {};
  const jarvisBriefingId = safeText(row.jarvisBriefingId);
  const localBriefingId = safeText(row.briefingId);
  if (!jarvisBriefingId && !localBriefingId) {
    res.status(400).json({ error: "jarvisBriefingId or briefingId is required" });
    return;
  }

  const existingBriefing = localBriefingId
    ? await prisma.briefing.findUnique({ where: { id: localBriefingId } })
    : await prisma.briefing.findUnique({ where: { jarvisBriefingId } });
  const existingBriefingForImport = existingBriefing?.jarvisBriefingId
    ? await findBriefingForImport(existingBriefing.jarvisBriefingId)
    : null;
  const broker = existingBriefing
    ? await prisma.broker.findUnique({ where: { id: existingBriefing.brokerId } })
    : await prisma.broker.findUnique({ where: { miniProgramUserId: safeText(row.brokerMiniProgramUserId) } });
  if (!broker) {
    res.status(404).json({ error: "经纪人不存在，无法导入通告详情" });
    return;
  }

  const stableJarvisBriefingId = jarvisBriefingId || existingBriefing?.jarvisBriefingId || "";
  if (!stableJarvisBriefingId) {
    res.status(400).json({ error: "jarvisBriefingId is required when creating a new briefing" });
    return;
  }

  const sourceStatus = safeText(row.sourceStatus, existingBriefing?.sourceStatus ?? "");
  const cancelReason = safeText(row.cancelReason);
  const detailText = packBriefingDetails(row);
  const signupPeople = toNumber(row.signupPeople);
  const contractPeople = toNumber(row.contractPeople);
  const now = new Date();

  try {
    if (isUserManagedBriefing(existingBriefingForImport)) {
      const imported = existingBriefing
        ? await prisma.briefing.findUnique({
            where: { id: existingBriefing.id },
            include: {
              review: true,
              evidences: true,
              snapshots: { orderBy: { capturedAt: "desc" } }
            }
          })
        : null;
      res.json({
        batchId: "",
        brokerId: broker.id,
        briefing: imported ? mapBriefing(imported) : null,
        detailImported: false,
        skipped: true
      });
      return;
    }

    const batch = await prisma.importBatch.create({
      data: {
        title: req.body?.title ?? `${now.toISOString().slice(0, 10)} ${safeText(row.title, existingBriefing?.title ?? "通告")} 详情导入`,
        source: "JARVIS_CHROME",
        importedAt: now,
        operatorName: "Chrome 导入",
        brokerCount: 1,
        briefingCount: 1,
        notes: "从鑫通告通告详情页导入单条通告详情"
      }
    });

    const briefing = await prisma.briefing.upsert({
      where: { jarvisBriefingId: stableJarvisBriefingId },
      update: {
        brokerId: broker.id,
        title: safeText(row.title, existingBriefing?.title ?? "未命名通告"),
        recruitmentType: safeText(row.recruitmentType, existingBriefing?.recruitmentType ?? ""),
        genderRequirement: safeText(row.genderRequirement, existingBriefing?.genderRequirement ?? ""),
        recruitCount: toNumber(row.recruitCount ?? existingBriefing?.recruitCount),
        workAddress: safeText(row.workAddress, existingBriefing?.workAddress ?? ""),
        workStartAt: parseNullableDate(row.workStartAt ?? row.workDate) ?? existingBriefing?.workStartAt,
        workEndAt: parseNullableDate(row.workEndAt) ?? existingBriefing?.workEndAt,
        publishedAt: parseNullableDate(row.publishedAt) ?? existingBriefing?.publishedAt,
        finishedAt: parseNullableDate(row.finishedAt) ?? existingBriefing?.finishedAt,
        salaryText: safeText(row.salaryText, existingBriefing?.salaryText ?? ""),
        requirementText: detailText || existingBriefing?.requirementText,
        sourceStatus
      },
      create: {
        jarvisBriefingId: stableJarvisBriefingId,
        brokerId: broker.id,
        title: safeText(row.title, "未命名通告"),
        recruitmentType: safeText(row.recruitmentType),
        genderRequirement: safeText(row.genderRequirement),
        recruitCount: toNumber(row.recruitCount),
        workAddress: safeText(row.workAddress),
        workStartAt: parseNullableDate(row.workStartAt ?? row.workDate),
        workEndAt: parseNullableDate(row.workEndAt),
        publishedAt: parseNullableDate(row.publishedAt),
        finishedAt: parseNullableDate(row.finishedAt),
        salaryText: safeText(row.salaryText),
        requirementText: detailText,
        sourceStatus
      }
    });

    await prisma.briefingSnapshot.upsert({
      where: {
        briefingId_importBatchId: {
          briefingId: briefing.id,
          importBatchId: batch.id
        }
      },
      update: {
        signupTimes: toNumber(row.signupTimes),
        contractTimes: toNumber(row.contractTimes),
        signupPeople,
        contractPeople,
        sourceStatus
      },
      create: {
        briefingId: briefing.id,
        importBatchId: batch.id,
        signupTimes: toNumber(row.signupTimes),
        contractTimes: toNumber(row.contractTimes),
        signupPeople,
        contractPeople,
        sourceStatus
      }
    });

    await upsertBriefingReviewFromImport(briefing.id, sourceStatus, cancelReason, now);
    await syncBriefingSigners(briefing.id, unpackBriefingDetails(detailText || existingBriefing?.requirementText).signedModelNames, now);

    const imported = await prisma.briefing.findUnique({
      where: { id: briefing.id },
      include: {
        review: true,
        evidences: true,
        snapshots: { orderBy: { capturedAt: "desc" } }
      }
    });
    res.json({
      batchId: batch.id,
      brokerId: broker.id,
      briefing: imported ? mapBriefing(imported) : mapBriefing(briefing),
      detailImported: Boolean(detailText)
    });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "通告详情导入失败" });
  }
});

app.listen(port, () => {
  console.log(`XTG review admin API running at http://localhost:${port}`);
});

async function importJarvisBriefingRows({
  brokerMiniProgramUserId,
  brokerId,
  rows,
  title
}: {
  brokerMiniProgramUserId?: string;
  brokerId?: string;
  rows: any[];
  title?: string;
}) {
  const broker = brokerId
    ? await prisma.broker.findUnique({ where: { id: brokerId } })
    : await prisma.broker.findUnique({ where: { miniProgramUserId: safeText(brokerMiniProgramUserId) } });
  if (!broker) {
    throw new Error("经纪人不存在");
  }

  const now = new Date();
  const batch = await prisma.importBatch.create({
    data: {
      title: title || `${now.toISOString().slice(0, 10)} ${broker.nickname} 通告导入`,
      source: "JARVIS_CHROME",
      importedAt: now,
      operatorName: "Chrome 导入",
      brokerCount: 1,
      briefingCount: rows.length,
      notes: `从鑫通告经纪人详情页导入 ${rows.length} 条通告`
    }
  });

  let importedCount = 0;
  let newBriefingCount = 0;
  let detailImportedCount = 0;
  for (const row of rows) {
    const jarvisBriefingId = safeText(row.jarvisBriefingId);
    if (!jarvisBriefingId) continue;

    const signupPeople = toNumber(row.signupPeople);
    const contractPeople = toNumber(row.contractPeople);
    const sourceStatus = safeText(row.sourceStatus);
    const cancelReason = safeText(row.cancelReason);
    const detailText = packBriefingDetails(row);
    const existingBriefing = await findBriefingForImport(jarvisBriefingId);
    if (isUserManagedBriefing(existingBriefing)) {
      importedCount += 1;
      continue;
    }
    if (!existingBriefing) newBriefingCount += 1;
    if (detailText) detailImportedCount += 1;
    const briefing = await prisma.briefing.upsert({
      where: { jarvisBriefingId },
      update: {
        brokerId: broker.id,
        title: safeText(row.title, "未命名通告"),
        recruitmentType: safeText(row.recruitmentType),
        genderRequirement: safeText(row.genderRequirement),
        recruitCount: toNumber(row.recruitCount),
        workAddress: safeText(row.workAddress),
        workStartAt: parseNullableDate(row.workStartAt ?? row.workDate),
        workEndAt: parseNullableDate(row.workEndAt),
        publishedAt: parseNullableDate(row.publishedAt),
        finishedAt: parseNullableDate(row.finishedAt),
        salaryText: safeText(row.salaryText),
        requirementText: detailText,
        sourceStatus
      },
      create: {
        jarvisBriefingId,
        brokerId: broker.id,
        title: safeText(row.title, "未命名通告"),
        recruitmentType: safeText(row.recruitmentType),
        genderRequirement: safeText(row.genderRequirement),
        recruitCount: toNumber(row.recruitCount),
        workAddress: safeText(row.workAddress),
        workStartAt: parseNullableDate(row.workStartAt ?? row.workDate),
        workEndAt: parseNullableDate(row.workEndAt),
        publishedAt: parseNullableDate(row.publishedAt),
        finishedAt: parseNullableDate(row.finishedAt),
        salaryText: safeText(row.salaryText),
        requirementText: detailText,
        sourceStatus
      }
    });

    await prisma.briefingSnapshot.upsert({
      where: {
        briefingId_importBatchId: {
          briefingId: briefing.id,
          importBatchId: batch.id
        }
      },
      update: {
        signupTimes: toNumber(row.signupTimes),
        contractTimes: toNumber(row.contractTimes),
        signupPeople,
        contractPeople,
        sourceStatus
      },
      create: {
        briefingId: briefing.id,
        importBatchId: batch.id,
        signupTimes: toNumber(row.signupTimes),
        contractTimes: toNumber(row.contractTimes),
        signupPeople,
        contractPeople,
        sourceStatus
      }
    });

    await upsertBriefingReviewFromImport(briefing.id, sourceStatus, cancelReason, now);
    await syncBriefingSigners(briefing.id, unpackBriefingDetails(detailText).signedModelNames, now);

    importedCount += 1;
  }

  return {
    batchId: batch.id,
    brokerId: broker.id,
    importedCount,
    newBriefingCount,
    detailImportedCount
  };
}

async function runAppleScript(script: string) {
  const { stdout } = await execFileAsync("osascript", ["-e", script], {
    maxBuffer: 1024 * 1024 * 8
  });
  return stdout.trim();
}

function formatChromeScrapeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("-1723") || message.includes("不允许访问")) {
    return "Chrome 已打开鑫通告页面，但禁止本系统读取页面内容。请在 Chrome 顶部菜单栏打开：显示/视图 > 开发者 > 允许来自 Apple 事件的 JavaScript，然后回到系统重新点击导入通告数据。";
  }
  if (message.includes("Application isn’t running") || message.includes("应用程序没有运行")) {
    return "Chrome 没有运行，请先打开并登录鑫通告管理系统，再重新点击导入通告数据。";
  }
  if (message.includes("execution error")) {
    return "Chrome 自动抓取失败，请确认 Chrome 已登录鑫通告，且已允许来自 Apple 事件的 JavaScript。";
  }
  return "Chrome 自动抓取失败，请确认 Chrome 已登录鑫通告，且该经纪人的发布通告页可正常打开。";
}

async function openChromeUrl(url: string, createTab = false) {
  const tabCommand = createTab
    ? `tell front window
    make new tab at end of tabs with properties {URL:${JSON.stringify(url)}}
    set active tab index to (count of tabs)
  end tell`
    : `set URL of active tab of front window to ${JSON.stringify(url)}`;
  await runAppleScript(`
tell application "Google Chrome"
  activate
  if (count of windows) = 0 then make new window
  ${tabCommand}
end tell
`);
}

async function getChromeActiveTabIndex() {
  const output = await runAppleScript(`
tell application "Google Chrome"
  if (count of windows) = 0 then return ""
  return active tab index of front window
end tell
`);
  const index = Number(output);
  return Number.isFinite(index) && index > 0 ? index : null;
}

async function closeChromeScratchTab(originalTabIndex: number | null) {
  if (!originalTabIndex) return;
  await runAppleScript(`
tell application "Google Chrome"
  if (count of windows) = 0 then return
  tell front window
    if (count of tabs) > 1 then close active tab
    if ${originalTabIndex} <= (count of tabs) then set active tab index to ${originalTabIndex}
  end tell
end tell
`);
}

async function executeChromeJavaScript(source: string) {
  return runAppleScript(`
tell application "Google Chrome"
  tell active tab of front window to execute javascript ${JSON.stringify(source)}
end tell
`);
}

async function waitForChromePage() {
  await new Promise((resolve) => setTimeout(resolve, 1600));
}

async function scrapeJarvisBrokersWithChrome() {
  const originalTabIndex = await getChromeActiveTabIndex().catch(() => null);
  try {
    await openChromeUrl("https://jarvis.tong-gao.com/user/list", true);
    await waitForChromePage();

    const rows: any[] = [];
    for (let pageIndex = 0; pageIndex < 30; pageIndex += 1) {
      const pageRowsText = await executeChromeJavaScript(jarvisBrokerListScraperSource());
      rows.push(...JSON.parse(pageRowsText || "[]"));
      const didClickNext = await executeChromeJavaScript(jarvisNextPageSource());
      if (didClickNext !== "true") break;
      await waitForChromePage();
    }

    return Array.from(
      new Map(rows.filter((row) => safeText(row.miniProgramUserId)).map((row) => [safeText(row.miniProgramUserId), row])).values()
    );
  } finally {
    await closeChromeScratchTab(originalTabIndex).catch(() => undefined);
  }
}

async function scrapeJarvisBriefingsWithChrome(brokerMiniProgramUserId: string) {
  const originalTabIndex = await getChromeActiveTabIndex().catch(() => null);
  try {
    await openChromeUrl(`https://jarvis.tong-gao.com/user/detail/${brokerMiniProgramUserId}?tab=briefing`, true);
    await waitForChromePage();

    const rows: any[] = [];
    for (let pageIndex = 0; pageIndex < 20; pageIndex += 1) {
      const pageRowsText = await executeChromeJavaScript(jarvisListScraperSource());
      rows.push(...JSON.parse(pageRowsText || "[]"));
      const didClickNext = await executeChromeJavaScript(jarvisNextPageSource());
      if (didClickNext !== "true") break;
      await waitForChromePage();
    }

    const uniqueRows = Array.from(new Map(rows.filter((row) => safeText(row.jarvisBriefingId)).map((row) => [safeText(row.jarvisBriefingId), row])).values());
    const detailedRows: any[] = [];
    for (const row of uniqueRows) {
      await openChromeUrl(`https://jarvis.tong-gao.com/business/briefing/${row.jarvisBriefingId}`);
      await waitForChromePage();
      try {
        const detailText = await executeChromeJavaScript(jarvisDetailScraperSource(row));
        detailedRows.push({ ...row, ...JSON.parse(detailText || "{}") });
      } catch {
        detailedRows.push(row);
      }
    }
    return detailedRows;
  } finally {
    await closeChromeScratchTab(originalTabIndex).catch(() => undefined);
  }
}

function jarvisBrokerListScraperSource() {
  return `
(() => {
  const compact = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const numberOf = (value) => Number((compact(value).match(/\\d+/) || ["0"])[0]);
  const pairOf = (value) => {
    const match = compact(value).match(/(\\d+)\\s*\\/\\s*(\\d+)/);
    return match ? [Number(match[1]), Number(match[2])] : [0, 0];
  };
  const dateMatches = (value) => compact(value).match(/20\\d{2}[-/]\\d{1,2}[-/]\\d{1,2}\\s+\\d{1,2}:\\d{2}(?::\\d{2})?/g) || [];
  const statusOf = (value) => {
    const text = compact(value);
    return (text.match(/永久封号|临时封号|限制发布|正常/) || ["正常"])[0];
  };
  const realNameOf = (value) => {
    const text = compact(value);
    return (text.match(/认证失败|认证中|已认证|未认证/) || ["未认证"])[0];
  };
  const rowNodes = Array.from(document.querySelectorAll("tbody tr, .el-table__body tr, .el-table__row, [role='row']"));
  const parsed = rowNodes.map((row) => {
    const cellNodes = Array.from(row.querySelectorAll("td, .el-table__cell, [role='cell'], [role='gridcell']"));
    const rawCells = cellNodes.map((cell) => String(cell.innerText || cell.textContent || ""));
    const cells = rawCells.map(compact).filter(Boolean);
    const rowText = compact(row.innerText);
    if (!rowText || /用户管理|关键词|注册起始|账号状态|实名认证/.test(rowText) && !/#\\s*\\d{16,}/.test(rowText)) return null;
    const id = (rowText.match(/#\\s*(\\d{16,})/) || rowText.match(/\\b(\\d{16,})\\b/) || [])[1];
    const firstCell = rawCells[0] || cells[0] || rowText;
    const firstLines = firstCell.split(/\\n|\\s{2,}/).map(compact).filter(Boolean);
    const phone = (firstCell.match(/\\b1\\d{10}\\b/) || rowText.match(/\\b1\\d{10}\\b/) || [""])[0];
    const nickname = firstLines.find((line) => !/^#?\\d+$/.test(line) && !/^1\\d{10}$/.test(line)) || firstCell.split(phone)[0] || "未命名经纪人";
    const dates = dateMatches(rowText);
    const pairCells = cells.filter((cell) => /\\d+\\s*\\/\\s*\\d+/.test(cell));
    const [signupTotalTimes, contractTotalTimes] = pairOf(pairCells[0] || "");
    const [signupTotalPeople, contractTotalPeople] = pairOf(pairCells[1] || "");
    const numericCells = cells.map((cell) => compact(cell)).filter((cell) => /^\\d+$/.test(cell));
    if (!id) return null;
    return {
      miniProgramUserId: id,
      nickname: compact(nickname).replace(/#\\s*\\d{16,}.*/, "") || "未命名经纪人",
      wechatPhone: phone,
      boundPhone: phone,
      realNameStatus: realNameOf(rowText),
      accountStatus: statusOf(rowText),
      registeredAt: dates[0] || "",
      lastLoginAt: dates[1] || "",
      violationCount: numberOf(numericCells[0] || ""),
      publishedBriefings: numberOf(numericCells[1] || ""),
      completedBriefings: numberOf(numericCells[2] || ""),
      signupTotalTimes,
      contractTotalTimes,
      signupTotalPeople,
      contractTotalPeople,
      listText: rowText
    };
  }).filter(Boolean);
  return JSON.stringify(parsed);
})()
`;
}

function jarvisListScraperSource() {
  return `
(() => {
  const compact = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const numberOf = (value) => Number((compact(value).match(/\\d+/) || ["0"])[0]);
  const dateOf = (value) => (compact(value).match(/20\\d{2}[-/]\\d{1,2}[-/]\\d{1,2}\\s+\\d{1,2}:\\d{2}(?::\\d{2})?/) || [""])[0];
  const pairOf = (value) => {
    const match = compact(value).match(/(\\d+)\\s*\\/\\s*(\\d+)/);
    return match ? [Number(match[1]), Number(match[2])] : [0, 0];
  };
  const parsed = Array.from(document.querySelectorAll("tbody tr")).map((row) => {
    const cells = Array.from(row.querySelectorAll("td")).map((cell) => compact(cell.innerText));
    const rowText = compact(row.innerText);
    const link = row.querySelector('a[href*="/business/briefing/"]');
    const href = link ? link.getAttribute("href") || "" : "";
    const id = (href.match(/briefing\\/(\\d+)/) || rowText.match(/#(\\d{16,})/) || [])[1];
    const status = (rowText.match(/已结束|已取消|报名中|进行中|待审核/) || [""])[0];
    const pairCell = cells.find((cell) => /\\d+\\s*\\/\\s*\\d+/.test(cell)) || rowText;
    const [signupPeople, contractPeople] = pairOf(pairCell);
    const title = compact((cells[0] || "").split("#")[0]).replace(/\\s+\\d{16,}$/, "");
    const createdAt = dateOf(rowText);
    if (!id || !title) return null;
    return {
      jarvisBriefingId: id,
      title,
      recruitCount: numberOf(cells[1]),
      sourceStatus: status || "-",
      cancelReason: compact(cells[3]) === "-" ? "" : compact(cells[3]),
      signupPeople,
      contractPeople,
      signupTimes: signupPeople,
      contractTimes: contractPeople,
      publishedAt: createdAt,
      workStartAt: createdAt,
      listText: rowText
    };
  }).filter(Boolean);
  return JSON.stringify(parsed);
})()
`;
}

function jarvisNextPageSource() {
  return `
(() => {
  const next = Array.from(document.querySelectorAll("button")).find((button) => /下一页/.test(button.innerText || button.textContent || ""));
  if (!next || next.disabled || next.getAttribute("aria-disabled") === "true") return false;
  next.click();
  return true;
})()
`;
}

function jarvisDetailScraperSource(fallbackRow: any) {
  return `
(() => {
  const fallback = ${JSON.stringify(fallbackRow)};
  const compact = (value) => String(value || "").replace(/\\s+/g, " ").trim();
  const body = compact(document.body.innerText);
  const labels = ["招聘类型","性别","招聘人数","截止时间","是否要求连档","是否已付保证金","发布人","创建时间","发布时间","取消原因","工作时间 & 地点","工作日期","工作时段","工作地点","薪资","工作要求","报名列表","签约列表","操作日志"];
  const between = (start, endLabels = labels) => {
    const startIndex = body.indexOf(start);
    if (startIndex < 0) return "";
    const rest = body.slice(startIndex + start.length).trim();
    const next = endLabels.filter((label) => label !== start).map((label) => rest.indexOf(label)).filter((index) => index >= 0).sort((a, b) => a - b)[0];
    return compact(next === undefined ? rest : rest.slice(0, next));
  };
  const title = (() => {
    const index = body.indexOf("导出活动详情");
    if (index < 0) return fallback.title;
    const after = body.slice(index + "导出活动详情".length).trim();
    return compact(after.split(/已结束|已取消|报名中|进行中|#/)[0]) || fallback.title;
  })();
  const signedSection = body.includes("签约列表")
    ? body.slice(body.indexOf("签约列表")).split(/操作日志|聊天记录\\s+操作日志/)[0]
    : "";
  const signedModelNames = (() => {
    const names = [];
    const metadataTokens = new Set(["报名列表","签约列表","模特","模特状态","状态","自荐","报名时间","操作","聊天记录","正常","已报名","待处理","待签约","已签约","已解约","-","—"]);
    const nicknameOf = (value, rowText) => {
      if (/该用户已注销|用户已注销|账号已注销|(?:^|\\s)已注销(?:\\s|$)/.test(rowText)) return "该用户已注销";
      return compact(value).split(/\\s+/).filter((token) => token && !metadataTokens.has(token) && !/^20\\d{2}[-/]\\d{1,2}[-/]\\d{1,2}$/.test(token) && !/^\\d{1,2}:\\d{2}(?::\\d{2})?$/.test(token)).join(" ").trim();
    };
    const push = (name, phone, userId = "") => {
      const cleanName = nicknameOf(name, name);
      if (!cleanName || !phone) return;
      names.push(userId ? cleanName + "（" + phone + "） #" + userId : cleanName + "（" + phone + "）");
    };
    const rowNodes = Array.from(document.querySelectorAll("tbody tr, .ant-table-row, tr"));
    rowNodes.forEach((row) => {
      const rowText = compact(row.innerText || row.textContent || "");
      if (!/已签约/.test(rowText)) return;
      const profileLink = row.querySelector('a[href*="/user/detail/"]');
      const linkedText = compact(profileLink?.innerText || profileLink?.textContent || profileLink?.getAttribute("title") || profileLink?.querySelector("img")?.getAttribute("alt") || "");
      const userId = (String(profileLink?.getAttribute("href") || "").match(/user\\/detail\\/(\\d{12,})/) || rowText.match(/#(\\d{12,})/) || [])[1] || "";
      const noIdText = rowText.replace(/#\\d{12,}/g, " ");
      const phone = (noIdText.match(/(?:^|\\D)(1\\d{10})(?:\\D|$)/) || noIdText.match(/(?:^|\\D)(\\d{6,15})(?:\\D|$)/) || [])[1] || "";
      const genderIndex = noIdText.search(/\\s(?:男|女|不限)\\s*·\\s*\\d{1,3}岁/);
      const phoneIndex = noIdText.indexOf(phone);
      const identityEnd = genderIndex >= 0 ? genderIndex : phoneIndex;
      const nameSource = identityEnd >= 0 ? noIdText.slice(0, identityEnd) : noIdText;
      const name = nicknameOf(linkedText, rowText) || nicknameOf(nameSource, rowText) || "未命名签约者";
      push(name, phone, userId);
    });
    const regex = /(.{1,45}?)\\s+(?:男|女|不限)\\s*·\\s*\\d{1,3}岁\\s*·\\s*(\\d{6,15})(?:\\s*[·・•]?\\s*#?(\\d{12,}))?\\s+已签约/g;
    let match;
    while ((match = regex.exec(signedSection))) {
      push(match[1], match[2], match[3] || "");
    }
    return Array.from(new Set(names));
  })();
  return JSON.stringify({
    jarvisBriefingId: fallback.jarvisBriefingId || (location.pathname.match(/briefing\\/(\\d{16,})/) || [])[1] || (body.match(/导出活动详情\\s+.*?#(\\d{16,})/) || [])[1] || "",
    title,
    recruitmentType: between("招聘类型", ["性别"]),
    genderRequirement: between("性别", ["招聘人数"]),
    recruitCount: Number((between("招聘人数", ["截止时间"]).match(/\\d+/) || [fallback.recruitCount || 0])[0]),
    publisherText: between("发布人", ["创建时间"]),
    publishedAt: between("发布时间", ["取消原因", "工作时间 & 地点"]) || fallback.publishedAt,
    cancelReason: between("取消原因", ["工作时间 & 地点", "工作日期", "工作时段", "工作地点", "薪资", "工作要求", "报名列表", "签约列表"]) || fallback.cancelReason,
    workDateText: between("工作日期", ["工作时段"]),
    workTimeText: between("工作时段", ["工作地点"]),
    workAddress: between("工作地点", ["薪资"]) || fallback.workAddress,
    salaryText: between("薪资", ["工作要求"]),
    requirementText: between("工作要求", ["操作日志"]),
    signedModelNames,
    rawText: body,
    signupPeople: fallback.signupPeople,
    contractPeople: fallback.contractPeople,
    signupTimes: fallback.signupTimes,
    contractTimes: fallback.contractTimes,
    sourceStatus: fallback.sourceStatus
  });
})()
`;
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function mapRealNameStatus(status: string) {
  if (status === "VERIFIED") return "已认证";
  if (status === "PENDING") return "认证中";
  if (status === "FAILED") return "认证失败";
  return "未认证";
}

function mapAccountStatus(status: string) {
  if (status === "LIMITED") return "限制发布";
  if (status === "TEMP_BANNED") return "临时封号";
  if (status === "PERM_BANNED") return "永久封号";
  return "正常";
}

function safeText(value: unknown, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function toNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function toRealNameStatus(value: unknown) {
  const text = safeText(value);
  if (text.includes("已认证")) return "VERIFIED";
  if (text.includes("认证中")) return "PENDING";
  if (text.includes("失败")) return "FAILED";
  return "UNVERIFIED";
}

function toAccountStatus(value: unknown) {
  const text = safeText(value);
  if (text.includes("限制")) return "LIMITED";
  if (text.includes("临时")) return "TEMP_BANNED";
  if (text.includes("永久")) return "PERM_BANNED";
  return "NORMAL";
}

function toReviewStatus(value: unknown) {
  const text = safeText(value).toLowerCase();
  if (text === "approved") return "APPROVED";
  if (text === "rejected") return "REJECTED";
  return "PENDING";
}

function sanitizeFileName(value: string) {
  return value.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_").slice(0, 120);
}

function decodeHeaderText(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function upsertBriefingReviewFromImport(
  briefingId: string,
  sourceStatus: string,
  cancelReason: string,
  importAt: Date
) {
  const existingReview = await prisma.briefingReview.findUnique({ where: { briefingId } });
  const nextReview = resolveImportReview(existingReview, sourceStatus, cancelReason, importAt);
  await prisma.briefingReview.upsert({
    where: { briefingId },
    update: {
      validPublishStatus: nextReview.validPublishStatus,
      validCompleteStatus: nextReview.validCompleteStatus,
      invalidReason: nextReview.invalidReason
    },
    create: {
      briefingId,
      validPublishStatus: nextReview.validPublishStatus,
      validCompleteStatus: nextReview.validCompleteStatus,
      invalidReason: nextReview.invalidReason
    }
  });
}

async function findBriefingForImport(jarvisBriefingId: string) {
  return prisma.briefing.findUnique({
    where: { jarvisBriefingId },
    include: {
      review: true,
      evidences: true
    }
  });
}

function isUserManagedBriefing(
  briefing: null | {
    review?: {
      validPublishStatus?: string;
      validCompleteStatus?: string;
      invalidReason?: string | null;
      reviewedAt?: Date | null;
    } | null;
    evidences?: Array<unknown>;
  }
) {
  if (!briefing) return false;
  if ((briefing.evidences?.length ?? 0) > 0) return true;
  if (briefing.review?.reviewedAt) return true;
  if ((briefing.review?.invalidReason ?? "").includes("凭证异议")) return true;
  return false;
}

function normalizeSignedModelNames(value: unknown) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => safeText(item)).filter(Boolean))];
  }
  const text = safeText(value);
  if (!text) return [];
  return [...new Set(text.split(/[、,，\n]+/).map((item) => safeText(item)).filter(Boolean))];
}

function parseSignedModelIdentity(value: string) {
  const text = value.trim();
  const jarvisUserId = text.match(/#(\d{12,})/)?.[1] ?? "";
  const textWithoutIds = text.replace(/#\d{12,}/g, "");
  const phone = textWithoutIds.match(/\d{6,15}/)?.[0] ?? "";
  const nickname = importedSignerNickname(text
    .replace(/#\d{12,}/g, "")
    .replace(/[（(]?\d{6,15}[）)]?/g, "")
    .replace(/[·\s]+$/g, "")
    .trim(), text) || "未命名签约者";
  return { jarvisUserId, phone, nickname };
}

async function syncBriefingSigners(briefingId: string, signedModelNames: string[], signedAt: Date) {
  for (const signedModelName of signedModelNames) {
    const identity = parseSignedModelIdentity(signedModelName);
    if (!identity.jarvisUserId) continue;
    const signer = await prisma.signerProfile.upsert({
      where: { jarvisUserId: identity.jarvisUserId },
      update: {
        nickname: isImportedSignerPlaceholder(identity.nickname) ? undefined : identity.nickname,
        phone: identity.phone || undefined
      },
      create: {
        jarvisUserId: identity.jarvisUserId,
        nickname: identity.nickname,
        phone: identity.phone || null
      }
    });
    await prisma.briefingSigner.upsert({
      where: { briefingId_signerId: { briefingId, signerId: signer.id } },
      update: { signedAt, sourceStatus: "已签约" },
      create: { briefingId, signerId: signer.id, signedAt, sourceStatus: "已签约" }
    });
  }
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => safeText(item)).filter(Boolean) : [];
}

function signerProfileData(row: any) {
  return {
    nickname: safeText(row.nickname ?? row.name, "未命名签约者"),
    phone: safeText(row.phone) || null,
    avatarUrl: safeText(row.avatarUrl) || null,
    userType: safeText(row.userType, "模特"),
    accountStatus: safeText(row.accountStatus, "正常"),
    gender: safeText(row.gender) || null,
    age: nullableNumber(row.age),
    birthDate: parseNullableDate(row.birthDate ?? row.birthday),
    region: safeText(row.region) || null,
    heightCm: nullableNumber(row.heightCm ?? row.height),
    weightKg: nullableNumber(row.weightKg ?? row.weight),
    bustCm: nullableNumber(row.bustCm ?? row.bust),
    waistCm: nullableNumber(row.waistCm ?? row.waist),
    hipCm: nullableNumber(row.hipCm ?? row.hip),
    shoulderCm: nullableNumber(row.shoulderCm ?? row.shoulder),
    shoeSize: safeText(row.shoeSize) || null,
    clothingSize: safeText(row.clothingSize) || null,
    tattoo: safeText(row.tattoo) || null,
    hairColor: safeText(row.hairColor) || null,
    hairLength: safeText(row.hairLength) || null,
    languages: safeText(row.languages) || null,
    bio: safeText(row.bio) || null,
    imageUrls: stringArray(row.imageUrls),
    videoUrls: stringArray(row.videoUrls),
    registeredAt: parseNullableDate(row.registeredAt),
    lastLoginAt: parseNullableDate(row.lastLoginAt),
    violationCount: nullableNumber(row.violationCount) ?? 0,
    acceptedBriefingCount: nullableNumber(row.acceptedBriefingCount) ?? 0,
    completedBriefingCount: nullableNumber(row.completedBriefingCount) ?? 0
  };
}

function extractSignedModelNames(value: unknown) {
  const text = safeText(value).replace(/\s+/g, " ");
  if (!text || !text.includes("签约列表")) return [];
  const signedSection = text.slice(text.indexOf("签约列表")).split("聊天记录 操作日志")[0];
  const names: string[] = [];
  const regex = /(.{1,45}?)\s+(?:男|女|不限)\s*·\s*\d{1,3}岁\s*·\s*(\d{6,15})(?:\s*[·・•]?\s*#?(\d{12,}))?\s+已签约/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(signedSection))) {
    const name = importedSignerNickname(safeText(match[1]), match[0]);
    if (name) names.push(match[3] ? `${name}（${match[2]}） #${match[3]}` : `${name}（${match[2]}）`);
  }
  return [...new Set(names.filter(Boolean))];
}

function packBriefingDetails(row: any) {
  const normalizedSignedModelNames = normalizeSignedModelNames(row.signedModelNames);
  const extractedSignedModelNames = extractSignedModelNames(row.rawText ?? row.requirementText);
  const signedModelNames = extractedSignedModelNames.some((name) => /#\d{12,}/.test(name))
    ? extractedSignedModelNames
    : normalizedSignedModelNames.length
      ? normalizedSignedModelNames
      : extractedSignedModelNames;
  const payload = {
    __xtgDetail: 1,
    cancelReason: safeText(row.cancelReason),
    requirementText: safeText(row.requirementText),
    publisherText: safeText(row.publisherText),
    workDateText: safeText(row.workDateText),
    workTimeText: safeText(row.workTimeText),
    signedModelNames,
    rawText: safeText(row.rawText)
  };
  if (!Object.values(payload).some((value) => (typeof value === "string" && value) || (Array.isArray(value) && value.length))) {
    return "";
  }
  return JSON.stringify(payload);
}

function unpackBriefingDetails(value: unknown) {
  const text = safeText(value);
  if (!text) {
    return {
      cancelReason: "",
      requirementText: "",
      publisherText: "",
      workDateText: "",
      workTimeText: "",
      signedModelNames: [] as string[]
    };
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed?.__xtgDetail === 1) {
      const normalizedSignedModelNames = normalizeSignedModelNames(parsed.signedModelNames);
      const extractedSignedModelNames = extractSignedModelNames(parsed.rawText);
      const signedModelNames = extractedSignedModelNames.some((name) => /#\d{12,}/.test(name))
        ? extractedSignedModelNames
        : normalizedSignedModelNames;
      return {
        cancelReason: safeText(parsed.cancelReason),
        requirementText: safeText(parsed.requirementText),
        publisherText: safeText(parsed.publisherText),
        workDateText: safeText(parsed.workDateText),
        workTimeText: safeText(parsed.workTimeText),
        signedModelNames
      };
    }
  } catch {
    // Old rows stored only the cancel reason in this column.
  }
  return {
    cancelReason: text,
    requirementText: "",
    publisherText: "",
    workDateText: "",
    workTimeText: "",
    signedModelNames: []
  };
}

function parseNullableDate(value: unknown) {
  const text = safeText(value);
  if (!text || text === "-") return null;
  const normalized = text.replace(/\//g, "-").replace(" ", "T");
  const date = new Date(normalized.length === 16 ? `${normalized}:00` : normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function findSeedReviewStartAt(brokerId: string) {
  const broker = await prisma.broker.findUnique({
    where: { id: brokerId },
    include: {
      snapshots: { orderBy: { capturedAt: "asc" }, take: 1 },
      promotions: { where: { toLevel: "SEED" }, orderBy: { promotedAt: "desc" }, take: 1 }
    }
  });
  if (!broker?.seedPhase) return null;
  return broker.seedProgramJoinedAt
    ?? broker.promotions[0]?.promotedAt
    ?? broker.snapshots[0]?.capturedAt
    ?? broker.createdAt;
}

function mapReviewStatus(status?: string) {
  if (status === "APPROVED") return "approved";
  if (status === "REJECTED") return "rejected";
  return "pending";
}

function mapBroker(broker: any) {
  const briefingRows = broker.briefings ?? [];
  const latestBrokerSnapshot = broker.snapshots?.[0];
  const earliestBrokerSnapshot = broker.snapshots?.[broker.snapshots.length - 1];
  const latestSeedPromotion = broker.promotions?.[0];
  const referrerRelation = broker.refereeRelations?.[0];
  const latestRefereeRelation = broker.referrerRelations?.[0];
  const seedQualifiedAt = broker.brokerLevel === "SEED"
    ? latestSeedPromotion?.promotedAt ?? earliestBrokerSnapshot?.capturedAt ?? broker.createdAt
    : null;
  const seedProgramJoinedAt = broker.seedProgramJoinedAt ?? seedQualifiedAt;
  const snapshots = briefingRows.flatMap((briefing: any) => briefing.snapshots ?? []);
  return {
    id: broker.id,
    miniProgramUserId: broker.miniProgramUserId,
    nickname: broker.nickname,
    wechatPhone: broker.wechatPhone ?? "",
    boundPhone: broker.boundPhone ?? "",
    realNameStatus: mapRealNameStatus(broker.realNameStatus),
    accountStatus: mapAccountStatus(broker.accountStatus),
    brokerLevel: broker.brokerLevel === "SEED" ? "seed" : "normal",
    seedPhase: broker.seedPhase ?? null,
    seedProgramJoinedAt: broker.seedPhase && seedProgramJoinedAt ? formatDateTime(seedProgramJoinedAt) : null,
    seedQualifiedAt: seedQualifiedAt ? formatDateTime(seedQualifiedAt) : null,
    referralUnlocked: broker.referralUnlocked,
    referrerNickname: referrerRelation?.referrer?.nickname ?? null,
    referrerBoundAt: referrerRelation?.boundAt ? formatDateTime(referrerRelation.boundAt) : null,
    refereeCount: broker._count?.referrerRelations ?? broker.referrerRelations?.length ?? 0,
    latestRefereeBoundAt: latestRefereeRelation?.boundAt ? formatDateTime(latestRefereeRelation.boundAt) : null,
    registeredAt: formatDateTime(broker.registeredAt),
    lastLoginAt: formatDateTime(broker.lastLoginAt),
    violationCount: broker.violationCount,
    publishedBriefings: latestBrokerSnapshot?.publishedBriefings ?? briefingRows.length,
    completedBriefings: latestBrokerSnapshot?.completedBriefings ?? briefingRows.filter((briefing: any) => briefing.sourceStatus === "已结束").length,
    signupTotalTimes: latestBrokerSnapshot?.signupTotalTimes ?? snapshots.reduce((total: number, snapshot: any) => total + snapshot.signupTimes, 0),
    contractTotalTimes: latestBrokerSnapshot?.contractTotalTimes ?? snapshots.reduce((total: number, snapshot: any) => total + snapshot.contractTimes, 0),
    signupTotalPeople: latestBrokerSnapshot?.signupTotalPeople ?? snapshots.reduce((total: number, snapshot: any) => total + snapshot.signupPeople, 0),
    contractTotalPeople: latestBrokerSnapshot?.contractTotalPeople ?? snapshots.reduce((total: number, snapshot: any) => total + snapshot.contractPeople, 0)
  };
}

function mapReferralNode(broker: any) {
  const mapped = mapBroker(broker);
  return {
    id: mapped.id,
    nickname: mapped.nickname,
    phone: mapped.boundPhone || mapped.wechatPhone,
    brokerLevel: mapped.brokerLevel,
    seedPhase: mapped.seedPhase,
    seedProgramJoinedAt: mapped.seedProgramJoinedAt,
    seedQualifiedAt: mapped.seedQualifiedAt,
    referralUnlocked: mapped.referralUnlocked,
    validPublishCount: mapped.publishedBriefings,
    validCompleteCount: mapped.completedBriefings
  };
}

function mapSignerProfile(signer: any) {
  const imageUrls = Array.isArray(signer.imageUrls) ? signer.imageUrls.filter((item: unknown) => typeof item === "string") : [];
  const videoUrls = Array.isArray(signer.videoUrls) ? signer.videoUrls.filter((item: unknown) => typeof item === "string") : [];
  return {
    id: signer.id,
    jarvisUserId: signer.jarvisUserId,
    nickname: signer.nickname,
    phone: signer.phone ?? "",
    avatarUrl: signer.avatarUrl ?? "",
    userType: signer.userType,
    accountStatus: signer.accountStatus,
    gender: signer.gender ?? "",
    age: signer.age ?? null,
    birthDate: signer.birthDate ? formatDateTime(signer.birthDate).split(" ")[0] : "",
    region: signer.region ?? "",
    heightCm: signer.heightCm ?? null,
    weightKg: signer.weightKg ?? null,
    bustCm: signer.bustCm ?? null,
    waistCm: signer.waistCm ?? null,
    hipCm: signer.hipCm ?? null,
    shoulderCm: signer.shoulderCm ?? null,
    shoeSize: signer.shoeSize ?? "",
    clothingSize: signer.clothingSize ?? "",
    tattoo: signer.tattoo ?? "",
    hairColor: signer.hairColor ?? "",
    hairLength: signer.hairLength ?? "",
    languages: signer.languages ?? "",
    bio: signer.bio ?? "",
    imageUrls,
    videoUrls,
    registeredAt: signer.registeredAt ? formatDateTime(signer.registeredAt) : "",
    lastLoginAt: signer.lastLoginAt ? formatDateTime(signer.lastLoginAt) : "",
    violationCount: signer.violationCount,
    acceptedBriefingCount: signer.acceptedBriefingCount,
    completedBriefingCount: signer.completedBriefingCount,
    briefingHistory: (signer.briefings ?? []).map((item: any) => ({
      id: item.briefing.id,
      title: item.briefing.title,
      publishedAt: item.briefing.publishedAt ? formatDateTime(item.briefing.publishedAt) : "",
      signedAt: item.signedAt ? formatDateTime(item.signedAt) : "",
      sourceStatus: item.sourceStatus,
      brokerNickname: item.briefing.broker?.nickname ?? ""
    }))
  };
}

function mapBriefing(briefing: any) {
  const latestSnapshot = briefing.snapshots?.[0];
  const firstSignedSnapshot = [...(briefing.snapshots ?? [])]
    .reverse()
    .find((snapshot: any) => snapshot.contractPeople > 0);
  const details = unpackBriefingDetails(briefing.requirementText);
  const detailImported = Boolean(
    details.publisherText || details.workTimeText || details.requirementText || details.cancelReason || details.signedModelNames.length
  );
  return {
    id: briefing.id,
    jarvisBriefingId: briefing.jarvisBriefingId,
    brokerId: briefing.brokerId,
    title: briefing.title,
    recruitmentType: briefing.recruitmentType ?? "-",
    genderRequirement: briefing.genderRequirement ?? "-",
    recruitCount: briefing.recruitCount ?? 0,
    workAddress: briefing.workAddress ?? "-",
    workDate: details.workDateText || formatDateTime(briefing.workStartAt).split(" ")[0] || "-",
    workTime: details.workTimeText || "-",
    publishedAt: formatDateTime(briefing.publishedAt),
    finishedAt: briefing.finishedAt ? formatDateTime(briefing.finishedAt) : "",
    importedAt: formatDateTime(latestSnapshot?.capturedAt ?? briefing.createdAt),
    firstSignedAt: firstSignedSnapshot?.capturedAt ? formatDateTime(firstSignedSnapshot.capturedAt) : "",
    sourceStatus: briefing.sourceStatus ?? "-",
    cancelReason: details.cancelReason || (briefing.sourceStatus?.includes("已取消") ? safeText(briefing.sourceStatus) : ""),
    requirementText: details.requirementText,
    publisherText: details.publisherText,
    signedModelNames: details.signedModelNames,
    signedModelCount: details.signedModelNames.length,
    detailImported,
    detailUrl: `https://jarvis.tong-gao.com/business/briefing/${briefing.jarvisBriefingId}`,
    signupTimes: latestSnapshot?.signupTimes ?? 0,
    contractTimes: latestSnapshot?.contractTimes ?? 0,
    signupPeople: latestSnapshot?.signupPeople ?? 0,
    contractPeople: latestSnapshot?.contractPeople ?? 0,
    validPublishStatus: mapReviewStatus(briefing.review?.validPublishStatus),
    validCompleteStatus: mapReviewStatus(briefing.review?.validCompleteStatus),
    invalidReason: briefing.review?.invalidReason ?? "",
    reviewedAt: briefing.review?.reviewedAt ? formatDateTime(briefing.review.reviewedAt) : "",
    evidenceCount: briefing.evidences?.length ?? 0,
    evidenceFiles: (briefing.evidences ?? []).map(mapEvidence),
    salaryText: briefing.salaryText ?? "-"
  };
}

function mapEvidence(evidence: any) {
  return {
    id: evidence.id,
    brokerId: evidence.brokerId,
    briefingId: evidence.briefingId ?? null,
    fileName: evidence.fileName,
    fileUrl: evidence.fileUrl,
    fileType: evidence.fileType ?? "",
    matchedAt: formatDateTime(evidence.matchedAt),
    uploadedAt: formatDateTime(evidence.uploadedAt)
  };
}
