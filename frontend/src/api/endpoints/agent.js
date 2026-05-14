// /agent/chat — SSE chat with embedded tool-call events.
// Backend emits: token, correction, commit, done, error.

import { postSse } from "../sse.js";

export function chat({ sessionId, message, imagePath, imageFeatures, imageIssues }, handlers) {
  return postSse("/agent/chat",
    { sessionId, message, imagePath, imageFeatures, imageIssues },
    handlers);
}
