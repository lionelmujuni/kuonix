// fetch wrapper for the Java backend on localhost:8081.
// Backend is the only source of truth — no port 8080.

export const BASE_URL = "http://localhost:8081";

export class ApiError extends Error {
  constructor(status, body) {
    super(`API ${status}: ${body}`);
    this.status = status;
    this.body = body;
  }
}

export async function apiJson(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  if (res.status === 204) return null;
  return res.json();
}

export async function apiText(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.text();
}

export async function apiUploadMultipart(path, files, fieldName = "files") {
  const fd = new FormData();
  for (const f of files) fd.append(fieldName, f);
  const res = await fetch(`${BASE_URL}${path}`, { method: "POST", body: fd });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}

// Lightweight health check — used by app.js bootstrap to wait for backend.
export async function pingHealth(timeoutMs = 600) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}/admin/health`, {
      signal: ctrl.signal,
    });
    return res.ok || res.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function waitForBackend({ attempts = 40, delayMs = 500 } = {}) {
  for (let i = 0; i < attempts; i++) {
    if (await pingHealth()) return true;
    await new Promise(r => setTimeout(r, delayMs));
  }
  return false;
}
