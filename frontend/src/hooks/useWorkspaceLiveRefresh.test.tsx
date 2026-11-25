// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useWorkspaceLiveRefresh } from "./useWorkspaceLiveRefresh";

let root: Root;
let host: HTMLDivElement;
const readRevision = vi.fn<() => Promise<number>>();
const refresh = vi.fn<(canApply: () => boolean) => Promise<void>>();
function Harness({ blocked = false }: { blocked?: boolean }) {
  useWorkspaceLiveRefresh({ snapshotId: 8, blocked, readRevision, refresh }); return null;
}
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  readRevision.mockReset().mockResolvedValue(8); refresh.mockReset().mockResolvedValue();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("refreshes only newer snapshots and checks again when the window regains focus", async () => {
  act(() => root.render(<Harness/>));
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(refresh).not.toHaveBeenCalled();
  readRevision.mockResolvedValue(9);
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(refresh).toHaveBeenCalledOnce();
});
it("waits while editing, skips hidden windows and retries after temporary failures", async () => {
  act(() => root.render(<Harness blocked/>));
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(readRevision).not.toHaveBeenCalled();
  act(() => root.render(<Harness/>));
  Object.defineProperty(document, "hidden", { configurable: true, value: true });
  await act(async () => vi.advanceTimersByTimeAsync(3000));
  expect(readRevision).not.toHaveBeenCalled();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  readRevision.mockRejectedValueOnce(new Error("offline")).mockResolvedValue(9);
  await act(async () => vi.advanceTimersByTimeAsync(6000));
  expect(refresh).toHaveBeenCalledOnce();
});
it("does not overlap requests and invalidates an in-flight result when editing starts or unmounts", async () => {
  let finish!: (revision: number) => void;
  readRevision.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  act(() => root.render(<Harness/>));
  await act(async () => vi.advanceTimersByTimeAsync(9000));
  expect(readRevision).toHaveBeenCalledOnce();
  act(() => root.render(<Harness blocked/>));
  await act(async () => finish(9));
  expect(refresh).not.toHaveBeenCalled();
  act(() => root.render(<Harness/>));
  let guard!: () => boolean;
  refresh.mockImplementation(async canApply => { guard = canApply; });
  readRevision.mockResolvedValue(9);
  await act(async () => window.dispatchEvent(new Event("focus")));
  expect(guard()).toBe(true);
  act(() => root.render(<Harness blocked/>));
  expect(guard()).toBe(false);
  act(() => root.unmount());
  expect(guard()).toBe(false);
  root = createRoot(host);
});
