import { ChevronLeft, ExternalLink, Image, UserRound, Video } from "lucide-react";
import { useEffect, useState } from "react";
import type { SignerProfile } from "../types";

function display(value: string | number | null) {
  return value === null || value === "" ? "-" : String(value);
}

function metric(value: number | null, suffix: string) {
  return value === null ? "-" : `${value}${suffix}`;
}

function jarvisUserUrl(userId: string) {
  return `https://jarvis.tong-gao.com/user/detail/${encodeURIComponent(userId)}?tab=profile`;
}

export function SignerDetailPage({ signerId, onBack }: { signerId: string; onBack: () => void }) {
  const [profile, setProfile] = useState<SignerProfile | null>(null);
  const [status, setStatus] = useState("正在读取签约者资料...");

  useEffect(() => {
    let active = true;
    setProfile(null);
    setStatus("正在读取签约者资料...");
    fetch(`/api/signers/${encodeURIComponent(signerId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json())?.error || "签约者资料读取失败");
        return response.json() as Promise<SignerProfile>;
      })
      .then((nextProfile) => {
        if (!active) return;
        setProfile(nextProfile);
        setStatus("");
      })
      .catch((error) => {
        if (active) setStatus(error instanceof Error ? error.message : "签约者资料读取失败");
      });
    return () => { active = false; };
  }, [signerId]);

  if (!profile) {
    return (
      <section className="page signer-detail-page">
        <button className="secondary-action return-action" onClick={onBack} type="button"><ChevronLeft size={16} />返回</button>
        <section className="panel"><p className="empty-state">{status}</p></section>
      </section>
    );
  }

  const fields = [
    ["性别", profile.gender], ["年龄", profile.age === null ? "-" : `${profile.age}岁`],
    ["生日", profile.birthDate], ["地区", profile.region],
    ["身高", metric(profile.heightCm, "cm")], ["体重", metric(profile.weightKg, "kg")],
    ["胸围", metric(profile.bustCm, "cm")], ["腰围", metric(profile.waistCm, "cm")],
    ["臀围", metric(profile.hipCm, "cm")], ["肩宽", metric(profile.shoulderCm, "cm")],
    ["鞋码", profile.shoeSize], ["衣服尺码", profile.clothingSize],
    ["纹身", profile.tattoo], ["发色", profile.hairColor],
    ["发长", profile.hairLength], ["语言", profile.languages]
  ];

  return (
    <section className="page signer-detail-page">
      <header className="signer-detail-actions">
        <button className="secondary-action return-action" onClick={onBack} type="button"><ChevronLeft size={16} />返回</button>
        <a className="secondary-action" href={jarvisUserUrl(profile.jarvisUserId)} rel="noreferrer" target="_blank">打开鑫通告资料<ExternalLink size={15} /></a>
      </header>

      <section className="signer-profile-header panel">
        <div className="signer-avatar" aria-hidden="true">
          {profile.avatarUrl ? <img alt="" src={profile.avatarUrl} /> : <UserRound size={34} />}
        </div>
        <div className="signer-profile-heading">
          <h1>{profile.nickname}</h1>
          <div className="signer-status-line">
            <span className="status-pill neutral">{profile.userType}</span>
            <span className="status-pill success">{profile.accountStatus}</span>
            <span>ID #{profile.jarvisUserId}</span>
          </div>
        </div>
        <div className="signer-account-summary">
          <div><span>微信</span><strong>{display(profile.phone)}</strong></div>
          <div><span>注册</span><strong>{display(profile.registeredAt)}</strong></div>
          <div><span>上次登录</span><strong>{display(profile.lastLoginAt)}</strong></div>
          <div><span>违规</span><strong>{profile.violationCount}</strong></div>
          <div><span>接通告</span><strong>{profile.completedBriefingCount} / {profile.acceptedBriefingCount}</strong></div>
        </div>
      </section>

      <div className="tabs signer-tabs" role="tablist"><button className="active" type="button">资料</button></div>

      <section className="panel signer-profile-content">
        <h2>基础资料</h2>
        <div className="signer-field-grid">
          {fields.map(([label, value]) => <div key={label}><span>{label}</span><strong>{display(value)}</strong></div>)}
        </div>
        <div className="signer-bio">
          <span>文字介绍</span>
          <p>{profile.bio || "暂无文字介绍。"}</p>
        </div>
      </section>

      <section className="signer-media-section">
        <div className="signer-section-heading"><Image size={18} /><h2>图片模卡</h2><span>{profile.imageUrls.length}</span></div>
        {profile.imageUrls.length ? (
          <div className="signer-image-grid">
            {profile.imageUrls.map((url, index) => <a href={url} key={url} rel="noreferrer" target="_blank"><img alt={`${profile.nickname} 图片模卡 ${index + 1}`} src={url} /></a>)}
          </div>
        ) : <p className="empty-state">暂无图片模卡。</p>}
      </section>

      <section className="signer-media-section">
        <div className="signer-section-heading"><Video size={18} /><h2>视频模卡</h2><span>{profile.videoUrls.length}</span></div>
        {profile.videoUrls.length ? (
          <div className="signer-video-grid">{profile.videoUrls.map((url) => <video controls key={url} preload="metadata" src={url} />)}</div>
        ) : <p className="empty-state">暂无视频模卡。</p>}
      </section>

      <section className="panel table-panel signer-history-panel">
        <h2>签约通告记录</h2>
        <table>
          <thead><tr><th>通告</th><th>经纪人</th><th>发布时间</th><th>签约时间</th><th>状态</th></tr></thead>
          <tbody>{profile.briefingHistory.map((item) => (
            <tr key={item.id}><td>{item.title}</td><td>{item.brokerNickname}</td><td>{item.publishedAt}</td><td>{item.signedAt || "-"}</td><td>{item.sourceStatus}</td></tr>
          ))}</tbody>
        </table>
        {profile.briefingHistory.length === 0 ? <p className="empty-state">暂无签约通告记录。</p> : null}
      </section>
    </section>
  );
}
