const JARVIS_ORIGIN = "https://jarvis.tong-gao.com";
const STATUS_KEY = "xtgImportStatus";
const POLL_ALARM = "xtg-browser-import-poll";
let polling = false;

ensurePolling();
chrome.runtime.onInstalled.addListener(ensurePolling);
chrome.runtime.onStartup.addListener(ensurePolling);
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === POLL_ALARM) pollForJobs();
});

chrome.action.onClicked.addListener((tab) => {
  const sourceTabId = Number.isInteger(tab.id) ? tab.id : "";
  chrome.tabs.create({ url: chrome.runtime.getURL(`tool.html?sourceTabId=${sourceTabId}`) });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_SOURCE_CONTEXT") {
    getSourceContext(message.sourceTabId).then(sendResponse).catch((error) => sendResponse(failure(error)));
    return true;
  }
  if (message?.type === "FIND_JARVIS_TAB") {
    findJarvisTab().then(sendResponse).catch((error) => sendResponse(failure(error)));
    return true;
  }
  if (message?.type === "START_IMPORT") {
    runImport(message).then(sendResponse).catch((error) => sendResponse(failure(error)));
    return true;
  }
  if (message?.type === "REGISTER_SYSTEM_BRIDGE") {
    registerSystemBridge(message.backendUrl).then(sendResponse).catch((error) => sendResponse(failure(error)));
    return true;
  }
  if (message?.type === "START_IMPORT_FROM_SYSTEM") {
    runSystemImport(message, _sender).then(sendResponse).catch((error) => sendResponse(failure(error)));
    return true;
  }
  return false;
});

async function registerSystemBridge(backendUrl) {
  const pattern = originPatternOf(backendUrl);
  const existing = await chrome.scripting.getRegisteredContentScripts();
  const bridge = existing.find((item) => item.id === "xtg-system-bridge");
  if (bridge) await chrome.scripting.unregisterContentScripts({ ids: [bridge.id] });
  await chrome.scripting.registerContentScripts([{
    id: "xtg-system-bridge",
    matches: [pattern],
    js: ["system-bridge.js"],
    runAt: "document_start",
    persistAcrossSessions: true
  }]);
  const tabs = await chrome.tabs.query({ url: pattern });
  for (const tab of tabs) {
    if (tab.id) await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["system-bridge.js"] }).catch(() => undefined);
  }
  return { ok: true };
}

async function runSystemImport(message, sender) {
  const { backendUrl = "" } = await chrome.storage.local.get("backendUrl");
  if (!backendUrl || !sender.tab?.url || new URL(sender.tab.url).origin !== new URL(backendUrl).origin) {
    throw new Error("当前系统页面没有获得扩展授权，请在扩展工具中重新保存运营后台地址。");
  }
  return executeSystemImport(message, backendUrl);
}

async function executeSystemImport(message, backendUrl) {
  if (!["brokers", "briefings", "briefing-detail"].includes(message.mode)) throw new Error("不支持的导入类型。");
  if (message.mode === "briefings" && !message.brokerMiniProgramUserId) throw new Error("缺少经纪人 ID，无法读取通告。");
  if (message.mode === "briefing-detail" && !message.jarvisBriefingId) throw new Error("缺少通告 ID，无法读取通告详情。");

  const url = message.mode === "brokers"
    ? `${JARVIS_ORIGIN}/user/list`
    : message.mode === "briefings"
      ? `${JARVIS_ORIGIN}/user/detail/${message.brokerMiniProgramUserId}?tab=briefing`
      : `${JARVIS_ORIGIN}/business/briefing/${message.jarvisBriefingId}`;
  const sourceTab = await chrome.tabs.create({ url, active: false });
  if (!sourceTab.id) throw new Error("无法打开鑫通告页面。");
  try {
    await waitForTabComplete(sourceTab.id);
    await delay(1800);
    if (message.mode === "briefing-detail") {
      await setStatus("running", `正在读取通告详情：${message.title || message.jarvisBriefingId}`);
      const detail = await sendTabMessage(sourceTab.id, {
        type: "SCRAPE_BRIEFING_DETAIL",
        fallback: { jarvisBriefingId: message.jarvisBriefingId, title: message.title || "" }
      });
      const result = await postJson(backendUrl, "/api/import/jarvis-briefing-detail", {
        row: {
          ...detail,
          briefingId: message.briefingId,
          brokerMiniProgramUserId: message.brokerMiniProgramUserId
        },
        title: `${dateText()} Edge 扩展通告详情导入`
      });
      await setStatus("success", "当前通告详情和签约人员名单已导入。 ");
      return { ok: true, message: "当前通告详情和签约人员名单已导入。", result };
    }
    return await runImport({ mode: message.mode, sourceTabId: sourceTab.id });
  } finally {
    await chrome.tabs.remove(sourceTab.id).catch(() => undefined);
  }
}

async function ensurePolling() {
  await chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 });
  await pollForJobs();
}

async function pollForJobs() {
  if (polling) return;
  polling = true;
  try {
    const stored = await chrome.storage.local.get(["backendUrl", "workerId"]);
    const backendUrl = stored.backendUrl || "";
    if (!backendUrl) return;
    const workerId = stored.workerId || crypto.randomUUID();
    if (!stored.workerId) await chrome.storage.local.set({ workerId });
    const response = await fetch(`${backendUrl}/api/browser-import/jobs/next?workerId=${encodeURIComponent(workerId)}`, { cache: "no-store" });
    if (response.status === 204) return;
    const job = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(job.error || `领取导入任务失败：${response.status}`);
    try {
      const result = await executeSystemImport({ ...job.payload, mode: job.mode }, backendUrl);
      await postJson(backendUrl, `/api/browser-import/jobs/${job.id}/complete`, { workerId, result });
    } catch (error) {
      await postJson(backendUrl, `/api/browser-import/jobs/${job.id}/complete`, {
        workerId,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  } catch (error) {
    await setStatus("error", error instanceof Error ? error.message : String(error));
  } finally {
    polling = false;
  }
}

async function runImport({ mode, sourceTabId }) {
  const { backendUrl = "" } = await chrome.storage.local.get("backendUrl");
  if (!backendUrl) throw new Error("请先保存运营后台地址并完成连接测试。");
  const context = await getSourceContext(sourceTabId);
  if (!context.ok) throw new Error(context.error);

  await setStatus("running", mode === "brokers" ? "正在读取经纪人列表…" : "正在读取通告列表…");
  try {
    const result = mode === "brokers"
      ? await importBrokers(sourceTabId, backendUrl)
      : await importBriefings(sourceTabId, backendUrl, context);
    await setStatus("success", result.message);
    return { ok: true, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setStatus("error", message);
    throw error;
  }
}

async function importBrokers(tabId, backendUrl) {
  const context = await getSourceContext(tabId);
  if (context.pageType !== "broker-list") {
    throw new Error("请先在鑫通告打开“用户管理/经纪人列表”页面。");
  }
  const rows = await collectPages(tabId, "SCRAPE_BROKERS_PAGE", "miniProgramUserId", 30);
  if (rows.length === 0) throw new Error("当前页面没有识别到经纪人数据，请确认已经登录且列表已显示。");
  const result = await postJson(backendUrl, "/api/import/jarvis-brokers", {
    rows,
    title: `${dateText()} Edge 扩展经纪人导入`
  });
  return {
    message: `导入完成：读取 ${rows.length} 位经纪人，写入 ${result.importedCount ?? rows.length} 位。`,
    result
  };
}

async function importBriefings(tabId, backendUrl, context) {
  if (context.pageType !== "broker-briefings" || !context.brokerMiniProgramUserId) {
    throw new Error("请先打开某位经纪人的详情页，并切换到通告列表。");
  }
  const rows = await collectPages(tabId, "SCRAPE_BRIEFINGS_PAGE", "jarvisBriefingId", 20);
  if (rows.length === 0) throw new Error("当前页面没有识别到通告数据，请确认通告列表已显示。");

  const detailedRows = [];
  let scratchTabId = null;
  try {
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      await setStatus("running", `正在读取通告详情 ${index + 1}/${rows.length}：${row.title}`);
      const url = `${JARVIS_ORIGIN}/business/briefing/${row.jarvisBriefingId}`;
      if (scratchTabId === null) {
        const tab = await chrome.tabs.create({ url, active: false });
        scratchTabId = tab.id;
      } else {
        await chrome.tabs.update(scratchTabId, { url });
      }
      await waitForTabComplete(scratchTabId);
      try {
        const detail = await sendTabMessage(scratchTabId, { type: "SCRAPE_BRIEFING_DETAIL", fallback: row });
        detailedRows.push({ ...row, ...detail });
      } catch {
        detailedRows.push(row);
      }
    }
  } finally {
    if (scratchTabId !== null) await chrome.tabs.remove(scratchTabId).catch(() => undefined);
  }

  const result = await postJson(backendUrl, "/api/import/jarvis-briefings", {
    brokerMiniProgramUserId: context.brokerMiniProgramUserId,
    rows: detailedRows,
    title: `${dateText()} Edge 扩展通告导入`
  });
  return {
    message: `导入完成：读取 ${rows.length} 条通告，详情 ${result.detailImportedCount ?? 0} 条。`,
    result
  };
}

async function collectPages(tabId, scrapeType, uniqueKey, maxPages) {
  const values = new Map();
  for (let page = 0; page < maxPages; page += 1) {
    const rows = await sendTabMessage(tabId, { type: scrapeType });
    for (const row of Array.isArray(rows) ? rows : []) {
      if (row?.[uniqueKey]) values.set(String(row[uniqueKey]), row);
    }
    const next = await sendTabMessage(tabId, { type: "CLICK_NEXT_PAGE" });
    if (!next?.changed) break;
  }
  return [...values.values()];
}

async function getSourceContext(tabId) {
  if (!Number.isInteger(Number(tabId))) return { ok: false, error: "没有找到鑫通告页面，请重新从鑫通告页面点击扩展图标。" };
  try {
    const tab = await chrome.tabs.get(Number(tabId));
    if (!tab.url?.startsWith(`${JARVIS_ORIGIN}/`)) return { ok: false, error: "所选页面不是鑫通告管理后台。" };
    const context = await sendTabMessage(Number(tabId), { type: "GET_PAGE_CONTEXT" });
    return { ok: true, tabId: Number(tabId), url: tab.url, title: tab.title, ...context };
  } catch {
    return { ok: false, error: "鑫通告页面已关闭，请重新打开页面后再试。" };
  }
}

async function findJarvisTab() {
  const tabs = await chrome.tabs.query({ url: `${JARVIS_ORIGIN}/*` });
  const tab = tabs.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  return tab?.id ? getSourceContext(tab.id) : { ok: false, error: "没有找到已打开的鑫通告页面。" };
}

async function sendTabMessage(tabId, message, attempts = 10) {
  let lastError;
  for (let index = 0; index < attempts; index += 1) {
    try {
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      lastError = error;
      await delay(300);
    }
  }
  throw lastError ?? new Error("页面读取脚本未加载，请刷新鑫通告页面。");
}

function waitForTabComplete(tabId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => finish(new Error("通告详情页面加载超时。")), timeoutMs);
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") finish();
    };
    const finish = (error) => {
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      error ? reject(error) : resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") finish();
    }).catch(finish);
  });
}

async function postJson(backendUrl, path, body) {
  const response = await fetch(`${backendUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error || `运营后台返回错误 ${response.status}`);
  return value;
}

async function setStatus(tone, message) {
  await chrome.storage.local.set({ [STATUS_KEY]: { tone, message, updatedAt: new Date().toISOString() } });
}

function failure(error) {
  return { ok: false, error: error instanceof Error ? error.message : String(error) };
}

function dateText() {
  return new Date().toISOString().slice(0, 10);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function originPatternOf(value) {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol)) throw new Error("运营后台地址必须使用 http 或 https。");
  return `${url.protocol}//${url.hostname}/*`;
}
