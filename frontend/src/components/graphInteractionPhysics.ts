import type { Edge } from "../lib/types";

export type InteractivePoint = { x: number; y: number; z?: number };
type Velocity = { x: number; y: number; z: number };
export type GraphMotion = {
  homes: Map<string, InteractivePoint>;
  velocities: Map<string, Velocity>;
  frames: number;
  cursor: { position: InteractivePoint; radius: number } | null;
};

export function createGraphMotion(): GraphMotion {
  return { homes: new Map(), velocities: new Map(), frames: 0, cursor: null };
}

export function wakeGraphMotion(motion: GraphMotion, positions: ReadonlyMap<string, InteractivePoint>, frames = 150): void {
  for (const [id, point] of positions) {
    if (!motion.homes.has(id)) motion.homes.set(id, { x: point.x, y: point.y, z: point.z ?? 0 });
    if (!motion.velocities.has(id)) motion.velocities.set(id, { x: 0, y: 0, z: 0 });
  }
  motion.frames = frames;
}

// Only presentation positions move. Home attraction retains the existing chapter clusters.
export function stepGraphMotion(positions: ReadonlyMap<string, InteractivePoint>, edges: Edge[], motion: GraphMotion,
  draggedId: string | null, protectedId: string | null, step = 1): boolean {
  if (motion.frames <= 0) return false;
  const dt = Math.max(0.2, Math.min(2, step));
  const entries = [...positions];
  const push = (id: string, dx: number, dy: number, dz: number, force: number): void => {
    if (id === draggedId) return;
    const v = motion.velocities.get(id);
    if (!v) return;
    v.x += dx * force * dt; v.y += dy * force * dt; v.z += dz * force * dt;
  };
  for (let i = 0; i < entries.length; i++) {
    const [id, a] = entries[i];
    for (let j = i + 1; j < entries.length; j++) {
      const [otherId, b] = entries[j];
      let dx = a.x - b.x, dy = a.y - b.y, dz = (a.z ?? 0) - (b.z ?? 0);
      const distance = Math.hypot(dx, dy, dz);
      if (distance > 110) continue;
      if (distance < 0.001) { dx = 1; dy = i % 2 ? -0.3 : 0.3; dz = 0; }
      const length = Math.hypot(dx, dy, dz);
      const force = Math.min(0.6, 420 / Math.max(100, length * length));
      push(id, dx / length, dy / length, dz / length, force);
      push(otherId, -dx / length, -dy / length, -dz / length, force);
    }
  }
  for (const edge of edges) {
    const a = positions.get(edge.source_topic_id), b = positions.get(edge.target_topic_id);
    const homeA = motion.homes.get(edge.source_topic_id), homeB = motion.homes.get(edge.target_topic_id);
    if (!a || !b || !homeA || !homeB) continue;
    const dx = b.x - a.x, dy = b.y - a.y, dz = (b.z ?? 0) - (a.z ?? 0);
    const length = Math.hypot(dx, dy, dz) || 1;
    const rest = Math.max(24, Math.hypot(homeB.x - homeA.x, homeB.y - homeA.y, (homeB.z ?? 0) - (homeA.z ?? 0)));
    const force = Math.max(-1.4, Math.min(1.4, (length - rest) * 0.012));
    push(edge.source_topic_id, dx / length, dy / length, dz / length, force);
    push(edge.target_topic_id, -dx / length, -dy / length, -dz / length, force);
  }
  for (const [id, point] of entries) {
    const home = motion.homes.get(id), velocity = motion.velocities.get(id);
    if (!home || !velocity) continue;
    if (id === draggedId || id === protectedId) { velocity.x = 0; velocity.y = 0; velocity.z = 0; continue; }
    push(id, home.x - point.x, home.y - point.y, (home.z ?? 0) - (point.z ?? 0), 0.018);
    if (motion.cursor && id !== protectedId) {
      const { position: cursor, radius } = motion.cursor;
      const dx = point.x - cursor.x, dy = point.y - cursor.y, dz = (point.z ?? 0) - (cursor.z ?? 0);
      const distance = Math.hypot(dx, dy, dz);
      if (distance > 0.01 && distance < radius) push(id, dx / distance, dy / distance, dz / distance, (1 - distance / radius) * 0.7);
    }
    const damping = Math.pow(0.8, dt);
    velocity.x *= damping; velocity.y *= damping; velocity.z *= damping;
    point.x += Math.max(-3, Math.min(3, velocity.x * dt));
    point.y += Math.max(-3, Math.min(3, velocity.y * dt));
    if (point.z !== undefined) point.z += Math.max(-3, Math.min(3, velocity.z * dt));
  }
  motion.frames -= 1;
  return true;
}
