import { deleteAuth } from "../lib/config";

export async function runLogout(): Promise<void> {
  if (deleteAuth()) {
    console.log("Logged out. Stored credentials deleted.");
  } else {
    console.log("No stored credentials found.");
  }
}
