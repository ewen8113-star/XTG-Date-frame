export type SystemRole = "super_admin" | "operations" | "finance";

export type StoredAccount = {
  account: string;
  avatarUrl?: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  role: SystemRole;
  enabled: boolean;
};

export const accountStorageKey = "xtg-local-accounts";
export const roleLabels: Record<SystemRole, string> = {
  super_admin: "超级管理员",
  operations: "运营",
  finance: "财务"
};

export const roleDescriptions: Record<SystemRole, string> = {
  super_admin: "管理系统账户、角色与全部业务权限",
  operations: "审核通告与签约凭证，并提交经纪人结算付款单",
  finance: "处理待付款订单、确认付款并查看财务报表"
};

export function readAccounts(): StoredAccount[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(accountStorageKey) ?? "[]") as Partial<StoredAccount>[];
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is Partial<StoredAccount> & Pick<StoredAccount, "account" | "passwordHash" | "salt" | "createdAt"> =>
        Boolean(item.account && item.passwordHash && item.salt && item.createdAt)
      )
      .map((item, index) => ({
        account: item.account,
        avatarUrl: typeof item.avatarUrl === "string" ? item.avatarUrl : undefined,
        passwordHash: item.passwordHash,
        salt: item.salt,
        createdAt: item.createdAt,
        role: item.role ?? (index === 0 ? "super_admin" : "operations"),
        enabled: item.enabled ?? true
      }));
  } catch {
    return [];
  }
}

export function saveAccounts(accounts: StoredAccount[]) {
  window.localStorage.setItem(accountStorageKey, JSON.stringify(accounts));
}

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers }
  });
  const value = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(value.error ?? "账户服务请求失败");
  return value;
}

export async function syncLocalAccounts() {
  const localAccounts = readAccounts();
  if (!localAccounts.length) return fetchAccounts();
  const accounts = await authRequest<StoredAccount[]>("/api/auth/import-local", {
    method: "POST",
    body: JSON.stringify({ accounts: localAccounts })
  });
  saveAccounts(accounts);
  return accounts;
}

export async function fetchAuthStatus() {
  return authRequest<{ hasAccounts: boolean }>("/api/auth/status");
}

export async function registerRemoteAccount(account: string, password: string) {
  return authRequest<StoredAccount>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ account, password })
  });
}

export async function loginRemoteAccount(account: string, password: string) {
  return authRequest<StoredAccount>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ account, password })
  });
}

export async function fetchAccounts() {
  return authRequest<StoredAccount[]>("/api/auth/accounts");
}

export async function updateRemoteAccount(
  account: string,
  changes: Partial<Pick<StoredAccount, "role" | "enabled">> & { avatarDataUrl?: string }
) {
  return authRequest<StoredAccount[]>(`/api/auth/accounts/${encodeURIComponent(account)}`, {
    method: "PATCH",
    body: JSON.stringify(changes)
  });
}

export async function hashPassword(password: string, salt: string) {
  const bytes = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
