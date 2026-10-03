import { parseArgs } from "node:util";
import { DEFAULT_GATEWAY_ID, saveAuth, type Auth, type Backend } from "../lib/config";
import { maskToken } from "../lib/backends";
import { promptHidden, promptLine } from "../lib/prompt";
import { fetchAccounts, loginBrowser, loginDevice, type CloudflareAccount } from "../lib/oauth";

function normalizeBackend(value: string): Backend | null {
  const v = value.trim().toLowerCase();
  if (v === "gateway") return "gateway";
  if (v === "workers-ai" || v === "workersai" || v === "workers_ai") return "workers-ai";
  return null;
}

async function selectAccount(
  accounts: CloudflareAccount[],
  preselected: string | undefined,
): Promise<string> {
  if (accounts.length === 0) {
    throw new Error("No Cloudflare accounts found for this login.");
  }
  if (preselected) {
    const match = accounts.find((a) => a.id === preselected);
    if (!match) {
      throw new Error(`Account ${preselected} not found. Available: ${accounts.map((a) => a.id).join(", ")}`);
    }
    return match.id;
  }
  if (accounts.length === 1) return accounts[0].id;
  if (!process.stdin.isTTY) {
    throw new Error(`Multiple accounts found; pass --account <id>. Available: ${accounts.map((a) => a.id).join(", ")}`);
  }
  console.log("Select an account:");
  accounts.forEach((a, i) => console.log(`  ${i + 1}) ${a.name} (${a.id})`));
  for (;;) {
    const answer = await promptLine("Account number");
    const idx = Number.parseInt(answer, 10);
    if (idx >= 1 && idx <= accounts.length) return accounts[idx - 1].id;
    console.error(`  Enter a number between 1 and ${accounts.length}.`);
  }
}

export async function runLogin(args: string[]): Promise<void> {
  const { values } = parseArgs({
    args,
    options: {
      browser: { type: "boolean", default: false },
      device: { type: "boolean", default: false },
      backend: { type: "string" },
      account: { type: "string" },
      gateway: { type: "string" },
      token: { type: "string" },
    },
    allowPositionals: true,
  });

  if (values.device && values.token) {
    console.error("Error: --device cannot be combined with --token.");
    process.exit(1);
  }

  console.log("Login to Cloudflare AI (gateway or Workers AI).");

  let backend: Backend | null = values.backend ? normalizeBackend(values.backend) : null;
  while (backend === null) {
    const answer = await promptLine("Backend (gateway / workers-ai)", "gateway");
    backend = normalizeBackend(answer);
    if (backend === null) console.error("  Invalid backend. Type `gateway` or `workers-ai`.");
  }

  let gatewayId: string | undefined;
  if (backend === "gateway") {
    gatewayId = (values.gateway ?? (await promptLine("Gateway ID", DEFAULT_GATEWAY_ID))).trim();
    if (gatewayId === "") gatewayId = DEFAULT_GATEWAY_ID;
  }

  let token = values.token?.trim() ?? "";
  let oauth: Auth["oauth"] | undefined;

  if (!token && (values.browser || values.device || process.stdin.isTTY)) {
    const tokens = values.device ? await loginDevice() : await loginBrowser();
    const accounts = await fetchAccounts(tokens.accessToken);
    const accountId = await selectAccount(accounts, values.account);
    token = tokens.accessToken;
    oauth = {
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
      scopes: tokens.scopes,
    };
    const auth: Auth = { backend, accountId, token };
    if (gatewayId) auth.gatewayId = gatewayId;
    auth.oauth = oauth;
    saveAuth(auth);
    const via = values.device ? "device" : "browser";
    console.log(`Logged in via ${via}: backend=${backend} account=${accountId}${gatewayId ? ` gateway=${gatewayId}` : ""}`);
    console.log(`Access token expires: ${auth.oauth.expiresAt} (auto-refreshes on use)`);
    return;
  }

  while (token === "") {
    token = await promptHidden("API token (input hidden): ");
    if (token === "") console.error("  Token cannot be empty.");
  }

  let accountId = values.account?.trim() ?? "";
  while (accountId === "") {
    accountId = await promptLine("Cloudflare account ID");
  }

  const auth: Auth = { backend, accountId, token };
  if (gatewayId) auth.gatewayId = gatewayId;
  saveAuth(auth);

  console.log(`Logged in: backend=${backend} account=${accountId}${gatewayId ? ` gateway=${gatewayId}` : ""}`);
  console.log(`Token saved (0600): ${maskToken(token)}`);
}
