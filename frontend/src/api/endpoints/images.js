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

export function classify(paths, { enableSkin = true, signal } = {}) {
  return apiJson("/images/classify", {
    method: "POST",
    body: JSON.stringify({ paths, enableSkin }),
    signal,
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

// Per-channel OpenCV histograms for the editing histogram panel. advanced=true
// also returns the contextual hue + dark-channel histograms.
export function getHistogram(path, { bins = 256, advanced = false, signal } = {}) {
  return apiJson("/images/histogram", {
    method: "POST",
    body: JSON.stringify({ path, bins, advanced }),
    signal,
  });
}

export function getCameraFeedback(paths, { enableSkin = false } = {}) {
  return apiJson("/images/camera-feedback", {
    method: "POST",
    body: JSON.stringify({ paths, enableSkin }),
  });
}
