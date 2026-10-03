import { deleteAuth, loadAuth } from "../lib/config";
import { revokeToken } from "../lib/oauth";

export async function runLogout(): Promise<void> {
  const auth = loadAuth();
  if (!auth) {
    console.log("No stored credentials found.");
    return;
  }
  if (auth.oauth) {
    await revokeToken(auth.oauth.refreshToken);
  }
  deleteAuth();
  console.log(auth.oauth ? "Logged out. OAuth token revoked and credentials deleted." : "Logged out. Stored credentials deleted.");
}
