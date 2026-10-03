import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type Backend = "gateway" | "workers-ai";

export type Kind = "chat" | "image";

export type Auth = {
  backend: Backend;
  accountId: string;
  gatewayId?: string;
  token: string;
  oauth?: {
    refreshToken: string;
    expiresAt: string;
    scopes?: string[];
  };
};

export type AgentProfile = {
  name: string;
  model: string;
  kind?: Kind;
  backend?: Backend;
  system?: string;
  temperature?: number;
  maxTokens?: number;
};

export type AgentsFile = Record<string, AgentProfile>;

export const BACKENDS: Backend[] = ["gateway", "workers-ai"];
export const DEFAULT_GATEWAY_ID = "home-ai";

export function configDir(): string {
  if (process.env.CF_AI_CONFIG_DIR) return process.env.CF_AI_CONFIG_DIR;
  const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  return join(base, "cf-ai");
}

export function authPath(): string {
  return join(configDir(), "auth.json");
}

export function agentsPath(): string {
  return join(configDir(), "agents.json");
}

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    throw new Error(`Invalid JSON in ${path} — fix or delete the file.`);
  }
}

export function loadAuth(): Auth | null {
  return readJson<Auth>(authPath());
}

export function requireAuth(): Auth {
  const auth = loadAuth();
  if (!auth) {
    console.error("Not logged in. Run `cf-ai login` first.");
    process.exit(1);
  }
  return auth;
}

export function saveAuth(auth: Auth): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(authPath(), JSON.stringify(auth, null, 2) + "\n");
  chmodSync(authPath(), 0o600);
}

export function deleteAuth(): boolean {
  if (!existsSync(authPath())) return false;
  rmSync(authPath());
  return true;
}

export function loadAgents(): AgentsFile {
  return readJson<AgentsFile>(agentsPath()) ?? {};
}

export function saveAgents(agents: AgentsFile): void {
  mkdirSync(configDir(), { recursive: true });
  writeFileSync(agentsPath(), JSON.stringify(agents, null, 2) + "\n");
}

export function envAuth(): Auth | null {
  const token = process.env.CF_AI_TOKEN;
  const accountId = process.env.CF_AI_ACCOUNT_ID;
  if (!token || !accountId) return null;
  const backend = (process.env.CF_AI_BACKEND as Backend | undefined) ?? "gateway";
  return {
    token,
    accountId,
    backend,
    gatewayId: process.env.CF_AI_GATEWAY_ID ?? DEFAULT_GATEWAY_ID,
  };
}
