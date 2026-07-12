import { Eye, EyeOff, LockKeyhole, Moon, Sun, UserRound } from "lucide-react";
import { type CSSProperties, type FormEvent, useEffect, useRef, useState } from "react";
import baseImageUrl from "../assets/login-network-dark-base-hq.avif";
import revealImageUrl from "../assets/login-network-dark-reveal-hq.avif";
import lightBaseImageUrl from "../assets/login-network-light-base-hq.avif";
import lightRevealImageUrl from "../assets/login-network-light-reveal-hq.avif";
import { hashPassword, readAccounts, saveAccounts, type StoredAccount } from "../lib/auth";

type LoginScreenProps = {
  theme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
  onLogin: (account: string) => void;
};

const loginArtworkStyle = {
  "--login-base": `url(${baseImageUrl})`,
  "--login-reveal": `url(${revealImageUrl})`,
  "--login-light-base": `url(${lightBaseImageUrl})`,
  "--login-light-reveal": `url(${lightRevealImageUrl})`
} as CSSProperties;

type AuthMode = "login" | "register";
export function LoginScreen({ theme, onThemeChange, onLogin }: LoginScreenProps) {
  const artworkRef = useRef<HTMLDivElement>(null);
  const revealRef = useRef<HTMLDivElement>(null);
  const rawPointer = useRef({ x: 0.69, y: 0.52 });
  const smoothPointer = useRef({ x: 0.69, y: 0.52 });
  const [account, setAccount] = useState(() => window.localStorage.getItem("xtg-last-account") ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>(() => readAccounts().length ? "login" : "register");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const artwork = artworkRef.current;
    const reveal = revealRef.current;
    if (!artwork || !reveal) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
    let animationFrame = 0;
    let startTime = performance.now();

    function positionInReveal(clientX: number, clientY: number) {
      const bounds = reveal!.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)),
        y: Math.max(0, Math.min(1, (clientY - bounds.top) / bounds.height))
      };
    }

    function updatePointer(event: PointerEvent) {
      rawPointer.current = positionInReveal(event.clientX, event.clientY);
    }

    function animate(time: number) {
      if (coarsePointer && !reduceMotion) {
        const elapsed = (time - startTime) / 1000;
        rawPointer.current = positionInReveal(
          window.innerWidth * (0.68 + Math.sin(elapsed * 0.42) * 0.17),
          window.innerHeight * (0.52 + Math.cos(elapsed * 0.34) * 0.2)
        );
      }
      const easing = reduceMotion ? 1 : 0.28;
      smoothPointer.current.x += (rawPointer.current.x - smoothPointer.current.x) * easing;
      smoothPointer.current.y += (rawPointer.current.y - smoothPointer.current.y) * easing;
      artwork!.style.setProperty("--spot-x", `${smoothPointer.current.x * 100}%`);
      artwork!.style.setProperty("--spot-y", `${smoothPointer.current.y * 100}%`);
      animationFrame = window.requestAnimationFrame(animate);
    }

    const initialPointer = positionInReveal(window.innerWidth * 0.69, window.innerHeight * 0.52);
    rawPointer.current = initialPointer;
    smoothPointer.current = initialPointer;
    if (!coarsePointer) window.addEventListener("pointermove", updatePointer);
    if (reduceMotion) startTime = 0;
    animationFrame = window.requestAnimationFrame(animate);
    return () => {
      window.removeEventListener("pointermove", updatePointer);
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  function changeAuthMode(nextMode: AuthMode) {
    setAuthMode(nextMode);
    setPassword("");
    setConfirmPassword("");
    setError("");
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!account.trim() || !password) {
      setError("请输入账号和密码");
      return;
    }
    const normalizedAccount = account.trim().toLowerCase();
    if (authMode === "register") {
      if (normalizedAccount.length < 3) {
        setError("账号至少需要 3 个字符");
        return;
      }
      if (password.length < 6) {
        setError("密码至少需要 6 个字符");
        return;
      }
      if (password !== confirmPassword) {
        setError("两次输入的密码不一致");
        return;
      }
      const accounts = readAccounts();
      if (accounts.some((item) => item.account === normalizedAccount)) {
        setError("该账号已存在，请直接登录");
        return;
      }
      setError("");
      setIsSubmitting(true);
      const salt = window.crypto.randomUUID();
      const passwordHash = await hashPassword(password, salt);
      saveAccounts([
        ...accounts,
        {
          account: normalizedAccount,
          passwordHash,
          salt,
          createdAt: new Date().toISOString(),
          role: accounts.length === 0 ? "super_admin" : "operations",
          enabled: true
        }
      ] satisfies StoredAccount[]);
      window.localStorage.setItem("xtg-last-account", normalizedAccount);
      window.setTimeout(() => {
        setIsSubmitting(false);
        onLogin(normalizedAccount);
      }, 450);
      return;
    }

    const storedAccount = readAccounts().find((item) => item.account === normalizedAccount);
    if (!storedAccount) {
      setError("账号不存在，请先注册");
      return;
    }
    if (!storedAccount.enabled) {
      setError("该账号已停用，请联系超级管理员");
      return;
    }
    const passwordHash = await hashPassword(password, storedAccount.salt);
    if (passwordHash !== storedAccount.passwordHash) {
      setError("账号或密码错误");
      return;
    }
    setError("");
    setIsSubmitting(true);
    if (remember) window.localStorage.setItem("xtg-last-account", normalizedAccount);
    else window.localStorage.removeItem("xtg-last-account");
    window.setTimeout(() => {
      setIsSubmitting(false);
      onLogin(normalizedAccount);
    }, 450);
  }

  return (
    <main className={`login-screen ${theme}`}>
      <section className="login-shell">
        <div className="login-artwork" ref={artworkRef} style={loginArtworkStyle} aria-hidden="true">
          <div className="login-artwork-base" />
          <div className="login-artwork-reveal" ref={revealRef} />
        </div>

        <div className="login-content">
          <div className="login-heading">
            <h1>鑫通告运营结算后台</h1>
          </div>

          <div className="login-mode-switch" role="tablist" aria-label="账户操作">
            <button aria-selected={authMode === "login"} className={authMode === "login" ? "active" : ""} onClick={() => changeAuthMode("login")} role="tab" type="button">登录</button>
            <button aria-selected={authMode === "register"} className={authMode === "register" ? "active" : ""} onClick={() => changeAuthMode("register")} role="tab" type="button">注册</button>
          </div>

          <form className="login-form" onSubmit={submitLogin}>
            <label>
              <span>账号 / 手机号</span>
              <span className="login-input">
                <UserRound size={18} />
                <input autoComplete="username" onChange={(event) => setAccount(event.target.value)} placeholder="请输入账号或手机号" value={account} />
              </span>
            </label>
            <label>
              <span>密码</span>
              <span className="login-input">
                <LockKeyhole size={18} />
                <input autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} placeholder="请输入密码" type={showPassword ? "text" : "password"} value={password} />
                <button aria-label={showPassword ? "隐藏密码" : "显示密码"} onClick={() => setShowPassword((current) => !current)} type="button">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </span>
            </label>
            {authMode === "register" ? (
              <label>
                <span>确认密码</span>
                <span className="login-input">
                  <LockKeyhole size={18} />
                  <input autoComplete="new-password" onChange={(event) => setConfirmPassword(event.target.value)} placeholder="请再次输入密码" type={showPassword ? "text" : "password"} value={confirmPassword} />
                </span>
              </label>
            ) : (
              <div className="login-options">
                <label className="remember-option">
                  <input checked={remember} onChange={(event) => setRemember(event.target.checked)} type="checkbox" />
                  <span>记住账号</span>
                </label>
                <button className="forgot-action" onClick={() => setError("请联系系统管理员重置密码")} type="button">忘记密码？</button>
              </div>
            )}
            {error ? <p className="login-error" role="alert">{error}</p> : null}
            <button className="login-submit" disabled={isSubmitting} type="submit">
              {isSubmitting ? (authMode === "register" ? "正在创建..." : "正在登录...") : (authMode === "register" ? "创建账号并进入" : "登录")}
            </button>
          </form>

        </div>
        <div className="login-theme" aria-label="主题模式">
          <button aria-label="浅色模式" className={theme === "light" ? "active" : ""} onClick={() => onThemeChange("light")} title="浅色模式" type="button"><Sun size={18} /></button>
          <button aria-label="深色模式" className={theme === "dark" ? "active" : ""} onClick={() => onThemeChange("dark")} title="深色模式" type="button"><Moon size={18} /></button>
        </div>
        <span className="login-version">ver 1.02</span>
      </section>
    </main>
  );
}
