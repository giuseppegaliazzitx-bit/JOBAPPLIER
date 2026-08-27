const API = "http://127.0.0.1:8787";

chrome.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== "apply" || typeof message.url !== "string") {
    return;
  }
  fetch(`${API}/api/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message.url }),
  });
});
