// /settings/ollama — read, save, list curated models.

import { apiJson } from "../client.js";

export function getOllama() {
  return apiJson("/settings/ollama");
}

export function saveOllama(settings) {
  return apiJson("/settings/ollama", { method: "POST", body: JSON.stringify(settings) });
}

export function listModels() {
  return apiJson("/settings/ollama/models");
}
