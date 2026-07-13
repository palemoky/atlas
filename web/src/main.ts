import "./style.css";
import { ForceGraph } from "./graph";
import { toGraph, type Blueprint, type GraphNode } from "./types";

const DATASETS: { id: string; file: string; label: string }[] = [
  { id: "scientists", file: "/data/scientists.json", label: "Great Scientists" },
  { id: "computer_scientists", file: "/data/computer_scientists.json", label: "Computer Scientist" },
];

const graphEl = document.getElementById("graph")!;
const detailEl = document.getElementById("detail")!;
const searchEl = document.getElementById("search") as HTMLInputElement;
const typeFilterEl = document.getElementById("type-filter") as HTMLSelectElement;
const switchEl = document.getElementById("dataset-switch")!;

const graph = new ForceGraph(graphEl);
const cache = new Map<string, Blueprint>();
let activeTag: string | null = null;

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// Descriptions use `[text](url)` markdown links; render them as anchors.
function renderDescription(desc: string): string {
  const escaped = escapeHtml(desc);
  return escaped.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_m, text, url) => `<a href="${url}" target="_blank" rel="noopener">${text}</a>`
  );
}

function showDetail(node: GraphNode | null) {
  if (!node) {
    detailEl.classList.add("hidden");
    detailEl.innerHTML = "";
    graph.applyFilter(activeTag ? (n) => n.tags.includes(activeTag!) : null);
    return;
  }

  const years = [node.born, node.died].filter(Boolean).join(" – ");
  detailEl.classList.remove("hidden");
  detailEl.innerHTML = `
    <button class="close" id="detail-close">✕</button>
    ${node.image ? `<img class="avatar" src="${node.image}" alt="${escapeHtml(node.label)}" />` : ""}
    <h2>${escapeHtml(node.label)}</h2>
    ${years ? `<div class="years">${escapeHtml(years)}</div>` : ""}
    <div class="desc">${renderDescription(node.description)}</div>
    <div class="tags">
      ${node.tags.map((t) => `<span class="tag" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</span>`).join("")}
    </div>
  `;

  detailEl.querySelector("#detail-close")?.addEventListener("click", () => showDetail(null));
  detailEl.querySelectorAll<HTMLElement>(".tag").forEach((el) => {
    el.addEventListener("click", () => {
      activeTag = el.dataset.tag ?? null;
      graph.applyFilter((n) => n.tags.includes(activeTag!));
    });
  });

  graph.applyFilter((n) => n.id === node.id);
  graph.focusNode(node.id);
}

function applySearchAndType() {
  const q = searchEl.value.trim().toLowerCase();
  const type = typeFilterEl.value;
  activeTag = null;

  if (!q && !type) {
    graph.applyFilter(null);
    return;
  }

  graph.applyFilter((n) => {
    const matchesQuery = !q || n.label.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q));
    const matchesType = !type || n.elementType === type;
    return matchesQuery && matchesType;
  });
}

async function loadDataset(id: string) {
  const meta = DATASETS.find((d) => d.id === id)!;
  let bp = cache.get(id);
  if (!bp) {
    const res = await fetch(meta.file);
    if (!res.ok) throw new Error(`Failed to load ${meta.file}: ${res.status}`);
    bp = await res.json();
    cache.set(id, bp!);
  }

  const { nodes, links } = toGraph(bp!);

  const types = Array.from(new Set(nodes.map((n) => n.elementType))).sort();
  typeFilterEl.innerHTML =
    `<option value="">全部类型</option>` + types.map((t) => `<option value="${t}">${t}</option>`).join("");

  graph.reset();
  graph.setData(nodes, links);
  showDetail(null);
}

function renderSwitch(activeId: string) {
  switchEl.innerHTML = DATASETS.map(
    (d) => `<button data-id="${d.id}" class="${d.id === activeId ? "active" : ""}">${d.label}</button>`
  ).join("");

  switchEl.querySelectorAll<HTMLButtonElement>("button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      renderSwitch(btn.dataset.id!);
      searchEl.value = "";
      await loadDataset(btn.dataset.id!);
    });
  });
}

graph.onClick((node) => showDetail(node));
searchEl.addEventListener("input", applySearchAndType);
typeFilterEl.addEventListener("change", applySearchAndType);

renderSwitch(DATASETS[0].id);
loadDataset(DATASETS[0].id).catch((err) => {
  graphEl.innerHTML = `<p style="color:#e88; padding:20px;">加载数据失败：${escapeHtml(String(err))}</p>`;
  console.error(err);
});
