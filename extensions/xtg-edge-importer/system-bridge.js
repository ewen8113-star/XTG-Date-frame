if (!globalThis.xtgSystemBridgeInstalled) {
  globalThis.xtgSystemBridgeInstalled = true;

  window.addEventListener("message", (event) => {
    const request = event.data;
    if (event.source !== window || event.origin !== window.location.origin || request?.channel !== "XTG_WEB_APP_REQUEST") return;
    if (!request.requestId || !["PING", "IMPORT"].includes(request.action)) return;

    if (request.action === "PING") {
      respond(request.requestId, { ok: true });
      return;
    }

    chrome.runtime.sendMessage({
      type: "START_IMPORT_FROM_SYSTEM",
      mode: request.mode,
      brokerMiniProgramUserId: request.brokerMiniProgramUserId,
      jarvisBriefingId: request.jarvisBriefingId,
      briefingId: request.briefingId,
      title: request.title
    }).then((result) => {
      respond(request.requestId, result);
    }).catch((error) => {
      respond(request.requestId, { ok: false, error: error instanceof Error ? error.message : String(error) });
    });
  });
}

function respond(requestId, value) {
  window.postMessage({ channel: "XTG_EXTENSION_RESPONSE", requestId, ...value }, window.location.origin);
}
