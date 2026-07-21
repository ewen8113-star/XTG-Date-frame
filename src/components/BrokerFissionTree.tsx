import {
  ArrowLeft,
  CalendarDays,
  Download,
  Expand,
  Search,
  Sprout,
  Target,
  UserRound,
  UsersRound
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { Broker, ReferralNode } from "../types";
import "../broker-fission-tree.css";

type StatusFilter = "all" | "active" | "pending" | "inactive";

function brokerStatus(broker: Broker) {
  if (broker.accountStatus !== "正常") return "inactive" as const;
  if (broker.realNameStatus === "认证中") return "pending" as const;
  return "active" as const;
}

function statusLabel(status: ReturnType<typeof brokerStatus>) {
  return status === "active" ? "活跃" : status === "pending" ? "待审核" : "未激活";
}

function initials(name: string) {
  return name.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 2) || "经纪";
}

function BrokerNode({
  broker,
  childrenCount,
  approvedSigningCount,
  focused,
  onClick
}: {
  broker: Broker;
  childrenCount: number;
  approvedSigningCount: number;
  focused?: boolean;
  onClick: () => void;
}) {
  const status = brokerStatus(broker);
  return <button className={`fission-node ${focused ? "selected" : ""}`} onClick={onClick} type="button">
    <span className="fission-avatar" aria-hidden="true">{initials(broker.nickname)}</span>
    <span className="fission-node-copy"><strong>{broker.nickname}</strong><small>ID：{broker.miniProgramUserId}</small><em className={`status-${status}`}>{statusLabel(status)}</em></span>
    <span className="fission-node-stats"><small>直属 {childrenCount} 人</small><small>有效签约 {approvedSigningCount} 单</small></span>
  </button>;
}

export function BrokerFissionTree({
  brokers,
  approvedSigningCounts,
  onOpenBroker
}: {
  brokers: Broker[];
  approvedSigningCounts: Record<string, number>;
  onOpenBroker: (broker: Broker) => void;
}) {
  const [relationMap, setRelationMap] = useState<Record<string, string[]>>({});
  const [focusId, setFocusId] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all(brokers.map(async (broker) => {
      try {
        const response = await fetch(`/api/brokers/${broker.id}/referrals`);
        if (!response.ok) return [broker.id, []] as const;
        const nodes = await response.json() as ReferralNode[];
        return [broker.id, nodes.map((node) => node.id)] as const;
      } catch {
        return [broker.id, []] as const;
      }
    })).then((entries) => {
      if (!active) return;
      const next = Object.fromEntries(entries);
      brokers.forEach((broker) => {
        if (!broker.referrerNickname) return;
        const referrer = brokers.find((candidate) => candidate.nickname === broker.referrerNickname);
        if (referrer && !next[referrer.id]?.includes(broker.id)) next[referrer.id] = [...(next[referrer.id] ?? []), broker.id];
      });
      setRelationMap(next);
    });
    return () => { active = false; };
  }, [brokers]);

  const brokerById = useMemo(() => new Map(brokers.map((broker) => [broker.id, broker])), [brokers]);
  const parentById = useMemo(() => {
    const next = new Map<string, string>();
    Object.entries(relationMap).forEach(([parentId, childIds]) => childIds.forEach((childId) => next.set(childId, parentId)));
    return next;
  }, [relationMap]);
  const phaseOneSeeds = useMemo(() => brokers.filter((broker) => broker.brokerLevel === "seed" && broker.seedPhase === 1), [brokers]);
  const visibleSeeds = useMemo(() => phaseOneSeeds.filter((broker) => {
    const matchesQuery = !query.trim() || `${broker.nickname} ${broker.miniProgramUserId}`.toLowerCase().includes(query.trim().toLowerCase());
    return matchesQuery && (status === "all" || brokerStatus(broker) === status);
  }), [phaseOneSeeds, query, status]);
  const focusBroker = brokerById.get(focusId);

  const upstream = useMemo(() => {
    if (!focusBroker) return [];
    const chain: Broker[] = [];
    let parentId = parentById.get(focusBroker.id);
    while (parentId) {
      const parent = brokerById.get(parentId);
      if (!parent) break;
      chain.unshift(parent);
      parentId = parentById.get(parent.id);
    }
    return chain;
  }, [brokerById, focusBroker, parentById]);

  const downstreamLevels = useMemo(() => {
    if (!focusBroker) return [];
    const levels: Broker[][] = [];
    const seen = new Set([focusBroker.id]);
    let ids = relationMap[focusBroker.id] ?? [];
    while (ids.length) {
      const level = ids.flatMap((id) => {
        const broker = brokerById.get(id);
        return broker && !seen.has(broker.id) ? [broker] : [];
      });
      if (!level.length) break;
      levels.push(level);
      level.forEach((broker) => seen.add(broker.id));
      ids = level.flatMap((broker) => relationMap[broker.id] ?? []);
    }
    return levels;
  }, [brokerById, focusBroker, relationMap]);

  const phaseDownlineIds = useMemo(() => {
    const seen = new Set<string>();
    const pending = phaseOneSeeds.flatMap((broker) => relationMap[broker.id] ?? []);
    while (pending.length) {
      const id = pending.shift();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      pending.push(...(relationMap[id] ?? []));
    }
    return seen;
  }, [phaseOneSeeds, relationMap]);
  const approvedSignings = useMemo(() => {
    const phaseBrokerIds = new Set([...phaseOneSeeds.map((broker) => broker.id), ...phaseDownlineIds]);
    return [...phaseBrokerIds].reduce((total, brokerId) => total + (approvedSigningCounts[brokerId] ?? 0), 0);
  }, [approvedSigningCounts, phaseDownlineIds, phaseOneSeeds]);

  if (focusBroker) {
    const descendantCount = downstreamLevels.flat().length;
    return <section className={`fission-page fission-network-page ${compact ? "is-compact" : ""}`}>
      <div className="fission-heading">
        <div className="fission-focus-title"><button onClick={() => setFocusId("")} type="button"><ArrowLeft size={17} />返回第一期总览</button><div><h1>{focusBroker.nickname} · 个人关系网络</h1><p>点击任意经纪人卡片，可继续切换到他的上下级网络</p></div></div>
        <div className="fission-toolbar"><button onClick={() => setCompact((current) => !current)} type="button"><Expand size={15} />适应视图</button><button onClick={() => window.print()} type="button"><Download size={15} />导出快照</button></div>
      </div>
      <div className="fission-focus-summary">
        <div><span>所属计划</span><strong>第一期种子裂变计划</strong></div><div><span>上级链路</span><strong>{upstream.length} 层</strong></div><div><span>直属下线</span><strong>{relationMap[focusBroker.id]?.length ?? 0} 人</strong></div><div><span>总下级人数</span><strong>{descendantCount} 人</strong></div><button onClick={() => onOpenBroker(focusBroker)} type="button">进入经纪人工作台</button>
      </div>
      <div className="horizontal-network-canvas">
        {upstream.length ? <div className="horizontal-generation upstream-generation"><div className="generation-label"><span>上级链路</span><small>{upstream.length} 人</small></div><div className="generation-nodes">{upstream.map((broker) => <BrokerNode approvedSigningCount={approvedSigningCounts[broker.id] ?? 0} broker={broker} childrenCount={relationMap[broker.id]?.length ?? 0} key={broker.id} onClick={() => setFocusId(broker.id)} />)}</div></div> : null}
        <div className="horizontal-generation current-generation"><div className="generation-label"><span>当前经纪人</span><small>{focusBroker.brokerLevel === "seed" ? "种子" : "下线"}</small></div><div className="generation-nodes"><BrokerNode approvedSigningCount={approvedSigningCounts[focusBroker.id] ?? 0} broker={focusBroker} childrenCount={relationMap[focusBroker.id]?.length ?? 0} focused onClick={() => undefined} /></div></div>
        {downstreamLevels.map((level, index) => <div className="horizontal-generation" key={`generation-${index + 1}`}><div className="generation-label"><span>第 {index + 1} 代下线</span><small>{level.length} 人</small></div><div className="generation-nodes">{level.map((broker) => <BrokerNode approvedSigningCount={approvedSigningCounts[broker.id] ?? 0} broker={broker} childrenCount={relationMap[broker.id]?.length ?? 0} key={broker.id} onClick={() => setFocusId(broker.id)} />)}</div></div>)}
        {!downstreamLevels.length ? <div className="horizontal-empty"><Sprout size={28} /><strong>暂无下线关系</strong><span>该经纪人目前还没有发展下线</span></div> : null}
      </div>
    </section>;
  }

  return <section className="fission-page">
    <div className="fission-heading">
      <div><h1>经纪人裂变图</h1><p>按种子计划分期查看裂变效果，目前展示第一期</p></div>
      <div className="fission-toolbar"><label><Search size={16} /><input aria-label="搜索种子经纪人" onChange={(event) => setQuery(event.target.value)} placeholder="搜索第一期种子经纪人" value={query} /></label><select aria-label="状态筛选" onChange={(event) => setStatus(event.target.value as StatusFilter)} value={status}><option value="all">状态：全部状态</option><option value="active">活跃</option><option value="pending">待审核</option><option value="inactive">未激活</option></select><button onClick={() => window.print()} type="button"><Download size={15} />导出快照</button></div>
    </div>
    <div className="phase-tabs" role="tablist"><button className="active" role="tab" type="button"><span>第一期种子经纪人</span><strong>{phaseOneSeeds.length} / 30</strong></button><button aria-disabled="true" disabled role="tab" type="button"><span>第二期种子经纪人</span><strong>暂未开放</strong></button></div>
    <div className="fission-metrics">
      <div><Target /><span>计划孵化目标</span><strong>30</strong><small>第一期种子经纪人</small></div><div><UsersRound /><span>当前种子经纪人</span><strong>{phaseOneSeeds.length}</strong><small>仅统计第一期身份</small></div><div><UserRound /><span>已裂变下线</span><strong>{phaseDownlineIds.size}</strong><small>去重后的下线人数</small></div><div><CalendarDays /><span>有效签约</span><strong>{approvedSignings}</strong><small>人工审核已通过</small></div>
    </div>
    <div className="seed-overview-panel">
      <div className="seed-overview-heading"><div><h2>第一期种子经纪人裂变总览</h2><p>点击卡片查看该经纪人的横向关系网络</p></div><span>{visibleSeeds.length} 位种子经纪人</span></div>
      <div className="seed-overview-grid">{visibleSeeds.map((broker) => <BrokerNode approvedSigningCount={approvedSigningCounts[broker.id] ?? 0} broker={broker} childrenCount={relationMap[broker.id]?.length ?? 0} key={broker.id} onClick={() => setFocusId(broker.id)} />)}{!visibleSeeds.length ? <div className="fission-empty">当前筛选条件下暂无第一期种子经纪人</div> : null}</div>
    </div>
  </section>;
}
