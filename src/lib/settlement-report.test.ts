import assert from "node:assert/strict";
import test from "node:test";
import { buildSettlementReportHtml, type SettlementReport } from "./settlement-report";

const report: SettlementReport = {
  brokerName: "熙 <测试>",
  brokerPhone: "17701861230",
  brokerUserId: "1495605105714069504",
  cycleLabel: "2026年4月第五周",
  generatedAt: "2026/7/14 18:00:00",
  rows: [
    { id: "1", category: "新增签约奖励", object: "2901", decision: "计奖", description: "新增签约", amount: 2 },
    { id: "2", category: "新增签约奖励", object: "2902", decision: "不计奖", description: "签约者重复", amount: 0 }
  ],
  weekSubtotal: 2,
  carryForward: 0,
  total: 2,
  payout: 2
};

test("settlement PDF includes rewarded and excluded decisions", () => {
  const html = buildSettlementReportHtml(report);
  assert.match(html, /2901/);
  assert.match(html, /2902/);
  assert.match(html, /计奖/);
  assert.match(html, /不计奖/);
  assert.match(html, /¥0/);
  assert.match(html, /<span class="number">17701861230<\/span>/);
});

test("settlement PDF escapes imported broker content", () => {
  const html = buildSettlementReportHtml(report);
  assert.match(html, /熙 &lt;测试&gt;/);
  assert.doesNotMatch(html, /熙 <测试>/);
});
