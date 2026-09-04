/**
 * Atheneum chat widget. One script tag on the WordPress site:
 *
 *   <script src="https://portal.atheneummartialarts.com/widget.js" async></script>
 *
 * It adds a launcher button and, on click, an iframe of /embed/chat. Everything lives in the
 * iframe so the site's theme cannot restyle the chat and the chat cannot restyle the site.
 */
(function () {
  var script = document.currentScript;
  var origin = script ? new URL(script.src).origin : window.location.origin;
  var LABEL = (script && script.getAttribute("data-label")) || "Chat with us";

  if (window.__atheneumChat) return;
  window.__atheneumChat = true;

  var style = document.createElement("style");
  style.textContent =
    ".atheneum-chat-launcher{position:fixed;bottom:20px;right:20px;z-index:2147483000;" +
    "padding:14px 20px;border:0;border-radius:999px;background:#0039b7;color:#fff;" +
    "font:600 15px/1 system-ui,-apple-system,'Segoe UI',sans-serif;cursor:pointer;" +
    "box-shadow:0 10px 30px rgba(0,57,183,.35)}" +
    ".atheneum-chat-launcher:hover{background:#002a89}" +
    ".atheneum-chat-frame{position:fixed;bottom:20px;right:20px;z-index:2147483000;width:380px;" +
    "height:min(560px,calc(100vh - 40px));border:0;border-radius:16px;display:none;" +
    "box-shadow:0 20px 60px rgba(15,23,42,.28);background:#fff}" +
    ".atheneum-chat-frame.open{display:block}" +
    "@media (max-width:440px){.atheneum-chat-frame{width:calc(100vw - 24px);right:12px;bottom:12px;" +
    "height:calc(100vh - 24px)}.atheneum-chat-launcher{right:12px;bottom:12px}}";
  document.head.appendChild(style);

  var frame = document.createElement("iframe");
  frame.className = "atheneum-chat-frame";
  frame.title = "Chat with Atheneum Martial Arts";
  frame.setAttribute("loading", "lazy");

  var launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "atheneum-chat-launcher";
  launcher.textContent = LABEL;

  function open() {
    // The iframe is only fetched when someone opens the chat, so the marketing page stays fast.
    if (!frame.src) frame.src = origin + "/embed/chat";
    frame.classList.add("open");
    launcher.style.display = "none";
  }

  function close() {
    frame.classList.remove("open");
    launcher.style.display = "";
  }

  launcher.addEventListener("click", open);
  window.addEventListener("message", function (event) {
    if (event.origin === origin && event.data && event.data.atheneumChat === "close") close();
  });

  document.body.appendChild(frame);
  document.body.appendChild(launcher);
})();
