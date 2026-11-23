import type { Edge } from "../lib/types";

export const GRAPH_LABEL_FONT = '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif';

export function graphLabelOpacity(zoom: number, emphasized: boolean, focused: boolean, onPath = false): number {
  if (emphasized) return 1;
  if (focused) return onPath ? 0.65 : 0.25;
  return Math.max(0, Math.min(0.86, (zoom - 0.5) * 1.4));
}

export type GraphNeighborhood = { nodeIds: Set<string>; edgeIds: Set<string> };
export type GraphFocus = GraphNeighborhood & { topicId: string | null };

export function graphNeighborhoods(topics: ReadonlyArray<{ id: string }>, edges: ReadonlyArray<Edge>): Map<string, GraphNeighborhood> {
  const index = new Map(topics.map(({ id }) => [id, { nodeIds: new Set([id]), edgeIds: new Set<string>() }]));
  for (const edge of edges) {
    const source = index.get(edge.source_topic_id);
    const target = index.get(edge.target_topic_id);
    if (!source || !target) continue;
    source.nodeIds.add(edge.target_topic_id);
    target.nodeIds.add(edge.source_topic_id);
    source.edgeIds.add(edge.id);
    target.edgeIds.add(edge.id);
  }
  return index;
}

export function graphFocus(index: Map<string, GraphNeighborhood>, selectedId: string | null, hoveredId: string | null): GraphFocus {
  const topicId = selectedId && index.has(selectedId) ? selectedId : hoveredId && index.has(hoveredId) ? hoveredId : null;
  return { topicId, ...(topicId ? index.get(topicId)! : { nodeIds: new Set<string>(), edgeIds: new Set<string>() }) };
}

export function fitGraphLabel(text: string, maxWidth: number, measure: (value: string) => number): string {
  if (measure(text) <= maxWidth) return text;
  const characters = Array.from(text);
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measure(characters.slice(0, middle).join("") + "…") <= maxWidth) low = middle;
    else high = middle - 1;
  }
  return characters.slice(0, low).join("") + "…";
}

export type GraphLabelCandidate = { id: string; x: number; y: number; width: number; height: number; radius: number; priority: number };
export type GraphLabelPlacement = { x: number; y: number; left: number; top: number; width: number; height: number };

// Both renderers place labels in CSS pixels, so zoom never shrinks Chinese text.
export function placeGraphLabels(candidates: GraphLabelCandidate[], width: number, height: number): Map<string, GraphLabelPlacement> {
  const placed = new Map<string, GraphLabelPlacement>();
  const margin = 8;
  for (const label of [...candidates].sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))) {
    if (label.width > width - margin * 2 || label.height > height - margin * 2) continue;
    const gap = label.radius + 6;
    const offsets = [
      [0, -gap - label.height / 2], [0, gap + label.height / 2],
      [gap + label.width / 2, 0], [-gap - label.width / 2, 0],
      [0, -gap - label.height * 1.7], [0, gap + label.height * 1.7],
    ];
    for (const [dx, dy] of offsets) {
      const x = label.x + dx;
      const y = label.y + dy;
      const left = x - label.width / 2;
      const top = y - label.height / 2;
      if (left < margin || top < margin || left + label.width > width - margin || top + label.height > height - margin) continue;
      if ([...placed.values()].some(other => left < other.left + other.width + 4 && left + label.width + 4 > other.left
          && top < other.top + other.height + 3 && top + label.height + 3 > other.top)) continue;
      placed.set(label.id, { x, y, left, top, width: label.width, height: label.height });
      break;
    }
  }
  return placed;
}

export function positionGraphTooltip(element: HTMLDivElement, title: string, x: number, y: number, width: number, height: number): void {
  element.hidden = false;
  if (element.textContent !== title) element.textContent = title;
  const left = Math.max(8, Math.min(x + 14, width - element.offsetWidth - 8));
  const top = Math.max(8, Math.min(y + 14, height - element.offsetHeight - 8));
  element.style.transform = `translate(${left}px, ${top}px)`;
}
