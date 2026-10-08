"use client";

/**
 * AuditPage: the whole design system audit page, driven by the scan.
 *
 * Copy this file and AuditCanvas.tsx into the audit folder as they are. Do not
 * edit either. You supply three things:
 *
 *   <AuditPage scan={scan} specimens={specimens} data={data} />
 *
 *   scan       audit.scan.json, written by scripts/scan.mjs. Never edited by hand.
 *   specimens  one render function per component and per hand-rolled look.
 *   data       audit.data.json: your judgement. Labels, captions, recommendations.
 *
 * The inventory lists every component the scan found and renders the shared
 * ones (the primitives) with every variant value, by calling each component's
 * render function once per value. Local versions and hand-rolled elements are
 * listed with their counts, and drawn only for groups named in `data.audited`:
 * the deep audit of a group happens when the user asks for it.
 *
 * A shared component with no specimen yet shows as an empty frame and lowers
 * the coverage count, so a gap is never silent.
 *
 * Every specimen names the real usage it was copied from, and the page prints
 * that location under it. Content is never invented; see SpecimenEntry.
 *
 * The view is in the URL hash: no hash is the inventory, #modals is one group.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AuditCanvas, CanvasPanel, CanvasSpecimen, useAuditCanvas, type CanvasMarker } from "./AuditCanvas";

type Literal = string | number | boolean;

export type ScanAxis = {
  name: string;
  kind: string;
  values: Literal[];
  default?: Literal;
  required: boolean;
  inheritedFrom?: string;
  used?: Record<string, number>;
  neverUsed?: Literal[];
};

export type ScanProp = {
  name: string;
  type: string;
  optional: boolean;
  values?: Literal[];
  boolean?: boolean;
  default?: Literal;
  inheritedFrom?: string;
};

export type ScanComponent = {
  id: string;
  name: string;
  file: string;
  line: number;
  shared: boolean;
  kind: string | null;
  wraps: string | null;
  wrapsComponent: string | null;
  extends: string[];
  props: ScanProp[];
  axes: ScanAxis[];
  primary: string | null;
  part: boolean;
  parts: string[];
  uses: number;
  files: number;
  classNameOverrides: number;
  /** Call sites that restyle the component with className, grouped by the classes they add. Placement (margin, width) is not counted. */
  overrides?: ScanOverrides;
  /** The `data-slot` its root element sets, if any. */
  slot?: string;
  /** Its own visual classes: used to recognise its element on a page. */
  ownClasses?: string[];
  propUsage: Record<string, { count: number; values: Record<string, number>; dynamic: number }>;
  combos: { props: Record<string, unknown>; count: number; example: string }[];
  callSites: { file: string; line: number; props: Record<string, unknown>; classes?: string[]; conditionalClasses?: string[]; routes?: string[] }[];
};

export type ScanOverridePattern = {
  /** Every class in this override that changes the look: replaces, inside, and adds together. */
  classes: string[];
  /** Classes that replace one the component sets itself, with the ones they replace. */
  replaces: { token: string; replaces: string[] }[];
  /** Classes that style the component's children: `[&_svg]:…`, `**:…`. */
  inside: string[];
  /** Classes that add a look the component does not set. */
  adds: string[];
  /** Of `classes`, the ones applied only under a condition. */
  conditional: string[];
  /** Placement classes passed alongside. Not an override. */
  placement: string[];
  /** The variant props of the first call site with this override, so it is drawn on the variant it restyles. */
  props: Record<string, unknown>;
  count: number;
  sites: string[];
};

export type ScanOverrides = { sites: number; replacing: number; placementOnly: number; patterns: ScanOverridePattern[] };

export type ScanCluster = {
  id: string;
  kind: string;
  tag: string;
  role?: string;
  confidence: string;
  signature: string;
  lookFamily: string;
  count: number;
  files: number;
  locations: { file: string; line: number; in: string | null }[];
  example: { at: string; code: string };
};

export type AuditScan = {
  /** Every route the app has, and the file that defines it. */
  pages?: { route: string; file: string; dynamic?: boolean }[];
  generatedAt: string;
  scannedFiles: number;
  components: ScanComponent[];
  handRolled: ScanCluster[];
};

export type SpecimenEntry = {
  /**
   * The real usage this specimen is a copy of, as "file:line". Required.
   * For a component, one of its call sites in the scan. For a hand-rolled look, one of its locations.
   */
  from: string;
  /**
   * Stand-ins for values that only exist when the app runs, keyed by the expression in the source:
   * { "project.name": "Acme rebrand" }. The stand-in must be the kind of thing the expression is.
   * Everything else in the specimen is copied from the usage as written.
   */
  mocks?: Record<string, string>;
  /**
   * Render the real component as that usage does, spreading the props: `<Button {...props}>Save</Button>`.
   * Show it as written: leave out the className the call site passes to restyle it. The page draws
   * every override itself, from the scan, by calling render({ className }). If the component needs
   * room, give it a wrapper marked as only that: `<div data-audit-room className="w-72">`.
   */
  render: (props: Record<string, unknown>) => ReactNode;
  /**
   * For a component that is opened by state the usage keeps elsewhere (a dialog with `open={open}`
   * and no trigger of its own): the name of that prop, usually "open". The page adds an Open
   * control under the specimen and passes `{ [toggle]: true, onOpenChange }` when it is on.
   * Components with their own trigger do not need this: they open when clicked.
   */
  toggle?: string;
  /**
   * A fixed box, for raw markup that positions itself against the screen (a hand-rolled modal
   * with a `fixed inset-0` backdrop). Not for components.
   */
  width?: number;
  height?: number;
  /** Shrink a boxed specimen in the inventory, e.g. 0.4. The group view always shows full size. */
  scale?: number;
};

export type AuditSpecimens = {
  /** Keyed by the component id from the scan: "src/components/ui/button.tsx#Button". */
  components: Record<string, SpecimenEntry>;
  /** Keyed by the hand-rolled look id from the scan: "buttons-1a2b3c4d". */
  handRolled: Record<string, SpecimenEntry>;
};

export type NextStep = { title: string; reason: string; prompt: string };

export type GroupDetail = {
  steps?: { label: string; done: boolean }[];
  /** Component id of the version to keep. */
  keep?: string;
  headline?: string;
  reason?: string;
  stats?: { label: string; value: number | string }[];
  /** Numbered markers on a specimen, by component or look id. x and y are percentages of the specimen. */
  notes?: Record<string, { n: number; text: string; x: number; y: number }[]>;
  nextSteps?: NextStep[];
};

export type AuditData = {
  project?: string;
  status?: string;
  /** Group ids the user asked to audit in depth. Their local versions and hand-rolled looks are drawn. */
  audited?: string[];
  /** Group labels by group id, when the default (the id, capitalised) is not right. */
  labels?: Record<string, string>;
  /** Move a component or hand-rolled look to another group: { "<id>": "<group id>" }. */
  move?: Record<string, string>;
  /** Group ids in display order. Groups not named follow, most used first. */
  order?: string[];
  /** Left out on purpose. Each needs a reason, and is listed at the end of the page. */
  omitted?: { id: string; reason: string }[];
  /** One variant value left out on purpose. */
  skipped?: { component: string; axis: string; value: Literal; reason: string }[];
  /** One line under a component or look, by id. */
  captions?: Record<string, string>;
  /** The deep audit of a group, by group id. */
  details?: Record<string, GroupDetail>;
  nextSteps?: NextStep[];
  coverage?: unknown;
};

type Group = {
  id: string;
  label: string;
  /** True once the user has asked for this group's deep audit. */
  deep: boolean;
  components: ScanComponent[];
  looks: ScanCluster[];
  lookAlikes: ScanCluster[];
  uses: number;
  handRolled: number;
};

type Model = {
  groups: Group[];
  byId: Map<string, ScanComponent>;
  omitted: Map<string, string>;
  skipped: Map<string, string>;
  entries: number;
  shown: number;
  variants: number;
  variantsShown: number;
};

function titleCase(id: string) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function buildModel(scan: AuditScan, data: AuditData, specimens: AuditSpecimens): Model {
  const byId = new Map(scan.components.map((component) => [component.id, component]));
  const omitted = new Map((data.omitted ?? []).map((entry) => [entry.id, entry.reason]));
  const skipped = new Map((data.skipped ?? []).map((entry) => [`${entry.component}|${entry.axis}|${String(entry.value)}`, entry.reason]));
  const groups = new Map<string, Group>();
  const groupFor = (id: string) => {
    let group = groups.get(id);
    if (!group) {
      group = { id, label: data.labels?.[id] ?? titleCase(id), deep: (data.audited ?? []).includes(id), components: [], looks: [], lookAlikes: [], uses: 0, handRolled: 0 };
      groups.set(id, group);
    }
    return group;
  };

  let entries = 0;
  let shown = 0;
  let variants = 0;
  let variantsShown = 0;

  const groupIdOf = (component: ScanComponent): string => {
    const owner = component.part && component.primary ? byId.get(component.primary) : undefined;
    const item = owner ?? component;
    return data.move?.[item.id] ?? item.kind ?? "other";
  };
  for (const component of scan.components) {
    if (omitted.has(component.id)) continue;
    const hasSpecimen = !!specimens.components[component.id];
    // Shared components are always drawn. A local version is drawn once its group is audited.
    const drawn = component.shared || groupFor(groupIdOf(component)).deep;
    for (const axis of component.axes) {
      if (!drawn) break;
      if (!axis.required) continue;
      for (const value of axis.values) {
        if (skipped.has(`${component.id}|${axis.name}|${String(value)}`)) continue;
        variants += 1;
        if (hasSpecimen) variantsShown += 1;
      }
    }
    if (component.part) continue;
    const group = groupFor(groupIdOf(component));
    group.components.push(component);
    group.uses += component.uses;
    if (!drawn) continue;
    entries += 1;
    if (hasSpecimen) shown += 1;
  }
  for (const cluster of scan.handRolled) {
    if (omitted.has(cluster.id)) continue;
    const group = groupFor(data.move?.[cluster.id] ?? cluster.kind);
    if (cluster.confidence !== "high") {
      group.lookAlikes.push(cluster);
      continue;
    }
    group.looks.push(cluster);
    group.uses += cluster.count;
    group.handRolled += cluster.count;
    if (!group.deep) continue;
    entries += 1;
    if (specimens.handRolled[cluster.id]) shown += 1;
  }

  const order = data.order ?? [];
  const sorted = [...groups.values()].sort((a, b) => {
    const ai = order.indexOf(a.id);
    const bi = order.indexOf(b.id);
    if (ai !== bi) return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi);
    return b.uses - a.uses || a.label.localeCompare(b.label);
  });
  for (const group of sorted) group.components.sort((a, b) => Number(b.shared) - Number(a.shared) || b.uses - a.uses);
  return { groups: sorted, byId, omitted, skipped, entries, shown, variants, variantsShown };
}

/**
 * How long ago the scan ran. Read on the client after mount: frameworks that prerender
 * (Next.js with cacheComponents) reject a clock read during render.
 */
function TimeAgo({ iso }: { iso: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);
  return <>{now === null ? "" : timeAgo(iso, now)}</>;
}

function timeAgo(iso: string, now: number) {
  const seconds = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (seconds < 90) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} d ago`;
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/**
 * The app's own text styles and page background, read from <body>, so specimens
 * look as they do in the app instead of inheriting the audit's chrome.
 */
function useAppStyle(): { text: CSSProperties; background: string } {
  const [style, setStyle] = useState<{ text: CSSProperties; background: string }>({ text: {}, background: "#ffffff" });
  useEffect(() => {
    const body = getComputedStyle(document.body);
    const html = getComputedStyle(document.documentElement);
    const clear = (colour: string) => !colour || colour === "transparent" || colour === "rgba(0, 0, 0, 0)";
    setStyle({
      text: { fontFamily: body.fontFamily, fontSize: body.fontSize, lineHeight: body.lineHeight, letterSpacing: body.letterSpacing, color: body.color },
      background: [body.backgroundColor, html.backgroundColor].find((colour) => !clear(colour)) ?? "#ffffff",
    });
  }, []);
  return style;
}

function useHashGroup() {
  const [group, setGroup] = useState<string | null>(null);
  useEffect(() => {
    const read = () => setGroup(decodeURIComponent(window.location.hash.replace(/^#/, "")) || null);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  return group;
}

// ── Issues ────────────────────────────────────────────────────────────────

/** The four things the audit flags. One name, one colour, one meaning each. */
export const STATUSES = {
  raw: { label: "Raw", color: "#f43f5e", meaning: "Plain HTML styled in place, with no component." },
  custom: { label: "Custom", color: "#f59e0b", meaning: "A component outside the design system that does the job of one in it." },
  overridden: { label: "Overridden", color: "#ea580c", meaning: "A design system component restyled with className where it is used. Margin, width and position do not count." },
  unused: { label: "Unused", color: "#a1a1aa", meaning: "It exists, but nothing uses it." },
} as const;
type StatusKey = keyof typeof STATUSES;
const STATUS_ORDER = Object.keys(STATUSES) as StatusKey[];

type Issue = {
  id: string;
  status: StatusKey;
  /** The sidebar row it is listed under: a component id, or "<group>|raw". */
  owner: string;
  /** The `data-canvas-id` of the element it points at. */
  target: string;
  /** Where its pin sits, when not on the target itself: a variant's pin sits beside its label. */
  pin?: string;
  title: string;
  detail: string;
  prompt: string;
  /** For raw elements: how many places this look appears in. */
  count?: number;
};

const at = (file: string, line: number) => `${file}:${line}`;

/** The `data-canvas-id` of a component's Overridden card. */
const overridesTarget = (id: string) => `${id}|overrides`;

/** One line for an override: what it replaces first, then how much more it changes. */
function overrideSummary(pattern: ScanOverridePattern) {
  const first = pattern.replaces[0];
  const lead = first ? `${first.replaces[0] ?? "(own)"} → ${first.token}` : pattern.adds[0] ? `+ ${pattern.adds[0]}` : `↳ ${pattern.inside[0]}`;
  const more = pattern.classes.length - 1;
  return more > 0 ? `${lead} +${more}` : lead;
}

/** Every issue, from the scan alone. Nothing here is the agent's opinion. */
function buildIssues(model: Model): Issue[] {
  const issues: Issue[] = [];
  for (const group of model.groups) {
    const primary = group.components.find((component) => component.shared);
    for (const component of group.components) {
      const drawn = component.shared || group.deep;
      const where = at(component.file, component.line);
      if (!component.shared) {
        const wrapped = component.wrapsComponent ? model.byId.get(component.wrapsComponent) : undefined;
        issues.push({
          id: `custom:${component.id}`,
          status: "custom",
          owner: component.id,
          target: component.id,
          title: wrapped ? `Custom version of ${wrapped.name}` : `Custom ${component.wraps ?? "component"}`,
          detail: `${component.name} is defined outside the design system, in ${where}. Used ${plural(component.uses, "time")} in ${plural(component.files, "file")}.`,
          prompt: wrapped
            ? `${component.name} (${where}) wraps ${wrapped.name} from ${wrapped.file} and is used ${plural(component.uses, "time")}. Decide whether it should become a variant of ${wrapped.name}, and list what it changes.`
            : `${component.name} (${where}) is a custom ${component.wraps ?? "component"} used ${plural(component.uses, "time")}${primary ? `, next to the shared ${primary.name} (${primary.file})` : ""}. Compare the two and say what moving to the shared one would take.`,
        });
      }
      if (component.uses === 0) {
        issues.push({
          id: `unused:${component.id}`,
          status: "unused",
          owner: component.id,
          target: component.id,
          title: "Never used",
          detail: `Nothing in the codebase renders ${component.name}. ${where}`,
          prompt: `${component.name} in ${where} is not used anywhere. Confirm nothing imports it, then remove it.`,
        });
      }
      const parts = component.parts.map((id) => model.byId.get(id)).filter((part): part is ScanComponent => !!part);
      // One issue per distinct override, for the component and each of its parts.
      for (const owner of [component, ...parts]) {
        const ownerWhere = at(owner.file, owner.line);
        if (!owner.overrides) {
          // A scan from before overrides were classified: all it knows is that className was passed.
          if (owner === component && component.classNameOverrides > 0)
            issues.push({
              id: `overridden:${component.id}`,
              status: "overridden",
              owner: component.id,
              target: component.id,
              title: `Restyled at ${component.classNameOverrides} of ${plural(component.uses, "use")}`,
              detail: `Those call sites pass className to change how ${component.name} looks instead of using a variant.`,
              prompt: `${component.name} (${where}) is restyled with className at ${component.classNameOverrides} of its ${component.uses} call sites. Group the overrides that repeat, and suggest a variant for each group.`,
            });
          continue;
        }
        for (const pattern of owner.overrides.patterns) {
          const replaced = pattern.replaces.flatMap((entry) => entry.replaces.slice(0, 1));
          issues.push({
            id: `overridden:${owner.id}|${[...pattern.classes].sort().join(" ")}`,
            status: "overridden",
            owner: component.id,
            target: drawn ? overridesTarget(component.id) : component.id,
            count: pattern.count,
            title: `${pattern.count}× ${owner === component ? "" : `${owner.name}: `}${overrideSummary(pattern)}`,
            detail: `className="${pattern.classes.join(" ")}" at ${pattern.sites.slice(0, 3).join(", ")}${pattern.sites.length > 3 ? `, and ${pattern.sites.length - 3} more` : ""}.`,
            prompt: `${owner.name} (${ownerWhere}) is restyled with className="${pattern.classes.join(" ")}" at ${plural(pattern.count, "call site")}: ${pattern.sites.join(", ")}.${
              replaced.length ? ` That replaces its own ${[...new Set(replaced)].join(", ")}.` : ""
            } Decide whether this is a variant ${owner.name} is missing (add it, and use it at those call sites) or a one-off to remove, then make the change.`,
          });
        }
      }
      for (const owner of [component, ...parts]) {
        // A component or part nothing uses has one "never used" issue; its values would only repeat it.
        if (owner.uses === 0) continue;
        for (const axis of owner.axes) {
          if (!axis.required || axis.kind !== "enum") continue;
          for (const value of axis.neverUsed ?? []) {
            const prefix = owner === component ? "" : `${owner.name}.`;
            issues.push({
              id: `unused:${owner.id}|${axis.name}|${String(value)}`,
              status: "unused",
              owner: component.id,
              target: drawn ? `${owner.id}|${axis.name}|${String(value)}` : component.id,
              pin: drawn ? `${owner.id}|${axis.name}|${String(value)}|pin` : undefined,
              title: `${prefix}${axis.name}="${String(value)}" is never used`,
              detail: `No call site passes it to ${owner.name}.`,
              prompt: `The ${axis.name}="${String(value)}" option of ${owner.name} (${at(owner.file, owner.line)}) is never used. Confirm it, then remove it or note why it stays.`,
            });
          }
        }
      }
      for (const part of parts) {
        if (part.uses > 0) continue;
        issues.push({
          id: `unused:${part.id}`,
          status: "unused",
          owner: component.id,
          target: component.id,
          title: `${part.name} is never used`,
          detail: `A part of ${component.name} that nothing renders. ${at(part.file, part.line)}`,
          prompt: `${part.name} (${at(part.file, part.line)}) is never used. Confirm nothing imports it, then remove it.`,
        });
      }
    }
    for (const look of group.looks) {
      const first = look.locations[0];
      const tag = `<${look.tag}${look.role ? ` role="${look.role}"` : ""}>`;
      issues.push({
        id: `raw:${look.id}`,
        status: "raw",
        owner: `${group.id}|raw`,
        target: group.deep ? look.id : `${group.id}|raw`,
        count: look.count,
        title: `${look.count}× ${tag}`,
        detail: `${look.signature.startsWith("(") ? look.signature : `Classes: ${look.signature}`}. First at ${at(first.file, first.line)}.`,
        prompt: `Replace the ${plural(look.count, "raw " + tag + " element")} with ${primary ? `the ${primary.name} component from ${primary.file}` : "a shared component"}. They are at: ${look.locations
          .slice(0, 12)
          .map((location) => at(location.file, location.line))
          .join(", ")}${look.locations.length > 12 ? `, and ${look.locations.length - 12} more` : ""}.`,
      });
    }
  }
  return issues;
}

/** Resolved issues, kept in this browser per project. */
function useResolved(project: string) {
  const key = `lunagraph-audit-resolved:${project}`;
  const [resolved, setResolved] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    try {
      setResolved(new Set(JSON.parse(window.localStorage.getItem(key) ?? "[]") as string[]));
    } catch {
      setResolved(new Set());
    }
  }, [key]);
  const toggle = (id: string) =>
    setResolved((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(key, JSON.stringify([...next]));
      } catch {
        // Not being able to remember is fine.
      }
      return next;
    });
  return [resolved, toggle] as const;
}

function copy(text: string) {
  void navigator.clipboard?.writeText(text);
}

/** Pins for the canvas: one per issue, except many raw looks on one block become one pin with the total. */
function buildMarkers(issues: Issue[], resolve: (id: string) => void): CanvasMarker[] {
  const byPlace = new Map<string, Issue[]>();
  for (const issue of issues) {
    const key = `${issue.pin ?? issue.target}|${issue.status}`;
    if (!byPlace.has(key)) byPlace.set(key, []);
    byPlace.get(key)!.push(issue);
  }
  const markers: CanvasMarker[] = [];
  for (const [key, group] of byPlace) {
    const status = STATUSES[group[0].status];
    if (group.length === 1) {
      const issue = group[0];
      markers.push({
        id: issue.id,
        target: issue.pin ?? issue.target,
        color: status.color,
        label: issue.count ? String(issue.count) : undefined,
        title: `${status.label}: ${issue.title}`,
        detail: issue.detail,
        actions: [
          { label: "Copy prompt", onSelect: () => copy(issue.prompt) },
          { label: "Resolve", onSelect: () => resolve(issue.id) },
        ],
      });
    } else {
      const total = group.reduce((sum, issue) => sum + (issue.count ?? 1), 0);
      markers.push({
        id: key,
        target: group[0].pin ?? group[0].target,
        color: status.color,
        label: String(total),
        title:
          group[0].status === "raw"
            ? `${status.label}: ${total} elements in ${plural(group.length, "look")}`
            : group[0].status === "overridden"
              ? `${status.label}: ${plural(total, "call site")} in ${plural(group.length, "distinct override")}`
              : `${status.label}: ${plural(group.length, "issue")}`,
        detail: "Open this in the sidebar to go through them one by one.",
        actions: [{ label: "Copy prompt", onSelect: () => copy(group.map((issue) => issue.prompt).join("\n\n")) }],
      });
    }
  }
  return markers;
}

// ── The page ──────────────────────────────────────────────────────────────

export function AuditPage({ scan, specimens, data = {} }: { scan: AuditScan; specimens: AuditSpecimens; data?: AuditData }) {
  const model = useMemo(() => buildModel(scan, data, specimens), [scan, data, specimens]);
  const app = useAppStyle();
  const hash = useHashGroup();
  const groupIndex = model.groups.findIndex((candidate) => candidate.id === hash);
  const group = groupIndex < 0 ? null : model.groups[groupIndex];
  const detail = group ? data.details?.[group.id] : undefined;
  const [location, setLocation] = useState("");
  useEffect(() => setLocation(window.location.host + window.location.pathname), []);

  const issues = useMemo(() => buildIssues(model), [model]);
  const [resolved, toggleResolved] = useResolved(data.project ?? "audit");
  const [shown, setShown] = useState<Set<StatusKey>>(() => new Set(STATUS_ORDER));
  const open = issues.filter((issue) => !resolved.has(issue.id));
  const markers = useMemo(
    () => buildMarkers(open.filter((issue) => shown.has(issue.status) && (!group || issue.owner === `${group.id}|raw` || group.components.some((component) => component.id === issue.owner))), toggleResolved),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [issues, resolved, shown, group],
  );
  const steps = (group ? detail?.nextSteps : data.nextSteps) ?? [];
  const shared = { model, specimens, data, appStyle: app.text };
  const counts = Object.fromEntries(STATUS_ORDER.map((key) => [key, open.filter((issue) => issue.status === key).length])) as Record<StatusKey, number>;
  const inspect = useInspectState();

  // "Open in a tab": the call site's page on its own, full size, with the marks.
  if (inspect.view === "page" && inspect.selected) return <PageView model={model} inspect={inspect.selected} route={inspect.route} site={inspect.site} width={inspect.width} />;

  return (
    <InspectContext.Provider value={inspect}>
    <AuditCanvas
      id={group ? `group:${group.id}` : "inventory"}
      inset={{ top: 56, right: group && detail ? 420 : inspect.selected ? 380 : 48, bottom: 104, left: 48 }}
      sidebar={<Sidebar model={model} issues={issues} resolved={resolved} toggleResolved={toggleResolved} data={data} scan={scan} location={location} openCount={open.length} />}
      markers={markers}
      toolbar={<Filters shown={shown} setShown={setShown} counts={counts} />}
      topRight={
        <div className="lgap-stack">
          <a className="lgac-panel lgap-bar lgap-link" href="https://lunagraph.com" target="_blank" rel="noreferrer">
            Edit in Lunagraph ↗
          </a>
          {group && detail ? <DetailPanels group={group} detail={detail} model={model} /> : null}
          <Inspector model={model} />
        </div>
      }
      bottomRight={steps.length && !inspect.selected ? <WhatNext steps={steps} /> : null}
    >
      <div className="lgap-layout" style={{ ["--lgap-app-bg" as string]: app.background }}>
        <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
        <div className="lgap-groups">
          {group ? null : <Legend counts={counts} />}
          {(group ? [group] : model.groups).map((candidate) => (
            <GroupSection key={candidate.id} group={candidate} index={model.groups.indexOf(candidate) + 1} full={!!group} {...shared} />
          ))}
          {!group && model.omitted.size ? (
            <section className="lgap-group">
              <header className="lgap-group-head">
                <h2 className="lgap-heading">Left out on purpose</h2>
                <span className="lgap-muted">{model.omitted.size}</span>
              </header>
              <div className="lgap-sheet lgap-rows-plain">
                {[...model.omitted].map(([id, reason]) => (
                  <div key={id}>
                    <span className="lgap-mono" data-canvas-text="">
                      {id}
                    </span>{" "}
                    <span className="lgap-muted">{reason}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </AuditCanvas>
    </InspectContext.Provider>
  );
}

function Dot({ status }: { status: StatusKey }) {
  return <span className="lgap-dot-status" style={{ background: STATUSES[status].color }} title={STATUSES[status].label} />;
}

/** What each colour means, above everything else on the canvas. */
function Legend({ counts }: { counts: Record<StatusKey, number> }) {
  const { open } = useInspect();
  return (
    <section className="lgap-legend" data-canvas-id="legend" data-canvas-select="Legend">
      {STATUS_ORDER.map((key) => (
        <div
          key={key}
          className={key === "overridden" && counts[key] ? "lgap-legend-item lgap-legend-link" : "lgap-legend-item"}
          data-audit-legend={key}
          title={key === "overridden" && counts[key] ? "Inspect every override, and see where each one is" : undefined}
          onClickCapture={key === "overridden" && counts[key] ? () => open("all") : undefined}
        >
          <span className="lgap-legend-pin" style={{ background: STATUSES[key].color }} />
          <span className="lgap-column">
            <span>
              <strong>{STATUSES[key].label}</strong> <span className="lgap-muted">{counts[key]}</span>
            </span>
            <span className="lgap-small lgap-muted">{STATUSES[key].meaning}</span>
          </span>
        </div>
      ))}
    </section>
  );
}

/** Which pins to show. */
function Filters({ shown, setShown, counts }: { shown: Set<StatusKey>; setShown: (next: Set<StatusKey>) => void; counts: Record<StatusKey, number> }) {
  const toggle = (key: StatusKey) => {
    const next = new Set(shown);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setShown(next);
  };
  return (
    <span className="lgap-filters" data-audit-filters="">
      {STATUS_ORDER.map((key) => (
        <button key={key} type="button" className="lgap-filter" aria-pressed={shown.has(key)} data-audit-filter={key} onClick={() => toggle(key)}>
          <Dot status={key} />
          {STATUSES[key].label}
          <span className="lgap-muted">{counts[key]}</span>
        </button>
      ))}
      <span className="lgac-divider" />
      <button type="button" className="lgap-filter" data-audit-filter="all" aria-pressed={shown.size === STATUS_ORDER.length} onClick={() => setShown(new Set(STATUS_ORDER))}>
        All
      </button>
      <button type="button" className="lgap-filter" data-audit-filter="none" aria-pressed={shown.size === 0} onClick={() => setShown(new Set())}>
        None
      </button>
    </span>
  );
}

type SidebarProps = {
  model: Model;
  issues: Issue[];
  resolved: Set<string>;
  toggleResolved: (id: string) => void;
  data: AuditData;
  scan: AuditScan;
  location: string;
  openCount: number;
};

/** The inventory: every component, its status dots, and its issues one click away. */
function Sidebar({ model, issues, resolved, toggleResolved, data, scan, location, openCount }: SidebarProps) {
  const { focus } = useAuditCanvas();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const byOwner = useMemo(() => {
    const map = new Map<string, Issue[]>();
    for (const issue of issues) {
      if (!map.has(issue.owner)) map.set(issue.owner, []);
      map.get(issue.owner)!.push(issue);
    }
    return map;
  }, [issues]);
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const components = model.groups.reduce((sum, group) => sum + group.components.length, 0);

  const Row = ({ id, name, count, focusTarget, listedId }: { id: string; name: string; count: number; focusTarget: string; listedId?: string }) => {
    const rowIssues = byOwner.get(id) ?? [];
    const openStatuses = STATUS_ORDER.filter((key) => rowIssues.some((issue) => issue.status === key && !resolved.has(issue.id)));
    const isOpen = expanded.has(id);
    return (
      <div className="lgap-side-item">
        <div className="lgap-side-row">
          {rowIssues.length ? (
            <button type="button" className="lgap-caret" aria-expanded={isOpen} aria-label={`${isOpen ? "Hide" : "Show"} issues for ${name}`} data-audit-caret={id} onClick={() => toggle(id)}>
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" style={{ transform: isOpen ? "rotate(90deg)" : undefined }}>
                <path d="M3.5 2 L7 5 L3.5 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <span className="lgap-caret-space" />
          )}
          <button type="button" className="lgap-side-name" data-audit-listed={listedId} onClick={() => focus(focusTarget)}>
            <span className="lgap-truncate">{name}</span>
            {openStatuses.map((key) => (
              <Dot key={key} status={key} />
            ))}
          </button>
          <span className="lgap-side-count">{count}</span>
        </div>
        {isOpen ? (
          <div className="lgap-issues" data-audit-issues={id}>
            {rowIssues.map((issue) => {
              const done = resolved.has(issue.id);
              return (
                <div key={issue.id} className={done ? "lgap-issue lgap-resolved" : "lgap-issue"} data-audit-issue={issue.id}>
                  <Dot status={issue.status} />
                  <button type="button" className="lgap-issue-title" title={issue.detail} onClick={() => focus(issue.target)}>
                    {issue.title}
                  </button>
                  <button type="button" className="lgap-issue-action" title="Copy a prompt for your agent" onClick={() => copy(issue.prompt)}>
                    Copy
                  </button>
                  <button type="button" className="lgap-issue-action" data-audit-resolve={issue.id} onClick={() => toggleResolved(issue.id)}>
                    {done ? "Reopen" : "Resolve"}
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="lgap-sidebar">
      <div className="lgap-side-head">
        <a className="lgap-link lgap-side-title" href="#">
          Design system audit
        </a>
        <span className="lgap-mono lgap-muted lgap-truncate">
          {data.project ?? "project"}
          {location ? ` · ${location}` : ""}
        </span>
      </div>
      <div className="lgap-side-summary">
        <span className="lgap-eyebrow">Inventory</span>
        <strong className="lgap-side-total">{plural(components, "component")}</strong>
        <span className="lgap-small lgap-muted">
          {plural(model.groups.length, "group")}, {plural(openCount, "open issue")}
        </span>
      </div>
      <div className="lgap-side-list">
        {model.groups.map((group) => (
          <div key={group.id} className="lgap-side-group">
            <a className="lgap-side-group-head lgap-link" href={`#${encodeURIComponent(group.id)}`}>
              <span>{group.label}</span>
              <span className="lgap-mono">{group.components.length}</span>
            </a>
            {group.components.map((component) => (
              <Row key={component.id} id={component.id} name={component.name} count={component.uses} focusTarget={component.id} listedId={component.id} />
            ))}
            {group.looks.length ? <Row id={`${group.id}|raw`} name="Raw elements" count={group.handRolled} focusTarget={`${group.id}|raw`} /> : null}
          </div>
        ))}
      </div>
      <div className="lgap-side-foot">
        <span data-testid="coverage">
          {model.shown} of {model.entries} shown
        </span>
        <span className="lgap-mono lgap-muted">
          {plural(scan.scannedFiles, "file")}, <TimeAgo iso={scan.generatedAt} />
        </span>
      </div>
    </div>
  );
}

type Shared = { model: Model; specimens: AuditSpecimens; data: AuditData; appStyle: CSSProperties };

function GroupSection({ group, index, full = false, ...shared }: Shared & { group: Group; index: number; full?: boolean }) {
  const { model, data } = shared;
  const detail = data.details?.[group.id];
  const number = String(index).padStart(2, "0");
  // The inventory draws the shared primitives. Local versions and hand-rolled looks wait for the group's deep audit.
  const drawn = group.components.filter((component) => component.shared || group.deep);
  const listed = group.components.filter((component) => !drawn.includes(component));
  return (
    <section className="lgap-group" data-canvas-id={group.id}>
      <header className="lgap-group-head">
        <span className="lgap-eyebrow">{number}</span>
        {full ? (
          <h2 className="lgap-heading">{group.label}</h2>
        ) : (
          <a className="lgap-link" href={`#${encodeURIComponent(group.id)}`}>
            <h2 className="lgap-heading">{group.label}</h2>
          </a>
        )}
        <span className="lgap-muted">
          {plural(group.uses, "use")}
          {group.components.length > 1 ? `, ${plural(group.components.length, "version")}` : ""}
          {group.components.length === 0 ? ", no shared component" : ""}
        </span>
      </header>
      <div className="lgap-sheets">
        {drawn.map((component, position) => (
          <Sheet key={component.id} component={component} eyebrow={`${group.label} · ${number}.${position + 1}`} full={full} detail={detail} {...shared} />
        ))}
        {group.deep && group.looks.length ? (
          <LooksSheet anchor={`${group.id}|raw`} eyebrow={`${group.label} · raw`} title="Raw elements" note={`${plural(group.handRolled, "element")} styled in place, in ${plural(group.looks.length, "look")}`} looks={group.looks} full={full} detail={detail} {...shared} />
        ) : null}
        {group.deep && group.lookAlikes.length ? (
          <LooksSheet anchor={`${group.id}|look-alikes`} eyebrow={`${group.label} · look-alikes`} title="Possible look-alikes" note="Repeated markup that resembles this group. Not counted." looks={group.lookAlikes} full={full} detail={detail} {...shared} />
        ) : null}
        {!group.deep && (listed.length || group.looks.length) ? (
          <article className="lgap-sheet lgap-quiet" data-canvas-select="Listed" data-audit-listed-looks={group.looks.length ? group.id : undefined}>
            <span className="lgap-eyebrow">{group.label} · also here</span>
            <h3 className="lgap-title">Listed</h3>
            {listed.length ? (
              <div className="lgap-rows-plain">
                <span className="lgap-small lgap-muted">{plural(listed.length, "custom version")}, not drawn</span>
                {listed.map((component) => (
                  <div key={component.id} className="lgap-small" data-canvas-id={component.id}>
                    <strong>{component.name}</strong>{" "}
                    <span className="lgap-muted">
                      {plural(component.uses, "use")}
                      {component.wrapsComponent ? `, wraps ${model.byId.get(component.wrapsComponent)?.name}` : component.wraps ? `, wraps ${component.wraps}` : ""}
                    </span>
                    <span className="lgap-mono lgap-muted lgap-block" data-canvas-text="">
                      {component.file}:{component.line}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
            {group.looks.length ? (
              <div className="lgap-rows-plain" data-canvas-id={`${group.id}|raw`}>
                <span className="lgap-small lgap-muted">
                  {plural(group.handRolled, "raw element")} in {plural(group.looks.length, "look")}, not drawn
                </span>
                {(full ? group.looks : group.looks.slice(0, 5)).map((look) => (
                  <div key={look.id} className="lgap-small">
                    <span className="lgap-count-left">{look.count}×</span>{" "}
                    <span className="lgap-mono">
                      {"<"}
                      {look.tag}
                      {look.role ? ` role="${look.role}"` : ""}
                      {">"}
                    </span>{" "}
                    <span className="lgap-mono lgap-muted" data-canvas-text="">
                      {look.locations[0].file}:{look.locations[0].line}
                    </span>
                  </div>
                ))}
                {!full && group.looks.length > 5 ? <span className="lgap-small lgap-muted">+{group.looks.length - 5} more looks</span> : null}
              </div>
            ) : null}
            <p className="lgap-sub">Ask for an audit of the {group.label.toLowerCase()} to see each one drawn.</p>
          </article>
        ) : null}
      </div>
    </section>
  );
}

function Render({ entry, props }: { entry: SpecimenEntry; props: Record<string, unknown> }) {
  return <>{entry.render(props)}</>;
}

function Specimen({ entry, props, name, appStyle, full }: { entry: SpecimenEntry | undefined; props: Record<string, unknown>; name: string; appStyle: CSSProperties; full: boolean }) {
  if (!entry) return <div className="lgap-missing">No example yet</div>;
  return (
    <div className="lgap-app" style={appStyle}>
      {/* Hovering a component outlines it in the component colour; hovering the page around it outlines the page. */}
      <CanvasSpecimen name={name} width={entry.width} height={entry.height} scale={full ? 1 : (entry.scale ?? 1)}>
        <Render entry={entry} props={props} />
      </CanvasSpecimen>
    </div>
  );
}

/** A framed stage with a quiet caption strip under it. `hero` is the component's main stage. */
function Frame({ children, left, right, dashed = false, hero = false }: { children: ReactNode; left?: ReactNode; right?: ReactNode; dashed?: boolean; hero?: boolean }) {
  return (
    <div className={["lgap-frame", dashed ? "lgap-dashed" : "", hero ? "lgap-hero" : ""].filter(Boolean).join(" ")}>
      <div className="lgap-stage">{children}</div>
      {left || right ? (
        <div className="lgap-foot">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      ) : null}
    </div>
  );
}

/** A numbered section heading inside a sheet: 1 Component, 2 Overridden. */
function SectionLabel({ n, title, note, tone }: { n: number; title: string; note?: ReactNode; tone?: string }) {
  return (
    <div className="lgap-section">
      <span className="lgap-section-n" style={tone ? { background: tone, color: "#ffffff" } : undefined}>
        {n}
      </span>
      <strong className="lgap-section-title">{title}</strong>
      {note ? <span className="lgap-small lgap-muted">{note}</span> : null}
    </div>
  );
}

const OVERRIDE_LIMIT = 4;

/**
 * Section 2 of a sheet: every distinct way call sites restyle the component (and its parts) with className.
 * Each override is drawn as the real component with those classes, so it can be compared with section 1.
 */
function OverridesCard({ component, parts, specimens, appStyle, full }: { component: ScanComponent; parts: ScanComponent[]; specimens: AuditSpecimens; appStyle: CSSProperties; full: boolean }) {
  const [all, setAll] = useState(false);
  const { selected, open } = useInspect();
  const owners = [component, ...parts].filter((owner) => owner.overrides?.patterns.length);
  if (!component.overrides || !owners.length) return null;
  const tiles = owners
    .flatMap((owner) => owner.overrides!.patterns.map((pattern) => ({ owner, pattern, key: overrideKey(owner, pattern) })))
    .sort((a, b) => b.pattern.count - a.pattern.count);
  // The override being inspected is always drawn, even when it is past the first few.
  const selectedIndex = tiles.findIndex((tile) => tile.key === selected);
  const shown = all || full || selectedIndex >= OVERRIDE_LIMIT ? tiles : tiles.slice(0, OVERRIDE_LIMIT);
  const placementOnly = owners.reduce((sum, owner) => sum + (owner.overrides?.placementOnly ?? 0), 0);
  const tone = STATUSES.overridden.color;
  return (
    <section className="lgap-ovr" data-canvas-id={overridesTarget(component.id)} data-canvas-select={`${component.name} overrides`} data-audit-overrides={component.id}>
      <SectionLabel n={2} title="Overridden" tone={tone} note="Where call sites restyle it with className instead of a variant." />
      <div
        className={selected === `component:${component.id}` ? "lgap-ovr-head lgap-ovr-head-selected" : "lgap-ovr-head"}
        data-audit-overrides-all={component.id}
        title={`Inspect every ${component.name} override, and see where each one is`}
        onClickCapture={() => open(`component:${component.id}`)}
      >
        {owners.map((owner) => {
          const overrides = owner.overrides!;
          const share = owner.uses ? overrides.sites / owner.uses : 0;
          return (
            <div key={owner.id} className="lgap-ovr-stat" data-audit-override-stat={owner.id}>
              <p className="lgap-ovr-title">
                <strong>
                  {overrides.sites} of {plural(owner.uses, "call site")}
                </strong>{" "}
                restyle {owner.name}
                {overrides.replacing ? <span className="lgap-muted">, {overrides.replacing} replacing its own classes</span> : null}
              </p>
              <span className="lgap-ovr-meter" aria-hidden="true">
                <span style={{ width: `${Math.round(share * 100)}%`, background: tone }} />
              </span>
            </div>
          );
        })}
        <p className="lgap-small lgap-muted">
          {plural(tiles.length, "distinct override")}. Each shows the component as written beside the same component as that call site renders it. Click one to inspect it, or
          click here to see every {component.name} override and where it is.
          {placementOnly ? ` ${plural(placementOnly, "more call site")} only ${placementOnly === 1 ? "passes" : "pass"} margin, width or position; not counted.` : ""}
        </p>
      </div>
      <div className="lgap-ovr-grid">
        {shown.map(({ owner, pattern, key }) => (
          <OverrideTile key={key} id={key} owner={owner} isPart={owner !== component} pattern={pattern} entry={specimens.components[owner.id]} appStyle={appStyle} />
        ))}
      </div>
      {tiles.length > OVERRIDE_LIMIT && !full && selectedIndex < OVERRIDE_LIMIT ? (
        <button type="button" className="lgap-ovr-more" data-audit-overrides-more={component.id} onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${tiles.length} overrides`}
        </button>
      ) : null}
    </section>
  );
}

/** The id of one override: its owner and its classes. Used for the tile, the inspector and the URL. */
const overrideKey = (owner: ScanComponent, pattern: ScanOverridePattern) => `${owner.id}|${pattern.classes.join(" ")}`;

/** One line per class: what it replaces, adds, or reaches inside to change. */
function overrideLines(pattern: ScanOverridePattern) {
  const conditional = new Set(pattern.conditional);
  return [
    ...pattern.replaces.map((entry) => ({ kind: "replaces" as const, token: entry.token, was: entry.replaces[0] ?? null, all: entry.replaces, when: conditional.has(entry.token) })),
    ...pattern.adds.map((token) => ({ kind: "adds" as const, token, was: null, all: [], when: conditional.has(token) })),
    ...pattern.inside.map((token) => ({ kind: "inside" as const, token, was: null, all: [], when: conditional.has(token) })),
  ];
}

/** The specimen's own element, skipping a wrapper that only gives it room. */
function specimenRoot(container: Element | null): HTMLElement | null {
  const first = container?.querySelector(".lgac-specimen-content")?.firstElementChild ?? null;
  const root = first?.hasAttribute("data-audit-room") ? first.firstElementChild : first;
  return root instanceof HTMLElement ? root : null;
}

/**
 * One override, side by side: the component as written on the left, the same component with the
 * call site's classes on the right. Clicking it opens the inspector.
 */
function OverrideTile({ id, owner, isPart, pattern, entry, appStyle }: { id: string; owner: ScanComponent; isPart: boolean; pattern: ScanOverridePattern; entry: SpecimenEntry | undefined; appStyle: CSSProperties }) {
  const { selected, open } = useInspect();
  const lines = overrideLines(pattern);
  const isSelected = selected === id;
  return (
    <div
      className={isSelected ? "lgap-ovr-tile lgap-ovr-selected" : "lgap-ovr-tile"}
      data-audit-override={id}
      data-canvas-id={`override:${id}`}
      onClickCapture={() => open(id)}
    >
      <div className="lgap-ovr-compare">
        <div className="lgap-ovr-side" data-ovr-side="original">
          <span className="lgap-ovr-side-label">Original</span>
          <div className="lgap-ovr-side-stage">
            {entry ? <Specimen entry={entry} props={{ ...pattern.props }} name={`${owner.name} as written`} appStyle={appStyle} full /> : <span className="lgap-small lgap-muted">No example of {owner.name}</span>}
          </div>
        </div>
        <div className="lgap-ovr-side lgap-ovr-side-after" data-ovr-side="overridden">
          <span className="lgap-ovr-side-label">Overridden</span>
          <div className="lgap-ovr-side-stage">
            {entry ? <Specimen entry={entry} props={{ ...pattern.props, className: pattern.classes.join(" ") }} name={`${owner.name} overridden`} appStyle={appStyle} full /> : <span className="lgap-small lgap-muted">No example of {owner.name}</span>}
          </div>
        </div>
      </div>
      <div className="lgap-ovr-meta">
        <div className="lgap-ovr-count">
          <strong>{pattern.count}×</strong>
          {isPart ? <span className="lgap-mono">{owner.name}</span> : null}
          <span className="lgap-ovr-inspect">{isSelected ? "Inspecting" : "Inspect →"}</span>
        </div>
        <div className="lgap-ovr-lines">
          {lines.slice(0, 3).map((line) => (
            <span key={line.token} className="lgap-ovr-line">
              {line.kind === "replaces" ? <s>{line.was}</s> : null}
              {line.kind === "replaces" ? " → " : line.kind === "adds" ? "+ " : "↳ "}
              {line.token}
              {line.when ? <span className="lgap-ovr-if">if</span> : null}
            </span>
          ))}
          {lines.length > 3 ? <span className="lgap-small lgap-muted">+{lines.length - 3} more in the inspector</span> : null}
        </div>
      </div>
    </div>
  );
}

// ── Inspector ─────────────────────────────────────────────────────────────
//
// Three scopes, all in the URL as `inspect`:
//   <override id>          one override: its CSS, its classes, its call sites
//   component:<id>         every override of a component and its parts
//   all                    every override in the codebase
// `route` opens a page with every override of the scope on it marked; `site` scrolls to one of them.

type InspectState = {
  selected: string | null;
  route: string | null;
  site: string | null;
  view: string | null;
  width: number | null;
  open: (scope: string | null) => void;
  openRoute: (route: string | null, site?: string | null) => void;
};
const InspectContext = createContext<InspectState>({ selected: null, route: null, site: null, view: null, width: null, open: () => {}, openRoute: () => {} });
const useInspect = () => useContext(InspectContext);

function useInspectState(): InspectState {
  const [state, setState] = useState<{ selected: string | null; route: string | null; site: string | null; view: string | null; width: number | null }>({ selected: null, route: null, site: null, view: null, width: null });
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setState({ selected: params.get("inspect"), route: params.get("route"), site: params.get("site"), view: params.get("view"), width: Number(params.get("width")) || null });
  }, []);
  const write = (next: { selected: string | null; route: string | null; site: string | null }) => {
    const url = new URL(window.location.href);
    for (const [name, value] of [["inspect", next.selected], ["route", next.route], ["site", next.site]] as const) {
      if (value) url.searchParams.set(name, value);
      else url.searchParams.delete(name);
    }
    window.history.replaceState(null, "", url);
  };
  return {
    ...state,
    open: (scope) => {
      const next = { selected: scope, route: null, site: null };
      setState((current) => ({ ...current, ...next }));
      write(next);
    },
    openRoute: (route, site = null) => {
      setState((current) => {
        const next = { selected: current.selected, route, site: route ? site : null };
        write(next);
        return { ...current, ...next };
      });
    },
  };
}

/** One call site of one override: a numbered place to look. */
/** `related`: in the one-override scope, a call site of another override of the same component that shares a class with it. */
type Target = { n: number; owner: ScanComponent; pattern: ScanOverridePattern; key: string; site: string; routes: string[]; related?: boolean };
type Scope = { kind: "one" | "component" | "all"; id: string; title: string; primary: ScanComponent | null; one: Located | null; targets: Target[] };

const primaryOf = (model: Model, owner: ScanComponent) => (owner.part && owner.primary ? (model.byId.get(owner.primary) ?? owner) : owner);

function siteRoutes(owner: ScanComponent, site: string) {
  const [file, line] = [site.replace(/:\d+$/, ""), Number(site.match(/:(\d+)$/)?.[1])];
  const callSite = owner.callSites.find((candidate) => candidate.file === file && candidate.line === line);
  return { callSite, routes: (callSite?.routes ?? []).filter((route) => !/[[:$*]/.test(route)) };
}

/** Every call site in a scope, numbered in a stable order: component, then most used override, then file. */
function scopeOf(model: Model, id: string | null): Scope | null {
  if (!id) return null;
  let kind: Scope["kind"];
  let owners: ScanComponent[];
  let one: Located | null = null;
  let primary: ScanComponent | null = null;
  if (id === "all") {
    kind = "all";
    owners = model.groups.flatMap((group) => group.components.flatMap((component) => [component, ...component.parts.map((part) => model.byId.get(part)).filter((part): part is ScanComponent => !!part)]));
  } else if (id.startsWith("component:")) {
    kind = "component";
    primary = model.byId.get(id.slice("component:".length)) ?? null;
    if (!primary) return null;
    owners = [primary, ...primary.parts.map((part) => model.byId.get(part)).filter((part): part is ScanComponent => !!part)];
  } else {
    kind = "one";
    one = locate(model, id);
    if (!one) return null;
    primary = primaryOf(model, one.owner);
    owners = [one.owner];
  }
  const targets: Target[] = [];
  for (const owner of owners) {
    const patterns = [...(owner.overrides?.patterns ?? [])].sort((a, b) => b.count - a.count);
    for (const pattern of patterns) {
      if (one && pattern !== one.pattern) continue;
      for (const site of pattern.sites) targets.push({ n: targets.length + 1, owner, pattern, key: overrideKey(owner, pattern), site, routes: siteRoutes(owner, site).routes });
    }
  }
  // One override is one exact set of classes. Overrides of the same component that share a class with
  // it (rounded-full, plus a shadow) are shown beside it, lighter, so nothing that looks the same is unmarked.
  if (one) {
    const shared = new Set(one.pattern.classes);
    const related = [...(one.owner.overrides?.patterns ?? [])].filter((pattern) => pattern !== one!.pattern && pattern.classes.some((token) => shared.has(token))).sort((a, b) => b.count - a.count);
    for (const pattern of related)
      for (const site of pattern.sites) targets.push({ n: targets.length + 1, owner: one.owner, pattern, key: overrideKey(one.owner, pattern), site, routes: siteRoutes(one.owner, site).routes, related: true });
  }
  const title = kind === "all" ? "All overrides" : kind === "component" ? `All ${primary!.name} overrides` : `${one!.owner.name} override`;
  return { kind, id, title, primary, one, targets };
}

/** Routes with how many of the scope's call sites render on each, most first. */
function routesIn(targets: Target[]) {
  const counts = new Map<string, number>();
  for (const target of targets) for (const route of target.routes) counts.set(route, (counts.get(route) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const summaryOf = (pattern: ScanOverridePattern) => overrideSummary(pattern);

/** Computed properties compared between the original and the overridden specimen. */
const COMPARED = [
  "border-radius", "background-color", "color", "box-shadow", "font-family", "font-size", "font-weight", "line-height", "letter-spacing",
  "padding-top", "padding-right", "padding-bottom", "padding-left", "width", "height", "min-width", "min-height", "gap",
  "border-top-width", "border-top-style", "border-top-color", "opacity", "display", "flex-direction", "resize",
];

function cssValue(property: string, value: string) {
  // `rounded-full` computes to an enormous radius.
  if (property === "border-radius" && /e\+|^\d{5,}/.test(value)) return "9999px (full)";
  return value;
}

type CssDiff = { selector: string; rows: { property: string; before: string; after: string }[] };

function diffStyles(before: HTMLElement, after: HTMLElement, selector: string): CssDiff {
  const a = getComputedStyle(before);
  const b = getComputedStyle(after);
  const rows = COMPARED.filter((property) => a.getPropertyValue(property) !== b.getPropertyValue(property)).map((property) => ({
    property,
    before: cssValue(property, a.getPropertyValue(property)),
    after: cssValue(property, b.getPropertyValue(property)),
  }));
  return { selector, rows };
}

function Inspector({ model }: { model: Model }) {
  const { selected, route, site, open, openRoute } = useInspect();
  const { focus } = useAuditCanvas();
  const [diffs, setDiffs] = useState<CssDiff[] | null>(null);
  const scope = useMemo(() => scopeOf(model, selected), [selected, model]);
  // The last single override and component looked at, so the scope can be widened and narrowed again.
  const [last, setLast] = useState<{ one: string | null; component: string | null }>({ one: null, component: null });
  useEffect(() => {
    if (!scope) return;
    setLast((current) => ({
      one: scope.kind === "one" ? scope.id : scope.kind === "component" && current.one && scopeOf(model, current.one)?.primary?.id !== scope.primary?.id ? null : current.one,
      component: scope.primary ? `component:${scope.primary.id}` : current.component,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope?.id]);

  // Bring what is inspected into view, including when it comes from the URL.
  useEffect(() => {
    if (!scope || scope.kind === "all") return;
    const target = scope.kind === "one" ? `override:${scope.id}` : overridesTarget(scope.primary!.id);
    const timer = window.setTimeout(() => focus(target), 120);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope?.id]);

  // For one override: measure what it changes, from the two specimens on the canvas.
  useEffect(() => {
    setDiffs(null);
    if (scope?.kind !== "one") return;
    const id = scope.id;
    const measure = () => {
      const tile = document.querySelector(`[data-audit-override="${CSS.escape(id)}"]`);
      const before = specimenRoot(tile?.querySelector('[data-ovr-side="original"]') ?? null);
      const after = specimenRoot(tile?.querySelector('[data-ovr-side="overridden"]') ?? null);
      if (!before || !after) return false;
      const result = [diffStyles(before, after, "element")];
      const beforeSvg = before.querySelector("svg");
      const afterSvg = after.querySelector("svg");
      if (beforeSvg instanceof SVGElement && afterSvg instanceof SVGElement) {
        const svg = diffStyles(beforeSvg as unknown as HTMLElement, afterSvg as unknown as HTMLElement, "svg");
        if (svg.rows.length) result.push(svg);
      }
      setDiffs(result);
      return true;
    };
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      if (measure() || tries > 20) window.clearInterval(timer);
    }, 150);
    return () => window.clearInterval(timer);
  }, [scope?.id, scope?.kind]);

  if (!selected) return null;
  if (!scope)
    return (
      <aside className="lgap-inspector" data-audit-inspector="" data-canvas-overlay="">
        <div className="lgap-insp-head">
          <span className="lgap-insp-tab">Inspect</span>
          <button type="button" className="lgap-insp-close" aria-label="Close inspector" onClick={() => open(null)}>
            ×
          </button>
        </div>
        <p className="lgap-insp-block lgap-muted">This is not in the scan any more. Run the scan again.</p>
      </aside>
    );

  const routes = routesIn(scope.targets);
  const owners = new Set(scope.targets.map((target) => target.key));
  const scopes = [
    last.one || scope.kind === "one" ? { id: scope.kind === "one" ? scope.id : last.one!, label: "This override" } : null,
    scope.primary || last.component ? { id: scope.primary ? `component:${scope.primary.id}` : last.component!, label: `All ${(scope.primary ?? model.byId.get(last.component!.slice(10)))?.name ?? ""}` } : null,
    { id: "all", label: "All overrides" },
  ].filter((entry): entry is { id: string; label: string } => !!entry);
  const one = scope.one;
  const css = (diffs ?? [])
    .map((diff) => `${diff.selector === "element" ? "element.style" : diff.selector} {\n${diff.rows.map((row) => `  ${row.property}: ${row.after};`).join("\n")}\n}`)
    .join("\n");
  // Call sites grouped by override, in pin order.
  const groups: { key: string; owner: ScanComponent; pattern: ScanOverridePattern; targets: Target[] }[] = [];
  for (const target of scope.targets) {
    const group = groups.find((candidate) => candidate.key === target.key);
    if (group) group.targets.push(target);
    else groups.push({ key: target.key, owner: target.owner, pattern: target.pattern, targets: [target] });
  }

  return (
    <aside className="lgap-inspector" data-audit-inspector={selected} data-audit-scope={scope.kind}>
      <div className="lgap-insp-head">
        <span className="lgap-insp-tab">Inspect</span>
        <button type="button" className="lgap-insp-close" aria-label="Close inspector" onClick={() => open(null)}>
          ×
        </button>
      </div>

      <div className="lgap-insp-block">
        <div className="lgap-insp-scopes" role="tablist">
          {scopes.map((entry) => (
            <button key={entry.id} type="button" role="tab" className="lgap-insp-scope" aria-selected={entry.id === scope.id} data-audit-scope-option={entry.id} onClick={() => open(entry.id)}>
              {entry.label}
            </button>
          ))}
        </div>
        <div className="lgap-insp-title">
          <Dot status="overridden" />
          <strong>{scope.title}</strong>
        </div>
        <p className="lgap-insp-note">
          {plural(scope.targets.filter((target) => !target.related).length, "call site")}
          {scope.kind !== "one" ? `, ${plural(owners.size, "distinct override")}` : ""}, on {plural(routes.length, "page")}.
        </p>
        {one && formatProps(one.pattern.props) ? <div className="lgap-insp-code lgap-muted">{`<${one.owner.name} ${formatProps(one.pattern.props)}>`}</div> : null}
      </div>

      {one ? (
        <>
          <div className="lgap-insp-block">
            <div className="lgap-insp-row">
              <span className="lgap-muted">CSS</span>
              {css ? (
                <button type="button" className="lgap-insp-action" onClick={() => copy(css)}>
                  Copy
                </button>
              ) : null}
            </div>
            {diffs === null ? (
              <p className="lgap-insp-note">Measuring…</p>
            ) : diffs.every((diff) => !diff.rows.length) ? (
              <p className="lgap-insp-note">No difference at rest. The classes below apply on hover, focus, or a state.</p>
            ) : (
              diffs.map((diff) => (
                <div key={diff.selector} className="lgap-insp-code" data-audit-css={diff.selector}>
                  <div>
                    <span className="lgap-muted">{diff.selector === "element" ? "element.style" : diff.selector}</span> {"{"}
                  </div>
                  {diff.rows.map((row) => (
                    <div key={row.property} className="lgap-insp-decl">
                      <span className="lgap-insp-prop">{row.property}</span>: <s className="lgap-muted">{row.before}</s> <span className="lgap-insp-new">{row.after}</span>;
                    </div>
                  ))}
                  <div>{"}"}</div>
                </div>
              ))
            )}
          </div>
          <div className="lgap-insp-block">
            <div className="lgap-insp-row">
              <span className="lgap-muted">Classes</span>
              <button type="button" className="lgap-insp-action" onClick={() => copy(one.pattern.classes.join(" "))}>
                Copy
              </button>
            </div>
            <div className="lgap-insp-code">
              {overrideLines(one.pattern).map((line) => (
                <div key={line.token} className="lgap-insp-class" data-audit-class={line.kind}>
                  {line.when ? <div className="lgap-muted">:if</div> : null}
                  {line.kind === "replaces" ? (
                    <>
                      <div className="lgap-muted">
                        <s>.{line.was}</s> <span className="lgap-insp-tag">{one.owner.name}</span>
                      </div>
                      <div className="lgap-insp-new">.{line.token}</div>
                    </>
                  ) : (
                    <div className="lgap-insp-new">
                      .{line.token} <span className="lgap-insp-tag">{line.kind === "adds" ? "added" : "styles its children"}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}

      <div className="lgap-insp-block">
        <div className="lgap-insp-row">
          <span className="lgap-muted">Pages</span>
          <span className="lgap-muted">{routes.length}</span>
        </div>
        {routes.length ? (
          routes.map(([path, count]) => (
            <button key={path} type="button" className={route === path && !site ? "lgap-insp-page lgap-insp-site-open" : "lgap-insp-page"} data-audit-open-route={path} onClick={() => openRoute(route === path && !site ? null : path)}>
              <span className="lgap-insp-code">{path}</span>
              <span className="lgap-muted">{plural(count, "call site")}</span>
              <span className="lgap-insp-go">{route === path && !site ? "Close" : "Open"}</span>
            </button>
          ))
        ) : (
          <p className="lgap-insp-note">No page found that renders these call sites.</p>
        )}
      </div>

      <div className="lgap-insp-block">
        <div className="lgap-insp-row">
          <span className="lgap-muted">Call sites</span>
          <span className="lgap-muted">{scope.targets.length}</span>
        </div>
        {groups.map((group, index) => (
          <div key={group.key} className="lgap-insp-group">
            {group.targets[0].related && !groups[index - 1]?.targets[0].related ? (
              <p className="lgap-insp-note lgap-insp-related-note">
                Related: other {group.owner.name} overrides that also use {group.pattern.classes.filter((token) => one?.pattern.classes.includes(token)).join(", ")}. Lighter on the page.
              </p>
            ) : null}
            {scope.kind !== "one" || group.targets[0].related ? (
              <button type="button" className="lgap-insp-group-head" title="Inspect this override" onClick={() => open(group.key)}>
                <strong>{group.owner.name}</strong> <span className="lgap-insp-code">{summaryOf(group.pattern)}</span>
              </button>
            ) : null}
            {group.targets.map((target) => {
              const active = site === target.site && route !== null;
              return (
                <button
                  key={target.site}
                  type="button"
                  className={active ? "lgap-insp-site lgap-insp-site-open" : "lgap-insp-site"}
                  data-audit-site={target.site}
                  disabled={!target.routes.length}
                  title={target.routes.length ? `Show it on ${target.routes[0]}` : "No page renders it"}
                  onClick={() => (active ? openRoute(null) : openRoute(target.routes[0], target.site))}
                >
                  <span className={target.related ? "lgap-insp-pin lgap-insp-pin-related" : "lgap-insp-pin"}>{target.n}</span>
                  <span className="lgap-insp-code lgap-insp-path" data-canvas-text="">
                    {target.site}
                  </span>
                  <span className="lgap-insp-go">{target.routes.length ? (active ? "Close" : target.routes[0]) : "no page"}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {route ? <PagePreview scope={scope} route={route} site={site} onClose={() => openRoute(null)} /> : null}
    </aside>
  );
}

/** Attributes a call site sets as literals, which tell its element apart from other uses of the same override. */
const IDENTIFYING = /^(aria-|title$|placeholder$|alt$|role$|name$|type$|href$|data-(?!slot))/;

/** Viewport widths the page can be shown at. The page renders at that width and is scaled to fit. */
const DEVICES = [
  { id: "desktop", label: "Desktop", width: 1440 },
  { id: "laptop", label: "Laptop", width: 1280 },
  { id: "tablet", label: "Tablet", width: 768 },
  { id: "mobile", label: "Mobile", width: 390 },
] as const;

type Located = { owner: ScanComponent; pattern: ScanOverridePattern };

/** Find an override in the scan by its id. */
function locate(model: Model, id: string | null): Located | null {
  if (!id) return null;
  const cut = id.indexOf("|");
  const owner = model.byId.get(id.slice(0, cut));
  const pattern = owner?.overrides?.patterns.find((candidate) => candidate.classes.join(" ") === id.slice(cut + 1));
  return owner && pattern ? { owner, pattern } : null;
}

/** The full-window page view, which keeps the marks: `/audit?view=page&inspect=…&route=…`. */
function pageViewUrl(scope: string, route: string, site: string | null, width: number) {
  const url = new URL(window.location.href);
  url.hash = "";
  url.search = "";
  url.searchParams.set("view", "page");
  url.searchParams.set("inspect", scope);
  url.searchParams.set("route", route);
  if (site) url.searchParams.set("site", site);
  url.searchParams.set("width", String(width));
  return url.toString();
}

type MarkStatus = { state: "loading" | "done"; found: number; missing: Target[] };

/**
 * Marks every call site of the scope that renders on the page inside the iframe: a dashed outline
 * and a numbered pin each, numbered as in the inspector. Clicking a pin opens a note saying what is
 * overridden there. Elements are found by the override's classes and the call site's literal
 * attributes. `focus` scrolls to one call site and draws it solid. Marks follow scrolling.
 */
function usePageMarks(frame: React.RefObject<HTMLIFrameElement | null>, targets: Target[], focus: string | null, src: string): MarkStatus {
  const [status, setStatus] = useState<MarkStatus>({ state: "loading", found: 0, missing: [] });
  const signature = targets.map((target) => `${target.key}@${target.site}`).join(",");
  useEffect(() => {
    setStatus({ state: "loading", found: 0, missing: [] });
    const iframe = frame.current;
    if (!iframe) return;
    let timer = 0;
    const orange = STATUSES.overridden.color;
    const escape = (text: string) => text.replace(/[&<>"]/g, (char) => `&${({ "&": "amp", "<": "lt", ">": "gt", '"': "quot" } as Record<string, string>)[char]};`);
    /**
     * The elements each call site renders. A call site inside a `.map()` renders several, and all of
     * them carry its pin. Matches on the call site's attributes win; a match on classes alone only
     * takes elements no other call site matched exactly.
     */
    const find = (doc: Document) => {
      const all = [...doc.body.querySelectorAll("*")];
      const candidates = targets.map((target) => {
        const { callSite } = siteRoutes(target.owner, target.site);
        const conditional = new Set(target.pattern.conditional);
        // A conditional class can replace a static one of the same kind (tailwind-merge keeps the last),
        // so a static class is only required when no conditional class competes with it.
        const kindOf = (token: string) => token.replace(/^-/, "").split("-")[0];
        const competing = new Set([...conditional].map(kindOf));
        const classes = (callSite?.classes ?? target.pattern.classes).filter((token) => target.pattern.classes.includes(token) && !conditional.has(token) && !competing.has(kindOf(token)));
        const attributes = Object.entries(callSite?.props ?? {}).filter(([name, value]) => IDENTIFYING.test(name) && (typeof value === "string" || (value && typeof value === "object" && Array.isArray((value as { values?: unknown[] }).values))));
        // The element must be this component's: its data-slot (a wrapper such as a tooltip trigger can
        // replace it), or at least three of its own visual classes.
        const own = (target.owner.ownClasses ?? []).filter((token) => !target.pattern.classes.includes(token));
        const isComponent = (element: Element) =>
          (!!target.owner.slot && element.getAttribute("data-slot") === target.owner.slot) || (own.length > 0 && own.filter((token) => element.classList.contains(token)).length >= Math.min(3, own.length));
        const byClass = classes.length ? all.filter((element) => classes.every((token) => element.classList.contains(token)) && isComponent(element)) : [];
        const exact = attributes.length
          ? byClass.filter((element) =>
              attributes.every(([name, value]) => {
                const actual = element.getAttribute(name);
                // A conditional attribute (`active ? "page" : undefined`) may also be absent.
                if (typeof value === "string") return actual === value;
                const options = value as { values?: unknown[]; optional?: boolean };
                return actual === null ? !!options.optional : (options.values ?? []).map(String).includes(actual);
              }),
            )
          : [];
        return { target, exact, byClass };
      });
      const exactlyClaimed = new Set(candidates.flatMap((candidate) => candidate.exact));
      const claimed = new Set<Element>();
      const placed: { target: Target; elements: Element[] }[] = [];
      for (const { target, exact, byClass } of [...candidates].sort((a, b) => Number(!b.exact.length) - Number(!a.exact.length))) {
        const elements = (exact.length ? exact : byClass.filter((element) => !exactlyClaimed.has(element))).filter((element) => !claimed.has(element));
        for (const element of elements) claimed.add(element);
        if (elements.length) placed.push({ target, elements });
      }
      return placed;
    };
    // One note at a time; a click anywhere else on the page, or Esc, closes it.
    let openNote: number | null = null;
    let listening: Document | null = null;
    const closeNote = (event: Event) => {
      if (openNote === null) return;
      // The event comes from the iframe's own window, so check its type, not `instanceof`.
      const key = event.type === "keydown";
      if (key ? (event as KeyboardEvent).key !== "Escape" : (event.target as Element | null)?.closest?.("#lgap-marks")) return;
      // Esc closes the note first; the next Esc closes the page.
      if (key) event.stopPropagation();
      openNote = null;
      mark();
    };
    const mark = () => {
      const doc = iframe.contentDocument;
      if (!doc?.body) return null;
      if (listening !== doc) {
        listening?.removeEventListener("pointerdown", closeNote, true);
        listening?.removeEventListener("keydown", closeNote, true);
        doc.addEventListener("pointerdown", closeNote, true);
        doc.addEventListener("keydown", closeNote, true);
        listening = doc;
      }
      const placed = find(doc);
      doc.getElementById("lgap-marks")?.remove();
      // Fixed to the viewport and redrawn on scroll, so marks stay on elements inside fixed bars too.
      const layer = doc.createElement("div");
      layer.id = "lgap-marks";
      layer.setAttribute("style", "position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;font:12px/1.4 Inter,ui-sans-serif,system-ui,sans-serif;");
      const viewWidth = doc.documentElement.clientWidth || 1200;
      const viewHeight = doc.documentElement.clientHeight || 800;
      const outlines: HTMLElement[] = [];
      const pins: HTMLElement[] = [];
      let note: HTMLElement | null = null;
      for (const { target, elements } of placed) for (const [index, element] of elements.entries()) {
        const box = element.getBoundingClientRect();
        if (!box.width && !box.height) continue;
        const focused = focus === target.site;
        const related = !!target.related && !focused;
        // A container (a tab panel, a whole section) gets a quiet outline and its pin inside its corner,
        // so it frames the page without drowning the marks on the controls inside it.
        const large = box.width * box.height > viewWidth * viewHeight * 0.15;
        const color = related || large ? "rgba(234,88,12,.45)" : orange;
        const outline = doc.createElement("div");
        outline.dataset.site = target.site;
        if (target.related) outline.dataset.related = "";
        outline.setAttribute(
          "style",
          `position:absolute;left:${box.left - (large ? 0 : 4)}px;top:${box.top - (large ? 0 : 4)}px;width:${box.width + (large ? 0 : 8)}px;height:${box.height + (large ? 0 : 8)}px;box-sizing:border-box;border:${large && !focused ? 1 : 2}px ${focused ? "solid" : related ? "dotted" : "dashed"} ${focused ? orange : color};border-radius:10px;${focused ? "box-shadow:0 0 0 4px rgba(234,88,12,.2);" : ""}`,
        );
        outlines.push(outline);
        const pin = doc.createElement("button");
        pin.type = "button";
        pin.textContent = String(target.n);
        pin.title = `${target.owner.name}: ${summaryOf(target.pattern)}`;
        const pinLeft = large ? box.left + 6 : box.right - 7;
        const pinTop = large ? box.top + 6 : box.top - 16;
        const pale = related || large;
        pin.setAttribute(
          "style",
          `all:unset;pointer-events:auto;cursor:pointer;position:absolute;left:${pinLeft}px;top:${pinTop}px;min-width:22px;height:22px;padding:0 6px;box-sizing:border-box;border-radius:999px;background:${pale ? "#fed7aa" : orange};color:${pale ? "#9a3412" : "#fff"};font:600 11px/22px Inter,ui-sans-serif,system-ui,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff,0 1px 4px rgba(0,0,0,.25);${openNote === target.n ? "outline:2px solid #9a3412;outline-offset:1px;" : ""}`,
        );
        pin.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          openNote = openNote === target.n ? null : target.n;
          mark();
        });
        pins.push(pin);
        if (openNote === target.n && index === 0) {
          note = doc.createElement("div");
          note.addEventListener("pointerdown", (event) => event.stopPropagation());
          const lines = overrideLines(target.pattern);
          const shown = lines
            .slice(0, 4)
            .map((entry) => (entry.kind === "replaces" ? `<s style="color:#a1a1aa">${escape(entry.was ?? "")}</s> → ${escape(entry.token)}` : `${entry.kind === "adds" ? "+" : "↳"} ${escape(entry.token)}`))
            .join("<br>");
          const more = lines.length > 4 ? `<span style="display:block;color:#707070">+${lines.length - 4} more · full list in the inspector</span>` : "";
          const many = elements.length > 1 ? ` · ${elements.length} elements` : "";
          const kin = target.related ? ` · related` : "";
          note.innerHTML = `<strong style="display:block;margin-bottom:4px;color:${orange}">${target.n} · ${escape(target.owner.name)}${many}${kin}</strong><span style="font:11px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;color:#313131;overflow-wrap:anywhere">${shown}${more}</span><span style="display:block;margin-top:6px;font:10px ui-monospace,Menlo,monospace;color:#707070;overflow-wrap:anywhere">${escape(target.site)}</span>`;
          const noteWidth = 240;
          const noteHeight = 120;
          const anchorRight = large ? pinLeft + 22 : box.right;
          const anchorTop = large ? pinTop : box.top;
          const left = anchorRight + 14 + noteWidth <= viewWidth ? anchorRight + 14 : Math.max(8, (large ? pinLeft : box.left) - noteWidth - 14);
          const top = Math.max(8, Math.min(anchorTop - 8, viewHeight - noteHeight - 8));
          note.setAttribute("style", `pointer-events:auto;position:absolute;left:${left}px;top:${top}px;width:${noteWidth}px;box-sizing:border-box;padding:10px 12px;border-radius:10px;background:#fff;box-shadow:0 8px 28px rgba(0,0,0,.2),0 0 0 1px rgba(0,0,0,.06);`);
        }
      }
      // Outlines, then pins above them, then the one open note above everything.
      layer.append(...outlines, ...pins, ...(note ? [note] : []));
      doc.body.append(layer);
      return placed;
    };
    // Start as soon as the page's HTML is in, without waiting for its images to load, and start over
    // whenever the iframe navigates. Marks follow scrolling and resizing.
    let watched: Window | null = null;
    let current: Document | null = null;
    let scrolled = false;
    let settledAt = 0;
    let frameRequest = 0;
    const redraw = () => {
      if (frameRequest) return;
      frameRequest = requestAnimationFrame(() => {
        frameRequest = 0;
        mark();
      });
    };
    const watch = (view: Window | null) => {
      watched?.removeEventListener("scroll", redraw, true);
      watched?.removeEventListener("resize", redraw);
      watched = view;
      watched?.addEventListener("scroll", redraw, true);
      watched?.addEventListener("resize", redraw);
    };
    const tick = () => {
      const doc = iframe.contentDocument;
      if (!doc || doc.URL === "about:blank" || !doc.body?.childElementCount) return;
      if (doc !== current) {
        current = doc;
        scrolled = false;
        settledAt = 0;
        watch(iframe.contentWindow);
      }
      const placed = mark();
      if (!placed) return;
      // Scroll the focused call site (or the first one) into view, once.
      const goal = placed.find((entry) => entry.target.site === focus) ?? (focus ? null : placed.find((entry) => !entry.target.related));
      if (goal && !scrolled) {
        scrolled = true;
        const box = goal.elements[0].getBoundingClientRect();
        const view = iframe.contentWindow;
        if (view && (box.top < 0 || box.bottom > view.innerHeight)) view.scrollBy({ top: box.top - view.innerHeight / 2 });
      }
      const missing = targets.filter((target) => !placed.some((entry) => entry.target === target));
      settledAt ||= Date.now();
      // Keep looking while the page settles (hydration, data), then report.
      if (!missing.length || Date.now() - settledAt > 4000) {
        window.clearInterval(timer);
        setStatus({ state: "done", found: placed.length, missing });
      } else setStatus({ state: "loading", found: placed.length, missing: [] });
    };
    const poll = () => {
      window.clearInterval(timer);
      timer = window.setInterval(tick, 100);
    };
    poll();
    // A navigation inside the page (or a reload) starts the search again.
    iframe.addEventListener("load", poll);
    return () => {
      listening?.removeEventListener("pointerdown", closeNote, true);
      listening?.removeEventListener("keydown", closeNote, true);
      iframe.removeEventListener("load", poll);
      cancelAnimationFrame(frameRequest);
      watch(null);
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, focus, src]);
  return status;
}

function statusText({ state, found, missing }: MarkStatus, targets: Target[]) {
  if (state === "loading" && !found) return "Finding them on the page…";
  if (!found) return "None of them is on the page as it loads. They may need a state: a hover, an open menu, data.";
  const main = targets.filter((target) => !target.related);
  const related = targets.length - main.length;
  const lostMain = missing.filter((target) => !target.related);
  const marked = main.length - lostMain.length;
  const lost = lostMain.length ? ` ${lostMain.length} not on the page as it loads (${lostMain.map((target) => target.n).join(", ")}).` : "";
  return `Marked ${marked} of ${main.length}${related ? `, plus ${related - missing.filter((target) => target.related).length} related (lighter)` : ""}. Click a pin for what changed.${lost}`;
}

/**
 * A page, live, at a real viewport width, scaled down to fit the panel, with every call site of the
 * scope that renders on it marked.
 */
function PagePreview({ scope, route, site, onClose }: { scope: Scope; route: string; site: string | null; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [device, setDevice] = useState<(typeof DEVICES)[number]>(DEVICES[0]);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setSize({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    return () => observer.disconnect();
  }, [mounted]);
  const targets = useMemo(() => scope.targets.filter((target) => target.routes.includes(route)), [scope, route]);
  const status = usePageMarks(frame, targets, site, `${route}|${mounted}`);
  // Esc closes the page, also when the focus is inside it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const inner = frame.current?.contentWindow;
    inner?.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      inner?.removeEventListener("keydown", onKey);
    };
  }, [onClose, status.state]);
  const scale = size ? Math.min(1, (size.width - 32) / device.width) : 1;
  const height = size ? (size.height - 32) / scale : 900;

  if (!mounted) return null;
  return createPortal(
    <div className="lgap-page-preview" data-audit-page-preview={route} data-status={status.state} data-found={status.found}>
      <style dangerouslySetInnerHTML={{ __html: PREVIEW_CSS }} />
      <div className="lgap-pp-head lgap-pp-head-stacked">
        <div className="lgap-pp-row">
          <span className="lgap-pp-route">{route}</span>
          <span className="lgap-pp-scope">{scope.title}</span>
          <span className="lgap-pp-status" title={statusText(status, targets)}>
            {statusText(status, targets)}
          </span>
          <a className="lgap-pp-action lgap-pp-button" href={pageViewUrl(scope.id, route, site, device.width)} target="_blank" rel="noreferrer" data-audit-open-tab="">
            Open in a tab ↗
          </a>
          <button type="button" className="lgap-pp-action lgap-pp-button" data-audit-close-page="" title="Close the page (Esc)" onClick={onClose}>
            × Close
          </button>
        </div>
        <div className="lgap-pp-row">
          <span className="lgap-pp-devices">
            {DEVICES.map((candidate) => (
              <button key={candidate.id} type="button" className="lgap-pp-device" aria-pressed={device.id === candidate.id} data-audit-device={candidate.id} onClick={() => setDevice(candidate)}>
                {candidate.label} <span>{candidate.width}</span>
              </button>
            ))}
          </span>
          <span className="lgap-pp-scale">shown at {Math.round(scale * 100)}%</span>
        </div>
      </div>
      <div ref={stage} className="lgap-pp-stage">
        <div className="lgap-pp-device-frame" style={{ width: device.width * scale, height: height * scale }}>
          <iframe ref={frame} className="lgap-pp-frame" src={route} title={`${route}, with ${scope.title.toLowerCase()} marked`} style={{ width: device.width, height, transform: `scale(${scale})` }} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * `/audit?view=page&inspect=…&route=…`: a page filling the window, at its real size, with every call
 * site of the scope on it marked. What "Open in a tab" opens, so the marks survive leaving the canvas.
 */
function PageView({ model, inspect, route, site, width }: { model: Model; inspect: string; route: string | null; site: string | null; width: number | null }) {
  const scope = scopeOf(model, inspect);
  const page = route ?? (scope ? routesIn(scope.targets)[0]?.[0] : null) ?? null;
  if (!scope || !page)
    return (
      <div className="lgap-page-view">
        <style dangerouslySetInnerHTML={{ __html: PREVIEW_CSS }} />
        <div className="lgap-pp-head">
          <span className="lgap-pp-status">{scope ? "No page found that renders these call sites." : "This is not in the scan any more. Run the scan again."}</span>
        </div>
      </div>
    );
  return <MarkedPage scope={scope} route={page} site={site} width={width} />;
}

function MarkedPage({ scope, route, site, width }: { scope: Scope; route: string; site: string | null; width: number | null }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const targets = useMemo(() => scope.targets.filter((target) => target.routes.includes(route)), [scope, route]);
  const status = usePageMarks(frame, targets, site, route);
  const back = (() => {
    if (typeof window === "undefined") return "?";
    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    url.searchParams.delete("width");
    return url.toString();
  })();
  return (
    <div className="lgap-page-view" data-audit-page-view={route} data-status={status.state} data-found={status.found}>
      <style dangerouslySetInnerHTML={{ __html: PREVIEW_CSS }} />
      <div className="lgap-pp-head">
        <a className="lgap-pp-action" href={back}>
          ← Audit
        </a>
        <span className="lgap-pp-route">{route}</span>
        <span className="lgap-pp-scope">{scope.title}</span>
        <span className="lgap-pp-status" title={statusText(status, targets)}>
          {statusText(status, targets)}
        </span>
        <a className="lgap-pp-action" href={route} target="_blank" rel="noreferrer">
          Page without marks ↗
        </a>
      </div>
      <div className="lgap-pv-stage">
        <iframe ref={frame} className="lgap-pv-frame" src={route} title={`${route}, with ${scope.title.toLowerCase()} marked`} style={width && width < 1200 ? { width, boxShadow: "0 0 0 1px #e8e8e8" } : undefined} />
      </div>
    </div>
  );
}

const PREVIEW_CSS = `
.lgap-page-preview { position: fixed; z-index: 60; top: 16px; bottom: 16px; left: 16px; right: 372px; display: flex; flex-direction: column; overflow: hidden; border-radius: 14px; background: #f7f7f7; box-shadow: 0 18px 60px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(0, 0, 0, 0.08); font: 12px/1.4 Inter, ui-sans-serif, system-ui, sans-serif; color: #313131; }
.lgap-page-view { position: fixed; inset: 0; z-index: 60; display: flex; flex-direction: column; background: #f7f7f7; font: 12px/1.4 Inter, ui-sans-serif, system-ui, sans-serif; color: #313131; }
.lgap-pp-head { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 6px 10px 6px 14px; border-bottom: 1px solid #e8e8e8; background: #f7f7f7; }
.lgap-pp-head-stacked { flex-direction: column; align-items: stretch; gap: 4px; padding: 8px 10px; }
.lgap-pp-row { display: flex; align-items: center; gap: 10px; min-width: 0; }
.lgap-pp-action.lgap-pp-button { padding: 5px 10px; border-radius: 6px; background: #ebebeb; font-weight: 500; }
.lgap-pp-action.lgap-pp-button:hover { background: #e0e0e0; }
.lgap-pp-route { flex: none; padding: 2px 8px; border-radius: 6px; background: #ffffff; box-shadow: inset 0 0 0 1px #e8e8e8; font: 11px ui-monospace, SFMono-Regular, Menlo, monospace; }
.lgap-pp-scope { flex: none; color: #9a3412; font-weight: 600; }
.lgap-pp-status { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #707070; }
.lgap-pp-devices { flex: none; display: flex; gap: 2px; }
.lgap-pp-device { all: unset; cursor: pointer; padding: 4px 8px; border-radius: 5px; color: #6a6a6a; font-size: 11px; }
.lgap-pp-device span { color: #a1a1aa; font: 10px ui-monospace, Menlo, monospace; }
.lgap-pp-device[aria-pressed="true"] { background: #eeeeee; color: #313131; }
.lgap-pp-scale { flex: none; color: #a1a1aa; font: 11px ui-monospace, Menlo, monospace; }
.lgap-pp-action { all: unset; flex: none; cursor: pointer; padding: 4px 8px; border-radius: 5px; color: #313131; font-size: 12px; white-space: nowrap; }
.lgap-pp-action:hover, .lgap-pp-device:hover { background: #eaeaea; }
.lgap-pp-stage { flex: 1; min-height: 0; display: flex; justify-content: center; align-items: flex-start; padding: 16px; overflow: hidden; }
.lgap-pp-device-frame { position: relative; flex: none; overflow: hidden; border-radius: 8px; background: #ffffff; box-shadow: 0 0 0 1px #e8e8e8, 0 4px 18px rgba(0, 0, 0, 0.08); }
.lgap-pp-frame { position: absolute; left: 0; top: 0; border: 0; background: #ffffff; transform-origin: 0 0; }
.lgap-pv-stage { flex: 1; min-height: 0; display: flex; justify-content: center; }
.lgap-pv-frame { flex: 1; max-width: 100%; height: 100%; border: 0; background: #ffffff; }
`;

function Notes({ notes }: { notes: { n: number; text: string; x: number; y: number }[] | undefined }) {
  if (!notes?.length) return null;
  return (
    <>
      {notes.map((note) => (
        <span key={note.n} className="lgap-marker" style={{ left: `${note.x}%`, top: `${note.y}%` }}>
          {note.n}
        </span>
      ))}
    </>
  );
}

/** Where a specimen's content came from, and which runtime values were stood in for. */
function Source({ entry }: { entry: SpecimenEntry | undefined }) {
  if (!entry) return <>no example yet</>;
  const mocks = Object.entries(entry.mocks ?? {});
  return (
    <span data-canvas-text="">
      {entry.from}
      {mocks.length ? ` · stand-in for ${mocks.map(([expression]) => expression).join(", ")}` : ""}
    </span>
  );
}

function AxisFrames({ component, entry, model, appStyle, full, prefix = "" }: { component: ScanComponent; entry: SpecimenEntry | undefined; model: Model; appStyle: CSSProperties; full: boolean; prefix?: string }) {
  const required = component.axes.filter((axis) => axis.required);
  return (
    <>
      {required.map((axis) => {
        const never = axis.kind === "enum" ? (axis.neverUsed?.length ?? 0) : 0;
        return (
          <Frame
            key={axis.name}
            left={`${prefix}${axis.name}`}
            right={axis.kind === "boolean" ? "state" : `${plural(axis.values.length, "value")}${never ? `, ${never} never used` : ""}`}
          >
            <div className="lgap-sweep">
              {axis.values.map((value) => {
                const reason = model.skipped.get(`${component.id}|${axis.name}|${String(value)}`);
                const used = axis.used?.[String(value)] ?? 0;
                return (
                  <div key={String(value)} className="lgap-value" data-canvas-id={`${component.id}|${axis.name}|${String(value)}`} data-audit-variant={`${component.name}.${axis.name}=${String(value)}`}>
                    {reason ? <div className="lgap-missing">Skipped: {reason}</div> : <Specimen entry={entry} props={{ [axis.name]: value }} name={`${component.name} ${axis.name}=${String(value)}`} appStyle={appStyle} full={full} />}
                    <span className="lgap-value-label">
                      {/* The pin anchors just right of the label, so it never covers the variant it is about. */}
                      <span className="lgap-pin-anchor" data-canvas-id={`${component.id}|${axis.name}|${String(value)}|pin`} />
                      {axis.kind === "boolean" ? axis.name : String(value)}
                      {axis.default === value && String(value) !== "default" ? " · default" : ""}
                      {used ? ` · ${used}` : ""}
                    </span>
                  </div>
                );
              })}
            </div>
          </Frame>
        );
      })}
    </>
  );
}

function Sheet({ component, eyebrow, full, detail, model, specimens, data, appStyle }: Shared & { component: ScanComponent; eyebrow: string; full: boolean; detail: GroupDetail | undefined }) {
  const entry = specimens.components[component.id];
  const parts = component.parts.map((id) => model.byId.get(id)).filter((part): part is ScanComponent => !!part);
  const wrapped = component.wrapsComponent ? model.byId.get(component.wrapsComponent)?.name : component.wraps;
  const optional = component.axes.filter((axis) => !axis.required);
  const keep = detail?.keep === component.id;
  const notes = detail?.notes?.[component.id];
  // Only for components the usage opens from elsewhere. Everything else is opened by clicking it.
  const [on, setOn] = useState(false);
  const toggled = entry?.toggle ? { [entry.toggle]: on, onOpenChange: setOn } : {};
  return (
    <article className="lgap-sheet" data-canvas-id={component.id} data-canvas-select={component.name} data-audit-component={component.id}>
      <span className="lgap-eyebrow">{eyebrow}</span>
      <h3 className="lgap-title">
        {component.name}
        {keep ? <span className="lgap-pill lgap-solid">keep</span> : null}
      </h3>
      <p className="lgap-sub">
        {wrapped ? `Wraps ${wrapped}. ` : ""}
        {component.uses ? `Used ${component.uses} times in ${plural(component.files, "file")}.` : "Not used anywhere."}{" "}
        <span className="lgap-mono" data-canvas-text="">
          {component.file}:{component.line}
        </span>
      </p>

      <SectionLabel n={1} title="Component" note="As written, with every variant. Content copied from one real usage." />
      <Frame
        hero
        left={<Source entry={entry} />}
        right={
          entry?.toggle ? (
            <button type="button" className="lgap-toggle" data-audit-toggle={component.id} onClick={() => setOn(!on)}>
              {on ? "Close" : "Open"}
            </button>
          ) : (
            "as written"
          )
        }
      >
        <div className="lgap-noted">
          <Specimen entry={entry} props={toggled} name={component.name} appStyle={appStyle} full={full} />
          <Notes notes={notes} />
        </div>
      </Frame>
      <AxisFrames component={component} entry={entry} model={model} appStyle={appStyle} full={full} />
      {parts
        .filter((part) => part.axes.some((axis) => axis.required))
        .map((part) => (
          <AxisFrames key={part.id} component={part} entry={specimens.components[part.id]} model={model} appStyle={appStyle} full={full} prefix={`${part.name}.`} />
        ))}

      {data.captions?.[component.id] ? <p className="lgap-caption">{data.captions[component.id]}</p> : null}
      {notes?.length ? <p className="lgap-caption">{notes.map((note) => `${note.n}. ${note.text}`).join(" ")}</p> : null}

      <OverridesCard component={component} parts={parts} specimens={specimens} appStyle={appStyle} full={full} />

      {parts.length || optional.length || (!component.overrides && component.classNameOverrides) ? (
        <div className="lgap-rows-plain">
          <span className="lgap-eyebrow">In the codebase</span>
          {parts.length ? (
            <p className="lgap-small lgap-wrap">
              <span className="lgap-muted">Parts</span>
              {parts.map((part) => (
                <span key={part.id} className="lgap-chip">
                  {part.name} {part.uses}
                </span>
              ))}
            </p>
          ) : null}
          {optional.length ? (
            <p className="lgap-small lgap-muted lgap-wrap">
              Also accepts {optional.map((axis) => `${axis.name}${axis.inheritedFrom ? ` (from ${axis.inheritedFrom})` : ""}`).join(", ")}
            </p>
          ) : null}
          {!component.overrides && component.classNameOverrides ? (
            <p className="lgap-small lgap-muted">
              Restyled with className at {component.classNameOverrides} of {plural(component.uses, "call site")}
            </p>
          ) : null}
        </div>
      ) : null}
      {full ? <Facts component={component} /> : null}
    </article>
  );
}

function formatProps(props: Record<string, unknown>) {
  return Object.entries(props)
    .map(([name, value]) =>
      value === true ? name : value === "(dynamic)" || (value && typeof value === "object") ? `${name}={…}` : typeof value === "string" ? `${name}="${value}"` : `${name}={${String(value)}}`,
    )
    .join(" ");
}

/** Group view only: every prop, every combination, every call site. */
function Facts({ component }: { component: ScanComponent }) {
  return (
    <div className="lgap-facts">
      {component.props.length ? (
        <div className="lgap-rows-plain">
          <span className="lgap-eyebrow">{plural(component.props.length, "prop")}</span>
          <table className="lgap-table">
            <tbody>
              {component.props.map((prop) => {
                const usage = component.propUsage[prop.name];
                return (
                  <tr key={prop.name}>
                    <td className="lgap-mono">{prop.name}</td>
                    <td className="lgap-mono lgap-muted">{prop.values?.length ? prop.values.map(String).join(" | ") : prop.type}</td>
                    <td className="lgap-muted">{prop.default !== undefined ? `default ${String(prop.default)}` : ""}</td>
                    <td className={usage ? "lgap-muted" : "lgap-amber-text"}>{usage ? `passed ${usage.count}×` : "never passed"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {component.combos.length > 1 ? (
        <div className="lgap-rows-plain">
          <span className="lgap-eyebrow">{plural(component.combos.length, "combination")} in use</span>
          {component.combos.map((combo) => (
            <div key={combo.example} className="lgap-small">
              <span className="lgap-count-left">{combo.count}×</span> <span className="lgap-mono">{formatProps(combo.props) || "(defaults)"}</span>
            </div>
          ))}
        </div>
      ) : null}
      {component.callSites.length ? (
        <div className="lgap-rows-plain">
          <span className="lgap-eyebrow">{plural(component.callSites.length, "call site")}</span>
          <div className="lgap-sites">
            {component.callSites.map((site) => (
              <div key={`${site.file}:${site.line}`} className="lgap-small">
                <span className="lgap-mono" data-canvas-text="">
                  {site.file}:{site.line}
                </span>{" "}
                <span className="lgap-mono lgap-muted">{formatProps(site.props)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LooksSheet({ anchor, eyebrow, title, note, looks, full, detail, specimens, data, appStyle }: Shared & { anchor: string; eyebrow: string; title: string; note: string; looks: ScanCluster[]; full: boolean; detail: GroupDetail | undefined }) {
  return (
    <article className="lgap-sheet" data-canvas-id={anchor} data-canvas-select={title}>
      <span className="lgap-eyebrow">{eyebrow}</span>
      <h3 className="lgap-title">
        {title}
        <span className="lgap-pill">{plural(looks.length, "look")}</span>
      </h3>
      <p className="lgap-sub">{note}</p>
      <div className="lgap-look-grid">
        {looks.map((look) => {
          const entry = specimens.handRolled[look.id];
          const notes = detail?.notes?.[look.id];
          return (
            <div key={look.id} className="lgap-look" data-canvas-id={look.id} data-audit-look={look.id}>
              <Frame dashed left={<Source entry={entry} />} right={`${look.count}×`}>
                <div className="lgap-noted">
                  <Specimen entry={entry} props={{}} name={`${look.tag} ${look.id}`} appStyle={appStyle} full={full} />
                  <Notes notes={notes} />
                </div>
              </Frame>
              {full ? (
                <span className="lgap-small">
                  {look.locations.map((location) => (
                    <span key={`${location.file}:${location.line}`} className="lgap-mono lgap-muted lgap-block" data-canvas-text="">
                      {location.file}:{location.line}
                    </span>
                  ))}
                </span>
              ) : look.locations.length > 1 ? (
                <span className="lgap-small lgap-muted">+{look.locations.length - 1} more places</span>
              ) : null}
              {data.captions?.[look.id] ? <span className="lgap-caption">{data.captions[look.id]}</span> : null}
              {notes?.length ? <span className="lgap-caption">{notes.map((entryNote) => `${entryNote.n}. ${entryNote.text}`).join(" ")}</span> : null}
            </div>
          );
        })}
      </div>
    </article>
  );
}

function DetailPanels({ group, detail, model }: { group: Group; detail: GroupDetail; model: Model }) {
  const done = detail.steps?.filter((step) => step.done).length ?? 0;
  const keep = detail.keep ? model.byId.get(detail.keep) : undefined;
  return (
    <>
      {detail.steps?.length ? (
        <CanvasPanel className="lgap-side">
          <div className="lgap-side-title">
            <strong>{group.label} audited</strong>
            <span className="lgap-mono lgap-muted">
              {done} of {detail.steps.length}
            </span>
          </div>
          <div className="lgap-progress">
            <span style={{ width: `${(done / detail.steps.length) * 100}%` }} />
          </div>
          {detail.steps.map((step) => (
            <div key={step.label} className="lgap-step">
              <span className={step.done ? "lgap-dot lgap-done" : "lgap-dot"} />
              {step.label}
            </div>
          ))}
        </CanvasPanel>
      ) : null}
      {detail.headline ? (
        <CanvasPanel className="lgap-side">
          <span className="lgap-small lgap-muted">Recommendation</span>
          <strong className="lgap-headline">{detail.headline}</strong>
          {detail.reason ? <span className="lgap-muted">{detail.reason}</span> : null}
          {keep ? (
            <span className="lgap-small lgap-mono" data-canvas-text="">
              {keep.file}
            </span>
          ) : null}
          {detail.stats?.length ? (
            <div className="lgap-stats">
              {detail.stats.map((stat) => (
                <div key={stat.label} className="lgap-stat">
                  <span className="lgap-muted">{stat.label}</span>
                  <span className="lgap-mono">{stat.value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </CanvasPanel>
      ) : null}
    </>
  );
}

function WhatNext({ steps }: { steps: NextStep[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  return (
    <CanvasPanel className="lgap-next">
      <div className="lgap-side-title">
        <span className="lgap-small lgap-muted">What next</span>
        <button type="button" className="lgap-close" aria-label="Dismiss" onClick={() => setClosed(true)}>
          ×
        </button>
      </div>
      {steps.map((step) => (
        <button
          key={step.title}
          type="button"
          className={copied === step.title ? "lgap-next-row lgap-copied" : "lgap-next-row"}
          onClick={() => {
            void navigator.clipboard?.writeText(step.prompt);
            setCopied(step.title);
          }}
        >
          <span className="lgap-column">
            <span>{step.title}</span>
            <span className="lgap-small lgap-muted">{step.reason}</span>
          </span>
          <span className="lgap-small lgap-muted">{copied === step.title ? "Copied" : "Copy"}</span>
        </button>
      ))}
      <span className="lgap-small lgap-muted lgap-foot-note">Copies a prompt for Codex or Claude Code</span>
    </CanvasPanel>
  );
}

/**
 * The look: a grey canvas like Lunagraph's, with each component on its own white page.
 * Hovering or selecting outlines the page in the selection colour, or the component under
 * the pointer in the component colour, as on the Lunagraph canvas. Small monospace
 * captions, generous space; specimens are the only colour.
 */
const PAGE_CSS = `
.lgap-layout {
  display: flex;
  align-items: flex-start;
  gap: 72px;
  font: 14px/1.5 var(--lgac-font);
  color: var(--lgac-text);
  text-align: left;
}
.lgap-layout strong, .lgac-overlay strong { font-weight: 600; }
.lgap-layout p, .lgap-layout h2, .lgap-layout h3 { margin: 0; }

.lgap-eyebrow { font-size: 11px; letter-spacing: 0.04em; color: var(--lgac-muted); }
.lgap-heading { font-size: 30px; line-height: 1.15; font-weight: 600; letter-spacing: -0.02em; }
.lgap-title { display: flex; align-items: center; gap: 10px; font-size: 22px; line-height: 1.2; font-weight: 600; letter-spacing: -0.015em; }
.lgap-sub { max-width: 520px; font-size: 13px; color: var(--lgac-muted); }
.lgap-caption { max-width: 520px; font-size: 13px; color: var(--lgac-muted); }

.lgap-page { background: #ffffff; }
.lgap-sidebar { display: flex; flex-direction: column; height: 100%; }
.lgap-side-head { display: flex; flex-direction: column; gap: 2px; padding: 22px 22px 18px; border-bottom: 1px solid #ececec; }
.lgap-side-title { font-size: 14px; font-weight: 600; letter-spacing: -0.01em; }
.lgap-side-summary { display: flex; flex-direction: column; gap: 2px; padding: 18px 22px 6px; }
.lgap-side-total { font-size: 20px; letter-spacing: -0.02em; }
.lgap-side-list { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 4px 10px 16px; }
.lgap-side-group { display: flex; flex-direction: column; padding-top: 12px; }
.lgap-side-group-head { display: flex; justify-content: space-between; padding: 4px 12px; font-size: 11px; letter-spacing: 0.04em; color: var(--lgac-muted); }
.lgap-side-row { display: flex; align-items: center; gap: 2px; padding: 0 12px 0 2px; border-radius: 6px; }
.lgap-side-row:hover { background: #f5f5f5; }
.lgap-caret, .lgap-caret-space { all: unset; box-sizing: border-box; flex: none; display: grid; place-items: center; width: 18px; height: 26px; color: var(--lgac-muted); cursor: pointer; }
.lgap-caret svg { transition: transform 120ms ease; }
.lgap-caret-space { cursor: default; }
.lgap-side-name { all: unset; flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; height: 26px; cursor: pointer; font-size: 13px; }
.lgap-side-count { flex: none; font: 11px var(--lgac-mono); color: var(--lgac-muted); font-variant-numeric: tabular-nums; }
.lgap-truncate { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lgap-dot-status { flex: none; display: inline-block; width: 7px; height: 7px; border-radius: 999px; }
.lgap-issues { display: flex; flex-direction: column; gap: 1px; margin: 2px 0 6px 20px; padding-left: 8px; border-left: 1px solid #ececec; }
.lgap-issue { display: flex; align-items: center; gap: 7px; min-height: 26px; padding: 0 4px 0 6px; border-radius: 6px; font-size: 12px; }
.lgap-issue:hover { background: #f5f5f5; }
.lgap-issue-title { all: unset; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
.lgap-issue-action { all: unset; display: none; padding: 2px 6px; border-radius: 5px; color: var(--lgac-muted); font-size: 11px; cursor: pointer; }
.lgap-issue:hover .lgap-issue-action, .lgap-issue:focus-within .lgap-issue-action { display: inline-block; }
.lgap-issue-action:hover { background: #ebebeb; color: var(--lgac-text); }
.lgap-resolved .lgap-issue-title { color: var(--lgac-muted); text-decoration: line-through; }
.lgap-resolved .lgap-dot-status { opacity: 0.35; }
.lgap-side-name:focus-visible, .lgap-caret:focus-visible, .lgap-issue-title:focus-visible, .lgap-issue-action:focus-visible { outline: 2px solid var(--lgac-accent); outline-offset: 1px; border-radius: 4px; }
.lgap-side-foot { display: flex; justify-content: space-between; align-items: center; padding: 12px 22px 16px; border-top: 1px solid #ececec; font-size: 12px; }
.lgap-legend { box-sizing: border-box; display: flex; gap: 28px; padding: 20px 28px; background: #ffffff; max-width: 1180px; }
.lgap-legend-item { flex: 1; display: flex; align-items: flex-start; gap: 10px; min-width: 0; }
.lgap-legend-pin { flex: none; width: 18px; height: 18px; margin-top: 1px; border-radius: 999px; box-shadow: 0 0 0 2px #ffffff, 0 1px 3px rgba(0, 0, 0, 0.25); }
.lgap-filters { display: flex; align-items: center; gap: 2px; }
.lgap-filter { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 9px; border-radius: 7px; color: var(--lgac-muted); font: 500 12px/1 var(--lgac-font); cursor: pointer; }
.lgap-filter:hover { background: var(--lgac-hover); color: var(--lgac-text); }
.lgap-filter[aria-pressed="true"] { background: var(--lgac-hover); color: var(--lgac-text); }
.lgap-filter[aria-pressed="false"] .lgap-dot-status { opacity: 0.3; }
.lgap-filter:focus-visible { outline: 2px solid var(--lgac-accent); outline-offset: 1px; }
.lgap-rows { display: flex; flex-direction: column; margin-top: 18px; }
.lgap-next-row:focus-visible, .lgap-link:focus-visible { outline: 2px solid var(--lgac-accent); outline-offset: 2px; }

.lgap-groups { display: flex; flex-direction: column; gap: 120px; }
.lgap-group { display: flex; flex-direction: column; gap: 32px; }
.lgap-group-head { display: flex; align-items: baseline; gap: 12px; }
.lgap-sheets { display: flex; align-items: flex-start; gap: 40px; }
.lgap-sheet { display: flex; flex-direction: column; gap: 14px; flex: none; padding: 44px 48px 52px; background: #ffffff; }
.lgap-sheet > .lgap-frame { margin-top: 6px; }
.lgap-quiet { max-width: 420px; }
.lgap-group-head .lgap-pill { background: #e4e4e4; }
.lgap-group-head .lgap-pill.lgap-amber { background: var(--lgac-amber-bg); }
.lgap-group-head .lgap-pill.lgap-outline { background: none; box-shadow: inset 0 0 0 1px #d4d4d4; }

.lgap-frame { display: flex; flex-direction: column; align-self: stretch; padding: 4px; border: 1px solid var(--lgac-border); border-radius: 14px; background: #ffffff; }
.lgap-stage {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 440px;
  min-height: 148px;
  padding: 40px 44px;
  border: 1px solid var(--lgac-border);
  border-radius: 10px;
  background: var(--lgap-app-bg, #ffffff);
}
.lgap-hero > .lgap-stage { min-width: 560px; min-height: 220px; padding: 56px 64px; }
.lgap-section { display: flex; align-items: baseline; gap: 10px; margin-top: 18px; }
.lgap-section-n { flex: none; display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 999px; background: var(--lgac-text); color: var(--lgac-surface); font: 600 12px/1 var(--lgac-font); transform: translateY(-2px); }
.lgap-section-title { font-size: 17px; letter-spacing: -0.01em; }
.lgap-ovr { display: flex; flex-direction: column; gap: 14px; align-self: stretch; margin-top: 10px; padding: 0 0 4px; }
.lgap-ovr-head { display: flex; flex-direction: column; gap: 10px; padding: 18px 20px; border: 1px solid rgba(234, 88, 12, 0.35); border-radius: 14px; background: rgba(234, 88, 12, 0.06); }
.lgap-ovr-stat { display: flex; flex-direction: column; gap: 8px; }
.lgap-ovr-title { font-size: 16px; line-height: 1.35; }
.lgap-ovr-meter { display: block; height: 6px; max-width: 520px; border-radius: 999px; background: rgba(234, 88, 12, 0.15); overflow: hidden; }
.lgap-ovr-meter > span { display: block; height: 100%; border-radius: 999px; }
.lgap-ovr-grid { display: flex; flex-wrap: wrap; align-items: stretch; gap: 12px; max-width: 1040px; }
/* Tiles grow to fit what they draw: a wide component is never clipped. */
.lgap-ovr-tile { flex: 0 0 auto; min-width: 340px; max-width: 100%; display: flex; flex-direction: column; border: 1px solid rgba(234, 88, 12, 0.35); border-radius: 14px; background: #ffffff; }
.lgap-ovr-stage { display: flex; align-items: center; justify-content: center; min-height: 128px; padding: 28px 24px; border-bottom: 1px solid rgba(234, 88, 12, 0.2); border-radius: 13px 13px 0 0; background: var(--lgap-app-bg, #ffffff); }
.lgap-ovr-tile { cursor: pointer; transition: box-shadow 120ms ease; }
.lgap-ovr-tile:hover { box-shadow: 0 0 0 1px rgba(234, 88, 12, 0.6); }
.lgap-ovr-selected, .lgap-ovr-selected:hover { box-shadow: 0 0 0 2px #ea580c; }
.lgap-ovr-compare { display: grid; grid-template-columns: 1fr 1fr; border-bottom: 1px solid rgba(234, 88, 12, 0.2); border-radius: 13px 13px 0 0; background: var(--lgap-app-bg, #ffffff); }
.lgap-ovr-side { display: flex; flex-direction: column; min-width: 0; padding: 10px 16px 24px; }
.lgap-ovr-side-after { border-left: 1px solid rgba(234, 88, 12, 0.35); }
.lgap-ovr-side-label { font: 600 10px/1 var(--lgac-font); letter-spacing: 0.06em; text-transform: uppercase; color: var(--lgac-muted); }
.lgap-ovr-side-after .lgap-ovr-side-label { color: #9a3412; }
.lgap-ovr-side-stage { flex: 1; display: flex; align-items: center; justify-content: center; min-height: 96px; padding-top: 12px; }
.lgap-ovr-inspect { margin-left: auto; font: 500 12px var(--lgac-font); color: #9a3412; }
.lgap-ovr-lines { display: flex; flex-direction: column; gap: 3px; font: 11px/1.5 var(--lgac-mono); color: var(--lgac-text); }
.lgap-ovr-line s { color: var(--lgac-muted); }

.lgap-inspector { box-sizing: border-box; width: 340px; max-height: calc(100vh - 92px); overflow-y: auto; overscroll-behavior: contain; border-radius: 12px; background: #f7f7f7; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12), 0 0 0 1px #e8e8e8; font: 11px/1.45 var(--lgac-font); color: #313131; }
.lgap-insp-head { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-bottom: 1px solid #e8e8e8; background: #f7f7f7; }
.lgap-insp-tab { padding: 4px 8px; border-radius: 5px; background: #eeeeee; font-size: 11px; }
.lgap-insp-close { all: unset; cursor: pointer; width: 22px; height: 22px; display: grid; place-items: center; border-radius: 5px; color: #707070; font-size: 15px; }
.lgap-insp-close:hover { background: #eaeaea; color: #313131; }
.lgap-insp-block { display: flex; flex-direction: column; gap: 6px; padding: 8px 12px 10px; border-bottom: 1px solid #e8e8e8; }
.lgap-insp-title { display: flex; align-items: center; gap: 7px; font-size: 13px; }
.lgap-insp-row { display: flex; align-items: center; justify-content: space-between; min-height: 24px; }
.lgap-insp-action { all: unset; flex: none; white-space: nowrap; cursor: pointer; padding: 2px 7px; border-radius: 5px; color: #313131; font-size: 11px; }
.lgap-insp-action:hover { background: #eaeaea; }
.lgap-insp-action:focus-visible, .lgap-insp-close:focus-visible { outline: 2px solid var(--lgac-accent); outline-offset: 1px; }
.lgap-insp-code { font: 11px/1.6 ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; overflow-wrap: anywhere; }
.lgap-insp-decl { padding-left: 12px; }
.lgap-insp-decl:hover, .lgap-insp-class:hover { background: #eaeaea; border-radius: 3px; }
.lgap-insp-prop { color: #0550ae; }
.lgap-insp-new { color: #9a3412; }
.lgap-insp-class { display: flex; flex-direction: column; padding: 3px 0 3px 12px; }
.lgap-insp-tag { margin-left: 4px; padding: 0 5px; border-radius: 4px; background: #eeeeee; color: #707070; font: 10px var(--lgac-font); }
.lgap-insp-note { margin: 0; color: #707070; font-size: 11px; }
.lgap-insp-site, .lgap-insp-page { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 8px; margin: 0 -6px; padding: 4px 6px; border-radius: 5px; cursor: pointer; }
.lgap-insp-site:hover, .lgap-insp-page:hover { background: #eaeaea; }
.lgap-insp-site:disabled { cursor: default; opacity: 0.55; }
.lgap-insp-site:focus-visible, .lgap-insp-page:focus-visible, .lgap-insp-scope:focus-visible, .lgap-insp-group-head:focus-visible { outline: 2px solid var(--lgac-accent); outline-offset: 1px; }
.lgap-insp-page > .lgap-insp-code { flex: 1; }
.lgap-insp-go { margin-left: auto; flex: none; color: #9a3412; font-size: 11px; white-space: nowrap; }
.lgap-insp-pin { flex: none; min-width: 18px; height: 18px; padding: 0 4px; box-sizing: border-box; border-radius: 999px; background: #ea580c; color: #ffffff; font: 600 10px/18px var(--lgac-font); text-align: center; }
.lgap-insp-pin-related { background: #fed7aa; color: #9a3412; }
.lgap-insp-related-note { margin: 2px 0 4px; }
.lgap-insp-group { display: flex; flex-direction: column; gap: 1px; padding-top: 4px; }
.lgap-insp-group + .lgap-insp-group { margin-top: 4px; border-top: 1px solid #ececec; padding-top: 8px; }
.lgap-insp-group-head { all: unset; cursor: pointer; display: flex; align-items: baseline; gap: 6px; padding: 2px 0 4px; font-size: 11px; }
.lgap-insp-group-head:hover strong { text-decoration: underline; }
.lgap-insp-scopes { display: flex; gap: 2px; margin-bottom: 4px; }
.lgap-insp-scope { all: unset; cursor: pointer; padding: 4px 8px; border-radius: 5px; color: #6a6a6a; font-size: 11px; white-space: nowrap; }
.lgap-insp-scope:hover { color: #313131; }
.lgap-insp-scope[aria-selected="true"] { background: #eeeeee; color: #313131; }
.lgap-ovr-head { cursor: pointer; }
.lgap-ovr-head:hover { box-shadow: 0 0 0 1px rgba(234, 88, 12, 0.6); }
.lgap-ovr-head-selected, .lgap-ovr-head-selected:hover { box-shadow: 0 0 0 2px #ea580c; }
.lgap-legend-link { cursor: pointer; border-radius: 8px; }
.lgap-legend-link:hover strong { text-decoration: underline; }
.lgap-insp-site-open { background: rgba(234, 88, 12, 0.1); }
.lgap-insp-path { flex: 1; min-width: 0; text-align: left; }
.lgap-ovr-meta { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px 14px; }
.lgap-ovr-count { display: flex; align-items: baseline; gap: 8px; font-size: 15px; color: #9a3412; }
.lgap-ovr-chips { display: flex; flex-wrap: wrap; gap: 5px; }
.lgap-ovr-chip { display: inline-flex; max-width: 100%; overflow-wrap: anywhere; align-items: center; gap: 5px; padding: 2px 7px; border-radius: 6px; font: 11px/1.5 var(--lgac-mono); }
.lgap-ovr-rep { background: rgba(234, 88, 12, 0.12); color: #9a3412; }
.lgap-ovr-rep s { color: var(--lgac-muted); }
.lgap-ovr-add { background: #f4f4f5; color: var(--lgac-text); }
.lgap-ovr-in { box-shadow: inset 0 0 0 1px rgba(234, 88, 12, 0.45); color: #9a3412; }
.lgap-ovr-if { padding: 0 4px; border-radius: 4px; background: #ffffff; color: var(--lgac-muted); font-size: 10px; }
.lgap-ovr-sites { display: flex; flex-direction: column; gap: 1px; font-size: 11px; color: var(--lgac-muted); }
.lgap-ovr-more { all: unset; align-self: flex-start; padding: 7px 12px; border-radius: 8px; box-shadow: inset 0 0 0 1px rgba(234, 88, 12, 0.45); color: #9a3412; font: 500 13px/1 var(--lgac-font); cursor: pointer; }
.lgap-ovr-more:hover { background: rgba(234, 88, 12, 0.08); }
.lgap-ovr-more:focus-visible { outline: 2px solid var(--lgac-accent); outline-offset: 2px; }
.lgap-dashed > .lgap-stage { border-style: dashed; min-width: 260px; min-height: 112px; padding: 28px 32px; }
.lgap-foot { position: relative; z-index: 1; display: flex; justify-content: space-between; gap: 24px; padding: 8px 10px 6px; font: 11px/1.4 var(--lgac-mono); color: var(--lgac-muted); }
.lgap-toggle { all: unset; cursor: pointer; color: var(--lgac-accent); font: inherit; }
.lgap-toggle:hover { text-decoration: underline; }
.lgap-toggle:focus-visible { outline: 2px solid var(--lgac-accent); outline-offset: 2px; }
.lgap-sweep { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: center; gap: 28px 36px; max-width: 760px; }
.lgap-value { display: flex; flex-direction: column; align-items: center; gap: 12px; flex: none; }
.lgap-pin-anchor { position: absolute; left: calc(100% + 10px); top: 50%; width: 0; height: 0; }
.lgap-value-label { position: relative; font: 11px/1.3 var(--lgac-mono); color: var(--lgac-muted); text-align: center; }
.lgap-noted { position: relative; }
.lgap-app { flex: none; }
.lgap-missing {
  display: grid;
  place-items: center;
  min-width: 96px;
  min-height: 36px;
  padding: 6px 12px;
  border: 1px dashed var(--lgac-border);
  border-radius: 8px;
  color: var(--lgac-muted);
  font: 12px/1.3 var(--lgac-font);
}
.lgap-marker {
  position: absolute;
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  margin: -10px 0 0 -10px;
  border-radius: 999px;
  background: var(--lgac-text);
  color: var(--lgac-surface);
  font: 600 11px/1 var(--lgac-font);
}
.lgap-look-grid { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 20px; max-width: 1200px; }
.lgap-look { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }

.lgap-rows-plain { display: flex; flex-direction: column; gap: 6px; margin-top: 10px; }
.lgap-facts { display: flex; align-items: flex-start; gap: 48px; margin-top: 8px; }
.lgap-sites { display: grid; grid-auto-flow: column; grid-template-rows: repeat(40, auto); gap: 2px 32px; }
.lgap-table { border-collapse: collapse; font-size: 12px; }
.lgap-table td { padding: 2px 16px 2px 0; vertical-align: top; max-width: 420px; white-space: nowrap; }
.lgap-table td:nth-child(2) { white-space: normal; overflow-wrap: anywhere; }

.lgap-column { display: flex; flex-direction: column; gap: 2px; text-align: left; }
.lgap-dot { box-sizing: border-box; flex: none; width: 13px; height: 13px; border: 1px solid var(--lgac-muted); border-radius: 999px; }
.lgap-dot.lgap-done { border-color: #0d9488; background: #0d9488; box-shadow: inset 0 0 0 2px var(--lgac-surface); }
.lgap-count { margin-left: auto; font-variant-numeric: tabular-nums; }
.lgap-count-left { display: inline-block; min-width: 32px; font-variant-numeric: tabular-nums; color: var(--lgac-muted); }
.lgap-muted { color: var(--lgac-muted); }
.lgap-small { font-size: 12px; }
.lgap-mono { font-family: var(--lgac-mono); font-size: 12px; }
.lgap-block { display: block; }
.lgap-wrap { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; max-width: 520px; }
.lgap-amber-text { color: var(--lgac-amber); }
.lgap-link { color: inherit; text-decoration: none; cursor: pointer; }
.lgap-link:hover { color: var(--lgac-accent); }
.lgap-pill {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 999px;
  background: #f1f1f1;
  font: 400 12px/1.5 var(--lgac-font);
  letter-spacing: 0;
  white-space: nowrap;
}
.lgap-pill.lgap-amber, .lgap-chip.lgap-amber { background: var(--lgac-amber-bg); color: var(--lgac-amber); }
.lgap-pill.lgap-outline { background: none; box-shadow: inset 0 0 0 1px var(--lgac-border); }
.lgap-pill.lgap-solid { background: var(--lgac-text); color: var(--lgac-surface); }
.lgap-chip { padding: 1px 6px; border-radius: 4px; background: #f1f1f1; font: 11px var(--lgac-mono); }

.lgap-bar { display: flex; align-items: center; gap: 12px; min-height: 40px; padding: 0 12px; white-space: nowrap; }
.lgap-stack { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
.lgap-row { display: flex; align-items: flex-start; gap: 8px; }
.lgap-side { display: flex; flex-direction: column; gap: 8px; width: 340px; padding: 16px; }
.lgap-side-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.lgap-headline { font-size: 16px; }
.lgap-progress { height: 6px; border-radius: 999px; background: var(--lgac-hover); overflow: hidden; }
.lgap-progress span { display: block; height: 100%; background: var(--lgac-text); }
.lgap-step { display: flex; align-items: center; gap: 8px; }
.lgap-stats { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; padding-top: 10px; border-top: 1px solid var(--lgac-border); }
.lgap-stat { display: flex; justify-content: space-between; gap: 16px; }
.lgap-next { display: flex; flex-direction: column; gap: 2px; width: 340px; padding: 12px 8px 8px; }
.lgap-next .lgap-side-title, .lgap-foot-note { padding: 0 8px; }
.lgap-foot-note { padding-top: 6px; }
.lgap-next-row {
  all: unset;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px;
  border-radius: 8px;
  cursor: pointer;
}
.lgap-next-row:hover, .lgap-next-row.lgap-copied { background: var(--lgac-hover); }
.lgap-close { all: unset; padding: 0 4px; color: var(--lgac-muted); cursor: pointer; font-size: 16px; line-height: 1; }
`;

export default AuditPage;
