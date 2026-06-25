// /style-profiles/* — CRUD, portfolio indexing, gap computation.

import { apiJson } from "../client.js";

export function listProfiles() {
  return apiJson("/style-profiles");
}

export function createProfile(name, imagePath) {
  return apiJson("/style-profiles", {
    method: "POST",
    body: JSON.stringify({ name, imagePath }),
  });
}

export function deleteProfile(id) {
  return apiJson(`/style-profiles/${id}`, { method: "DELETE" });
}

export function indexPortfolio(paths) {
  return apiJson("/style-profiles/index-portfolio", {
    method: "POST",
    body: JSON.stringify({ paths }),
  });
}

export function getStyleGap(imagePath, profileId = null) {
  const qs = profileId ? `?imagePath=${encodeURIComponent(imagePath)}&profileId=${encodeURIComponent(profileId)}`
                       : `?imagePath=${encodeURIComponent(imagePath)}`;
  return apiJson(`/style-profiles/gap${qs}`);
}
