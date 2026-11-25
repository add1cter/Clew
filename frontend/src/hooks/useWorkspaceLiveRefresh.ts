import { useEffect, useRef } from "react";

export function useWorkspaceLiveRefresh({ snapshotId, blocked, readRevision, refresh }: {
  snapshotId: number | null; blocked: boolean; readRevision: () => Promise<number>; refresh: (canApply: () => boolean) => Promise<void>;
}): void {
  const latest = useRef({ snapshotId, blocked, readRevision, refresh });
  latest.current = { snapshotId, blocked, readRevision, refresh };
  useEffect(() => {
    let stopped = false;
    let running = false;
    const poll = async () => {
      const state = latest.current;
      if (stopped || running || state.blocked || state.snapshotId === null || document.hidden) return;
      running = true;
      try {
        const revision = await state.readRevision();
        const canApply = () => !stopped && !latest.current.blocked;
        if (canApply() && revision > (latest.current.snapshotId ?? 0)) await latest.current.refresh(canApply);
      } catch {
        // apiFetch records request failures; retry after reconnection without replacing the current view.
      } finally { running = false; }
    };
    const timer = window.setInterval(() => { void poll(); }, 3000);
    const onFocus = () => { void poll(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => { stopped = true; window.clearInterval(timer); window.removeEventListener("focus", onFocus); document.removeEventListener("visibilitychange", onFocus); };
  }, []);
}
