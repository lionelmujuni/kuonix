// /color-correct/* — methods, camera matrices, preview / commit / apply.

import { apiJson } from "../client.js";

export function listMethods() {
  return apiJson("/color-correct/methods");
}

export function listCameraMatrices() {
  return apiJson("/color-correct/camera-matrices");
}

export function preview(req) {
  return apiJson("/color-correct/preview", { method: "POST", body: JSON.stringify(req) });
}

export function commit(req) {
  return apiJson("/color-correct/commit", { method: "POST", body: JSON.stringify(req) });
}

export function apply(req) {
  return apiJson("/color-correct/apply", { method: "POST", body: JSON.stringify(req) });
}

export function exportImage(req) {
  return apiJson("/color-correct/export", { method: "POST", body: JSON.stringify(req) });
}
