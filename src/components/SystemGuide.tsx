import {
  BarChart3,
  Bell,
  BookOpen,
  CheckCircle2,
  GitBranch,
  Handshake,
  ListChecks,
  ReceiptText,
  ShieldCheck,
  Sprout,
  UserCog,
  UsersRound,
  WalletCards
} from "lucide-react";
import type { ReactNode } from "react";
import { appVersion } from "../data/releaseNotes";

const workflowSteps = [
  { icon: UsersRound, title: "找到经纪人", text: "在经纪人用户中搜索目标用户，点击用户行进入专属工作台。", outcome: "进入专属工作台" },
  { icon: ListChecks, title: "审核通告与签约", text: "核对通告来源、视频凭证和新增签约名单，分别给出人工审核结论。", outcome: "形成审核结论" },
  { icon: ReceiptText, title: "核对费用", text: "在费用结算中选择周期，确认有效通告、签约奖励与抵扣项目。", outcome: "生成结算金额" },
  { icon: WalletCards, title: "提交与付款", text: "运营提交付款单，财务先审核订单，再在实际付款后标记已付款；驳回理由会同步回工作台。", outcome: "完成状态同步" }
];

const roleGuides = [
  { icon: ShieldCheck, role: "超级管理员", text: "管理系统账号、角色权限，并可查看运营与财务全部功能。" },
  { icon: ListChecks, role: "运营", text: "负责经纪人资料、通告与签约审核，以及费用核对和付款提报。" },
  { icon: WalletCards, role: "财务", text: "审核待付款订单、准备款项、确认实际付款或驳回，并查看财务报表。" }
];

export function SystemGuide() {
  return (
    <section className="page guide-page">
      <header className="guide-hero">
        <div className="guide-hero-icon"><BookOpen size={26} /></div>
        <div>
          <span className="eyebrow">SYSTEM GUIDE · VER {appVersion}</span>
          <h1>系统使用白皮书</h1>
          <p>从经纪人审核到财务付款，一页掌握日常操作路径。</p>
        </div>
      </header>

      <section className="guide-section">
        <div className="guide-section-heading">
          <div><h2>核心工作流程</h2><p>建议新用户按以下顺序完成一次完整操作。</p></div>
        </div>
        <div className="guide-flow" aria-label="核心工作流程">
          {workflowSteps.map(({ icon: Icon, title, text, outcome }) => (
            <article className="guide-step" key={title}>
              <div className="guide-step-marker"><Icon size={20} aria-hidden="true" /></div>
              <div className="guide-step-body">
                <h3>{title}</h3>
                <p>{text}</p>
                <span className="guide-step-outcome">{outcome}</span>
              </div>
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
            <GuideCheck title="有效通告发布" text="在具备引荐权限的种子经纪人关系网络中关联下线后，下线自动成为普通经纪人并继承相同种子期数，关联时间即计划生效时间。其后发布的通告立即进入计划审核、本人奖励和 6 + 2 统计，同时贡献直属上线收益。" />
            <GuideCheck title="有效新增签约" text="新增签约去重从计划身份生效时间开始，与该时间之后发布的历史通告签约者比较。晋升不会重置去重范围；晋升前后通告都沿用同一计划周期。" />
            <GuideCheck title="上下级关系" text="每位经纪人只能关联一个直接上线；关系建立后自动继承上线的种子期数。满足 6 + 2 后，系统提醒运营确认晋升，晋升时间默认当前时间并可按实际情况回填；晋升后才开通发展下线的权限。" />
            <GuideCheck title="初始种子身份" text="没有上线的第一期、第二期等初始种子经纪人，由运营在用户级别中手动设置种子期数、身份生效时间和引荐权限；被引荐经纪人不能通过此入口绕过 6 + 2 晋升流程。" />
            <GuideCheck title="费用结算" text="上线本人和每个直接下线分别执行每日 3 条、每周 12 条上限；下线每条有效新增签约通告给上线 1 元提成，多名下线独立计算后汇总。下线满足 6 + 2 并由运营确认晋升为种子经纪人后，给上线 10 元且每名下线仅发一次。" />
            <GuideCheck title="财务流程" text="付款单先显示财务审批中；审核通过且款项准备完成后显示财务审批通过，实际付款后再标记财务已付款。若被驳回，运营在付款状态中查看理由，修正通告或费用后重新提交。" />
          </div>
        </section>

        <section className="guide-section">
          <div className="guide-section-heading">
            <div><h2>角色分工</h2><p>页面与操作权限随账号角色变化。</p></div>
          </div>
          <div className="guide-role-list">
            {roleGuides.map(({ icon: Icon, role, text }) => (
              <article key={role}><h3><Icon size={18} />{role}</h3><p>{text}</p></article>
            ))}
          </div>
        </section>
      </div>

      <section className="guide-section">
        <div className="guide-section-heading">
          <div><h2>身份图标速查</h2><p>在经纪人列表、工作台和关系网络中，通过图标快速辨识身份与权限。</p></div>
        </div>
        <div className="guide-identity-list">
          <GuideIdentity
            icon={<img alt="种子经纪人身份图标" src="/assets/seed-broker-icon.png" />}
            title="种子经纪人"
            text="圆形幼苗与根系图标表示该经纪人已经运营审核晋升为种子经纪人。"
          />
          <GuideIdentity
            icon={<Sprout aria-hidden="true" size={28} />}
            title="种子期数"
            text="幼苗右下角的数字表示种子计划归属期数；晋升和继续发展下线不会改变该期数。"
          />
          <GuideIdentity
            icon={<Handshake aria-hidden="true" size={26} />}
            title="引荐权限"
            text="握手图标表示该种子经纪人已经开通引荐权限，可以发展自己的直接下线。"
          />
        </div>
      </section>

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

function GuideIdentity({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return <article><span className="guide-identity-icon">{icon}</span><div><h3>{title}</h3><p>{text}</p></div></article>;
}
