// /admin/* — temp cleanup; useful as a smoke test for backend health.

import { apiJson } from "../client.js";

export function cleanupTemp() {
  return apiJson("/admin/cleanup-temp", { method: "POST", body: "{}" });
}
