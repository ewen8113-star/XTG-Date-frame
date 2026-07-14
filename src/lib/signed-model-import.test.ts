import assert from "node:assert/strict";
import test from "node:test";
import { importedSignerDisplayNickname, importedSignerNickname, parseSignedModelRowText } from "./signed-model-import";

test("signed model import removes table labels and relationship statuses from nicknames", () => {
  assert.equal(importedSignerNickname("模特 状态 saisai 已解约"), "saisai");
  assert.equal(importedSignerNickname("模特 状态 Dancing With My Ghost 已签约"), "Dancing With My Ghost");
  assert.equal(importedSignerNickname("- 2026-05-06 14:16:03 saisai"), "saisai");
});

test("signed model import uses a consistent label for cancelled accounts", () => {
  const parsed = parseSignedModelRowText("模特 状态 该用户已注销 男 · 45岁 · 13482365546 · #1501466104425938944 已签约");
  assert.deepEqual(parsed, {
    nickname: "该用户已注销",
    phone: "13482365546",
    userId: "1501466104425938944"
  });
});

test("signed model import keeps full nicknames instead of the trailing status", () => {
  const parsed = parseSignedModelRowText("模特 状态 saisai 已解约 女 · 34岁 · 13127510082 · #1501464303962226688 已签约");
  assert.deepEqual(parsed, {
    nickname: "saisai",
    phone: "13127510082",
    userId: "1501464303962226688"
  });
});

test("signer detail recovers a nickname overwritten by a relationship status", () => {
  assert.equal(importedSignerDisplayNickname("已解约", "正常", ["saisai"]), "saisai");
  assert.equal(importedSignerDisplayNickname("saisai", "已注销", []), "该用户已注销");
});
