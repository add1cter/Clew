import { expect, it } from "vitest";
import { createGraphMotion, stepGraphMotion, wakeGraphMotion } from "./graphInteractionPhysics";
import type { Edge } from "../lib/types";

const edge = { id: "ab", source_topic_id: "a", target_topic_id: "b", relation: "prerequisite", rationale: "" } satisfies Edge;

it("moves a dragged node's neighbors while the dragged node follows the pointer exactly", () => {
  const points = new Map([["a", { x: 0, y: 0 }], ["b", { x: 50, y: 0 }]]);
  const motion = createGraphMotion(); wakeGraphMotion(motion, points);
  points.get("a")!.x = 40;
  for (let i = 0; i < 20; i++) stepGraphMotion(points, [edge], motion, "a", null);
  expect(points.get("a")!.x).toBe(40);
  expect(points.get("b")!.x).toBeGreaterThan(50);
});

it("gently repels nearby nodes and returns the cluster to its home after the cursor leaves", () => {
  const points = new Map([["a", { x: 0, y: 0, z: 0 }], ["b", { x: 100, y: 0, z: 0 }]]);
  const motion = createGraphMotion(); wakeGraphMotion(motion, points, 250);
  motion.cursor = { position: { x: 92, y: 0, z: 0 }, radius: 60 };
  for (let i = 0; i < 25; i++) stepGraphMotion(points, [], motion, null, "a");
  const pushed = points.get("b")!.x;
  expect(pushed).toBeGreaterThan(100);
  expect(points.get("a")!.x).toBeCloseTo(0, 1);
  motion.cursor = null;
  for (let i = 0; i < 180; i++) stepGraphMotion(points, [], motion, null, null);
  expect(Math.abs(points.get("b")!.x - 100)).toBeLessThan(Math.abs(pushed - 100));
  expect(points.get("b")!.z).toBe(0);
});

it("stays finite when nodes overlap and sleeps once its wake budget expires", () => {
  const points = new Map([["a", { x: 0, y: 0 }], ["b", { x: 0, y: 0 }]]);
  const motion = createGraphMotion(); wakeGraphMotion(motion, points, 1);
  expect(stepGraphMotion(points, [], motion, null, null)).toBe(true);
  expect(Number.isFinite(points.get("a")!.x)).toBe(true);
  expect(stepGraphMotion(points, [], motion, null, null)).toBe(false);
});
