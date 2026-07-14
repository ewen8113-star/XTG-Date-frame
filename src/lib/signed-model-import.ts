const cancelledAccountPattern = /该用户已注销|用户已注销|账号已注销|(?:^|\s)已注销(?:\s|$)/;

const signerMetadataTokens = new Set([
  "报名列表",
  "签约列表",
  "模特",
  "模特状态",
  "状态",
  "自荐",
  "报名时间",
  "操作",
  "聊天记录",
  "正常",
  "已报名",
  "待处理",
  "待签约",
  "已签约",
  "已解约",
  "-",
  "—"
]);

function isSignerMetadataToken(value: string) {
  return signerMetadataTokens.has(value)
    || /^20\d{2}[-/]\d{1,2}[-/]\d{1,2}$/.test(value)
    || /^\d{1,2}:\d{2}(?::\d{2})?$/.test(value);
}

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function importedSignerNickname(value: string, rowText = value) {
  if (cancelledAccountPattern.test(rowText)) return "该用户已注销";
  return compact(value)
    .split(" ")
    .filter((token) => token && !isSignerMetadataToken(token))
    .join(" ")
    .trim();
}

export function parseSignedModelRowText(rowText: string, preferredNickname = "") {
  const text = compact(rowText);
  if (!text || !/已签约/.test(text)) return null;
  const userId = text.match(/#\s*(\d{12,})/)?.[1] ?? "";
  const textWithoutId = text.replace(/#\s*\d{12,}/g, " ");
  const phone = textWithoutId.match(/(?:^|\D)(1\d{10})(?:\D|$)/)?.[1]
    ?? textWithoutId.match(/(?:^|\D)(\d{6,15})(?:\D|$)/)?.[1]
    ?? "";
  if (!phone) return null;

  const genderIndex = textWithoutId.search(/\s(?:男|女|不限)\s*·\s*\d{1,3}岁/);
  const phoneIndex = textWithoutId.indexOf(phone);
  const identityEnd = genderIndex >= 0 ? genderIndex : phoneIndex;
  const nicknameSource = identityEnd >= 0 ? textWithoutId.slice(0, identityEnd) : textWithoutId;
  const nickname = importedSignerNickname(preferredNickname, text)
    || importedSignerNickname(nicknameSource, text)
    || "未命名签约者";
  return { nickname, phone, userId };
}

export function isImportedSignerPlaceholder(value: string) {
  return !importedSignerNickname(value) || value === "未命名签约者";
}

export function importedSignerDisplayNickname(storedNickname: string, accountStatus: string, recoveredNicknames: string[]) {
  if (cancelledAccountPattern.test(accountStatus)) return "该用户已注销";
  const recoveredNickname = recoveredNicknames
    .map((value) => importedSignerNickname(value))
    .find(Boolean);
  if (recoveredNickname) return recoveredNickname;
  return importedSignerNickname(storedNickname) || "未命名签约者";
}
