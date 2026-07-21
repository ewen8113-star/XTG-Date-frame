import { Eye, EyeOff, LockKeyhole, Moon, Sun, UserRound } from "lucide-react";
import { type CSSProperties, type FormEvent, useEffect, useState } from "react";
import darkBackgroundUrl from "../assets/login-operations-dark-v2.avif";
import lightBackgroundUrl from "../assets/login-operations-light-v2.avif";
import { appVersion } from "../data/releaseNotes";
import { fetchAuthStatus, loginRemoteAccount, readAccounts, registerRemoteAccount, saveAccounts, syncLocalAccounts } from "../lib/auth";

type LoginScreenProps = {
  theme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
  onLogin: (account: string) => void;
};

const loginArtworkStyle = {
  "--login-background-dark": `url(${darkBackgroundUrl})`,
  "--login-background-light": `url(${lightBackgroundUrl})`
} as CSSProperties;

type AuthMode = "login" | "register";
export function LoginScreen({ theme, onThemeChange, onLogin }: LoginScreenProps) {
  const [account, setAccount] = useState(() => window.localStorage.getItem("xtg-last-account") ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>(() => readAccounts().length ? "login" : "register");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    void syncLocalAccounts()
      .then(() => fetchAuthStatus())
      .then(({ hasAccounts }) => {
        if (hasAccounts) setAuthMode("login");
      })
      .catch(() => undefined);
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
      try {
        await syncLocalAccounts();
        const created = await registerRemoteAccount(normalizedAccount, password);
        saveAccounts([...readAccounts().filter((item) => item.account !== created.account), created]);
      } catch (registerError) {
        setIsSubmitting(false);
        setError(registerError instanceof Error ? registerError.message : "注册失败");
        return;
      }
      window.localStorage.setItem("xtg-last-account", normalizedAccount);
      window.setTimeout(() => {
        setIsSubmitting(false);
        onLogin(normalizedAccount);
      }, 450);
      return;
    }

    setIsSubmitting(true);
    try {
      await syncLocalAccounts();
      const authenticated = await loginRemoteAccount(normalizedAccount, password);
      saveAccounts([...readAccounts().filter((item) => item.account !== authenticated.account), authenticated]);
    } catch (loginError) {
      setIsSubmitting(false);
      setError(loginError instanceof Error ? loginError.message : "登录失败");
      return;
    }
    setError("");
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
        <div className="login-artwork" style={loginArtworkStyle} aria-hidden="true" />

        <div className="login-content">
          <span className="login-glow login-glow-one" aria-hidden="true" />
          <span className="login-glow login-glow-two" aria-hidden="true" />
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
        <span className="login-version">ver {appVersion}</span>
      </section>
    </main>
  );
}
