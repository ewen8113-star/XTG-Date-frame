type ExtensionImportMode = "brokers" | "briefings" | "briefing-detail";

type ExtensionImportPayload = {
  mode: ExtensionImportMode;
  brokerMiniProgramUserId?: string;
  jarvisBriefingId?: string;
  briefingId?: string;
  title?: string;
};

type BridgeResponse = {
  channel: "XTG_EXTENSION_RESPONSE";
  requestId: string;
  ok: boolean;
  result?: Record<string, unknown>;
  error?: string;
};

export type BrowserExtensionImportResult = {
  available: boolean;
  ok: boolean;
  result?: Record<string, any>;
  error?: string;
};

export async function importWithBrowserExtension(payload: ExtensionImportPayload): Promise<BrowserExtensionImportResult> {
  const available = await sendBridgeRequest({ action: "PING" }, 1500).catch(() => null);
  if (!available?.ok) {
    if (/Mac/i.test(navigator.userAgent)) return { available: false, ok: false };
    return importThroughJobQueue(payload);
  }

  let response: BridgeResponse;
  try {
    response = await sendBridgeRequest({ action: "IMPORT", ...payload }, 10 * 60 * 1000);
  } catch (error) {
    return {
      available: true,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
  return {
    available: true,
    ok: Boolean(response.ok),
    result: response.result,
    error: response.error
  };
}

async function importThroughJobQueue(payload: ExtensionImportPayload): Promise<BrowserExtensionImportResult> {
  try {
    const createResponse = await fetch("/api/browser-import/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const created = await createResponse.json();
    if (!createResponse.ok) throw new Error(created.error || "创建扩展导入任务失败");

    const startedAt = Date.now();
    while (Date.now() - startedAt < 10 * 60 * 1000) {
      await delay(1000);
      const response = await fetch(`/api/browser-import/jobs/${created.id}`, { cache: "no-store" });
      const job = await response.json();
      if (!response.ok) throw new Error(job.error || "读取扩展导入任务失败");
      if (job.status === "completed") {
        const value = job.result ?? {};
        return { available: true, ok: value.ok !== false, result: value.result ?? value, error: value.error };
      }
      if (job.status === "failed") return { available: true, ok: false, error: job.error || "扩展导入失败" };
      if (job.status === "pending" && Date.now() - startedAt > 45 * 1000) {
        return { available: true, ok: false, error: "Edge 扩展在45秒内没有领取任务，请确认扩展 v0.3.0 已启用并保持 Edge 运行。" };
      }
    }
    return { available: true, ok: false, error: "扩展导入超过10分钟仍未完成，请稍后重试。" };
  } catch (error) {
    return { available: true, ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function sendBridgeRequest(payload: Record<string, unknown>, timeoutMs: number): Promise<BridgeResponse> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error("浏览器扩展响应超时，请确认扩展已重新加载并刷新系统页面。")), timeoutMs);
    const listener = (event: MessageEvent) => {
      const value = event.data as BridgeResponse | undefined;
      if (event.source !== window || value?.channel !== "XTG_EXTENSION_RESPONSE" || value.requestId !== requestId) return;
      finish(undefined, value);
    };
    const finish = (error?: Error, value?: BridgeResponse) => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", listener);
      error ? reject(error) : resolve(value as BridgeResponse);
    };
    window.addEventListener("message", listener);
    window.postMessage({ channel: "XTG_WEB_APP_REQUEST", requestId, ...payload }, window.location.origin);
  });
}

function delay(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
