// i18n smoke test against a deployed URL: both locales, desktop + 390px, no horizontal scroll, the two advisor queries,
// legal check with the sample, /keyfiyyet, /menbeler, language switch keeps page + query, Accept-Language redirect,
// and (EN) a DOM scan for leftover Azerbaijani UI text.
// Usage: BASE=https://… [BYPASS=<vercel protection bypass>] node scripts/smoke-i18n.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE?.replace(/\/$/, "");
if (!BASE) throw new Error("BASE is required");
const headers = process.env.BYPASS ? { "x-vercel-protection-bypass": process.env.BYPASS, "x-vercel-set-bypass-cookie": "true" } : {};
const results = [];
const ok = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};

// Lowercase words with Azerbaijani letters, outside “quoted phrases”. Official street-name parts are allowed.
const ALLOWED = new Set(["küçəsi", "küç", "prospekti", "şossesi", "qəsəbəsi", "bulvarı", "meydanı", "döngəsi", "yolu", "çıxarış", "kupça", "məhəllə", "rayon"]);
const scan = () =>
  page.evaluate(() => {
    const out = new Set();
    const words = (s) => s.replace(/“[^”]*”/g, " ").split(/[\s·,.;:()/<>{}!?—–"'\-]+/);
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (n.parentElement?.closest("script,style,[aria-hidden=true]")) continue;
      for (const x of words(n.textContent)) if (/^[a-zəğışçöü]/.test(x) && /[əğışçöü]/.test(x)) out.add(x);
    }
    for (const el of document.querySelectorAll("[aria-label],[title],[placeholder]"))
      for (const a of ["aria-label", "title", "placeholder"]) for (const x of words(el.getAttribute(a) ?? "")) if (/^[a-zəğışçöü]/.test(x) && /[əğışçöü]/.test(x)) out.add(`${a}:${x}`);
    return [...out];
  });
const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// reuse an already-downloaded headless shell if the pinned one is missing (no download needed)
const SHELL = process.env.CHROME_SHELL;
const browser = await chromium.launch(SHELL ? { executablePath: SHELL } : {});
let page;
for (const vp of [{ width: 1440, height: 900, name: "desktop" }, { width: 390, height: 844, name: "390px" }]) {
  for (const loc of ["az", "en"]) {
    const ctx = await browser.newContext({ viewport: vp, extraHTTPHeaders: headers, locale: loc === "en" ? "en-GB" : "az-AZ" });
    await ctx.addCookies([{ name: "NEXT_LOCALE", value: loc, url: BASE }]);
    page = await ctx.newPage();
    const pre = loc === "en" ? "/en" : "";
    for (const path of ["/", "/xerite?r=bk-nerimanov", "/keyfiyyet", "/menbeler", "/muqayise"]) {
      const url = `${BASE}${pre}${path === "/" && pre ? "" : path}`;
      const res = await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
      await page.waitForTimeout(1500);
      const lang = await page.evaluate(() => document.documentElement.lang);
      ok(`${vp.name} ${loc} ${path} loads`, res?.status() === 200 && lang === loc, `status ${res?.status()}, lang=${lang}`);
      ok(`${vp.name} ${loc} ${path} no horizontal scroll`, await noHScroll());
      if (loc === "en") {
        const left = (await scan()).filter((x) => !ALLOWED.has(x.replace(/^[a-z-]+:/, "")));
        ok(`${vp.name} en ${path} no Azerbaijani UI text`, !left.length, left.slice(0, 12).join(" "));
      }
    }
    await ctx.close();
  }
}

// Advisor queries (both, in both UIs), legal check, switch, redirect — desktop only
for (const loc of ["az", "en"]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, extraHTTPHeaders: headers });
  await ctx.addCookies([{ name: "NEXT_LOCALE", value: loc, url: BASE }]);
  page = await ctx.newPage();
  const pre = loc === "en" ? "/en" : "";
  for (const q of ["Nərimanovda metroya yaxın ev lazımdır", "flat near the metro in Nərimanov"]) {
    const wait = page.waitForResponse((r) => r.url().includes("/api/decide"), { timeout: 90000 });
    await page.goto(`${BASE}${pre}/xerite?q=${encodeURIComponent(q)}`, { waitUntil: "domcontentloaded" });
    const res = await wait;
    const j = await res.json();
    const n = j.candidates?.length ?? 0;
    const inNarimanov = (j.candidates ?? []).every((c) => c.region_id === "bk-nerimanov");
    const azWords = loc === "en" ? JSON.stringify(j.explain).replace(/“[^”]*”/g, " ").split(/[^a-zA-ZəğışçöüƏĞİŞÇÖÜ]+/).filter((x) => /^[a-zəğışçöü]/.test(x) && /[əğışçöü]/.test(x) && !ALLOWED.has(x)) : [];
    ok(`${loc} UI query “${q}”`, res.status() === 200 && n > 0 && inNarimanov && !azWords.length, `${n} results in Nərimanov=${inNarimanov}, intent ${j.intent_source}, explain ${j.explain_source}${azWords.length ? `, AZ words: ${azWords.slice(0, 6).join(" ")}` : ""}`);
    await page.waitForTimeout(1500);
  }
  // legal check with the sample text
  await page.goto(`${BASE}${pre}/xerite?r=bk-nerimanov`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: loc === "en" ? "Legal check" : "Hüquqi yoxlama" }).click();
  await page.getByRole("button", { name: loc === "en" ? "Sample text" : "Nümunə mətn" }).click();
  const lw = page.waitForResponse((r) => r.url().includes("/api/legal-check"), { timeout: 90000 });
  await page.getByRole("button", { name: loc === "en" ? "Check listing" : "Elanı yoxla", exact: true }).click();
  const lj = await (await lw).json();
  ok(`${loc} legal check (sample)`, lj.result?.red_flags?.length > 0, `${lj.result?.red_flags?.length} flags, source ${lj.source}; verdict: ${String(lj.result?.verdict).slice(0, 90)}`);
  // language switch keeps page + query
  const target = loc === "en" ? "AZ" : "EN";
  await page.getByRole("button", { name: target, exact: true }).first().click();
  await page.waitForURL((u) => (loc === "en" ? !u.pathname.startsWith("/en") : u.pathname.startsWith("/en")), { timeout: 20000 });
  const u = new URL(page.url());
  const cookie = (await ctx.cookies()).find((c) => c.name === "NEXT_LOCALE")?.value;
  ok(`${loc} → ${target} switch keeps page and query`, u.pathname.endsWith("/xerite") && u.searchParams.get("r") === "bk-nerimanov" && cookie === target.toLowerCase(), `${u.pathname}${u.search}, cookie=${cookie}`);
  await ctx.close();
}
// Accept-Language: English browser without a cookie → /en; a chosen az cookie is respected
for (const [al, cookie, expectEn] of [["en-US,en;q=0.9", null, true], ["en-US,en;q=0.9", "az", false], ["az,ru;q=0.8", null, false]]) {
  const ctx = await browser.newContext({ extraHTTPHeaders: { ...headers, "Accept-Language": al } });
  if (cookie) await ctx.addCookies([{ name: "NEXT_LOCALE", value: cookie, url: BASE }]);
  page = await ctx.newPage();
  await page.goto(`${BASE}/menbeler`, { waitUntil: "domcontentloaded" });
  const isEn = new URL(page.url()).pathname.startsWith("/en");
  ok(`Accept-Language ${al}${cookie ? ` + cookie ${cookie}` : ""} → ${expectEn ? "/en" : "az"}`, isEn === expectEn, page.url().replace(BASE, ""));
  await ctx.close();
}
await browser.close();
const failed = results.filter((r) => !r.pass);
console.log(`\nsmoke: ${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
