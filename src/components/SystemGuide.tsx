import {
  BarChart3,
  Bell,
  BookOpen,
  CheckCircle2,
  GitBranch,
  ListChecks,
  ReceiptText,
  ShieldCheck,
  UserCog,
  UsersRound,
  WalletCards
} from "lucide-react";
import type { ReactNode } from "react";

const workflowSteps = [
  { icon: UsersRound, title: "找到经纪人", text: "在经纪人用户中搜索目标用户，点击用户行进入专属工作台。" },
  { icon: ListChecks, title: "审核通告与签约", text: "核对通告来源、视频凭证和新增签约名单，分别给出人工审核结论。" },
  { icon: ReceiptText, title: "核对费用", text: "在费用结算中选择周期，确认有效通告、签约奖励与抵扣项目。" },
  { icon: WalletCards, title: "提交与付款", text: "运营提交付款单，财务确认付款或填写理由驳回，状态会同步回工作台。" }
];

const roleGuides = [
  { icon: ShieldCheck, role: "超级管理员", text: "管理系统账号、角色权限，并可查看运营与财务全部功能。" },
  { icon: ListChecks, role: "运营", text: "负责经纪人资料、通告与签约审核，以及费用核对和付款提报。" },
  { icon: WalletCards, role: "财务", text: "处理待付款订单、确认付款或驳回，并查看财务报表。" }
];

export function SystemGuide() {
  return (
    <section className="page guide-page">
      <header className="guide-hero">
        <div className="guide-hero-icon"><BookOpen size={26} /></div>
        <div>
          <span className="eyebrow">SYSTEM GUIDE · VER 1.03</span>
          <h1>系统使用白皮书</h1>
          <p>从经纪人审核到财务付款，一页掌握日常操作路径。</p>
        </div>
      </header>

      <section className="guide-section">
        <div className="guide-section-heading">
          <div><h2>核心工作流程</h2><p>建议新用户按以下顺序完成一次完整操作。</p></div>
        </div>
        <div className="guide-flow" aria-label="核心工作流程">
          {workflowSteps.map(({ icon: Icon, title, text }, index) => (
            <article className="guide-step" key={title}>
              <div className="guide-step-top"><span>{index + 1}</span><Icon size={20} /></div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="guide-columns">
        <section className="guide-section">
          <div className="guide-section-heading">
            <div><h2>审核操作要点</h2><p>审核结果会直接影响奖励与付款。</p></div>
          </div>
          <div className="guide-checklist">
            <GuideCheck title="有效通告发布" text="来源状态有效、视频凭证与通告内容一致且人工审核通过后，才进入奖励名额；每日最多 3 条、每周最多 12 条，超出部分作为候选待定，前序记录不通过后按发布时间顺序递补。" />
            <GuideCheck title="有效新增签约" text="通告先满足有效发布，签约者资料通过人工核验，并且用户 ID 未出现在历史合作订单中，才计为有效新增；身份不符或历史重复均不计奖。" />
            <GuideCheck title="上下级关系" text="每位经纪人只能关联一个直接上线；已有上线时不能改绑其他上线，但仍可在获得引荐权限后继续发展自己的直接下线。" />
            <GuideCheck title="费用结算" text="确认周期、奖励明细和抵扣金额后再提交；沟通有变时可撤销付款并重新审核提报。" />
            <GuideCheck title="财务驳回" text="运营在付款状态中查看驳回理由，修正通告或费用后重新提交付款单。" />
          </div>
        </section>

        <section className="guide-section">
          <div className="guide-section-heading">
            <div><h2>角色分工</h2><p>页面与操作权限随账号角色变化。</p></div>
          </div>
          <div className="guide-role-list">
            {roleGuides.map(({ icon: Icon, role, text }) => (
              <article key={role}><Icon size={20} /><div><h3>{role}</h3><p>{text}</p></div></article>
            ))}
          </div>
        </section>
      </div>

      <section className="guide-section">
        <div className="guide-section-heading">
          <div><h2>页面速查</h2><p>不知道从哪里开始时，可按任务选择入口。</p></div>
        </div>
        <div className="guide-map">
          <GuideMapItem icon={<BarChart3 size={19} />} title="工作总览 / 数据分析" text="查看待办、关键指标与审核漏斗。" />
          <GuideMapItem icon={<UsersRound size={19} />} title="经纪人用户 / 工作台" text="查询用户、关系网络、通告、签约和付款状态。" />
          <GuideMapItem icon={<GitBranch size={19} />} title="关系网络" text="桌面端横向查看上下级，手机端自动切换纵向布局。" />
          <GuideMapItem icon={<WalletCards size={19} />} title="财务管理" text="处理付款审批、已付款订单和结算报表。" />
          <GuideMapItem icon={<UserCog size={19} />} title="账户管理" text="超级管理员创建账号并分配运营、财务等权限。" />
          <GuideMapItem icon={<Bell size={19} />} title="版本更新" text="点击右上角铃铛查看每次功能更新与问题修复。" />
        </div>
      </section>
    </section>
  );
}

function GuideCheck({ title, text }: { title: string; text: string }) {
  return <article><CheckCircle2 size={19} /><div><h3>{title}</h3><p>{text}</p></div></article>;
}

function GuideMapItem({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <article>{icon}<div><h3>{title}</h3><p>{text}</p></div></article>;
}
