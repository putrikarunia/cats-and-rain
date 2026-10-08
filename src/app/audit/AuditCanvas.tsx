"use client";

/**
 * AuditCanvas: the pan-and-zoom canvas for the Lunagraph design system audit.
 *
 * One file, no dependencies beyond React 18 or 19. Copy it into the audit
 * folder as is and import from it. Do not edit it; put audit UI in your own
 * files.
 *
 *   <AuditCanvas id="inventory" topLeft={...} topRight={...} bottomRight={...}>
 *     ...content that pans and zooms...
 *   </AuditCanvas>
 *
 * Pan: scroll, drag with the hand tool (H), hold Space and drag, middle-drag,
 *      or drag with one finger on touch.
 * Zoom: pinch, Ctrl or Cmd + scroll, + and -, 0 for 100%, 1 to fit.
 * Hover outlines anything selectable; click selects it, Escape clears.
 *
 * How it stays fast: while the canvas is moving, nothing goes through React.
 * The transform, the zoom readout, and the outlines are written straight to
 * the DOM, and outlines are re-projected with arithmetic instead of measured.
 * React hears about the new zoom once, after the movement settles.
 *
 * Icons are from Lucide (ISC License).
 */

import {
  Component,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ErrorInfo,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

type View = { x: number; y: number; z: number };
type Rect = { x: number; y: number; width: number; height: number };
type Inset = { top: number; right: number; bottom: number; left: number };
/** An outlined element and its box in canvas space (unzoomed px from the content's top left). */
type Outline = { element: Element; rect: Rect };

export type CanvasTool = "select" | "hand";

export type CanvasSelection = {
  /** The element's `data-canvas-select` value, e.g. a component name. */
  label: string;
  /** Its `data-canvas-id`, if it has one. */
  id: string | null;
  element: Element;
};

export type AuditCanvasApi = {
  /** Zoom as a whole percentage, e.g. 100. Updates once movement settles. */
  zoom: number;
  tool: CanvasTool;
  setTool: (tool: CanvasTool) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  /** Zoom to a factor (1 = 100%), keeping the centre of the screen in place. */
  zoomTo: (factor: number) => void;
  /** Fit all content in view. */
  fit: () => void;
  /** Bring one element into view: a `data-canvas-id` value or the element itself. */
  focus: (target: string | Element) => void;
  selection: CanvasSelection | null;
  /** Select an element by `data-canvas-id` or directly. Pass null to clear. */
  select: (target: string | Element | null) => void;
};

/** A pin on the canvas: it sits on an element's top-right corner and stays the same size at any zoom. */
export type CanvasMarker = {
  id: string;
  /** The `data-canvas-id` of the element it sits on. */
  target: string;
  color: string;
  /** Short text inside the pin, such as a count. */
  label?: string;
  /** Shown when the pin is hovered. */
  title: string;
  detail?: string;
  actions?: { label: string; onSelect: () => void }[];
};

export type AuditCanvasProps = {
  /** Names this view. The position is remembered per id, and changing it refits. */
  id?: string;
  /** Content that pans and zooms. */
  children?: ReactNode;
  /** Fixed overlays. They stay put while the canvas moves. */
  topLeft?: ReactNode;
  topRight?: ReactNode;
  bottomRight?: ReactNode;
  /** Extra content in the bottom dock, after the tools. */
  dock?: ReactNode;
  /** A second toolbar beside the dock, such as filters. */
  toolbar?: ReactNode;
  /** A fixed panel down the left edge. The canvas fills the rest. */
  sidebar?: ReactNode;
  sidebarWidth?: number;
  /** Pins on elements in the content, by `data-canvas-id`. */
  markers?: CanvasMarker[];
  /** Space kept clear around content when fitting, in px. */
  inset?: Partial<Inset>;
  /** Called when the selection changes. */
  onSelect?: (selection: CanvasSelection | null) => void;
  minZoom?: number;
  maxZoom?: number;
};

const DEFAULT_INSET: Inset = { top: 96, right: 40, bottom: 104, left: 40 };
const STORAGE_PREFIX = "lunagraph-audit-canvas:";
/** Pointer travel that turns a touch into a pan. */
const DRAG_THRESHOLD = 4;
/** After the last camera change, wait this long before telling React and saving. */
const SETTLE_MS = 150;
const ANIMATION_MS = 220;
/** Pinch and Ctrl + scroll: scale by exp(-deltaY * this). */
const WHEEL_ZOOM_SENSITIVITY = 0.01;
/** A mouse wheel notch reports a far larger delta than a pinch tick. Cap it so one notch is not a leap. */
const WHEEL_ZOOM_MAX_DELTA = 50;
const KEY_ZOOM_STEP = 1.1;
const BUTTON_ZOOM_STEP = 1.25;
const SELECTABLE = "[data-canvas-select]";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

const CanvasContext = createContext<AuditCanvasApi | null>(null);

/** Canvas controls, for anything rendered inside <AuditCanvas> (content or overlays). */
export function useAuditCanvas(): AuditCanvasApi {
  const api = useContext(CanvasContext);
  if (!api) throw new Error("useAuditCanvas must be used inside <AuditCanvas>");
  return api;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

function isControl(target: EventTarget | null) {
  return target instanceof Element && target.closest("button, a, [role='button']") !== null;
}

function inOverlay(target: EventTarget | null) {
  return target instanceof Element && target.closest("[data-canvas-overlay]") !== null;
}

function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function readView(id: string): View | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + id);
    if (!raw) return null;
    const view = JSON.parse(raw) as Partial<View>;
    if ([view.x, view.y, view.z].every((n) => typeof n === "number" && Number.isFinite(n))) {
      return view as View;
    }
  } catch {
    // Storage is unavailable or the value is stale. Fall through to a fresh fit.
  }
  return null;
}

function writeView(id: string, view: View) {
  try {
    window.sessionStorage.setItem(STORAGE_PREFIX + id, JSON.stringify(view));
  } catch {
    // Not being able to remember the position is fine.
  }
}

type SafariGestureEvent = Event & { scale: number; clientX: number; clientY: number };
type Pointer = { x: number; y: number; startX: number; startY: number };

export function AuditCanvas({
  id = "audit",
  children,
  topLeft,
  topRight,
  bottomRight,
  dock,
  toolbar,
  sidebar,
  sidebarWidth = 280,
  markers,
  inset: insetProp,
  onSelect,
  minZoom = 0.05,
  maxZoom = 8,
}: AuditCanvasProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const zoomTextRef = useRef<HTMLSpanElement>(null);
  const hoverBoxRef = useRef<HTMLDivElement>(null);
  const selectBoxRef = useRef<HTMLDivElement>(null);

  // The camera and everything that follows it live in refs, not state: see the note at the top.
  const viewRef = useRef<View>({ x: 0, y: 0, z: 1 });
  const idRef = useRef(id);
  const autoFitRef = useRef(true);
  const movingRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);
  const pointersRef = useRef(new Map<number, Pointer>());
  const panningRef = useRef(false);
  const justPannedRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const hoverRef = useRef<Outline | null>(null);
  const selectedRef = useRef<Outline | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const [tool, setTool] = useState<CanvasTool>("select");
  const [zoom, setZoom] = useState(100);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [ready, setReady] = useState(false);
  const [selection, setSelection] = useState<CanvasSelection | null>(null);

  const panMode = tool === "hand" || spaceHeld;
  const panModeRef = useRef(panMode);
  panModeRef.current = panMode;

  const top = insetProp?.top ?? DEFAULT_INSET.top;
  const right = insetProp?.right ?? DEFAULT_INSET.right;
  const bottom = insetProp?.bottom ?? DEFAULT_INSET.bottom;
  const left = insetProp?.left ?? DEFAULT_INSET.left;

  // ── Outlines ────────────────────────────────────────────────────────────

  /** An element's box in canvas space. The only place outlines read layout. */
  const measure = useCallback((element: Element): Rect | null => {
    const world = worldRef.current;
    if (!world || !world.contains(element)) return null;
    const { z } = viewRef.current;
    const origin = world.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    return {
      x: (box.left - origin.left) / z,
      y: (box.top - origin.top) / z,
      width: box.width / z,
      height: box.height / z,
    };
  }, []);

  /** Put the outline boxes where the camera now shows their elements. Arithmetic and style writes only. */
  const projectOutlines = useCallback(() => {
    const { x, y, z } = viewRef.current;
    const place = (box: HTMLDivElement | null, outline: Outline | null) => {
      if (!box) return;
      if (!outline) {
        box.style.display = "none";
        return;
      }
      const boxTop = outline.rect.y * z + y;
      box.style.display = "block";
      box.style.transform = `translate(${outline.rect.x * z + x}px, ${boxTop}px)`;
      box.style.width = `${outline.rect.width * z}px`;
      box.style.height = `${outline.rect.height * z}px`;
      // The name is cut to the width of what it names.
      box.style.setProperty("--lgac-outline-width", `${Math.max(16, outline.rect.width * z)}px`);
      // No room above the box for the name tag: tuck it inside the top edge.
      box.toggleAttribute("data-label-inside", boxTop < 24);
    };
    const hover = hoverRef.current;
    const selected = selectedRef.current;
    place(hoverBoxRef.current, hover && hover.element !== selected?.element ? hover : null);
    place(selectBoxRef.current, selected);
  }, []);

  // ── Markers ─────────────────────────────────────────────────────────────
  // Positions are measured in canvas space when content changes, and projected with
  // arithmetic on every frame, the same way as the outlines.

  const markerSlots = useMemo(() => {
    const taken = new Map<string, number>();
    return (markers ?? []).map((marker) => {
      const slot = taken.get(marker.target) ?? 0;
      taken.set(marker.target, slot + 1);
      return { marker, slot };
    });
  }, [markers]);
  const markerSlotsRef = useRef(markerSlots);
  markerSlotsRef.current = markerSlots;
  const markerElements = useRef(new Map<string, HTMLDivElement>());
  const markerRects = useRef(new Map<string, Rect | null>());

  const measureMarkers = useCallback(() => {
    const world = worldRef.current;
    if (!world) return;
    const targets = new Map<string, Rect | null>();
    for (const { marker } of markerSlotsRef.current) {
      if (!targets.has(marker.target)) {
        const element = world.querySelector(`[data-canvas-id="${CSS.escape(marker.target)}"]`);
        targets.set(marker.target, element ? measure(element) : null);
      }
      markerRects.current.set(marker.id, targets.get(marker.target) ?? null);
    }
  }, [measure]);

  const projectMarkers = useCallback(() => {
    const { x, y, z } = viewRef.current;
    for (const { marker, slot } of markerSlotsRef.current) {
      const element = markerElements.current.get(marker.id);
      if (!element) continue;
      const rect = markerRects.current.get(marker.id);
      if (!rect) {
        element.style.display = "none";
        continue;
      }
      element.style.display = "block";
      // On the top-right corner; several on one element line up leftwards.
      element.style.transform = `translate(${(rect.x + rect.width) * z + x - 11 - slot * 18}px, ${rect.y * z + y - 11}px)`;
    }
  }, []);

  const outlineFor = useCallback(
    (element: Element | null, box: HTMLDivElement | null): Outline | null => {
      const rect = element ? measure(element) : null;
      if (!element || !rect) return null;
      const label = box?.firstElementChild;
      if (label) label.textContent = element.getAttribute("data-canvas-select") ?? "";
      // Components get the component colour, everything else the selection colour.
      box?.toggleAttribute("data-component", element.hasAttribute("data-canvas-component"));
      return { element, rect };
    },
    [measure],
  );

  const setHover = useCallback(
    (element: Element | null) => {
      if ((hoverRef.current?.element ?? null) === element) return;
      hoverRef.current = outlineFor(element, hoverBoxRef.current);
      projectOutlines();
    },
    [outlineFor, projectOutlines],
  );

  const selectableFrom = useCallback((target: EventTarget | null) => {
    const world = worldRef.current;
    if (!world || !(target instanceof Element)) return null;
    const element = target.closest(SELECTABLE);
    return element && world.contains(element) ? element : null;
  }, []);

  /** Hover is ignored while the canvas moves, so afterwards work out what is under the pointer now. */
  const rehover = useCallback(() => {
    const pointer = lastPointerRef.current;
    if (!pointer || panModeRef.current || panningRef.current) {
      setHover(null);
      return;
    }
    setHover(selectableFrom(document.elementFromPoint(pointer.x, pointer.y)));
  }, [selectableFrom, setHover]);

  const selectElement = useCallback(
    (element: Element | null) => {
      if ((selectedRef.current?.element ?? null) === element) return;
      selectedRef.current = outlineFor(element, selectBoxRef.current);
      projectOutlines();
      const selected = selectedRef.current;
      const next = selected
        ? {
            label: selected.element.getAttribute("data-canvas-select") ?? "",
            id: selected.element.getAttribute("data-canvas-id"),
            element: selected.element,
          }
        : null;
      setSelection(next);
      onSelectRef.current?.(next);
    },
    [outlineFor, projectOutlines],
  );

  /** Content changed size or was replaced: measure the outlined elements again, drop ones that are gone. */
  const remeasureOutlines = useCallback(() => {
    const hover = hoverRef.current;
    if (hover) {
      const rect = hover.element.isConnected ? measure(hover.element) : null;
      hoverRef.current = rect ? { element: hover.element, rect } : null;
    }
    const selected = selectedRef.current;
    if (selected) {
      const rect = selected.element.isConnected ? measure(selected.element) : null;
      if (rect) selectedRef.current = { element: selected.element, rect };
      else selectElement(null);
    }
    projectOutlines();
  }, [measure, projectOutlines, selectElement]);

  // ── Camera ──────────────────────────────────────────────────────────────

  const paint = useCallback(() => {
    const view = viewRef.current;
    const world = worldRef.current;
    if (world) world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.z})`;
    const zoomText = zoomTextRef.current;
    if (zoomText) zoomText.textContent = `${Math.round(view.z * 100)}%`;
    projectOutlines();
    projectMarkers();
  }, [projectOutlines, projectMarkers]);

  /** Movement has stopped: snap to whole pixels so text is crisp, then tell React and save. */
  const settle = useCallback(() => {
    if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
    if (!movingRef.current) return;
    movingRef.current = false;
    const view = viewRef.current;
    viewRef.current = { x: Math.round(view.x), y: Math.round(view.y), z: view.z };
    paint();
    setZoom(Math.round(view.z * 100));
    if (!autoFitRef.current) writeView(idRef.current, viewRef.current);
    rehover();
  }, [paint, rehover]);

  const apply = useCallback(
    (next: View) => {
      viewRef.current = { x: next.x, y: next.y, z: clamp(next.z, minZoom, maxZoom) };
      paint();
      movingRef.current = true;
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = window.setTimeout(settle, SETTLE_MS);
    },
    [minZoom, maxZoom, paint, settle],
  );

  const stopAnimation = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
  }, []);

  const moveTo = useCallback(
    (target: View, animate: boolean) => {
      stopAnimation();
      const to = { x: target.x, y: target.y, z: clamp(target.z, minZoom, maxZoom) };
      if (!animate || prefersReducedMotion()) {
        apply(to);
        return;
      }
      const from = viewRef.current;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / ANIMATION_MS);
        const eased = 1 - (1 - t) ** 3;
        apply({
          x: from.x + (to.x - from.x) * eased,
          y: from.y + (to.y - from.y) * eased,
          z: from.z + (to.z - from.z) * eased,
        });
        frameRef.current = t < 1 ? requestAnimationFrame(step) : null;
      };
      frameRef.current = requestAnimationFrame(step);
    },
    [apply, stopAnimation, minZoom, maxZoom],
  );

  /** Zoom to `z`, keeping the viewport point (px, py) fixed on screen. */
  const zoomAt = useCallback(
    (px: number, py: number, z: number, animate = false) => {
      const view = viewRef.current;
      const nextZ = clamp(z, minZoom, maxZoom);
      const k = nextZ / view.z;
      moveTo({ x: px - (px - view.x) * k, y: py - (py - view.y) * k, z: nextZ }, animate);
    },
    [moveTo, minZoom, maxZoom],
  );

  /**
   * Bring a rectangle of the content into view, never zooming past 100%.
   * "all" shows the whole rectangle. "width" only fits its width and stays readable,
   * so tall content opens at the top like a page.
   */
  const fitRect = useCallback(
    (rect: Rect, animate: boolean, mode: "all" | "width" = "all") => {
      const viewport = viewportRef.current;
      if (!viewport || !rect.width || !rect.height) return false;
      const availableW = Math.max(1, viewport.clientWidth - left - right);
      const availableH = Math.max(1, viewport.clientHeight - top - bottom);
      const z =
        mode === "width"
          ? clamp(Math.min(availableW / rect.width, 1), Math.max(minZoom, 0.5), maxZoom)
          : clamp(Math.min(availableW / rect.width, availableH / rect.height, 1), minZoom, maxZoom);
      moveTo(
        {
          x: left + Math.max(0, (availableW - rect.width * z) / 2) - rect.x * z,
          y: top - rect.y * z,
          z,
        },
        animate,
      );
      return true;
    },
    [moveTo, top, right, bottom, left, minZoom, maxZoom],
  );

  const fitContent = useCallback(
    (animate: boolean, mode: "all" | "width" = "all") => {
      const world = worldRef.current;
      if (!world) return false;
      return fitRect({ x: 0, y: 0, width: world.offsetWidth, height: world.offsetHeight }, animate, mode);
    },
    [fitRect],
  );

  /** The user took the camera: stop following content, and stop any animation in flight. */
  const userMoved = useCallback(() => {
    autoFitRef.current = false;
    stopAnimation();
  }, [stopAnimation]);

  const zoomFromCentre = useCallback(
    (z: number) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      userMoved();
      zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, z, true);
    },
    [userMoved, zoomAt],
  );

  const findById = useCallback((target: string | Element | null) => {
    if (typeof target !== "string") return target;
    const world = worldRef.current;
    if (!world) return null;
    return (
      Array.from(world.querySelectorAll("[data-canvas-id]")).find(
        (candidate) => candidate.getAttribute("data-canvas-id") === target,
      ) ?? null
    );
  }, []);

  const api = useMemo<AuditCanvasApi>(
    () => ({
      zoom,
      tool,
      setTool,
      zoomIn: () => zoomFromCentre(viewRef.current.z * BUTTON_ZOOM_STEP),
      zoomOut: () => zoomFromCentre(viewRef.current.z / BUTTON_ZOOM_STEP),
      zoomTo: zoomFromCentre,
      fit: () => {
        userMoved();
        fitContent(true);
      },
      focus: (target) => {
        const element = findById(target);
        const rect = element ? measure(element) : null;
        if (!rect) return;
        userMoved();
        fitRect(rect, true);
      },
      selection,
      select: (target) => selectElement(findById(target)),
    }),
    [zoom, tool, selection, zoomFromCentre, fitContent, fitRect, findById, measure, selectElement, userMoved],
  );

  // Restore the remembered position for this id, or fit the content.
  useIsoLayoutEffect(() => {
    idRef.current = id;
    hoverRef.current = null;
    selectElement(null);
    const saved = readView(id);
    if (saved) {
      autoFitRef.current = false;
      moveTo(saved, false);
    } else {
      autoFitRef.current = true;
      if (!fitContent(false, "width")) moveTo({ x: left, y: top, z: 1 }, false);
    }
    settle();
    setReady(true);
    // Only when the view id changes. Inset and zoom limits are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Until the user moves the canvas, keep fitting as content arrives or the window resizes.
  useEffect(() => {
    const world = worldRef.current;
    const viewport = viewportRef.current;
    if (!world || !viewport || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (autoFitRef.current) fitContent(false, "width");
      remeasureOutlines();
      measureMarkers();
      projectMarkers();
    });
    observer.observe(world);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitContent, remeasureOutlines, measureMarkers, projectMarkers]);

  useIsoLayoutEffect(() => {
    measureMarkers();
    projectMarkers();
  }, [markerSlots, measureMarkers, projectMarkers]);

  // Leaving: finish any pending settle so the position is saved, and stop timers.
  useEffect(() => {
    window.addEventListener("pagehide", settle);
    return () => {
      window.removeEventListener("pagehide", settle);
      settle();
      stopAnimation();
    };
  }, [settle, stopAnimation]);

  // Menus, popovers, and dialogs usually render into <body>, outside the canvas. The canvas sits
  // above the whole app, so lift anything added to <body> from now on above the canvas too.
  useEffect(() => {
    const body = document.body;
    const present = Array.from(body.children);
    for (const child of present) child.setAttribute("data-lgac-app", "");
    const lift = (node: Node) => {
      if (!(node instanceof HTMLElement) || node.hasAttribute("data-lgac-app")) return;
      // z-index needs a positioned box. A plain wrapper gets one; a positioned element keeps its own.
      if (getComputedStyle(node).position === "static") node.style.position = "relative";
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) record.addedNodes.forEach(lift);
    });
    observer.observe(body, { childList: true });
    return () => {
      observer.disconnect();
      for (const child of present) child.removeAttribute("data-lgac-app");
    };
  }, []);

  // A sideways swipe at the edge of the canvas must not navigate back or forward.
  useEffect(() => {
    const targets = [document.documentElement, document.body];
    const previous = targets.map((element) => element.style.overscrollBehavior);
    for (const element of targets) element.style.overscrollBehavior = "none";
    return () => {
      targets.forEach((element, index) => {
        element.style.overscrollBehavior = previous[index] ?? "";
      });
    };
  }, []);

  // Entering pan mode drops the hover outline; leaving it picks up whatever is under the pointer.
  useEffect(() => {
    rehover();
  }, [panMode, rehover]);

  // Wheel and trackpad. Registered by hand because React's wheel listener is passive.
  useEffect(() => {
    const root = rootRef.current;
    const viewport = viewportRef.current;
    if (!root || !viewport) return;

    // Safari reports a trackpad pinch as gesture events with a cumulative scale. Some
    // versions also send ctrl + wheel for the same pinch, so only one path may zoom.
    let safariGesture = false;
    let safariGestureStartZoom = 1;

    const onWheel = (event: WheelEvent) => {
      const zooming = event.ctrlKey || event.metaKey;
      if (inOverlay(event.target)) {
        // Overlays scroll their own content, but the browser must not zoom the page or swipe back.
        if (zooming || Math.abs(event.deltaX) > Math.abs(event.deltaY)) event.preventDefault();
        return;
      }
      event.preventDefault();
      if (safariGesture && zooming) return;
      userMoved();

      let dx = event.deltaX;
      let dy = event.deltaY;
      if (event.deltaMode === 1) {
        dx *= 16;
        dy *= 16;
      } else if (event.deltaMode === 2) {
        dx *= viewport.clientWidth;
        dy *= viewport.clientHeight;
      }

      if (zooming) {
        const box = viewport.getBoundingClientRect();
        const delta = clamp(dy, -WHEEL_ZOOM_MAX_DELTA, WHEEL_ZOOM_MAX_DELTA);
        zoomAt(
          event.clientX - box.left,
          event.clientY - box.top,
          viewRef.current.z * Math.exp(-delta * WHEEL_ZOOM_SENSITIVITY),
        );
        return;
      }
      // Panning reads no layout: one transform write per event.
      if (event.shiftKey && dx === 0) {
        dx = dy;
        dy = 0;
      }
      const view = viewRef.current;
      apply({ x: view.x - dx, y: view.y - dy, z: view.z });
    };

    const onGestureStart = (event: Event) => {
      event.preventDefault();
      safariGesture = true;
      safariGestureStartZoom = viewRef.current.z;
    };
    const onGestureChange = (event: Event) => {
      event.preventDefault();
      const gesture = event as SafariGestureEvent;
      if (!Number.isFinite(gesture.scale)) return;
      const box = viewport.getBoundingClientRect();
      userMoved();
      zoomAt(gesture.clientX - box.left, gesture.clientY - box.top, safariGestureStartZoom * gesture.scale);
    };
    const onGestureEnd = (event: Event) => {
      event.preventDefault();
      safariGesture = false;
    };

    root.addEventListener("wheel", onWheel, { passive: false });
    root.addEventListener("gesturestart", onGestureStart);
    root.addEventListener("gesturechange", onGestureChange);
    root.addEventListener("gestureend", onGestureEnd);
    return () => {
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("gesturestart", onGestureStart);
      root.removeEventListener("gesturechange", onGestureChange);
      root.removeEventListener("gestureend", onGestureEnd);
    };
  }, [apply, zoomAt, userMoved]);

  // Keyboard.
  useEffect(() => {
    const releaseSpace = () => setSpaceHeld(false);

    /** Zoom toward the pointer when it is over the canvas, otherwise toward the centre. */
    const zoomByKey = (z: number, animate: boolean) => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const box = viewport.getBoundingClientRect();
      const pointer = lastPointerRef.current;
      userMoved();
      zoomAt(pointer ? pointer.x - box.left : box.width / 2, pointer ? pointer.y - box.top : box.height / 2, z, animate);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target) || event.altKey) return;
      const mod = event.metaKey || event.ctrlKey;
      if (event.code === "Space") {
        // Space on one of the canvas's own controls presses it. Anywhere else, including on a
        // button inside a specimen that was just clicked, Space is the hand.
        if (mod || (isControl(event.target) && inOverlay(event.target))) return;
        event.preventDefault();
        setSpaceHeld(true);
        return;
      }
      switch (event.key) {
        case "+":
        case "=":
          event.preventDefault();
          zoomByKey(viewRef.current.z * KEY_ZOOM_STEP, false);
          break;
        case "-":
        case "_":
          event.preventDefault();
          zoomByKey(viewRef.current.z / KEY_ZOOM_STEP, false);
          break;
        case "0":
          event.preventDefault();
          zoomByKey(1, true);
          break;
        case "1":
          if (mod) break;
          userMoved();
          fitContent(true);
          break;
        case "Escape":
          selectElement(null);
          break;
        case "v":
        case "V":
          if (!mod) setTool("select");
          break;
        case "h":
        case "H":
          if (!mod) setTool("hand");
          break;
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      // Letting go of Space must not press the specimen button that happens to have focus.
      if (!isTyping(event.target) && !(isControl(event.target) && inOverlay(event.target))) event.preventDefault();
      releaseSpace();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseSpace);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseSpace);
    };
  }, [zoomAt, fitContent, selectElement, userMoved]);

  // Drag to pan, two fingers to pinch, hover to outline, click to select.
  const startPanning = (event: ReactPointerEvent<HTMLDivElement>) => {
    panningRef.current = true;
    setDragging(true);
    setHover(null);
    userMoved();
    for (const pointerId of pointersRef.current.keys()) {
      try {
        event.currentTarget.setPointerCapture(pointerId);
      } catch {
        // The pointer is already gone.
      }
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    justPannedRef.current = false;
    const touch = event.pointerType === "touch";
    const mousePan = event.button === 1 || (event.button === 0 && panMode);
    if (!touch && !mousePan) return;
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
    });
    if (touch) {
      // A tap should still reach the content. Start panning once the finger moves, or a second finger lands.
      if (pointersRef.current.size > 1) startPanning(event);
      return;
    }
    event.preventDefault();
    startPanning(event);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointers = pointersRef.current;
    const pointer = pointers.get(event.pointerId);

    if (!pointer) {
      if (event.pointerType === "touch") return;
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      // While the canvas moves, the content under a still pointer changes every frame. Wait for it to settle.
      if (!movingRef.current && !panMode) setHover(selectableFrom(event.target));
      return;
    }

    if (!panningRef.current) {
      const moved = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
      if (moved < DRAG_THRESHOLD) return;
      startPanning(event);
    }

    const view = viewRef.current;
    if (pointers.size === 1) {
      apply({ x: view.x + event.clientX - pointer.x, y: view.y + event.clientY - pointer.y, z: view.z });
    } else if (pointers.size === 2) {
      let other: Pointer | undefined;
      for (const [pointerId, candidate] of pointers) {
        if (pointerId !== event.pointerId) other = candidate;
      }
      if (other) {
        const box = event.currentTarget.getBoundingClientRect();
        const before = Math.hypot(pointer.x - other.x, pointer.y - other.y);
        const after = Math.hypot(event.clientX - other.x, event.clientY - other.y);
        const midBeforeX = (pointer.x + other.x) / 2;
        const midBeforeY = (pointer.y + other.y) / 2;
        const midAfterX = (event.clientX + other.x) / 2;
        const midAfterY = (event.clientY + other.y) / 2;
        apply({ x: view.x + midAfterX - midBeforeX, y: view.y + midAfterY - midBeforeY, z: view.z });
        if (before > 0) {
          zoomAt(midAfterX - box.left, midAfterY - box.top, viewRef.current.z * (after / before));
        }
      }
    }
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    if (event.pointerType !== "touch") lastPointerRef.current = { x: event.clientX, y: event.clientY };
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const pointers = pointersRef.current;
    if (!pointers.delete(event.pointerId)) return;
    if (pointers.size === 0) {
      // The click that ends a drag is not a click on the canvas.
      justPannedRef.current = panningRef.current;
      panningRef.current = false;
      setDragging(false);
    }
  };

  const onPointerLeave = () => {
    lastPointerRef.current = null;
    setHover(null);
  };

  const onClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (justPannedRef.current) {
      justPannedRef.current = false;
      return;
    }
    if (panMode) return;
    const element = selectableFrom(event.target);
    if (element) selectElement(element);
    else if (!isControl(event.target)) selectElement(null);
  };

  const grab = !dragging && panMode;
  const cursor = dragging ? "grabbing" : grab ? "grab" : undefined;

  return (
    <CanvasContext.Provider value={api}>
      <div ref={rootRef} className="lgac-root" data-audit-canvas="">
        <style dangerouslySetInnerHTML={{ __html: CANVAS_CSS }} />
        {sidebar ? (
          <aside className="lgac-sidebar" data-canvas-overlay="" style={{ width: sidebarWidth }}>
            {sidebar}
          </aside>
        ) : null}
        <div className="lgac-main" style={{ left: sidebar ? sidebarWidth : 0 }}>
        <div
          ref={viewportRef}
          className="lgac-viewport"
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onPointerLeave={onPointerLeave}
          onClick={onClick}
        >
          <div
            ref={worldRef}
            className="lgac-world"
            style={{
              visibility: ready ? "visible" : "hidden",
              pointerEvents: grab || dragging ? "none" : undefined,
            }}
          >
            {children}
          </div>
        </div>

        {/* Outlines sit outside the zoomed content so their stroke and label stay the same size at any zoom. */}
        <div className="lgac-outlines" aria-hidden="true">
          <div ref={hoverBoxRef} className="lgac-outline" data-outline="hover">
            <span className="lgac-outline-label" />
          </div>
          <div ref={selectBoxRef} className="lgac-outline" data-outline="selected">
            <span className="lgac-outline-label" />
          </div>
        </div>

        {/* Pins, like comments: the same size at any zoom, so they can still be found zoomed out. */}
        <div className="lgac-markers">
          {markerSlots.map(({ marker }) => (
            <div
              key={marker.id}
              ref={(element) => {
                if (element) markerElements.current.set(marker.id, element);
                else markerElements.current.delete(marker.id);
              }}
              className="lgac-marker"
              data-marker-id={marker.id}
              data-marker-target={marker.target}
              style={{ ["--lgac-marker" as string]: marker.color }}
            >
              <button type="button" className="lgac-marker-pin" aria-label={marker.title} onPointerDown={keepFocus} onClick={() => api.focus(marker.target)}>
                {marker.label ?? ""}
              </button>
              <div className="lgac-marker-card" role="tooltip">
                <strong>{marker.title}</strong>
                {marker.detail ? <span>{marker.detail}</span> : null}
                {marker.actions?.length ? (
                  <span className="lgac-marker-actions">
                    {marker.actions.map((action) => (
                      <button key={action.label} type="button" className="lgac-marker-action" onPointerDown={keepFocus} onClick={action.onSelect}>
                        {action.label}
                      </button>
                    ))}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {topLeft ? (
          <div className="lgac-overlay lgac-top-left" data-canvas-overlay="">
            {topLeft}
          </div>
        ) : null}
        {topRight ? (
          <div className="lgac-overlay lgac-top-right" data-canvas-overlay="">
            {topRight}
          </div>
        ) : null}
        {bottomRight ? (
          <div className="lgac-overlay lgac-bottom-right" data-canvas-overlay="">
            {bottomRight}
          </div>
        ) : null}

        <div className="lgac-overlay lgac-bottom-left" data-canvas-overlay="">
          <div className="lgac-panel lgac-bar">
            <CanvasButton label="Zoom out (-)" onClick={api.zoomOut}>
              <Icon d={["M5 12h14"]} />
            </CanvasButton>
            <button
              type="button"
              className="lgac-button lgac-zoom"
              title="Reset to 100% (0)"
              onPointerDown={keepFocus}
              onClick={() => api.zoomTo(1)}
            >
              {/* Written directly while zooming, so it has no React children. */}
              <span ref={zoomTextRef} />
            </button>
            <CanvasButton label="Zoom in (+)" onClick={api.zoomIn}>
              <Icon d={["M5 12h14", "M12 5v14"]} />
            </CanvasButton>
            <CanvasButton label="Fit to screen (1)" onClick={api.fit}>
              <Icon d={["M8 3H5a2 2 0 0 0-2 2v3", "M21 8V5a2 2 0 0 0-2-2h-3", "M3 16v3a2 2 0 0 0 2 2h3", "M16 21h3a2 2 0 0 0 2-2v-3"]} />
            </CanvasButton>
          </div>
        </div>

        <div className="lgac-overlay lgac-dock" data-canvas-overlay="">
          <div className="lgac-panel lgac-bar">
            <CanvasButton label="Select (V)" pressed={tool === "select"} onClick={() => setTool("select")}>
              <Icon
                d={[
                  "M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z",
                ]}
              />
            </CanvasButton>
            <CanvasButton label="Hand (H, or hold Space)" pressed={tool === "hand"} onClick={() => setTool("hand")}>
              <Icon
                d={[
                  "M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2",
                  "M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2",
                  "M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8",
                  "M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15",
                ]}
              />
            </CanvasButton>
            {dock ? (
              <>
                <span className="lgac-divider" />
                {dock}
              </>
            ) : null}
          </div>
          {toolbar ? <div className="lgac-panel lgac-bar">{toolbar}</div> : null}
        </div>
        </div>
      </div>
    </CanvasContext.Provider>
  );
}

/** Clicking a canvas control with the mouse should not leave focus on it, or Space would press it again. */
function keepFocus(event: ReactPointerEvent<HTMLElement>) {
  if (event.pointerType === "mouse") event.preventDefault();
}

function CanvasButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="lgac-button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onPointerDown={keepFocus}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Icon({ d }: { d: string[] }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d.map((path) => (
        <path key={path} d={path} />
      ))}
    </svg>
  );
}

/** A floating white card for overlay content: top bars, the "What next" card, side panels. */
export function CanvasPanel({
  children,
  className,
  style,
}: {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={className ? `lgac-panel ${className}` : "lgac-panel"} style={style}>
      {children}
    </div>
  );
}

export type CanvasSpecimenProps = {
  children?: ReactNode;
  /** The component name. Shown in the hover outline, and if the specimen fails to render. */
  name?: string;
  /** Lets `focus(id)` and `select(id)` find this specimen. */
  id?: string;
  /**
   * Put the specimen in a fixed box of this size. Only for raw markup that positions itself
   * against the screen, such as a hand-rolled modal with a `fixed inset-0` backdrop: the box
   * gives it something to fill. Leave unset for components: they render as they are.
   */
  width?: number;
  height?: number;
  /** Shrink a boxed specimen, e.g. 0.4. It still lays out at its natural size, then scales. */
  scale?: number;
  /** Specimens are live: they can be clicked, typed in, opened. Set false to make one look-only. */
  interactive?: boolean;
  /** Set false to leave this specimen out of hover and selection. */
  selectable?: boolean;
  className?: string;
  style?: CSSProperties;
};

/**
 * Wraps one real component render.
 * - It is live: click it, type in it, open its menu, the way you would in the app.
 *   Links do not navigate and forms do not submit, so trying one never leaves the page.
 * - It is outlined on hover and can be selected.
 * - It catches render errors, so one broken specimen does not take the page down.
 * - Given a width and height, it becomes a fixed box that contains `position: fixed`
 *   content and can be scaled down. That is for raw markup, not components.
 */
export function CanvasSpecimen(props: CanvasSpecimenProps) {
  const { name, id, width, height, scale = 1, selectable = true } = props;
  const boxed = width !== undefined || height !== undefined || scale !== 1;
  return (
    <SpecimenBoundary
      name={name}
      id={id}
      selectable={selectable}
      width={width === undefined ? undefined : width * scale}
      height={height === undefined ? undefined : height * scale}
    >
      {boxed ? <BoxedSpecimen {...props} /> : <LiveSpecimen {...props} />}
    </SpecimenBoundary>
  );
}

/** Trying a specimen must not leave the audit: links stay put, forms do not submit. */
function stayOnPage(event: ReactMouseEvent<HTMLElement>) {
  if (event.target instanceof Element && event.target.closest("a[href]")) event.preventDefault();
}
function noSubmit(event: { preventDefault: () => void }) {
  event.preventDefault();
}

/** Look-only content cannot be clicked or focused. Set on an inner element so the wrapper can still be hovered. */
function useInert(interactive: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useIsoLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (interactive) element.removeAttribute("inert");
    else element.setAttribute("inert", "");
  }, [interactive]);
  return ref;
}

function LiveSpecimen({ children, name, id, interactive = true, selectable = true, className, style }: CanvasSpecimenProps) {
  const innerRef = useInert(interactive);
  return (
    <div
      className={className ? `lgac-specimen lgac-specimen-live ${className}` : "lgac-specimen lgac-specimen-live"}
      data-canvas-select={selectable ? (name ?? "") : undefined}
      data-canvas-component=""
      data-canvas-id={id}
      style={style}
      onClickCapture={stayOnPage}
      onSubmitCapture={noSubmit}
    >
      <div ref={innerRef} className="lgac-specimen-content" style={{ pointerEvents: interactive ? undefined : "none" }}>
        {children}
      </div>
    </div>
  );
}

function BoxedSpecimen({ children, name, id, width, height, scale = 1, interactive = true, selectable = true, className, style }: CanvasSpecimenProps) {
  const innerRef = useInert(interactive);
  const [measured, setMeasured] = useState<{ width: number; height: number } | null>(null);

  useIsoLayoutEffect(() => {
    const inner = innerRef.current;
    if (!inner) return;
    const measure = () => {
      const next = { width: inner.offsetWidth, height: inner.offsetHeight };
      setMeasured((current) => (current && current.width === next.width && current.height === next.height ? current : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [innerRef]);

  const naturalWidth = width ?? measured?.width;
  const naturalHeight = height ?? measured?.height;

  return (
    <div
      className={className ? `lgac-specimen ${className}` : "lgac-specimen"}
      data-canvas-select={selectable ? (name ?? "") : undefined}
      data-canvas-component=""
      data-canvas-id={id}
      style={{
        ...style,
        width: naturalWidth === undefined ? undefined : naturalWidth * scale,
        height: naturalHeight === undefined ? undefined : naturalHeight * scale,
      }}
      onClickCapture={stayOnPage}
      onSubmitCapture={noSubmit}
    >
      <div
        ref={innerRef}
        className="lgac-specimen-inner"
        style={{
          width: width ?? "max-content",
          height,
          transform: `scale(${scale})`,
          pointerEvents: interactive ? undefined : "none",
        }}
      >
        {children}
      </div>
    </div>
  );
}

type BoundaryProps = {
  name?: string;
  id?: string;
  selectable: boolean;
  width?: number;
  height?: number;
  children?: ReactNode;
};
type BoundaryState = { message: string | null };

class SpecimenBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { message: null };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.warn(`[audit] Could not render ${this.props.name ?? "specimen"}`, error, info.componentStack);
  }

  render() {
    if (this.state.message === null) return this.props.children;
    const { name, id, selectable, width, height } = this.props;
    return (
      <div
        className="lgac-specimen-error"
        data-canvas-select={selectable ? (name ?? "") : undefined}
        data-canvas-id={id}
        style={{ width, minHeight: height }}
      >
        <strong>{name ?? "Specimen"} could not render</strong>
        <span>{this.state.message}</span>
      </div>
    );
  }
}

/**
 * Chrome styles. Prefixed and self-contained so they look the same in every app
 * and never depend on the app's tokens. The root does not set a font or text
 * colour, so specimens keep inheriting the app's own.
 *
 * Reuse the --lgac-* variables in the audit page's own stylesheet.
 */
const CANVAS_CSS = `
.lgac-root {
  /* The same grey as the Lunagraph canvas. */
  --lgac-bg: #f1f1f1;
  --lgac-surface: #ffffff;
  --lgac-border: #e3e3e3;
  --lgac-text: #18181b;
  --lgac-muted: #71717a;
  --lgac-hover: #f4f4f5;
  --lgac-accent: #1447e6;
  /* The same outline colours as the Lunagraph canvas: selection, and component instances. */
  --lgac-outline: oklch(0.623 0.214 259.815);
  --lgac-outline-component: oklch(0.627 0.265 303.9);
  --lgac-amber: #b45309;
  --lgac-amber-bg: #fef3c7;
  --lgac-radius: 12px;
  --lgac-shadow: 0 1px 2px rgba(24, 24, 27, 0.06), 0 8px 24px rgba(24, 24, 27, 0.08);
  --lgac-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --lgac-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  overflow: hidden;
  overflow: clip;
  background: var(--lgac-bg);
  overscroll-behavior: none;
}
.lgac-main {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  overflow: hidden;
  overflow: clip;
}
.lgac-sidebar {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 3;
  box-sizing: border-box;
  overflow: hidden;
  border-right: 1px solid var(--lgac-border);
  background: var(--lgac-surface);
  font: 13px/1.45 var(--lgac-font);
  color: var(--lgac-text);
}
.lgac-markers {
  position: absolute;
  inset: 0;
  overflow: hidden;
  overflow: clip;
  pointer-events: none;
}
.lgac-marker { position: absolute; top: 0; left: 0; display: none; pointer-events: auto; }
.lgac-marker:hover, .lgac-marker:focus-within { z-index: 2; }
.lgac-marker-pin {
  all: unset;
  box-sizing: border-box;
  display: grid;
  place-items: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 999px;
  background: var(--lgac-marker);
  color: #ffffff;
  font: 600 11px/1 var(--lgac-font);
  box-shadow: 0 0 0 2px #ffffff, 0 1px 4px rgba(0, 0, 0, 0.25);
  cursor: pointer;
}
/* A pin with no count is a small dot, so it marks a small specimen without hiding it. */
.lgac-marker-pin:empty { min-width: 12px; height: 12px; padding: 0; box-shadow: 0 0 0 2px #ffffff, 0 1px 3px rgba(0, 0, 0, 0.2); }
.lgac-marker-pin:focus-visible { outline: 2px solid var(--lgac-accent); outline-offset: 3px; }
.lgac-marker-card {
  position: absolute;
  top: 30px;
  right: 0;
  display: none;
  flex-direction: column;
  gap: 4px;
  box-sizing: border-box;
  width: 280px;
  padding: 12px 14px;
  border: 1px solid var(--lgac-border);
  border-radius: 10px;
  background: var(--lgac-surface);
  box-shadow: var(--lgac-shadow);
  font: 12px/1.45 var(--lgac-font);
  color: var(--lgac-muted);
  text-align: left;
}
/* Keeps the card open while the pointer moves from the pin to it. */
.lgac-marker-card::before { content: ""; position: absolute; top: -10px; left: 0; right: 0; height: 10px; }
.lgac-marker-card strong { display: flex; align-items: center; gap: 6px; color: var(--lgac-text); font-size: 13px; font-weight: 600; }
.lgac-marker-card strong::before { content: ""; flex: none; width: 8px; height: 8px; border-radius: 999px; background: var(--lgac-marker); }
.lgac-marker:hover .lgac-marker-card, .lgac-marker:focus-within .lgac-marker-card { display: flex; }
.lgac-marker-actions { display: flex; gap: 6px; margin-top: 6px; }
.lgac-marker-action {
  all: unset;
  padding: 4px 9px;
  border-radius: 6px;
  background: var(--lgac-hover);
  color: var(--lgac-text);
  font: 500 12px/1.3 var(--lgac-font);
  cursor: pointer;
}
.lgac-marker-action:hover { background: #e6e6e6; }
.lgac-marker-action:focus-visible { outline: 2px solid var(--lgac-accent); outline-offset: 1px; }
/* Portalled menus and dialogs, added to <body> after the canvas mounted: keep them above it. */
body > :not([data-lgac-app]) { z-index: 2147483600 !important; }
.lgac-viewport {
  position: absolute;
  inset: 0;
  /* clip, not hidden: a hidden box can still be scrolled by focus or find-in-page,
     which would move the content behind the camera's back. */
  overflow: hidden;
  overflow: clip;
  touch-action: none;
}
.lgac-world {
  position: absolute;
  top: 0;
  left: 0;
  width: max-content;
  transform-origin: 0 0;
  /* A drag across the canvas should not paint a text selection over it. */
  -webkit-user-select: none;
  user-select: none;
}
/* Opt back in for text worth copying, such as a file path. */
.lgac-world [data-canvas-text] {
  -webkit-user-select: text;
  user-select: text;
  cursor: text;
}
.lgac-outlines {
  position: absolute;
  inset: 0;
  overflow: hidden;
  overflow: clip;
  pointer-events: none;
}
/* Hover reads heavier than selection: 2px against 1px. The name sits on the top edge as plain text. */
.lgac-outline {
  --lgac-tone: var(--lgac-outline);
  position: absolute;
  top: 0;
  left: 0;
  display: none;
  box-sizing: border-box;
  outline: 2px solid var(--lgac-tone);
}
.lgac-outline[data-component] { --lgac-tone: var(--lgac-outline-component); }
.lgac-outline[data-outline="selected"] { outline-width: 1px; }
.lgac-outline-label {
  position: absolute;
  bottom: calc(100% + 3px);
  left: 0;
  min-width: 1em;
  max-width: var(--lgac-outline-width, 240px);
  overflow: hidden;
  color: var(--lgac-tone);
  font: 400 12px/16px var(--lgac-font);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lgac-outline-label:empty { display: none; }
.lgac-outline[data-label-inside] .lgac-outline-label {
  top: 3px;
  bottom: auto;
  left: 4px;
}
.lgac-overlay {
  position: absolute;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  max-width: calc(100% - 32px);
  font: 14px/1.4 var(--lgac-font);
  color: var(--lgac-text);
  overscroll-behavior: contain;
}
.lgac-top-left { top: 16px; left: 16px; }
.lgac-top-right { top: 16px; right: 16px; }
.lgac-bottom-right { bottom: 20px; right: 16px; align-items: flex-end; }
.lgac-bottom-left { bottom: 20px; left: 16px; }
.lgac-dock { bottom: 20px; left: 50%; transform: translateX(-50%); }
.lgac-panel {
  box-sizing: border-box;
  border: 1px solid var(--lgac-border);
  border-radius: var(--lgac-radius);
  background: var(--lgac-surface);
  box-shadow: var(--lgac-shadow);
  font: 14px/1.4 var(--lgac-font);
  color: var(--lgac-text);
}
.lgac-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
}
.lgac-button {
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 36px;
  border-radius: 8px;
  color: var(--lgac-muted);
  cursor: pointer;
  font: 500 13px/1 var(--lgac-font);
  font-variant-numeric: tabular-nums;
}
.lgac-button:hover { background: var(--lgac-hover); color: var(--lgac-text); }
.lgac-button:focus-visible { outline: 2px solid var(--lgac-accent); outline-offset: 1px; }
.lgac-button[aria-pressed="true"] { background: var(--lgac-hover); color: var(--lgac-text); }
.lgac-zoom { min-width: 52px; padding: 0 6px; color: var(--lgac-text); }
.lgac-divider {
  width: 1px;
  height: 20px;
  margin: 0 4px;
  background: var(--lgac-border);
}
.lgac-specimen {
  position: relative;
  flex: none;
  overflow: hidden;
}
.lgac-specimen-live { overflow: visible; width: max-content; max-width: 100%; }
.lgac-specimen-content { display: contents; }
.lgac-specimen-inner {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}
.lgac-specimen-error {
  display: flex;
  flex: none;
  flex-direction: column;
  justify-content: center;
  gap: 2px;
  box-sizing: border-box;
  max-width: 280px;
  padding: 10px 12px;
  overflow-wrap: anywhere;
  border: 1px dashed var(--lgac-border);
  border-radius: 8px;
  background: var(--lgac-surface);
  font: 12px/1.4 var(--lgac-font);
  color: var(--lgac-muted);
}
.lgac-specimen-error strong { color: var(--lgac-text); font-weight: 500; }
`;
