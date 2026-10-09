import { describe, expect, it } from "vitest";
import { formatSize } from "./fileKinds";

describe("formatSize", () => {
  it("usa la unidad adecuada", () => {
    expect(formatSize(512, "en")).toBe("512 B");
    expect(formatSize(1536, "en")).toBe("1.5 KB");
    expect(formatSize(5 * 1024 * 1024, "es")).toBe("5 MB");
    expect(formatSize(1.25 * 1024 * 1024, "es")).toBe("1,3 MB");
  });
});
