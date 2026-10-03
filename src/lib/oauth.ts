const CLIENT_ID = "54d11594-84e4-41aa-b438-e81b8fa78ee7";
const AUTH_URL = "https://dash.cloudflare.com/oauth2/auth";
const TOKEN_URL = "https://dash.cloudflare.com/oauth2/token";
const REVOKE_URL = "https://dash.cloudflare.com/oauth2/revoke";
const DEVICE_AUTH_URL = "https://dash.cloudflare.com/oauth2/device/auth";
const REDIRECT_URI = "http://localhost:8976/oauth/callback";
const CALLBACK_PORT = 8976;
export const OAUTH_SCOPES = ["account:read", "user:read", "ai:write"];
const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

export type OAuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scopes: string[];
};

export type CloudflareAccount = { id: string; name: string };

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function randomString(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return b64url(bytes);
}

async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomString(48);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(digest)) };
}

export function buildAuthUrl(challenge: string, state: string): string {
  const scopes = encodeURIComponent([...OAUTH_SCOPES, "offline_access"].join(" "));
  return (
    `${AUTH_URL}?response_type=code&` +
    `client_id=${encodeURIComponent(CLIENT_ID)}&` +
    `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
    `scope=${scopes}&` +
    `state=${encodeURIComponent(state)}&` +
    `code_challenge=${encodeURIComponent(challenge)}&` +
    `code_challenge_method=S256`
  );
}

export function openBrowser(url: string): boolean {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    const proc = Bun.spawn([cmd, url], { stdout: "ignore", stderr: "ignore", stdin: "ignore" });
    return proc.exitCode === null || proc.exitCode === 0;
  } catch {
    return false;
  }
}

async function exchangeToken(body: Record<string, string>): Promise<OAuthTokens> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(body).toString(),
    });
  } catch (err) {
    throw new Error(`Network error contacting ${TOKEN_URL}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok || !json || json.error || !json.access_token) {
    const message = json?.error_description ?? json?.error ?? `HTTP ${res.status}`;
    throw new Error(`Token exchange failed: ${message}`);
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: Number(json.expires_in) || 0,
    scopes: typeof json.scope === "string" ? json.scope.split(" ").filter(Boolean) : [],
  };
}

async function waitForCallback(state: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    let server: ReturnType<typeof Bun.serve>;
    const timer = setTimeout(() => {
      server.stop(true);
      reject(new Error("Timed out waiting for browser login (5 minutes)."));
    }, CALLBACK_TIMEOUT_MS);

    const finish = (fn: () => void) => {
      clearTimeout(timer);
      setTimeout(() => server.stop(true), 1000);
      fn();
    };

    try {
      server = Bun.serve({
        port: CALLBACK_PORT,
        hostname: "127.0.0.1",
        async fetch(req) {
          const url = new URL(req.url);
          if (url.pathname !== "/oauth/callback") {
            return new Response("Not found", { status: 404 });
          }
          const err = url.searchParams.get("error");
          if (err) {
            finish(() => reject(new Error(`Login denied: ${err} ${url.searchParams.get("error_description") ?? ""}`.trim())));
            return new Response("cf-ai: login denied. You can close this tab.", { status: 400 });
          }
          const code = url.searchParams.get("code");
          const returnedState = url.searchParams.get("state");
          if (!code || !returnedState) {
            return new Response("cf-ai: missing code/state", { status: 400 });
          }
          if (returnedState !== state) {
            finish(() => reject(new Error("State mismatch in OAuth callback — possible CSRF, aborting.")));
            return new Response("cf-ai: state mismatch", { status: 400 });
          }
          finish(() => resolve(code));
          return new Response(
            "<html><body style='font-family:sans-serif;background:#0b0d10;color:#eee;display:grid;place-items:center;height:100vh'><div><h1>cf-ai</h1><p>Logged in. You can close this tab.</p></div></body></html>",
            { headers: { "Content-Type": "text/html" } },
          );
        },
        error() {
          return new Response("error", { status: 500 });
        },
      });
    } catch (err) {
      clearTimeout(timer);
      reject(new Error(`Cannot start callback server on port ${CALLBACK_PORT} (is another login running?): ${err instanceof Error ? err.message : String(err)}`));
    }
  });
}

export async function loginBrowser(): Promise<OAuthTokens> {
  const { verifier, challenge } = await pkcePair();
  const state = randomString(32);
  const url = buildAuthUrl(challenge, state);

  console.log("Opening browser for Cloudflare login...");
  console.log(`\n  ${url}\n`);
  if (!openBrowser(url)) {
    console.log("(Could not open a browser automatically — open the URL above manually.)");
    console.log("(On a remote/SSH machine without a browser, use `cf-ai login --device` instead.)");
  }
  console.log(`Waiting for authorization on ${REDIRECT_URI} ...`);

  const code = await waitForCallback(state);
  return await exchangeToken({
    grant_type: "authorization_code",
    code,
    client_id: CLIENT_ID,
    code_verifier: verifier,
    redirect_uri: REDIRECT_URI,
  });
}

type DeviceAuthResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
};

export async function loginDevice(): Promise<OAuthTokens> {
  let res: Response;
  try {
    res = await fetch(DEVICE_AUTH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        scope: [...OAUTH_SCOPES, "offline_access"].join(" "),
      }).toString(),
    });
  } catch (err) {
    throw new Error(`Network error contacting ${DEVICE_AUTH_URL}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const device = (await res.json().catch(() => null)) as any;
  if (!res.ok || !device?.device_code || !device?.user_code || !device?.verification_uri) {
    const message = device?.error_description ?? device?.error ?? `HTTP ${res.status}`;
    throw new Error(`Device authorization failed: ${message}`);
  }

  const complete = device.verification_uri_complete;
  console.log("Device login — on any machine with a browser, open:");
  console.log(`\n  ${complete ?? device.verification_uri}\n`);
  console.log(`Code: ${device.user_code}`);
  if (complete && !openBrowser(complete)) {
    console.log("(Could not open a browser on this machine — use the URL above elsewhere.)");
  }

  const deadline = Date.now() + (Number(device.expires_in) || 600) * 1000;
  let intervalMs = Math.max((Number(device.interval) || 5) * 1000, 1000);

  for (;;) {
    if (Date.now() > deadline) {
      throw new Error("Device login timed out before approval.");
    }
    await Bun.sleep(intervalMs);
    const pollRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: device.device_code,
        client_id: CLIENT_ID,
      }).toString(),
    });
    const poll = (await pollRes.json().catch(() => null)) as any;
    if (poll?.access_token) {
      return {
        accessToken: poll.access_token,
        refreshToken: poll.refresh_token,
        expiresIn: Number(poll.expires_in) || 0,
        scopes: typeof poll.scope === "string" ? poll.scope.split(" ").filter(Boolean) : [],
      };
    }
    const errCode = poll?.error;
    if (errCode === "authorization_pending") continue;
    if (errCode === "slow_down") {
      intervalMs += 5000;
      continue;
    }
    const message = poll?.error_description ?? errCode ?? `HTTP ${pollRes.status}`;
    throw new Error(`Device login failed: ${message}`);
  }
}

export async function refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
  return await exchangeToken({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
  });
}

export async function revokeToken(token: string): Promise<void> {
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token, client_id: CLIENT_ID }).toString(),
    });
  } catch {
    console.error("Warning: could not reach Cloudflare to revoke the token; removed locally anyway.");
  }
}

export async function fetchAccounts(token: string): Promise<CloudflareAccount[]> {
  let res: Response;
  try {
    res = await fetch("https://api.cloudflare.com/client/v4/memberships?per_page=50", {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    throw new Error(`Network error fetching accounts: ${err instanceof Error ? err.message : String(err)}`);
  }
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok || !json?.success) {
    const message = json?.errors?.[0]?.message ?? `HTTP ${res.status}`;
    throw new Error(`Could not list accounts: ${message}`);
  }
  return (json.result ?? [])
    .map((m: any) => ({ id: m.account?.id ?? m.id, name: m.account?.name ?? m.name ?? m.account?.id }))
    .filter((a: CloudflareAccount) => Boolean(a.id));
}
