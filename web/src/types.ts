export interface RawElement {
  _id: string;
  attributes: {
    label: string;
    description?: string;
    tags?: string[];
    born?: string;
    died?: string;
    "element type"?: string;
    image?: string;
    influence?: number;
    blog?: string;
    website?: string;
    [key: string]: unknown;
  };
}

export interface RawConnection {
  _id: string;
  direction: string;
  from: string;
  to: string;
  attributes: {
    "connection type"?: string;
    [key: string]: unknown;
  };
}

export interface Blueprint {
  name: string;
  description: string;
  elements: RawElement[];
  connections: RawConnection[];
}

// Simulation-ready node/link types (d3-force mutates x/y/vx/vy in place).
export interface GraphNode {
  id: string;
  label: string;
  description: string;
  tags: string[];
  born?: string;
  died?: string;
  elementType: string;
  image?: string;
  influence: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphLink {
  id: string;
  source: string | GraphNode;
  target: string | GraphNode;
  connectionType: string;
}

export function toGraph(bp: Blueprint): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodes: GraphNode[] = bp.elements.map((e) => ({
    id: e._id,
    label: e.attributes.label,
    description: e.attributes.description ?? "",
    tags: e.attributes.tags ?? [],
    born: e.attributes.born,
    died: e.attributes.died,
    elementType: e.attributes["element type"] ?? "Person",
    image: e.attributes.image,
    influence: typeof e.attributes.influence === "number" ? e.attributes.influence : 5,
  }));

  const ids = new Set(nodes.map((n) => n.id));

  const links: GraphLink[] = bp.connections
    .filter((c) => ids.has(c.from) && ids.has(c.to))
    .map((c) => ({
      id: c._id,
      source: c.from,
      target: c.to,
      connectionType: c.attributes["connection type"] ?? "tag",
    }));

  return { nodes, links };
}
