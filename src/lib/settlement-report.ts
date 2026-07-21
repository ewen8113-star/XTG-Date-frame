export type SettlementReportDecision = "计奖" | "不计奖" | "待审核" | "抵扣";

export type SettlementReportRow = {
  id: string;
  briefingId?: string;
  category: string;
  object: string;
  decision: SettlementReportDecision;
  description: string;
  amount: number;
};

export type SettlementReport = {
  brokerName: string;
  brokerPhone: string;
  brokerUserId: string;
  cycleLabel: string;
  generatedAt: string;
  rows: SettlementReportRow[];
  weekSubtotal: number;
  carryForward: number;
  total: number;
  payout: number;
};

function escapeHtml(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function amountText(value: number) {
  return `${value < 0 ? "-" : ""}¥${Math.abs(value).toLocaleString("zh-CN")}`;
}

function textWithUnbrokenNumbers(value: string) {
  return value.split(/(#?\d{6,})/g).map((part) => (
    /^#?\d{6,}$/.test(part) ? `<span class="number">${escapeHtml(part)}</span>` : escapeHtml(part)
  )).join("");
}

function decisionClass(decision: SettlementReportDecision) {
  if (decision === "计奖") return "approved";
  if (decision === "待审核") return "pending";
  if (decision === "抵扣") return "deduction";
  return "rejected";
}

function reportGroups(rows: SettlementReportRow[]) {
  return [
    { key: "self", label: "本人奖励", rows: rows.filter((row) => !row.category.includes("引荐") && !row.category.includes("复审补发")) },
    { key: "referral", label: "引荐奖励", rows: rows.filter((row) => row.category.includes("引荐") && !row.category.includes("复审补发")) },
    { key: "adjustment", label: "调整与补发", rows: rows.filter((row) => row.category.includes("复审补发")) }
  ].filter((group) => group.rows.length > 0);
}

function reportRowsHtml(rows: SettlementReportRow[]) {
  return reportGroups(rows).map((group) => `
    <tr class="report-group group-${group.key}"><th colspan="6">${escapeHtml(group.label)}<span>${group.rows.length} 条</span></th></tr>
    ${group.rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.category)}</td>
      <td class="number">${escapeHtml(row.briefingId || "-")}</td>
      <td>${textWithUnbrokenNumbers(row.object)}</td>
      <td><span class="decision ${decisionClass(row.decision)}">${escapeHtml(row.decision)}</span></td>
      <td>${textWithUnbrokenNumbers(row.description)}</td>
      <td class="amount ${row.amount === 0 ? "zero" : ""}">${escapeHtml(amountText(row.amount))}</td>
    </tr>`).join("")}`).join("");
}

export function buildSettlementReportHtml(report: SettlementReport) {
  const rewardedCount = report.rows.filter((row) => row.decision === "计奖").length;
  const excludedCount = report.rows.filter((row) => row.decision === "不计奖").length;
  const pendingCount = report.rows.filter((row) => row.decision === "待审核").length;
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${escapeHtml(report.brokerName)}-${escapeHtml(report.cycleLabel)}-结算报表</title>
<style>
  @page { size: A4 portrait; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; color: #18181b; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 10px; line-height: 1.55; }
  header { padding-bottom: 12px; border-bottom: 2px solid #27272a; }
  h1 { margin: 0 0 4px; font-size: 20px; letter-spacing: 0; }
  .meta { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px 18px; color: #52525b; }
  .summary { display: grid; grid-template-columns: repeat(5, 1fr); margin: 14px 0; border: 1px solid #d4d4d8; border-radius: 4px; overflow: hidden; }
  .summary div { padding: 8px 10px; border-right: 1px solid #d4d4d8; }
  .summary div:last-child { border-right: 0; }
  .summary span { display: block; color: #71717a; font-size: 9px; }
  .summary strong { font-size: 15px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  thead { display: table-header-group; }
  th { background: #f4f4f5; color: #3f3f46; font-weight: 700; text-align: left; }
  th, td { padding: 7px 6px; border-bottom: 1px solid #e4e4e7; vertical-align: top; overflow-wrap: anywhere; }
  th:nth-child(1) { width: 14%; } th:nth-child(2) { width: 18%; } th:nth-child(3) { width: 17%; } th:nth-child(4) { width: 10%; } th:nth-child(5) { width: 31%; } th:nth-child(6) { width: 10%; }
  tr { break-inside: avoid; }
  .report-group th { padding: 8px 8px 8px 10px; border-left: 4px solid transparent; font-size: 10.5px; text-align: left; }
  .report-group th span { margin-left: 7px; font-size: 8.5px; font-weight: 500; }
  .report-group.group-self th { border-left-color: #059669; background: #ecfdf5; color: #065f46; }
  .report-group.group-referral th { border-left-color: #2563eb; background: #eff6ff; color: #1e40af; }
  .report-group.group-adjustment th { border-left-color: #d97706; background: #fffbeb; color: #92400e; }
  .decision { display: inline-block; border-radius: 3px; padding: 1px 5px; font-weight: 700; white-space: nowrap; }
  .approved { background: #dcfce7; color: #047857; } .rejected { background: #fee2e2; color: #b91c1c; }
  .pending { background: #fef3c7; color: #92400e; } .deduction { background: #f3e8ff; color: #7e22ce; }
  .amount { font-variant-numeric: tabular-nums; font-weight: 700; text-align: right; white-space: nowrap; }
  .number { white-space: nowrap; }
  .amount.zero { color: #a1a1aa; font-weight: 500; }
  .totals { width: 280px; margin: 14px 0 0 auto; border-top: 2px solid #27272a; }
  .totals div { display: flex; justify-content: space-between; padding: 4px 0; }
  .totals .total { margin-top: 3px; border-top: 1px dashed #a1a1aa; padding-top: 8px; font-size: 13px; font-weight: 800; }
  footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #e4e4e7; color: #71717a; font-size: 8px; }
</style></head><body>
<header><h1>经纪人奖励结算报表</h1><div class="meta">
  <span>经纪人：${escapeHtml(report.brokerName)}</span><span>结算周期：${escapeHtml(report.cycleLabel)}</span>
  <span>手机号：<span class="number">${escapeHtml(report.brokerPhone || "-")}</span></span><span>用户 ID：<span class="number">${escapeHtml(report.brokerUserId || "-")}</span></span>
</div></header>
<section class="summary"><div><span>判定记录</span><strong>${report.rows.length}</strong></div><div><span>计奖</span><strong>${rewardedCount}</strong></div><div><span>不计奖</span><strong>${excludedCount}</strong></div><div><span>待审核</span><strong>${pendingCount}</strong></div><div><span>合计应付</span><strong>${escapeHtml(amountText(report.total))}</strong></div></section>
<table><thead><tr><th>奖励项</th><th>通告ID</th><th>明细对象</th><th>判定</th><th>判定说明</th><th>金额</th></tr></thead><tbody>${reportRowsHtml(report.rows)}</tbody></table>
<section class="totals"><div><span>本周小计</span><strong>${escapeHtml(amountText(report.weekSubtotal))}</strong></div><div><span>上期结转</span><strong>${escapeHtml(amountText(report.carryForward))}</strong></div><div class="total"><span>合计应付</span><strong>${escapeHtml(amountText(report.total))}</strong></div><div><span>本期发放</span><strong>${escapeHtml(amountText(report.payout))}</strong></div></section>
<footer>鑫通告运营后台 · 生成时间 ${escapeHtml(report.generatedAt)} · 本报表包含计奖、不计奖、待审核及抵扣记录。</footer>
</body></html>`;
}

export function exportSettlementReportPdf(report: SettlementReport) {
  const reportWindow = window.open("", "_blank");
  if (!reportWindow) return false;
  reportWindow.document.open();
  reportWindow.document.write(buildSettlementReportHtml(report));
  reportWindow.document.close();
  reportWindow.addEventListener("afterprint", () => reportWindow.close(), { once: true });
  window.setTimeout(() => {
    reportWindow.focus();
    reportWindow.print();
  }, 250);
  return true;
}
