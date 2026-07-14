export type ReleaseNote = {
  id: string;
  version: string;
  date: string;
  title: string;
  updates: string[];
  fixes: string[];
};

export const releaseNotes: ReleaseNote[] = [
  {
    id: "1.04",
    version: "1.04",
    date: "2026-07-14",
    title: "种子计划与工作台体验更新",
    updates: [
      "恢复无上线经纪人的初始种子身份设置，并保留被引荐经纪人的 6 + 2 晋升流程。",
      "新增签约者资料详情、种子经纪人身份标识和白皮书规则说明。",
      "版本更新中心新增按账号保存的未读数字提醒。"
    ],
    fixes: [
      "修复进度卡片悬停色块压迫文字及深色模式对比异常。",
      "修复铃铛弹窗离开后不关闭、已读更新仍持续提示的问题。",
      "修复通告周期返回、跨周归属、凭证异议保存和多处深色模式配色问题。",
      "校正下线提成与一次性引荐奖励的结算条件。"
    ]
  },
  {
    id: "1.03",
    version: "1.03",
    date: "2026-07-13",
    title: "白皮书与奖励规则更新",
    updates: [
      "新增系统白皮书与版本更新中心。",
      "完善唯一上线、有效通告候选递补、付款状态追踪和财务驳回协作规则。"
    ],
    fixes: [
      "修复移动端登录布局与账户同步问题。",
      "修复深色模式详情页、搜索框白底及多处界面交互适配问题。"
    ]
  }
];

export const appVersion = releaseNotes[0].version;
