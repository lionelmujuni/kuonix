// /images/* — uploads, decode stream, classify, group, urls.

import { apiJson, apiUploadMultipart } from "../client.js";
import { postSse, eventSourceSse } from "../sse.js";

export function uploadJpeg(files) {
  return apiUploadMultipart("/images/upload", files, "files");
}

export function uploadRaw(files) {
  return apiUploadMultipart("/images/upload-raw", files, "files");
}

export function decodeStream(taskIds, handlers) {
  const qs = taskIds.map((id) => `taskIds=${encodeURIComponent(id)}`).join("&");
  return eventSourceSse(`/images/decode-stream?${qs}`, handlers);
}

export function classify(paths, { enableSkin = true } = {}) {
  return apiJson("/images/classify", {
    method: "POST",
    body: JSON.stringify({ paths, enableSkin }),
  });
}

export function classifyStream(paths, handlers, { enableSkin = true } = {}) {
  return postSse("/images/classify-stream", { paths, enableSkin }, handlers);
}

export function group({ paths, outputRoot, copy = true, enableSkin = true, filterIssue }) {
  return apiJson("/images/group", {
    method: "POST",
    body: JSON.stringify({ paths, outputRoot, copy, enableSkin, filterIssue }),
  });
}

export function getUrls(paths) {
  return apiJson("/images/get-urls", {
    method: "POST",
    body: JSON.stringify({ paths }),
  });
}
