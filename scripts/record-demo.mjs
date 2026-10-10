// Records a silent product demo of the LIVE site with injected captions, a step counter and a visible cursor.
// Overlay is injected per page via addInitScript/evaluate — no site code is touched.
// Usage: node scripts/record-demo.mjs  →  demo/raw/*.webm + demo/raw/marks.json (trimmed/encoded by ffmpeg after)
import fs from "node:fs";
import os from "node:os";
import { chromium } from "playwright";

const URL = "https://meskan-seven.vercel.app";
const TOTAL = 10;
const EXE = `${os.homedir()}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
fs.mkdirSync("demo/raw", { recursive: true });
for (const f of fs.readdirSync("demo/raw")) fs.unlinkSync(`demo/raw/${f}`);

// headed + GPU (Metal): headless WebGL renders in software and makes the map stutter
const browser = await chromium.launch({ headless: false, executablePath: fs.existsSync(EXE) ? EXE : undefined, args: ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--use-angle=metal", "--window-size=1600,1000"] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, recordVideo: { dir: "demo/raw", size: { width: 1600, height: 900 } }, colorScheme: "light", locale: "az-AZ" });
const t0 = Date.now();
const marks = []; // dead-time ranges to cut, seconds from start
await ctx.addInitScript(() => {
  try { localStorage.setItem("theme", "light"); } catch {}
  const css = `
  #demo-cap{position:fixed;left:50%;bottom:48px;transform:translate(-50%,12px);opacity:0;z-index:2147483647;background:rgba(18,27,32,.92);color:#fff;border-radius:18px;padding:18px 30px;max-width:1100px;text-align:center;font-family:Manrope,system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.35);transition:opacity .45s ease,transform .45s ease;pointer-events:none}
  #demo-cap.on{opacity:1;transform:translate(-50%,0)}
  #demo-cap b{display:block;font-size:30px;font-weight:800;letter-spacing:-.01em;margin-bottom:4px}
  #demo-cap span{display:block;font-size:22px;opacity:.92;line-height:1.35}
  #demo-step{position:fixed;top:22px;right:26px;z-index:2147483647;background:rgba(18,27,32,.85);color:#fff;font:700 18px Manrope,system-ui,sans-serif;padding:8px 14px;border-radius:999px;pointer-events:none}
  #demo-cur{position:fixed;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:rgba(232,120,40,.85);border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.35);z-index:2147483647;pointer-events:none;transition:left .7s cubic-bezier(.3,.7,.2,1),top .7s cubic-bezier(.3,.7,.2,1),transform .15s}
  #demo-cur.click{transform:scale(.7)}
  #demo-end{position:fixed;inset:0;z-index:2147483646;background:#0f4c5c;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Manrope,system-ui,sans-serif;opacity:0;transition:opacity .6s}
  #demo-end.on{opacity:1}`;
  const mount = () => {
    if (document.getElementById("demo-cap") || !document.body) return;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    for (const id of ["demo-cap", "demo-step", "demo-cur"]) { const d = document.createElement("div"); d.id = id; document.body.appendChild(d); }
    const s = window.__demoState; if (s) { window.__demoCap(s.t, s.s, s.n, true); window.__demoCur(s.x, s.y); }
  };
  window.__demoCap = (t, s, n, instant) => {
    window.__demoState = { ...(window.__demoState || {}), t, s, n };
    const c = document.getElementById("demo-cap"); if (!c) return;
    const set = () => { c.innerHTML = `<b>${t}</b><span>${s}</span>`; c.classList.add("on"); };
    if (instant) set(); else { c.classList.remove("on"); setTimeout(set, 350); }
    document.getElementById("demo-step").textContent = `${n}/9`;
  };
  window.__demoCur = (x, y) => {
    window.__demoState = { ...(window.__demoState || {}), x, y };
    const c = document.getElementById("demo-cur"); if (c) { c.style.left = x + "px"; c.style.top = y + "px"; }
  };
  window.__demoClick = () => { const c = document.getElementById("demo-cur"); if (c) { c.classList.add("click"); setTimeout(() => c.classList.remove("click"), 180); } };
  document.addEventListener("DOMContentLoaded", mount);
  setInterval(mount, 300);
});
const page = await ctx.newPage();
const sleep = (ms) => page.waitForTimeout(ms);
const now = () => (Date.now() - t0) / 1000;
let state = { t: "", s: "", n: 1, x: 960, y: 540 };
// caption appears while the action happens (no pause before it)
const cap = async (t, s, n) => { state = { ...state, t, s, n }; await page.evaluate(([t, s, n]) => window.__demoCap?.(t, s, n), [t, s, n]); await sleep(250); };
const mapIdle = async (max = 15000) => { await page.waitForFunction(() => window.__map && window.__map.loaded() && !window.__map.isMoving(), null, { timeout: max, polling: 150 }).catch(() => {}); };
const flyTo = async (opts) => { await page.evaluate((o) => window.__map?.flyTo(o), opts); await sleep(300); await mapIdle(); };
const cursorTo = async (x, y) => { state = { ...state, x, y }; await page.evaluate(([x, y]) => window.__demoCur?.(x, y), [x, y]); await page.mouse.move(x, y, { steps: 12 }); await sleep(750); };
const clickEl = async (loc, after = 1200) => {
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const b = await loc.boundingBox();
  if (!b) throw new Error("no box");
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await cursorTo(x, y);
  await page.evaluate(() => window.__demoClick?.());
  await loc.click();
  await sleep(after);
};
const smoothScroll = async (y, ms = 1800, sel = null) => {
  await page.evaluate(([y, sel]) => (sel ? document.querySelector(sel) : window).scrollTo({ top: y, behavior: "smooth" }), [y, sel]);
  await sleep(ms);
};
const restore = async () => page.evaluate((s) => { window.__demoCap?.(s.t, s.s, s.n, true); window.__demoCur?.(s.x, s.y); }, state);
const waitFor = async (fn, max = 25000, label = "") => {
  const s = now();
  try { await page.waitForFunction(fn, null, { timeout: max, polling: 300 }); } catch { console.log("timeout:", label); }
  const d = now() - s;
  if (d > 6) marks.push([s + 2.5, now() - 1, label]); // cut long waits (keep 2.5 s of loader + 1 s before result)
};

// 0. pre-warm (cut from the video): load the map, zoom Baku so data/geometry/tiles are cached
await page.goto(`${URL}/xerite`, { waitUntil: "networkidle" });
await mapIdle(30000);
await flyTo({ center: [49.86, 40.405], zoom: 11.4, duration: 800 });
await flyTo({ center: [49.88, 40.42], zoom: 9.7, duration: 800 });
const prewarm = now();

// 1. Landing (~8 s)
await page.goto(URL, { waitUntil: "networkidle" });
await sleep(400);
await cap("Məskən: harada yaşamalı?", "Ev və ya obyekt alan insana uyğun ərazini rəqəmlərlə tapır.", 1);
await sleep(1600);
await smoothScroll(800, 2000);
await smoothScroll(1450, 2000);
await smoothScroll(0, 1500);

// 2. Hero search
await cap("AI qərar mühərriki", "Sualı anlayır, əraziləri kodla süzür, nəticəni izah edir.", 2);
const input = page.locator('input[aria-label="Nə axtarırsan?"]');
await clickEl(input, 600);
await input.pressSequentially("Nərimanovda metroya yaxın ev lazımdır", { delay: 60 });
await sleep(500);
await clickEl(page.getByRole("button", { name: "Axtar", exact: true }), 500);
await page.waitForURL(/xerite/, { timeout: 20000 });
await sleep(1200);
await restore();

// 3. Results
await cap("5 konkret məhəllə", "Metroya piyada məsafə, xidmətlər, qiymət — hər biri mənbə ilə.", 3);
await waitFor(() => document.querySelectorAll(".map-pin").length >= 5 && document.querySelector("aside")?.innerText.includes("etibarlılıq"), 40000, "decide");
await mapIdle();
await sleep(1500);
await smoothScroll(420, 1800, "aside .overflow-y-auto");
await smoothScroll(0, 1200, "aside .overflow-y-auto");

// 4. Confidence
await cap("Tövsiyə etibarlılığı", "Məlumatın keyfiyyətinə görə kod hesablayır, AI yox.", 4);
await clickEl(page.getByRole("button", { name: /^Niyə \d+\?$/ }).first(), 3000);

// 5. Map metrics + region profile (merged)
await cap("Ərazi xəritəsi və profili", "Rayon və məhəllə göstəriciləri, qrafiklər və hər rəqəmin mənbə nişanı.", 5);
for (const chip of ["Mənzil qiyməti", "Xidmətlər"]) { await clickEl(page.getByRole("tab", { name: chip, exact: true }), 600); await mapIdle(); await sleep(600); }
await flyTo({ center: [49.86, 40.405], zoom: 11.4, duration: 2200 });
await sleep(1200);
await flyTo({ center: [49.88, 40.42], zoom: 9.7, duration: 1600 });
const pt = await page.evaluate(() => { const p = window.__map.project([49.842, 40.388]); const r = window.__map.getCanvas().getBoundingClientRect(); return [r.left + p.x, r.top + p.y]; });
await cursorTo(pt[0], pt[1]);
await page.evaluate(() => window.__demoClick?.());
await page.mouse.click(pt[0], pt[1]);
await sleep(2500);
await mapIdle();
for (const t of ["Qiymətlər", "Nəqliyyat", "DNT"]) await clickEl(page.locator("aside").getByRole("tab", { name: t, exact: true }), 1400);

// 6. AI Analitik + follow-up question
await cap("AI Analitik", "Güclü və zəif tərəflər, kimə uyğundur — yalnız real göstəricilərə əsaslanır.", 6);
const ai = page.locator("section", { hasText: "AI Analitik" }).first();
const aiTop = await ai.evaluate((el) => el.getBoundingClientRect().top + window.scrollY - 90);
await smoothScroll(aiTop, 2200);
await sleep(1800);
await smoothScroll(0, 1600);
await clickEl(page.getByRole("tab", { name: "AI məsləhətçi", exact: true }), 1200);
await clickEl(page.getByRole("button", { name: "Uşaqlı ailə üçün sakit ərazi, büdcə 150 min" }), 800);
await waitFor(() => (document.querySelector("aside")?.innerText.match(/etibarlılıq/g) || []).length >= 2, 40000, "followup");
await mapIdle();
await sleep(2500);

// 7. Legal check (pre-cached listing → instant)
await cap("Hüquqi yoxlama", "Elandakı riskli ifadələri tapır: çıxarışsız, etibarnamə ilə…", 7);
const tools = page.getByRole("tab", { name: "Hüquqi yoxlama", exact: true });
const toolsTop = await tools.evaluate((el) => el.getBoundingClientRect().top + window.scrollY - 140);
await smoothScroll(toolsTop, 2000);
await clickEl(tools, 1200);
const ta = page.locator('textarea[aria-label="Elanın mətni"]');
await clickEl(ta, 400);
await ta.pressSequentially("Yeni binada mənzil, kupça hazırlanır, ilkin ödəniş 30%.", { delay: 30 });
await sleep(700);
await clickEl(page.getByRole("button", { name: "Elanı yoxla", exact: true }), 500);
await waitFor(() => document.body.innerText.includes("Alışdan əvvəl yoxla"), 30000, "legal");
await sleep(3000);

// 8. /keyfiyyet (~10 s)
await page.goto(`${URL}/keyfiyyet`, { waitUntil: "networkidle" });
await sleep(800);
await restore();
await cap("Keyfiyyət və testlər", "AI qayda-əsaslı yanaşma ilə müqayisə olunur, səhvlər açıq göstərilir.", 8);
await sleep(1800);
for (const y of [650, 1300, 2000]) await smoothScroll(y, 2500);

// 9. End card (3 s)
await page.evaluate(() => {
  window.__demoCap?.("Məskən — meskan-seven.vercel.app", "Kod: github.com/serxan22/7byteNB", 9);
  const e = document.createElement("div"); e.id = "demo-end";
  e.innerHTML = `<div style="font-size:84px;font-weight:800;letter-spacing:-.04em">Məskən</div><div style="font-size:34px;margin-top:10px;opacity:.95">meskan-seven.vercel.app</div><div style="font-size:24px;margin-top:22px;opacity:.8">Kod: github.com/serxan22/7byteNB</div>`;
  document.body.appendChild(e); requestAnimationFrame(() => e.classList.add("on"));
  document.getElementById("demo-cap").style.display = "none"; document.getElementById("demo-cur").style.display = "none";
});
await sleep(3200);
const total = now();
await ctx.close();
await browser.close();
fs.writeFileSync("demo/raw/marks.json", JSON.stringify({ total, prewarm, cuts: marks }, null, 1));
console.log(`recorded ${total.toFixed(1)} s; cuts: ${JSON.stringify(marks)}`);
