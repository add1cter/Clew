// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { LocalWorkspace } from "./LocalWorkspace";

const bridge = vi.hoisted(() => ({ callServerTool: vi.fn(), ontoolresult: undefined as any,
  onhostcontextchanged: undefined as any, connect: async () => {}, getHostContext: () => ({ theme: "dark" }) }));
vi.mock("@modelcontextprotocol/ext-apps", () => ({ App: class { constructor() { return bridge; } } }));
vi.mock("../components/GraphCanvas", () => ({ GraphCanvas: () => <div data-testid="graph"/> }));
vi.mock("../components/Graph3DCanvas", () => ({ Graph3DCanvas: () => <div data-testid="graph3d"/> }));
const workspace = (snapshot = 8, state = "not_started") => ({ source: "local_desktop", snapshot_id: snapshot,
  graphs: [{ graph_id: "graph", title: "医学统计学" }], graph: { graph_id: "graph", title: "医学统计学", subject: "statistics",
    language: "zh-CN", version: snapshot, metadata: {}, edges: [], zones: [], quiz_attempts: [], topics: [
      { id: "df", slug: "df", title: "自由度", state, description: "独立变化的信息数量", difficulty: 1,
        level: 0, estimated_minutes: 10, zones: [], resources: [], artifacts: [] }] } });
const review = { id: "review-1", topic_id: "df", topic_title: "自由度", old_state: "not_started", new_state: "learning", reason: "正确解释了约束" };
let root: Root;
let host: HTMLDivElement;
beforeEach(async () => {
  vi.useFakeTimers(); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
  bridge.callServerTool.mockReset().mockResolvedValue({ structuredContent: workspace() });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<LocalWorkspace/>));
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
it("loads the desktop graph and polls for desktop progress without applying model reviews automatically", async () => {
  expect(bridge.callServerTool).toHaveBeenCalledWith({ name: "open_local_workspace", arguments: {} });
  expect(host.textContent).toContain("自由度");
  await act(async () => bridge.ontoolresult({ structuredContent: { ...workspace(), review } }));
  expect(host.textContent).toContain("确认进度修改");
  expect(bridge.callServerTool).toHaveBeenCalledOnce();
  bridge.callServerTool.mockResolvedValue({ structuredContent: workspace(9, "learning") });
  await act(async () => vi.advanceTimersByTimeAsync(4000));
  expect(host.textContent).toContain("快照 9");
  expect(host.textContent).toContain("当前：学习中");
  await act(async () => bridge.ontoolresult({ structuredContent: workspace(8) }));
  expect(host.textContent).toContain("快照 9");
});
it("applies only the saved review id after the user clicks Apply and keeps a failed review visible", async () => {
  await act(async () => bridge.ontoolresult({ structuredContent: { ...workspace(), review } }));
  bridge.callServerTool.mockResolvedValueOnce({ isError: true, content: [{ type: "text", text: "图谱已更新" }] });
  const clickApply = async () => act(async () => Array.from(host.querySelectorAll("button")).find(button => button.textContent === "应用进度")!.click());
  await clickApply();
  expect(bridge.callServerTool).toHaveBeenLastCalledWith({ name: "apply_local_progress", arguments: { review_id: "review-1" } });
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("图谱已更新");
  expect(host.textContent).toContain("确认进度修改");
  bridge.callServerTool.mockResolvedValueOnce({ structuredContent: { ...workspace(9, "learning"), receipt: { snapshot_id: 9 } } });
  await clickApply();
  expect(host.textContent).toContain("当前：学习中");
  expect(host.textContent).not.toContain("确认进度修改");
});
