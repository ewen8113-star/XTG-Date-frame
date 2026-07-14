const backendInput = document.querySelector("#backend-url");
const backendStatus = document.querySelector("#backend-status");
const sourceTitle = document.querySelector("#source-title");
const sourceType = document.querySelector("#source-type");
const taskStatus = document.querySelector("#task-status");
const importButtons = [document.querySelector("#import-brokers"), document.querySelector("#import-briefings")];
let sourceTabId = Number(new URLSearchParams(location.search).get("sourceTabId")) || null;

initialize();

document.querySelector("#save-backend").addEventListener("click", saveBackend);
document.querySelector("#refresh-source").addEventListener("click", findSourceTab);
document.querySelector("#import-brokers").addEventListener("click", () => startImport("brokers"));
document.querySelector("#import-briefings").addEventListener("click", () => startImport("briefings"));

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.xtgImportStatus?.newValue) renderTaskStatus(changes.xtgImportStatus.newValue);
});

async function initialize() {
  const stored = await chrome.storage.local.get(["backendUrl", "xtgImportStatus"]);
  backendInput.value = stored.backendUrl || "";
  if (stored.xtgImportStatus) renderTaskStatus(stored.xtgImportStatus);
  if (stored.backendUrl) await registerSystemBridge(stored.backendUrl).catch(() => undefined);
  await refreshSource();
}

async function saveBackend() {
  try {
    const backendUrl = normalizeUrl(backendInput.value);
    const url = new URL(backendUrl);
    const originPattern = `${url.protocol}//${url.hostname}/*`;
    const granted = await chrome.permissions.request({ origins: [originPattern] });
    if (!granted) throw new Error("未获得访问运营后台的权限。");
    backendStatus.textContent = "正在连接…";
    const response = await fetch(`${backendUrl}/api/health`, { cache: "no-store" });
    if (!response.ok) throw new Error(`连接失败：HTTP ${response.status}`);
    const value = await response.json();
    if (!value.ok) throw new Error("运营后台没有返回正常状态。");
    await chrome.storage.local.set({ backendUrl });
    await registerSystemBridge(backendUrl);
    backendInput.value = backendUrl;
    backendStatus.textContent = "连接成功，系统按钮已接入扩展。请刷新已打开的系统页面。";
  } catch (error) {
    backendStatus.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function refreshSource() {
  if (!sourceTabId) return findSourceTab();
  const context = await chrome.runtime.sendMessage({ type: "GET_SOURCE_CONTEXT", sourceTabId });
  if (!context?.ok) return findSourceTab();
  renderSource(context);
}

async function findSourceTab() {
  sourceTitle.textContent = "正在查找…";
  const context = await chrome.runtime.sendMessage({ type: "FIND_JARVIS_TAB" });
  if (!context?.ok) {
    sourceTabId = null;
    sourceTitle.textContent = context?.error || "没有找到鑫通告页面";
    sourceType.textContent = "未识别";
    return;
  }
  sourceTabId = context.tabId;
  renderSource(context);
}

function renderSource(context) {
  sourceTitle.textContent = context.title || context.url;
  sourceType.textContent = ({
    "broker-list": "经纪人列表",
    "broker-briefings": "经纪人通告列表",
    "briefing-detail": "通告详情"
  })[context.pageType] || "暂不支持的页面";
}

async function startImport(mode) {
  if (!sourceTabId) {
    renderTaskStatus({ tone: "error", message: "请先打开并识别鑫通告页面。" });
    return;
  }
  setBusy(true);
  renderTaskStatus({ tone: "running", message: "正在开始导入…" });
  try {
    const response = await chrome.runtime.sendMessage({ type: "START_IMPORT", mode, sourceTabId });
    if (!response?.ok) throw new Error(response?.error || "导入失败");
    renderTaskStatus({ tone: "success", message: response.message });
  } catch (error) {
    renderTaskStatus({ tone: "error", message: error instanceof Error ? error.message : String(error) });
  } finally {
    setBusy(false);
  }
}

function renderTaskStatus(status) {
  taskStatus.className = `task-status ${status.tone || "neutral"}`;
  taskStatus.textContent = status.message || "等待操作";
}

function setBusy(value) {
  for (const button of importButtons) button.disabled = value;
}

function normalizeUrl(value) {
  const trimmed = String(value || "").trim().replace(/\/$/, "");
  if (!trimmed) throw new Error("请输入运营后台地址。");
  const url = new URL(trimmed);
  if (!/^https?:$/.test(url.protocol)) throw new Error("后台地址必须以 http:// 或 https:// 开头。");
  return url.origin;
}

async function registerSystemBridge(backendUrl) {
  const result = await chrome.runtime.sendMessage({ type: "REGISTER_SYSTEM_BRIDGE", backendUrl });
  if (!result?.ok) throw new Error(result?.error || "系统按钮接入扩展失败。");
}
