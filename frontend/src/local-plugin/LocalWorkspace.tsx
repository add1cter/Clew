import { useEffect, useRef, useState } from "react";
import { App } from "@modelcontextprotocol/ext-apps";
import { GraphCanvas } from "../components/GraphCanvas";
import { Graph3DCanvas } from "../components/Graph3DCanvas";
import { APP_COPY_ZH_CN } from "../lib/appCopy.zh-CN";
import { computeFocusData } from "../lib/graph";
import type { GraphEnvelope, TopicState } from "../lib/types";
import "../styles/workspace-chat.css";
import "./style.css";

type Review = { id: string; topic_id: string; topic_title: string; old_state: TopicState; new_state: TopicState; reason: string };
type Payload = { source: "local_desktop"; snapshot_id: number; graph: GraphEnvelope | null;
  graphs: Array<{ graph_id: string; title: string }>; review?: Review; receipt?: { snapshot_id: number } };
const states: Record<TopicState, string> = { not_started: "未开始", learning: "学习中", shaky: "尚不熟练", solid: "已掌握", mastered: "熟练掌握", needs_review: "待复习" };
const client = new App({ name: "Clew Local", version: "0.1.0" });

export function LocalWorkspace() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [state, setState] = useState<TopicState>("learning");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"2d" | "3d">("2d");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [themeMode, setThemeMode] = useState<"dark" | "light">("dark");
  const current = useRef(payload); current.current = payload;
  const pending = useRef(false);
  const accept = (result: { isError?: boolean; structuredContent?: unknown; content?: Array<{ type: string; text?: string }> }) => {
    if (result.isError) throw new Error(result.content?.find(item => item.type === "text")?.text ?? "本地请求失败");
    const next = result.structuredContent as unknown as Payload;
    if (next?.source !== "local_desktop") throw new Error("返回的数据不是本地桌面工作区。");
    setPayload(previous => previous && (previous.snapshot_id > next.snapshot_id ||
      (previous.snapshot_id === next.snapshot_id && previous.graph?.graph_id === next.graph?.graph_id)) ? previous : next);
    if (next.review) { setReview(next.review); setSelected(next.review.topic_id); }
    if (next.receipt) setReview(null);
    setError("");
  };
  useEffect(() => {
    let disposed = false;
    client.ontoolresult = result => { if (!disposed) { try { accept(result); } catch (cause) { setError(String(cause)); } } };
    client.onhostcontextchanged = context => { document.documentElement.dataset.theme = context.theme ?? "dark"; setThemeMode(context.theme ?? "dark"); };
    client.connect().then(() => { if (!disposed) { setConnected(true); const theme = client.getHostContext()?.theme ?? "dark"; document.documentElement.dataset.theme = theme; setThemeMode(theme); } })
      .catch(cause => { if (!disposed) setError(`无法连接插件宿主：${String(cause)}`); });
    return () => { disposed = true; };
  }, []);
  async function refresh(graphId = current.current?.graph?.graph_id) {
    if (pending.current) return;
    pending.current = true;
    try { accept(await client.callServerTool({ name: "open_local_workspace", arguments: graphId ? { graph_id: graphId } : {} })); }
    catch (cause) { setError(`刷新失败：${String(cause)}`); }
    finally { pending.current = false; }
  }
  useEffect(() => {
    if (!connected) return;
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden && !pending.current) void refresh(); }, 4000);
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", onFocus); };
  }, [connected]);
  const graph = payload?.graph ?? null;
  const topic = graph?.topics.find(item => item.id === selected);
  const focus = graph ? computeFocusData(graph, selected) : null;
  async function stage() {
    if (!graph || !topic) return;
    setBusy(true);
    try { accept(await client.callServerTool({ name: "prepare_local_progress", arguments: { graph_id: graph.graph_id,
      topic_id: topic.id, state, expected_graph_version: graph.version, reason } })); }
    catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  }
  async function apply() {
    if (!review) return;
    setBusy(true);
    try { accept(await client.callServerTool({ name: "apply_local_progress", arguments: { review_id: review.id } })); }
    catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  }
  const graphProps = graph && focus ? { topics: graph.topics, edges: graph.edges, zones: graph.zones, selectedTopicId: selected,
    rootIds: focus.rootIds, pathNodeIds: focus.pathNodeIds, pathEdgeIds: focus.pathEdgeIds, frontierEdgeIds: focus.frontierEdgeIds,
    onSelectTopic: (id: string | null) => setSelected(id), onSelectedTopicAnchorChange: () => {}, themeMode } : null;
  return <main className="localApp">
    <header><strong>Clew Local</strong><span>桌面共用数据 · 快照 {payload?.snapshot_id ?? "—"}</span>
      <button disabled={!connected || busy} onClick={() => void refresh()}>刷新</button>
      <button onClick={() => setMode(value => value === "2d" ? "3d" : "2d")}>{mode === "2d" ? "3D" : "2D"}</button>
    </header>
    {error && <div className="localError" role="alert">{error}</div>}
    <div className="localBody"><aside>
      <label>学习图谱<select value={graph?.graph_id ?? ""} onChange={event => { setReview(null); setSelected(null); void refresh(event.target.value); }}>
        {payload?.graphs.map(item => <option key={item.graph_id} value={item.graph_id}>{item.title}</option>)}
      </select></label>
      <div className="localTopics">{graph?.topics.map(item => <button key={item.id} className={selected === item.id ? "selected" : ""} onClick={() => setSelected(item.id)}>
        <span>{item.title}</span><small>{states[item.state]}</small></button>)}</div>
      {topic && <section><h3>{topic.title}</h3><p>当前：{states[topic.state]}</p><p>{topic.description}</p>
        <label>记录学习进度<select value={state} onChange={event => setState(event.target.value as TopicState)}>{Object.entries(states).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>
        <textarea aria-label="学习依据" placeholder="简要填写练习或学习依据" value={reason} onChange={event => setReason(event.target.value)} maxLength={1000}/>
        <button disabled={busy || !reason.trim()} onClick={() => void stage()}>预览进度修改</button>
      </section>}
      {review && <section className="localReview"><h3>确认进度修改</h3><p>{review.topic_title}</p><p>{states[review.old_state]} → {states[review.new_state]}</p><p>{review.reason}</p>
        <button disabled={busy} onClick={() => void apply()}>应用进度</button><button disabled={busy} onClick={() => setReview(null)}>取消</button>
      </section>}
    </aside><div className="localGraph">{graphProps && focus ? mode === "3d"
      ? <Graph3DCanvas {...graphProps} copy={APP_COPY_ZH_CN.graphStats}/>
      : <GraphCanvas {...graphProps} ancestorIds={focus.ancestorIds} graphCacheKey={`local-plugin:${graph?.graph_id}`} backgroundFill={themeMode === "dark" ? "#000000" : "#f7f7f4"}/>
      : <div className="localEmpty">{connected ? "正在读取桌面图谱…" : "正在连接 Clew Local…"}</div>}
    </div></div>
  </main>;
}
