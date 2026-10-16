import { describe, expect, it } from "vitest";
import { ASSETS, detectPlatform, downloadUrl, primaryAsset, windowsAsset } from "./download";

const WIN64 =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const WIN32 = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0";
const ANDROID = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

describe("detectPlatform", () => {
  it("reconoce los sistemas de escritorio", () => {
    expect(detectPlatform({ userAgent: WIN64 })).toBe("windows");
    expect(detectPlatform({ userAgent: MAC })).toBe("mac");
    expect(detectPlatform({ userAgent: LINUX })).toBe("linux");
  });

  it("Android dice Linux, pero es un móvil", () => {
    expect(detectPlatform({ userAgent: ANDROID })).toBe("mobile");
    expect(detectPlatform({ userAgent: IPHONE })).toBe("mobile");
  });

  it("el iPad se hace pasar por Mac, pero tiene pantalla táctil", () => {
    expect(detectPlatform({ userAgent: MAC, touchPoints: 5 })).toBe("mobile");
    expect(detectPlatform({ userAgent: MAC, touchPoints: 0 })).toBe("mac");
  });

  it("da prioridad a userAgentData.platform", () => {
    expect(detectPlatform({ userAgent: "", platform: "Windows" })).toBe("windows");
    expect(detectPlatform({ userAgent: "", platform: "macOS" })).toBe("mac");
    expect(detectPlatform({ userAgent: "algo raro" })).toBe("unknown");
  });
});

describe("windowsAsset", () => {
  it("64 bits por defecto y 32 bits si el user agent no dice Win64", () => {
    expect(windowsAsset({ userAgent: WIN64 })).toBe(ASSETS.winX64);
    expect(windowsAsset({ userAgent: WIN32 })).toBe(ASSETS.winX86);
  });

  it("usa las pistas del navegador cuando las hay", () => {
    expect(windowsAsset({ userAgent: WIN64, architecture: "x86", bitness: "32" })).toBe(ASSETS.winX86);
    expect(windowsAsset({ userAgent: WIN32, architecture: "x86", bitness: "64" })).toBe(ASSETS.winX64);
  });

  it("ARM: Windows 10 no emula 64 bits, Windows 11 sí", () => {
    expect(windowsAsset({ userAgent: WIN64, architecture: "arm", platformVersion: "10.0.0" })).toBe(
      ASSETS.winX86,
    );
    expect(windowsAsset({ userAgent: WIN64, architecture: "arm", platformVersion: "15.0.0" })).toBe(
      ASSETS.winX64,
    );
  });
});

describe("primaryAsset", () => {
  it("elige el archivo de cada sistema", () => {
    expect(primaryAsset({ userAgent: MAC })).toBe(ASSETS.mac);
    expect(primaryAsset({ userAgent: LINUX })).toBe(ASSETS.appImage);
    expect(primaryAsset({ userAgent: IPHONE })).toBeNull();
  });

  it("los enlaces apuntan siempre a la última versión", () => {
    expect(downloadUrl(ASSETS.mac)).toBe(
      "https://github.com/salmeronvictor486-lang/ROBOT-ASISTENTE/releases/latest/download/Tico-macOS.dmg",
    );
  });
});
