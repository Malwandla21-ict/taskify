/* Shared by export-mp4.mjs and stills.mjs: start the local server, open
   the film in headless Chrome (your installed Chrome or Edge) at 1920×1080,
   and wait until every font and image is ready. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";
import { startServer } from "./serve.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"
  ].filter(Boolean);
  const hit = candidates.find((p) => fs.existsSync(p));
  if (!hit) throw new Error("Chrome or Edge not found. Set CHROME_PATH to your browser's executable.");
  return hit;
}

export function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith("--") ? true : v;
}

export async function openFilm({ scale = 1, captions = false } = {}) {
  const server = await startServer(0);
  const port = server.address().port;
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    defaultViewport: { width: 1920, height: 1080, deviceScaleFactor: scale },
    args: [
      "--lang=en-ZA", "--hide-scrollbars", "--mute-audio",
      "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows", "--force-color-profile=srgb"
    ]
  });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.error("page error:", e.message));
  const url = `http://127.0.0.1:${port}/explainer/index.html?render=1${captions ? "&captions=1" : ""}`;
  await page.goto(url, { waitUntil: "networkidle0", timeout: 120000 });
  await page.evaluate(() => window.__film.ready);
  const info = await page.evaluate(() => ({ duration: window.__film.duration, fps: window.__film.fps }));

  async function frame(t, type = "jpeg", quality = 94) {
    await page.evaluate((x) => window.__film.seek(x), t);
    // Let the iframe and the stage paint this exact state before capturing.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    return page.screenshot({ type, quality: type === "jpeg" ? quality : undefined, optimizeForSpeed: true });
  }

  async function close() { await browser.close(); server.close(); }
  return { page, frame, close, ...info };
}
