import { describe, expect, it } from "vitest";
import { boldParts, demoFrame, restingFrame, SCENE_SECONDS, SCENES } from "./demo";

describe("demoFrame", () => {
  it("la isla baja, crece, se abre y se esconde", () => {
    expect(demoFrame(0.2).state).toBe("hidden");
    expect(demoFrame(1.2).state).toBe("peek");
    expect(demoFrame(2.0).state).toBe("compact");
    expect(demoFrame(5).state).toBe("expanded");
    expect(demoFrame(9).state).toBe("hidden");
  });

  it("escribe la pregunta y luego la respuesta", () => {
    expect(demoFrame(2.7).question).toBe("");
    expect(demoFrame(3.4).question.length).toBeGreaterThan(0);
    expect(demoFrame(4.2).question).toBe(SCENES[0]?.question);
    expect(demoFrame(4.2).answer).toBe("");
    expect(demoFrame(5.8).expression).toBe("talking");
    expect(demoFrame(8).answer).toBe(SCENES[0]?.answer);
    expect(demoFrame(8).expression).toBe("happy");
  });

  it("solo la primera escena captura la pantalla", () => {
    expect(demoFrame(4.0).capturing).toBe(true);
    expect(demoFrame(SCENE_SECONDS + 4.0).capturing).toBe(false);
  });

  it("va pasando de escena y vuelve a empezar", () => {
    expect(demoFrame(SCENE_SECONDS + 1).scene).toBe(1);
    expect(demoFrame(SCENE_SECONDS * SCENES.length + 1).scene).toBe(0);
  });

  it("el fotograma de reposo ya tiene la respuesta completa", () => {
    const frame = restingFrame(1);
    expect(frame.state).toBe("expanded");
    expect(frame.answer).toBe(SCENES[1]?.answer);
  });
});

describe("boldParts", () => {
  it("separa la negrita sin HTML", () => {
    expect(boldParts("Veo **Ventas**: bien")).toEqual([
      { text: "Veo ", bold: false },
      { text: "Ventas", bold: true },
      { text: ": bien", bold: false },
    ]);
  });
});
