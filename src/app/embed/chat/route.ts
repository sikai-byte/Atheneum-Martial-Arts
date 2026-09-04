import { getBotConfig } from "@/lib/leads/config";
import { SMS_CONSENT_TEXT } from "@/lib/leads/webchat";

export const dynamic = "force-dynamic";

/**
 * The chat window itself, served as a self-contained HTML document rather than a React page.
 *
 * It renders inside an iframe on the studio's WordPress site, and that is the reason: the host
 * theme's CSS cannot reach into it and it cannot reach out, so the widget looks the same on every
 * page and cannot break the site's layout. It also keeps the payload a few kilobytes instead of a
 * React bundle on a marketing page.
 */
export async function GET() {
  const config = await getBotConfig();
  const html = page({
    studioName: config.studioName,
    greeting: config.webChatGreeting,
    consentText: SMS_CONSENT_TEXT,
    enabled: config.webChatEnabled,
  });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Only the studio's own site may frame it.
      "Content-Security-Policy": `frame-ancestors ${frameAncestors()}`,
      "Cache-Control": "no-store",
    },
  });
}

function frameAncestors(): string {
  const origins = (process.env.WEB_CHAT_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return origins.length > 0 ? ["'self'", ...origins].join(" ") : "*";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character,
  );
}

function page(input: {
  studioName: string;
  greeting: string;
  consentText: string;
  enabled: boolean;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(input.studioName)} — chat</title>
<style>
  :root {
    --blue: #0039b7;
    --blue-dark: #002a89;
    --slate-50: #f8fafc;
    --slate-200: #e2e8f0;
    --slate-500: #64748b;
    --slate-900: #0f172a;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; flex-direction: column;
    font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    color: var(--slate-900); background: #fff;
  }
  header {
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    padding: 14px 16px; background: var(--blue); color: #fff;
  }
  header p { margin: 0; font-weight: 600; letter-spacing: -0.01em; }
  header small { display: block; font-weight: 400; opacity: 0.8; }
  header button { background: none; border: 0; color: #fff; font-size: 20px; cursor: pointer; line-height: 1; }
  #log { flex: 1; overflow-y: auto; padding: 16px; background: var(--slate-50); }
  .msg { max-width: 85%; margin-bottom: 10px; padding: 10px 12px; border-radius: 14px; white-space: pre-wrap; }
  .bot { background: #fff; border: 1px solid var(--slate-200); border-bottom-left-radius: 4px; }
  .visitor { margin-left: auto; background: var(--blue); color: #fff; border-bottom-right-radius: 4px; }
  .note { font-size: 13px; color: var(--slate-500); text-align: center; margin: 8px 0; }
  form { border-top: 1px solid var(--slate-200); padding: 12px; display: flex; gap: 8px; }
  input[type=text], input[type=tel], input[type=email] {
    flex: 1; min-width: 0; padding: 10px 12px; border: 1px solid var(--slate-200);
    border-radius: 10px; font: inherit;
  }
  input:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
  button.send {
    padding: 10px 16px; border: 0; border-radius: 10px; background: var(--blue);
    color: #fff; font: inherit; font-weight: 600; cursor: pointer;
  }
  button.send:hover { background: var(--blue-dark); }
  button.send:disabled { opacity: 0.5; cursor: default; }
  #capture { display: none; border-top: 1px solid var(--slate-200); padding: 12px; }
  #capture.open { display: block; }
  #capture p { margin: 0 0 10px; font-weight: 600; }
  #capture .row { display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px; }
  .consent { display: flex; gap: 8px; font-size: 12px; color: var(--slate-500); margin-bottom: 10px; }
  .consent input { margin-top: 2px; }
  .error { color: #b91c1c; font-size: 13px; margin: 0 12px 8px; }
</style>
</head>
<body>
<header>
  <p>${escapeHtml(input.studioName)}<small>Usually replies in a moment</small></p>
  <button type="button" id="close" aria-label="Close chat">&times;</button>
</header>

<div id="log" role="log" aria-live="polite"></div>
<p class="error" id="error" hidden></p>

<form id="say">
  <input type="text" id="text" placeholder="Ask about classes, times, kids' programmes…" autocomplete="off" maxlength="1000" ${input.enabled ? "" : "disabled"} />
  <button class="send" type="submit" ${input.enabled ? "" : "disabled"}>Send</button>
</form>

<form id="capture">
  <p>Leave your details and a coach will get back to you</p>
  <div class="row">
    <input type="text" id="name" placeholder="First name" autocomplete="given-name" required />
    <input type="tel" id="phone" placeholder="Phone number" autocomplete="tel" />
    <input type="email" id="email" placeholder="Email (if you'd rather)" autocomplete="email" />
  </div>
  <label class="consent">
    <input type="checkbox" id="consent" />
    <span>${escapeHtml(input.consentText)}</span>
  </label>
  <button class="send" type="submit">Send my details</button>
</form>

<script>
(function () {
  var GREETING = ${JSON.stringify(input.greeting)};
  var log = document.getElementById("log");
  var errorBox = document.getElementById("error");
  var sayForm = document.getElementById("say");
  var textInput = document.getElementById("text");
  var captureForm = document.getElementById("capture");
  var chatId = null;
  var starting = null;

  function bubble(role, body) {
    var el = document.createElement("div");
    el.className = "msg " + role;
    el.textContent = body;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function note(body) {
    var el = document.createElement("p");
    el.className = "note";
    el.textContent = body;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }

  function fail(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function post(payload) {
    errorBox.hidden = true;
    return fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (response) {
      return response.json().then(function (data) {
        return { ok: response.ok, data: data };
      });
    });
  }

  bubble("bot", GREETING);

  // The chat row is only created once the visitor actually says something, so a page view does not
  // fill the database with empty conversations.
  function ensureChat() {
    if (chatId) return Promise.resolve(chatId);
    if (starting) return starting;
    starting = post({
      action: "start",
      pageUrl: document.referrer || "",
      referrer: document.referrer || ""
    }).then(function (result) {
      if (!result.ok) throw new Error(result.data.error || "Chat is unavailable.");
      chatId = result.data.chatId;
      return chatId;
    });
    return starting;
  }

  sayForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var body = textInput.value.trim();
    if (!body) return;
    textInput.value = "";
    bubble("visitor", body);
    var thinking = bubble("bot", "…");

    ensureChat()
      .then(function (id) {
        return post({ action: "message", chatId: id, message: body });
      })
      .then(function (result) {
        thinking.remove();
        bubble("bot", result.data.message || result.data.error || "Sorry — try again?");
        if (result.data.askForContact) captureForm.classList.add("open");
      })
      .catch(function (error) {
        thinking.remove();
        fail(error.message || "Something went wrong. Please call the studio.");
      });
  });

  captureForm.addEventListener("submit", function (event) {
    event.preventDefault();
    var name = document.getElementById("name").value.trim();
    var phone = document.getElementById("phone").value.trim();
    var email = document.getElementById("email").value.trim();
    if (!phone && !email) {
      fail("Leave a phone number or an email so a coach can reach you.");
      return;
    }
    post({
      action: "capture",
      chatId: chatId,
      name: name,
      phone: phone,
      email: email,
      smsConsent: document.getElementById("consent").checked
    }).then(function (result) {
      if (!result.ok) {
        fail(result.data.error || "That didn't save — try again?");
        return;
      }
      captureForm.classList.remove("open");
      note(result.data.message);
    });
  });

  document.getElementById("close").addEventListener("click", function () {
    parent.postMessage({ atheneumChat: "close" }, "*");
  });
})();
</script>
</body>
</html>`;
}
