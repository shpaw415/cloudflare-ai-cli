import { loadAuth } from "../lib/config";
import { maskToken } from "../lib/backends";

export async function runWhoami(): Promise<void> {
  const auth = loadAuth();
  if (!auth) {
    console.log("Not logged in. Run `cf-ai login` first.");
    return;
  }
  console.log(`backend:  ${auth.backend}`);
  console.log(`account:  ${auth.accountId}`);
  if (auth.gatewayId) console.log(`gateway:  ${auth.gatewayId}`);
  console.log(`login:    ${auth.oauth ? "browser (OAuth)" : "API token"}`);
  if (auth.oauth) console.log(`expires:  ${auth.oauth.expiresAt} (auto-refreshes on use)`);
  console.log(`token:    ${maskToken(auth.token)}`);
}
