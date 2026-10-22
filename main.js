"use strict";
// ?test loads the in-page test suite (see tests.js / run-tests.js)
if (location.search.indexOf("test") >= 0) { const s = document.createElement("script"); s.src = "tests.js"; document.body.appendChild(s); }
document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => {
  const id = b.dataset.tab;
  if (!Missions.canOpen(id)) {
    Missions.toast("🔒 Earn a ⭐ in the previous station first, or switch to Free explore.");
    return;
  }
  showTab(id);
}));
$("copy").addEventListener("click", async (e) => {
  try { await navigator.clipboard.writeText($("code").textContent); e.target.textContent = "Copied ✓"; }
  catch { e.target.textContent = "Select & copy"; }
  setTimeout(() => (e.target.textContent = "Copy"), 1500);
});
showTab(location.hash.slice(1) || "pwm");
Missions.render();
requestAnimationFrame(loop);

if (/[?&]test/.test(location.search)) { const s = document.createElement("script"); s.src = "tests.js"; document.body.appendChild(s); }
