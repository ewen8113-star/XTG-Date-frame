const compact = (value) => String(value || "").replace(/\s+/g, " ").trim();
const numberOf = (value) => Number((compact(value).match(/\d+/) || ["0"])[0]);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "GET_PAGE_CONTEXT") {
    sendResponse(getPageContext());
    return false;
  }
  if (message?.type === "SCRAPE_BROKERS_PAGE") {
    sendResponse(scrapeBrokers());
    return false;
  }
  if (message?.type === "SCRAPE_BRIEFINGS_PAGE") {
    sendResponse(scrapeBriefings());
    return false;
  }
  if (message?.type === "SCRAPE_BRIEFING_DETAIL") {
    sendResponse(scrapeBriefingDetail(message.fallback || {}));
    return false;
  }
  if (message?.type === "CLICK_NEXT_PAGE") {
    clickNextPage().then(sendResponse).catch((error) => sendResponse({ changed: false, error: String(error) }));
    return true;
  }
  return false;
});

function getPageContext() {
  const brokerMatch = location.pathname.match(/\/user\/detail\/(\d+)/);
  const pageType = location.pathname === "/user/list"
    ? "broker-list"
    : brokerMatch && new URLSearchParams(location.search).get("tab") === "briefing"
      ? "broker-briefings"
      : location.pathname.includes("/business/briefing/")
        ? "briefing-detail"
        : "unsupported";
  return { pageType, brokerMiniProgramUserId: brokerMatch?.[1] || "", url: location.href };
}

function scrapeBrokers() {
  const pairOf = (value) => {
    const match = compact(value).match(/(\d+)\s*\/\s*(\d+)/);
    return match ? [Number(match[1]), Number(match[2])] : [0, 0];
  };
  const datesOf = (value) => compact(value).match(/20\d{2}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?/g) || [];
  const rows = document.querySelectorAll("tbody tr, .el-table__body tr, .el-table__row, [role='row']");
  return Array.from(rows).map((row) => {
    const rawCells = Array.from(row.querySelectorAll("td, .el-table__cell, [role='cell'], [role='gridcell']"))
      .map((cell) => String(cell.innerText || cell.textContent || ""));
    const cells = rawCells.map(compact).filter(Boolean);
    const rowText = compact(row.innerText);
    const id = (rowText.match(/#\s*(\d{16,})/) || rowText.match(/\b(\d{16,})\b/) || [])[1];
    if (!id) return null;
    const firstCell = rawCells[0] || cells[0] || rowText;
    const firstLines = firstCell.split(/\n|\s{2,}/).map(compact).filter(Boolean);
    const phone = (firstCell.match(/\b1\d{10}\b/) || rowText.match(/\b1\d{10}\b/) || [""])[0];
    const nickname = firstLines.find((line) => !/^#?\d+$/.test(line) && !/^1\d{10}$/.test(line))
      || firstCell.split(phone)[0]
      || "未命名经纪人";
    const dates = datesOf(rowText);
    const pairCells = cells.filter((cell) => /\d+\s*\/\s*\d+/.test(cell));
    const [signupTotalTimes, contractTotalTimes] = pairOf(pairCells[0] || "");
    const [signupTotalPeople, contractTotalPeople] = pairOf(pairCells[1] || "");
    const numericCells = cells.filter((cell) => /^\d+$/.test(cell));
    return {
      miniProgramUserId: id,
      nickname: compact(nickname).replace(/#\s*\d{16,}.*/, "") || "未命名经纪人",
      wechatPhone: phone,
      boundPhone: phone,
      realNameStatus: (rowText.match(/认证失败|认证中|已认证|未认证/) || ["未认证"])[0],
      accountStatus: (rowText.match(/永久封号|临时封号|限制发布|正常/) || ["正常"])[0],
      registeredAt: dates[0] || "",
      lastLoginAt: dates[1] || "",
      violationCount: numberOf(numericCells[0]),
      publishedBriefings: numberOf(numericCells[1]),
      completedBriefings: numberOf(numericCells[2]),
      signupTotalTimes,
      contractTotalTimes,
      signupTotalPeople,
      contractTotalPeople,
      listText: rowText
    };
  }).filter(Boolean);
}

function scrapeBriefings() {
  const pairOf = (value) => {
    const match = compact(value).match(/(\d+)\s*\/\s*(\d+)/);
    return match ? [Number(match[1]), Number(match[2])] : [0, 0];
  };
  return Array.from(document.querySelectorAll("tbody tr")).map((row) => {
    const cells = Array.from(row.querySelectorAll("td")).map((cell) => compact(cell.innerText));
    const rowText = compact(row.innerText);
    const href = row.querySelector('a[href*="/business/briefing/"]')?.getAttribute("href") || "";
    const id = (href.match(/briefing\/(\d+)/) || rowText.match(/#(\d{16,})/) || [])[1];
    const title = compact((cells[0] || "").split("#")[0]).replace(/\s+\d{16,}$/, "");
    if (!id || !title) return null;
    const pairCell = cells.find((cell) => /\d+\s*\/\s*\d+/.test(cell)) || rowText;
    const [signupPeople, contractPeople] = pairOf(pairCell);
    const createdAt = (rowText.match(/20\d{2}[-/]\d{1,2}[-/]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?/) || [""])[0];
    return {
      jarvisBriefingId: id,
      title,
      recruitCount: numberOf(cells[1]),
      sourceStatus: (rowText.match(/已结束|已取消|报名中|进行中|待审核/) || ["-"])[0],
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
}

function scrapeBriefingDetail(fallback) {
  const body = compact(document.body.innerText);
  const metadataTokens = new Set(["报名列表", "签约列表", "模特", "模特状态", "状态", "自荐", "报名时间", "操作", "聊天记录", "正常", "已报名", "待处理", "待签约", "已签约", "已解约", "-", "—"]);
  const nicknameOf = (value, rowText) => {
    if (/该用户已注销|用户已注销|账号已注销|(?:^|\s)已注销(?:\s|$)/.test(rowText)) return "该用户已注销";
    return compact(value).split(/\s+/).filter((token) => token && !metadataTokens.has(token) && !/^20\d{2}[-/]\d{1,2}[-/]\d{1,2}$/.test(token) && !/^\d{1,2}:\d{2}(?::\d{2})?$/.test(token)).join(" ").trim();
  };
  const labels = ["招聘类型", "性别", "招聘人数", "截止时间", "是否要求连档", "是否已付保证金", "发布人", "创建时间", "发布时间", "取消原因", "工作时间 & 地点", "工作日期", "工作时段", "工作地点", "薪资", "工作要求", "报名列表", "签约列表", "操作日志"];
  const between = (start, endLabels = labels) => {
    const startIndex = body.indexOf(start);
    if (startIndex < 0) return "";
    const rest = body.slice(startIndex + start.length).trim();
    const indexes = endLabels.filter((label) => label !== start).map((label) => rest.indexOf(label)).filter((index) => index >= 0);
    return compact(indexes.length ? rest.slice(0, Math.min(...indexes)) : rest);
  };
  const signedModelNames = Array.from(document.querySelectorAll("tbody tr, .ant-table-row, tr"))
    .map((row) => {
      const rowText = compact(row.innerText || row.textContent || "");
      if (!/已签约/.test(rowText)) return "";
      const profileLink = row.querySelector('a[href*="/user/detail/"]');
      const linkedText = compact(profileLink?.innerText || profileLink?.textContent || profileLink?.getAttribute("title") || profileLink?.querySelector("img")?.getAttribute("alt") || "");
      const userId = (String(profileLink?.getAttribute("href") || "").match(/user\/detail\/(\d{12,})/) || rowText.match(/#(\d{12,})/) || [])[1] || "";
      const noIdText = rowText.replace(/#\d{12,}/g, " ");
      const phone = (noIdText.match(/(?:^|\D)(1\d{10})(?:\D|$)/) || noIdText.match(/(?:^|\D)(\d{6,15})(?:\D|$)/) || [])[1] || "";
      const genderIndex = noIdText.search(/\s(?:男|女|不限)\s*·\s*\d{1,3}岁/);
      const phoneIndex = noIdText.indexOf(phone);
      const identityEnd = genderIndex >= 0 ? genderIndex : phoneIndex;
      const nameSource = identityEnd >= 0 ? noIdText.slice(0, identityEnd) : noIdText;
      const name = nicknameOf(linkedText, rowText) || nicknameOf(nameSource, rowText) || "未命名签约者";
      return name && phone ? `${name}（${phone}）${userId ? ` #${userId}` : ""}` : "";
    }).filter(Boolean);
  return {
    jarvisBriefingId: fallback.jarvisBriefingId || (location.pathname.match(/briefing\/(\d{16,})/) || [])[1] || "",
    title: fallback.title,
    recruitmentType: between("招聘类型", ["性别"]),
    genderRequirement: between("性别", ["招聘人数"]),
    recruitCount: numberOf(between("招聘人数", ["截止时间"])) || fallback.recruitCount,
    publisherText: between("发布人", ["创建时间"]),
    publishedAt: between("发布时间", ["取消原因", "工作时间 & 地点"]) || fallback.publishedAt,
    cancelReason: between("取消原因", ["工作时间 & 地点", "工作日期", "工作时段", "工作地点", "薪资", "工作要求", "报名列表", "签约列表"]) || fallback.cancelReason,
    workDateText: between("工作日期", ["工作时段"]),
    workTimeText: between("工作时段", ["工作地点"]),
    workAddress: between("工作地点", ["薪资"]) || fallback.workAddress,
    salaryText: between("薪资", ["工作要求"]),
    requirementText: between("工作要求", ["操作日志"]),
    signedModelNames: [...new Set(signedModelNames)],
    rawText: body,
    signupPeople: fallback.signupPeople,
    contractPeople: fallback.contractPeople,
    signupTimes: fallback.signupTimes,
    contractTimes: fallback.contractTimes,
    sourceStatus: fallback.sourceStatus
  };
}

async function clickNextPage() {
  const button = Array.from(document.querySelectorAll("button"))
    .find((item) => /下一页/.test(item.innerText || item.textContent || ""));
  if (!button || button.disabled || button.getAttribute("aria-disabled") === "true") return { changed: false };
  const before = compact(document.querySelector("tbody")?.innerText || document.body.innerText).slice(0, 2000);
  button.click();
  const changed = await waitUntil(() => {
    const after = compact(document.querySelector("tbody")?.innerText || document.body.innerText).slice(0, 2000);
    return after !== before;
  }, 10000);
  return { changed };
}

async function waitUntil(predicate, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}
