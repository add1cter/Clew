import { describe, expect, it } from "vitest";
import type { Edge } from "../lib/types";
import { fitGraphLabel, graphFocus, graphNeighborhoods, placeGraphLabels, graphLabelOpacity } from "./graphPresentation";

const edge = (id: string, source: string, target: string): Edge => ({ id, source_topic_id: source, target_topic_id: target, relation: "prerequisite", rationale: "" });

describe("graph focus", () => {
  const index = graphNeighborhoods(["a", "b", "c", "d", "isolated"].map(id => ({ id })), [
    edge("ab", "a", "b"), edge("bc", "b", "c"), edge("cd", "c", "d"), edge("invalid", "b", "missing"),
  ]);
  it("previews incoming and outgoing direct neighbors without expanding a transitive path", () => {
    const focus = graphFocus(index, null, "b");
    expect([...focus.nodeIds].sort()).toEqual(["a", "b", "c"]);
    expect([...focus.edgeIds].sort()).toEqual(["ab", "bc"]);
    expect(graphFocus(index, null, null).topicId).toBeNull();
  });
  it("keeps the clicked focus locked while another node is hovered", () => {
    expect(graphFocus(index, "b", "d").topicId).toBe("b");
    expect([...graphFocus(index, "isolated", null).nodeIds]).toEqual(["isolated"]);
    expect(graphFocus(index, "deleted", "c").topicId).toBe("c");
  });
});

describe("graph labels", () => {
  it("fades overview text with zoom while hovered and focused neighbors stay readable", () => {
    expect(graphLabelOpacity(0.45, false, false)).toBe(0);
    expect(graphLabelOpacity(1.2, false, false)).toBeGreaterThan(0.8);
    expect(graphLabelOpacity(0.45, true, true)).toBe(1);
    expect(graphLabelOpacity(1, false, true)).toBeLessThan(graphLabelOpacity(1, false, false));
  });
  it("fits Chinese and supplementary characters to measured width without breaking surrogate pairs", () => {
    const measure = (text: string) => Array.from(text).length * 13;
    expect(fitGraphLabel("中文标签", 52, measure)).toBe("中文标签");
    expect(fitGraphLabel("总体😀与样本均数", 52, measure)).toBe("总体😀…");
  });
  it("places focused text first, avoids overlapping labels, and keeps labels inside the viewport", () => {
    const labels = placeGraphLabels([
      { id: "other", x: 150, y: 110, width: 190, height: 24, radius: 8, priority: 0 },
      { id: "focus", x: 150, y: 110, width: 190, height: 24, radius: 8, priority: 1000 },
      { id: "offscreen", x: -200, y: -200, width: 90, height: 24, radius: 8, priority: 0 },
    ], 300, 220);
    expect([...labels.keys()][0]).toBe("focus");
    expect(labels.has("offscreen")).toBe(false);
    const a = labels.get("focus")!;
    const b = labels.get("other")!;
    expect(a.top + a.height <= b.top || b.top + b.height <= a.top || a.left + a.width <= b.left || b.left + b.width <= a.left).toBe(true);
    for (const label of labels.values()) {
      expect(label.left).toBeGreaterThanOrEqual(8);
      expect(label.top).toBeGreaterThanOrEqual(8);
      expect(label.left + label.width).toBeLessThanOrEqual(292);
    }
  });
});
