import { describe, expect, it } from "vitest";
import { bindNativeTreeGestureGuardV55, bindNativeTreeWheelV59, MAX_TREE_SCALE, screenDeltaToSvgUnits } from "./usePanZoom";

describe("screenDeltaToSvgUnits", () => {
  it("converts CSS-pixel drag distance into the SVG viewBox coordinate system", () => {
    expect(screenDeltaToSvgUnits(
      { x: 420, y: 180 },
      { screenScaleX: 0.1, screenScaleY: 0.1 },
    )).toEqual({ x: 4200, y: 1800 });
  });

  it("supports non-uniform viewport scales", () => {
    expect(screenDeltaToSvgUnits(
      { x: 200, y: -150 },
      { screenScaleX: 0.25, screenScaleY: 0.5 },
    )).toEqual({ x: 800, y: -300 });
  });

  it("allows a closer tree inspection without handing pinch zoom to WebKit", () => {
    expect(MAX_TREE_SCALE).toBe(6);
    const canvas = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const release = bindNativeTreeGestureGuardV55(canvas);
    const guarded = new Event("gesturestart", { cancelable: true });
    expect(canvas.dispatchEvent(guarded)).toBe(false);
    expect(guarded.defaultPrevented).toBe(true);
    release();
    expect(canvas.dispatchEvent(new Event("gesturestart", { cancelable: true }))).toBe(true);
  });

  it("binds wheel zoom as a cancellable native listener", () => {
    const canvas = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const release = bindNativeTreeWheelV59(canvas, (event) => event.preventDefault());
    const wheel = new WheelEvent("wheel", { cancelable: true, deltaY: -100 });
    expect(canvas.dispatchEvent(wheel)).toBe(false);
    expect(wheel.defaultPrevented).toBe(true);
    release();
    expect(canvas.dispatchEvent(new WheelEvent("wheel", { cancelable: true }))).toBe(true);
  });
});
