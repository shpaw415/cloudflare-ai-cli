import { saveAuth, loadAuth, type Auth } from "./config";
import { refreshAccessToken } from "./oauth";

export async function getValidAuth(): Promise<Auth> {
  const auth = loadAuth();
  if (!auth) {
    console.error("Not logged in. Run `cf-ai login` first.");
    process.exit(1);
  }
  if (!auth.oauth) return auth;

  const expiresAt = Date.parse(auth.oauth.expiresAt);
  const refreshNeeded = Number.isNaN(expiresAt) || expiresAt - 60_000 <= Date.now();
  if (!refreshNeeded) return auth;

  try {
    const tokens = await refreshAccessToken(auth.oauth.refreshToken);
    const next: Auth = {
      ...auth,
      token: tokens.accessToken,
      oauth: {
        refreshToken: tokens.refreshToken || auth.oauth.refreshToken,
        expiresAt: new Date(Date.now() + tokens.expiresIn * 1000).toISOString(),
        scopes: tokens.scopes.length ? tokens.scopes : auth.oauth.scopes,
      },
    };
    saveAuth(next);
    return next;
  } catch (err) {
    console.error(`Token refresh failed (${err instanceof Error ? err.message : String(err)}).`);
    console.error("Run `cf-ai login` to sign in again.");
    process.exit(1);
  }
}
