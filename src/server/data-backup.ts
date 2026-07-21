import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { writeOperationLog } from "./operation-log";

const backupRoot = path.resolve(process.cwd(), "backups");
const uploadRoot = path.resolve(process.cwd(), "uploads");
const dumpCommand = process.env.MYSQLDUMP_PATH || "/opt/homebrew/opt/mysql-client/bin/mysqldump";
const mysqlCommand = process.env.MYSQL_PATH || "/opt/homebrew/opt/mysql-client/bin/mysql";

function databaseArgs() {
  const url = new URL(String(process.env.DATABASE_URL || ""));
  if (!url.hostname || !url.pathname.slice(1)) throw new Error("DATABASE_URL 未配置完整，无法备份");
  const common = ["--host", url.hostname, "--port", url.port || "3306", "--user", decodeURIComponent(url.username)];
  return { common, database: url.pathname.slice(1), password: decodeURIComponent(url.password) };
}

function backupName(date = new Date()) {
  const stamp = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
  }).format(date).replace(/[ :]/g, "-");
  return `xtg-system-backup-${stamp}`;
}

async function runToFile(command: string, args: string[], outputPath: string, password: string) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  const child = spawn(command, args, { env: { ...process.env, MYSQL_PWD: password }, stdio: ["ignore", "pipe", "pipe"] });
  let errorText = "";
  child.stderr.on("data", (chunk) => { errorText += String(chunk); });
  await Promise.all([
    pipeline(child.stdout, createWriteStream(outputPath)),
    new Promise<void>((resolve, reject) => child.once("close", (code) => code === 0 ? resolve() : reject(new Error(errorText || `备份命令退出：${code}`))))
  ]);
}

async function runFromFile(command: string, args: string[], inputPath: string, password: string) {
  const child = spawn(command, args, { env: { ...process.env, MYSQL_PWD: password }, stdio: ["pipe", "ignore", "pipe"] });
  let errorText = "";
  child.stderr.on("data", (chunk) => { errorText += String(chunk); });
  await Promise.all([
    pipeline(createReadStream(inputPath), child.stdin),
    new Promise<void>((resolve, reject) => child.once("close", (code) => code === 0 ? resolve() : reject(new Error(errorText || `还原命令退出：${code}`))))
  ]);
}

export async function createSystemBackup(actor: string, reason = "管理员手动备份") {
  const name = backupName();
  const folder = path.join(backupRoot, name);
  const databaseFile = path.join(folder, "database.sql");
  const uploadsFolder = path.join(folder, "uploads");
  const { common, database, password } = databaseArgs();
  await runToFile(dumpCommand, [...common, "--single-transaction", "--routines", "--triggers", "--default-character-set=utf8mb4", database], databaseFile, password);
  await fs.cp(uploadRoot, uploadsFolder, { recursive: true, force: false, errorOnExist: false });
  await fs.writeFile(path.join(folder, "manifest.json"), JSON.stringify({ name, createdAt: new Date().toISOString(), actor, reason, timeZone: "Asia/Shanghai" }, null, 2));
  await writeOperationLog({ actor, action: "创建备份", module: "数据备份", detail: `${name} · ${reason}` });
  return readBackup(name);
}

async function readBackup(name: string) {
  const folder = path.join(backupRoot, path.basename(name));
  const manifest = JSON.parse(await fs.readFile(path.join(folder, "manifest.json"), "utf8"));
  const databaseStat = await fs.stat(path.join(folder, "database.sql"));
  return { ...manifest, sizeBytes: databaseStat.size };
}

export async function listSystemBackups() {
  await fs.mkdir(backupRoot, { recursive: true });
  const entries = await fs.readdir(backupRoot, { withFileTypes: true });
  const backups = await Promise.all(entries.filter((entry) => entry.isDirectory()).map((entry) => readBackup(entry.name).catch(() => null)));
  return backups.filter(Boolean).sort((left: any, right: any) => right.createdAt.localeCompare(left.createdAt));
}

export async function restoreSystemBackup(name: string, actor: string, confirmation: string) {
  if (confirmation !== "确认还原") throw new Error("请输入“确认还原”后再执行");
  const safeName = path.basename(name);
  const folder = path.join(backupRoot, safeName);
  await fs.access(path.join(folder, "manifest.json"));
  await createSystemBackup(actor, `还原 ${safeName} 前自动保护备份`);
  const { common, database, password } = databaseArgs();
  await runFromFile(mysqlCommand, [...common, "--default-character-set=utf8mb4", database], path.join(folder, "database.sql"), password);
  const savedUploads = path.join(folder, "uploads");
  await fs.access(savedUploads).then(() => fs.cp(savedUploads, uploadRoot, { recursive: true, force: true })).catch(() => undefined);
  await writeOperationLog({ actor, action: "还原备份", module: "数据备份", detail: safeName });
  return { ok: true, name: safeName };
}
