// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GraphCanvas } from "./GraphCanvas";
import { positionCache } from "./graphCanvasCore";
import type { Edge, Topic } from "../lib/types";

let root: Root;
let host: HTMLDivElement;
let canvas: HTMLCanvasElement;
let frames: Map<number, FrameRequestCallback>;
let frameId: number;
let edgeStrokes: Array<{ x: number; color: string; alpha: number }>;
let labelFonts: string[];
let gradientCount: number;
let nodeArcs: number[];
const select = vi.fn();
const longTitle = "方差分析：总体均数、组间变异与组内变异的关系😀";
const topics = ["总体与样本", longTitle, "自由度", "F检验"].map((title, index) => ({
  id: String(index), title, level: index, state: "not_started",
})) as Topic[];
const edges = [0, 1, 2].map(index => ({ id: `e${index}`, source_topic_id: String(index), target_topic_id: String(index + 1), relation: "prerequisite", rationale: "" })) as Edge[];
const positions = { "0": { x: 100, y: 200 }, "1": { x: 250, y: 200 }, "2": { x: 400, y: 200 }, "3": { x: 550, y: 200 } };

function flush(count = 1): void {
  for (let i = 0; i < count; i++) {
    const queued = [...frames.values()];
    frames.clear();
    queued.forEach(callback => callback(i * 16));
  }
}

function pointer(type: string, x: number): void {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: 200, button: 0 });
  Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: "mouse" } });
  act(() => canvas.dispatchEvent(event));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  frames = new Map(); frameId = 0; edgeStrokes = []; labelFonts = []; gradientCount = 0; nodeArcs = [];
  select.mockReset(); positionCache.clear();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++frameId, callback); return frameId; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 700, bottom: 400, width: 700, height: 400, toJSON() {} });
  let pathX: number | null = null;
  const state: Record<string, any> = {
    globalAlpha: 1,
    beginPath: () => { pathX = null; },
    moveTo: (x: number) => { pathX = x; },
    measureText: (text: string) => ({ width: Array.from(text).length * 13 }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => { gradientCount++; return { addColorStop() {} }; },
    arc: (x: number, _y: number, radius: number) => { if (radius < 9) nodeArcs.push(x); },
    stroke: () => { if (pathX !== null) edgeStrokes.push({ x: pathX, color: state.strokeStyle, alpha: state.globalAlpha }); },
    fillText: () => { labelFonts.push(state.font); },
  };
  const context = new Proxy(state, { get: (object, key: string) => key in object ? object[key] : () => {} });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
  HTMLCanvasElement.prototype.releasePointerCapture = vi.fn();
  HTMLCanvasElement.prototype.hasPointerCapture = () => false;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  act(() => root.render(<GraphCanvas topics={topics} edges={edges} zones={[{ id: "chapter", title: "章节分群", kind: "chapter", color: "#4eae9e", intensity: 0.7, topic_ids: topics.map(topic => topic.id) }]} selectedTopicId={null}
    rootIds={new Set(["0"])} ancestorIds={new Set()} pathNodeIds={new Set()} pathEdgeIds={new Set()}
    onSelectTopic={select} onSelectedTopicAnchorChange={() => {}} nodePositions={positions}
    disablePhysics disableIdleAnimations disableGrid cascadeStepFrames={0} graphCacheKey="interaction-test" />));
  canvas = host.querySelector("canvas")!;
  flush(40);
});

afterEach(() => {
  act(() => root.unmount()); host.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it("hover displays the full Chinese title and highlights only incident edges without selecting or editing", () => {
  pointer("pointermove", 250);
  const tooltip = host.querySelector('[role="tooltip"]') as HTMLDivElement;
  expect(tooltip.hidden).toBe(false);
  expect(tooltip.textContent).toBe(longTitle);
  expect(select).not.toHaveBeenCalled();
  edgeStrokes = []; flush();
  expect(edgeStrokes.filter(edge => edge.color === "rgba(168,139,250,0.8)").map(edge => edge.x)).toEqual([100, 250]);
  expect(edgeStrokes.find(edge => edge.x === 400)?.alpha).toBe(0.3);
  expect(labelFonts.some(font => font.includes('14px "Microsoft YaHei"'))).toBe(true);
  pointer("pointerout", 250);
  expect(tooltip.hidden).toBe(true);
  edgeStrokes = []; flush();
  expect(edgeStrokes.every(edge => edge.alpha === 1)).toBe(true);
});

it("clicking a node selects it while clicking empty canvas clears the locked selection", () => {
  pointer("pointerdown", 250); pointer("pointerup", 250);
  expect(select.mock.calls.at(-1)?.[0]).toBe("1");
  pointer("pointerdown", 670); pointer("pointerup", 670);
  expect(select.mock.calls.at(-1)).toEqual([null, null]);
});

it("keeps the existing chapter glow and supports node dragging without opening a topic", () => {
  expect(gradientCount).toBeGreaterThan(0);
  pointer("pointerdown", 250);
  pointer("pointermove", 300);
  nodeArcs = []; flush();
  expect(nodeArcs.some(x => Math.abs(x - 300) < 1)).toBe(true);
  pointer("pointerup", 300);
  expect(select).not.toHaveBeenCalled();
  expect(document.body.style.userSelect).toBe("");
});
