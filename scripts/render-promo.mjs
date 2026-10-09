/**
 * Renderiza el anuncio de Tico a vídeo, fotograma a fotograma, a 60 fps exactos.
 *
 * Usa el "tiempo virtual" de Chrome: el reloj del navegador (performance.now,
 * requestAnimationFrame, temporizadores y animaciones CSS) solo avanza 1/60 s por
 * fotograma, así el vídeo sale perfecto aunque cada captura tarde lo que tarde.
 *
 * Requisitos: `npm run dev` arrancado, ffmpeg y Chrome/Chromium "headless shell".
 * Uso:
 *   python3 scripts/promo-music.py promo/tico-anuncio.wav
 *   node scripts/render-promo.mjs promo/tico-anuncio.mp4 promo/tico-anuncio.wav
 * Variables: CHROME (ruta al headless_shell), PROMO_URL, FPS, DURATION (para pruebas).
 */
import { spawn } from "node:child_process";
import puppeteer from "puppeteer-core";

const FPS = Number(process.env.FPS ?? 60);
const DURATION = Number(process.env.DURATION ?? 35);
const W = 1920;
const H = 1080;
const url = process.env.PROMO_URL ?? "http://localhost:1420/promo.html?render=1";
const chrome = process.env.CHROME ?? "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
const out = process.argv[2] ?? "promo/tico-anuncio.mp4";
const audio = process.argv[3];

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: "shell",
  args: [
    "--deterministic-mode",
    "--enable-begin-frame-control",
    "--disable-new-content-rendering-timeout",
    "--run-all-compositor-stages-before-draw",
    "--disable-threaded-animation",
    "--disable-threaded-scrolling",
    "--disable-checker-imaging",
    "--disable-image-animation-resync",
    "--font-render-hinting=none",
    "--no-sandbox",
  ],
});

const browserCdp = await browser.target().createCDPSession();
const { targetId } = await browserCdp.send("Target.createTarget", {
  url: "about:blank",
  enableBeginFrameControl: true,
  width: W,
  height: H,
});
const target = await browser.waitForTarget((t) => t._targetId === targetId);
const page = await target.page();
const cdp = await page.createCDPSession();
await cdp.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await cdp.send("HeadlessExperimental.enable");

let ticks = 1_000_000;
const interval = 1000 / FPS;
const frame = (screenshot) =>
  cdp.send("HeadlessExperimental.beginFrame", {
    frameTimeTicks: (ticks += interval),
    interval,
    ...(screenshot ? { screenshot: { format: "jpeg", quality: 95 } } : { noDisplayUpdates: false }),
  });

// Carga la página dejando que pinte unos fotogramas (fuentes, React, estilos).
await page.goto(url, { waitUntil: "load" });
for (let i = 0; i < 120; i++) {
  await frame(false);
  if (await page.evaluate(() => Boolean(window.__promoReady))) break;
}
for (let i = 0; i < 10; i++) await frame(false);

// A partir de aquí el tiempo solo avanza cuando lo decimos nosotros.
await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
await page.evaluate(() => window.__promoGo());

const ffmpegArgs = [
  "-y", "-loglevel", "error",
  "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
  ...(audio ? ["-i", audio] : []),
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  ...(audio ? ["-c:a", "aac", "-b:a", "192k", "-shortest"] : []),
  out,
];
const ffmpeg = spawn("ffmpeg", ffmpegArgs, { stdio: ["pipe", "inherit", "inherit"] });

const total = Math.round(DURATION * FPS);
const started = Date.now();
for (let i = 0; i < total; i++) {
  await new Promise((resolve) => {
    cdp.once("Emulation.virtualTimeBudgetExpired", resolve);
    void cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: interval });
  });
  let shot = await frame(true);
  // A veces Chrome no pinta en ese fotograma: repetimos sin avanzar el tiempo.
  for (let retry = 0; !shot.screenshotData && retry < 5; retry++) shot = await frame(true);
  if (!shot.screenshotData) throw new Error(`Sin imagen en el fotograma ${i}`);
  if (!ffmpeg.stdin.write(Buffer.from(shot.screenshotData, "base64"))) {
    await new Promise((resolve) => ffmpeg.stdin.once("drain", resolve));
  }
  if (i % FPS === 0) {
    const secs = ((Date.now() - started) / 1000).toFixed(0);
    process.stdout.write(`\r${(i / FPS).toFixed(0)}/${DURATION} s de vídeo · ${secs} s reales`);
  }
}
ffmpeg.stdin.end();
await new Promise((resolve, reject) => ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(code))));
await browser.close();
console.log(`\nListo: ${out}`);
