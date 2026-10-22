#!/usr/bin/env node
"use strict";
// Runs the in-page tests (index.html?test) in headless Edge/Chrome through the DevTools protocol
// and prints PASS/FAIL. Needs Node 22+ (built-in WebSocket/fetch) and Edge or Chrome installed.
// Usage: node run-tests.js        (exit code 1 if anything fails; BROWSER=/path overrides the browser)
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { pathToFileURL } = require("url");

const candidates = [
  process.env.BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const browser = candidates.find((p) => fs.existsSync(p));
if (!browser) { console.error("No Edge/Chrome found. Set BROWSER=/path/to/browser."); process.exit(2); }

const port = 9300 + Math.floor(Math.random() * 500);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "servolab-"));
const url = pathToFileURL(path.join(__dirname, "index.html")).href + "?test";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const proc = spawn(browser, ["--headless", "--disable-gpu", "--no-first-run", `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`, "about:blank"], { stdio: "ignore" });
  try {
    let up = false;
    for (let i = 0; i < 60 && !up; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); up = true; } catch { await sleep(250); } }
    if (!up) throw new Error("browser did not start");

    const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" })).json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("websocket failed")); });
    let id = 0; const pending = new Map();
    ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
    const evaluate = (expression) => new Promise((res) => { const n = ++id; pending.set(n, res); ws.send(JSON.stringify({ id: n, method: "Runtime.evaluate", params: { expression, returnByValue: true } })); });

    let text = null;
    for (let i = 0; i < 120 && !text; i++) {
      const r = await evaluate("(document.getElementById('testOut')||{}).textContent || ''");
      text = r.result && r.result.result && r.result.result.value;
      if (!text) await sleep(250);
    }
    ws.close();
    if (!text) throw new Error("no test output in the page (did a script fail to load?)");
    console.log(text);
    return /TESTS: \d+ passed, 0 failed/.test(text) ? 0 : 1;
  } finally {
    proc.kill();
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* browser may still hold files */ }
  }
}

main().then((c) => process.exit(c), (e) => { console.error(e.message); process.exit(2); });
