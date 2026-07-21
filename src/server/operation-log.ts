import type { Request, Response, NextFunction } from "express";
import { prisma } from "./prisma";

const actionLabels: Record<string, string> = {
  POST: "新增或执行",
  PATCH: "更新",
  PUT: "更新",
  DELETE: "删除"
};

function moduleForPath(path: string) {
  if (path.includes("/sync")) return "数据同步";
  if (path.includes("/backup")) return "数据备份";
  if (path.includes("/auth")) return "系统用户";
  if (path.includes("/settlement")) return "结算管理";
  if (path.includes("/briefing")) return "通告审核";
  if (path.includes("/broker")) return "经纪人管理";
  return "系统操作";
}

export async function writeOperationLog(input: {
  actor?: string;
  action: string;
  module: string;
  method?: string;
  path?: string;
  result?: string;
  detail?: string;
  ipAddress?: string;
}) {
  try {
    await prisma.operationLog.create({
      data: {
        actor: input.actor || "系统",
        action: input.action,
        module: input.module,
        method: input.method,
        path: input.path,
        result: input.result || "成功",
        detail: input.detail,
        ipAddress: input.ipAddress
      }
    });
  } catch (error) {
    console.error("操作日志写入失败", error);
  }
}

export function operationLogMiddleware(req: Request, res: Response, next: NextFunction) {
  const hasDedicatedLog = req.path.startsWith("/operation-logs")
    || req.path === "/data-sync/run"
    || req.path.startsWith("/system-backups");
  if (!actionLabels[req.method] || hasDedicatedLog) {
    next();
    return;
  }
  const startedAt = Date.now();
  const encodedActor = String(req.header("x-system-account") || "system");
  let actor = encodedActor;
  try { actor = decodeURIComponent(encodedActor); } catch { actor = "系统"; }
  res.on("finish", () => {
    void writeOperationLog({
      actor,
      action: actionLabels[req.method],
      module: moduleForPath(req.path),
      method: req.method,
      path: req.originalUrl,
      result: res.statusCode < 400 ? "成功" : "失败",
      detail: `HTTP ${res.statusCode} · ${Date.now() - startedAt}ms`,
      ipAddress: req.ip
    });
  });
  next();
}
