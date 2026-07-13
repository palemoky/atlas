import { select, type Selection } from "d3-selection";
import "d3-transition";
import { zoom, zoomIdentity, type D3ZoomEvent } from "d3-zoom";
import { drag, type D3DragEvent } from "d3-drag";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
} from "d3-force";
import { scaleLinear } from "d3-scale";
import type { GraphNode, GraphLink } from "./types";

const TYPE_COLORS: Record<string, string> = {
  Person: "#5b8def",
  Project: "#e0a63e",
  Organization: "#5cb87a",
};

const MIN_R = 10;
const MAX_R = 34;
const LABEL_ZOOM_THRESHOLD = 0.9;

export class ForceGraph {
  private svg: Selection<SVGSVGElement, unknown, null, undefined>;
  private zoomLayer: Selection<SVGGElement, unknown, null, undefined>;
  private linkLayer: Selection<SVGGElement, unknown, null, undefined>;
  private nodeLayer: Selection<SVGGElement, unknown, null, undefined>;
  private sim: Simulation<GraphNode, GraphLink>;
  private width = 0;
  private height = 0;
  private radius = scaleLinear().range([MIN_R, MAX_R]);
  private onNodeClick?: (n: GraphNode | null) => void;
  private allNodes: GraphNode[] = [];
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.svg = select(container)
      .append("svg")
      .attr("class", "graph-svg")
      .attr("width", "100%")
      .attr("height", "100%");

    this.svg.append("defs");

    this.zoomLayer = this.svg.append("g").attr("class", "zoom-layer");
    this.linkLayer = this.zoomLayer.append("g").attr("class", "links");
    this.nodeLayer = this.zoomLayer.append("g").attr("class", "nodes");

    const zoomBehavior = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.15, 4])
      .on("zoom", (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        this.zoomLayer.attr("transform", event.transform.toString());
        // Labels crowd/overlap heavily when many nodes are visible at once, so
        // only show them once zoomed in enough to have room; always show on hover/select.
        this.svg.classed("labels-hidden", event.transform.k < LABEL_ZOOM_THRESHOLD);
      });
    this.svg.call(zoomBehavior);
    this.svg.on("click", (event: MouseEvent) => {
      if (event.target === this.svg.node()) this.onNodeClick?.(null);
    });
    (this.svg.node() as any).__zoom_behavior = zoomBehavior;

    this.sim = forceSimulation<GraphNode>()
      .force("charge", forceManyBody().strength(-160))
      .force(
        "collide",
        forceCollide<GraphNode>((d) => this.radius(d.influence) + 14).iterations(3)
      )
      .force("center", forceCenter())
      // Weak pull toward the viewport center so disconnected clusters (nodes with
      // no links) don't fly off into empty space under charge repulsion alone.
      .force("x", forceX<GraphNode>().strength(0.03))
      .force("y", forceY<GraphNode>().strength(0.03))
      .on("tick", () => this.tick())
      .on("end", () => this.fitToView());

    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    this.resize();
  }

  onClick(cb: (n: GraphNode | null) => void) {
    this.onNodeClick = cb;
  }

  private resize() {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    this.sim.force("center", forceCenter(this.width / 2, this.height / 2));
    this.sim.force("x", forceX<GraphNode>(this.width / 2).strength(0.05));
    this.sim.force("y", forceY<GraphNode>(this.height / 2).strength(0.05));
    this.sim.alpha(0.3).restart();
  }

  setData(nodes: GraphNode[], links: GraphLink[]) {
    this.allNodes = nodes;

    const influences = nodes.map((n) => n.influence);
    const domain: [number, number] =
      influences.length > 0 ? [Math.min(...influences), Math.max(...influences)] : [0, 10];
    this.radius.domain(domain);

    // Preserve defs, seed a rough circular layout so it doesn't start in a pile.
    nodes.forEach((n, i) => {
      if (n.x === undefined) {
        const angle = (i / nodes.length) * Math.PI * 2;
        n.x = this.width / 2 + Math.cos(angle) * 200;
        n.y = this.height / 2 + Math.sin(angle) * 200;
      }
    });

    this.sim.nodes(nodes);
    this.sim
      .force(
        "link",
        forceLink<GraphNode, GraphLink>(links)
          .id((d) => d.id)
          .distance(85)
          .strength(0.35)
      )
      .force(
        "collide",
        forceCollide<GraphNode>((d) => this.radius(d.influence) + 14).iterations(3)
      );

    this.renderLinks(links);
    this.renderNodes(nodes);
    this.sim.alpha(1).restart();
    this.fitToView();
  }

  private renderLinks(links: GraphLink[]) {
    this.linkLayer
      .selectAll<SVGLineElement, GraphLink>("line")
      .data(links, (d: any) => d.id)
      .join(
        (enter) =>
          enter
            .append("line")
            .attr("class", (d) => `link link-${d.connectionType}`)
            .attr("stroke", "#8892a4")
            .attr("stroke-opacity", 0.35)
            .attr("stroke-width", 1.2),
        (update) => update,
        (exit) => exit.remove()
      );
  }

  private renderNodes(nodes: GraphNode[]) {
    const defs = this.svg.select("defs");

    const groups = this.nodeLayer
      .selectAll<SVGGElement, GraphNode>("g.node")
      .data(nodes, (d: any) => d.id)
      .join(
        (enter) => {
          const g = enter
            .append("g")
            .attr("class", "node")
            .call(this.dragBehavior());

          g.append("circle")
            .attr("class", "node-ring")
            .attr("fill", (d) => TYPE_COLORS[d.elementType] ?? "#999")
            .attr("r", (d) => this.radius(d.influence));

          g.each((d, i, els) => {
            if (d.image) {
              const clipId = `clip-${d.id}`;
              defs
                .append("clipPath")
                .attr("id", clipId)
                .append("circle")
                .attr("r", this.radius(d.influence) - 2);

              select(els[i])
                .append("image")
                .attr("href", d.image)
                .attr("clip-path", `url(#${clipId})`)
                .attr("x", -(this.radius(d.influence) - 2))
                .attr("y", -(this.radius(d.influence) - 2))
                .attr("width", (this.radius(d.influence) - 2) * 2)
                .attr("height", (this.radius(d.influence) - 2) * 2)
                .attr("preserveAspectRatio", "xMidYMid slice");
            } else {
              select(els[i])
                .append("text")
                .attr("class", "node-initial")
                .attr("text-anchor", "middle")
                .attr("dy", "0.35em")
                .attr("fill", "#fff")
                .attr("font-size", this.radius(d.influence) * 0.8)
                .text(d.label.charAt(0));
            }
          });

          g.append("text")
            .attr("class", "node-label")
            .attr("text-anchor", "middle")
            .attr("dy", (d) => this.radius(d.influence) + 14)
            .text((d) => d.label);

          g.on("click", (event, d) => {
            event.stopPropagation();
            this.onNodeClick?.(d);
          });

          // Labels are hidden when zoomed out (see labels-hidden); reveal on hover regardless.
          g.on("mouseenter", function () {
            select(this).classed("hovered", true);
          }).on("mouseleave", function () {
            select(this).classed("hovered", false);
          });

          return g;
        },
        (update) => update,
        (exit) => exit.remove()
      );

    groups.attr("data-id", (d) => d.id);
  }

  private dragBehavior() {
    return drag<SVGGElement, GraphNode>()
      .on("start", (event: D3DragEvent<SVGGElement, GraphNode, GraphNode>, d) => {
        if (!event.active) this.sim.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on("drag", (event: D3DragEvent<SVGGElement, GraphNode, GraphNode>, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event: D3DragEvent<SVGGElement, GraphNode, GraphNode>, d) => {
        if (!event.active) this.sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });
  }

  private tick() {
    this.linkLayer
      .selectAll<SVGLineElement, GraphLink>("line")
      .attr("x1", (d) => (d.source as GraphNode).x ?? 0)
      .attr("y1", (d) => (d.source as GraphNode).y ?? 0)
      .attr("x2", (d) => (d.target as GraphNode).x ?? 0)
      .attr("y2", (d) => (d.target as GraphNode).y ?? 0);

    this.nodeLayer
      .selectAll<SVGGElement, GraphNode>("g.node")
      .attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
  }

  // Dim nodes/links that don't match; null predicate clears the highlight.
  applyFilter(predicate: ((n: GraphNode) => boolean) | null) {
    const matched = predicate ? new Set(this.allNodes.filter(predicate).map((n) => n.id)) : null;

    this.nodeLayer
      .selectAll<SVGGElement, GraphNode>("g.node")
      .classed("dimmed", (d) => !!matched && !matched.has(d.id));

    this.linkLayer
      .selectAll<SVGLineElement, GraphLink>("line")
      .classed("dimmed", (d) => {
        if (!matched) return false;
        const s = (d.source as GraphNode).id ?? (d.source as unknown as string);
        const t = (d.target as GraphNode).id ?? (d.target as unknown as string);
        return !matched.has(s) && !matched.has(t);
      });
  }

  focusNode(id: string) {
    const node = this.allNodes.find((n) => n.id === id);
    if (!node || node.x === undefined || node.y === undefined) return;
    const zb = (this.svg.node() as any).__zoom_behavior;
    const transform = zoomIdentity
      .translate(this.width / 2, this.height / 2)
      .scale(1.4)
      .translate(-node.x, -node.y);
    this.svg.transition().duration(500).call(zb.transform, transform);
  }

  fitToView() {
    if (!this.allNodes.length) return;
    const xs = this.allNodes.map((n) => n.x ?? 0);
    const ys = this.allNodes.map((n) => n.y ?? 0);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const boxW = Math.max(maxX - minX, 1);
    const boxH = Math.max(maxY - minY, 1);
    const padding = 80;
    const scale = Math.min(
      4,
      Math.min((this.width - padding) / boxW, (this.height - padding) / boxH)
    );
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const transform = zoomIdentity
      .translate(this.width / 2, this.height / 2)
      .scale(scale)
      .translate(-cx, -cy);
    const zb = (this.svg.node() as any).__zoom_behavior;
    this.svg.transition().duration(400).call(zb.transform, transform);
  }

  reset() {
    this.svg.select("defs").selectAll("*").remove();
    this.linkLayer.selectAll("*").remove();
    this.nodeLayer.selectAll("*").remove();
  }
}
