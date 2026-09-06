import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";

export interface ViewTransform { x: number; y: number; scale: number }
export const MIN_TREE_SCALE = 0.35;
export const MAX_TREE_SCALE = 6;

export function clampTreeScale(scale: number) {
  return Math.min(MAX_TREE_SCALE, Math.max(MIN_TREE_SCALE, scale));
}

interface SvgViewportMetrics {
  screenScaleX: number;
  screenScaleY: number;
}

export interface PanZoomOptions {
  /**
   * When supplied, high-frequency gesture frames are written directly to the
   * rendered surface. React state is committed once at gesture end, avoiding a
   * complete graph reconciliation for every pointer move.
   */
  onTransientView?: (view: ViewTransform) => void;
  onInteractionChange?: (active: boolean) => void;
  wheelCommitDelayMs?: number;
}

export function screenDeltaToSvgUnits(
  delta: { x: number; y: number },
  metrics: SvgViewportMetrics,
) {
  return {
    x: delta.x / Math.max(Number.EPSILON, metrics.screenScaleX),
    y: delta.y / Math.max(Number.EPSILON, metrics.screenScaleY),
  };
}

/**
 * iOS WebKit still emits proprietary gesture events for a two-finger pinch on
 * some SVG roots, even when touch-action is none. Cancelling those events keeps
 * the browser from page-zooming and rebuilding the large SVG compositing layer.
 */
export function bindNativeTreeGestureGuardV55(element: SVGSVGElement) {
  const preventNativeZoom = (event: Event) => event.preventDefault();
  const eventNames = ["gesturestart", "gesturechange", "gestureend"] as const;
  eventNames.forEach((name) => element.addEventListener(name, preventNativeZoom, { passive: false }));
  return () => eventNames.forEach((name) => element.removeEventListener(name, preventNativeZoom));
}

function viewportMetrics(svg: SVGSVGElement): SvgViewportMetrics {
  const matrix = svg.getScreenCTM?.();
  if (matrix) {
    return {
      screenScaleX: Math.hypot(matrix.a, matrix.b),
      screenScaleY: Math.hypot(matrix.c, matrix.d),
    };
  }
  const rect = svg.getBoundingClientRect();
  const viewBox = svg.viewBox.baseVal;
  const scale = Math.min(
    rect.width / Math.max(1, viewBox.width),
    rect.height / Math.max(1, viewBox.height),
  );
  return { screenScaleX: scale, screenScaleY: scale };
}

function clientPointToSvg(svg: SVGSVGElement, clientX: number, clientY: number) {
  const rect = svg.getBoundingClientRect();
  const metrics = viewportMetrics(svg);
  const viewBox = svg.viewBox.baseVal;
  const renderedWidth = viewBox.width * metrics.screenScaleX;
  const renderedHeight = viewBox.height * metrics.screenScaleY;
  return {
    x: viewBox.x + (clientX - rect.left - (rect.width - renderedWidth) / 2) / metrics.screenScaleX,
    y: viewBox.y + (clientY - rect.top - (rect.height - renderedHeight) / 2) / metrics.screenScaleY,
  };
}

export function usePanZoom(
  initial: ViewTransform = { x: 0, y: 0, scale: 0.95 },
  options: PanZoomOptions = {},
) {
  const [view, setCommittedView] = useState(initial);
  const liveView = useRef(initial);
  const committedView = useRef(initial);
  const onTransientView = useRef(options.onTransientView);
  const onInteractionChange = useRef(options.onInteractionChange);
  const wheelCommitDelayMs = useRef(options.wheelCommitDelayMs ?? 110);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastPan = useRef<{ x: number; y: number } | null>(null);
  const lastPinch = useRef<{ distance: number; midpoint: { x: number; y: number } } | null>(null);
  const pointerTravel = useRef(0);
  const suppressPointerClick = useRef(false);
  const suppressionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateFrame = useRef<number | null>(null);
  const queuedView = useRef<ViewTransform | null>(null);
  const wheelCommitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onTransientView.current = options.onTransientView;
    onInteractionChange.current = options.onInteractionChange;
    wheelCommitDelayMs.current = options.wheelCommitDelayMs ?? 110;
  }, [options.onInteractionChange, options.onTransientView, options.wheelCommitDelayMs]);

  const renderTransientView = useCallback((next: ViewTransform) => {
    liveView.current = next;
    onTransientView.current?.(next);
  }, []);

  const applyQueuedView = useCallback(() => {
    updateFrame.current = null;
    if (!queuedView.current) return;
    const next = queuedView.current;
    queuedView.current = null;
    renderTransientView(next);
    if (!onTransientView.current) {
      committedView.current = next;
      setCommittedView(next);
    }
  }, [renderTransientView]);

  const queueView = useCallback((next: ViewTransform) => {
    queuedView.current = next;
    if (updateFrame.current !== null) return;
    updateFrame.current = window.requestAnimationFrame(applyQueuedView);
  }, [applyQueuedView]);

  const commitLiveView = useCallback(() => {
    if (updateFrame.current !== null) {
      window.cancelAnimationFrame(updateFrame.current);
      updateFrame.current = null;
    }
    if (queuedView.current) {
      renderTransientView(queuedView.current);
      queuedView.current = null;
    }
    const next = liveView.current;
    if (
      next.x !== committedView.current.x
      || next.y !== committedView.current.y
      || next.scale !== committedView.current.scale
    ) {
      committedView.current = next;
      setCommittedView(next);
    }
  }, [renderTransientView]);

  const setView = useCallback((update: SetStateAction<ViewTransform>) => {
    const base = queuedView.current ?? liveView.current;
    const next = typeof update === "function" ? update(base) : update;
    if (updateFrame.current !== null) {
      window.cancelAnimationFrame(updateFrame.current);
      updateFrame.current = null;
    }
    queuedView.current = null;
    renderTransientView(next);
    committedView.current = next;
    setCommittedView(next);
  }, [renderTransientView]);

  const onWheel = useCallback((event: React.WheelEvent<SVGSVGElement>) => {
    event.preventDefault();
    const point = clientPointToSvg(event.currentTarget, event.clientX, event.clientY);
    const current = queuedView.current ?? liveView.current;
    const nextScale = clampTreeScale(current.scale * Math.exp(-event.deltaY * 0.0014));
    const ratio = nextScale / current.scale;
    queueView({
      x: point.x - (point.x - current.x) * ratio,
      y: point.y - (point.y - current.y) * ratio,
      scale: nextScale,
    });
    if (onTransientView.current) {
      onInteractionChange.current?.(true);
      if (wheelCommitTimer.current) clearTimeout(wheelCommitTimer.current);
      wheelCommitTimer.current = setTimeout(() => {
        commitLiveView();
        onInteractionChange.current?.(false);
        wheelCommitTimer.current = null;
      }, wheelCommitDelayMs.current);
    }
  }, [commitLiveView, queueView]);

  const onPointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (pointers.current.size === 0) {
      if (suppressionTimer.current) clearTimeout(suppressionTimer.current);
      pointerTravel.current = 0;
      suppressPointerClick.current = false;
      onInteractionChange.current?.(true);
    }
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 1) lastPan.current = { x: event.clientX, y: event.clientY };
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      lastPinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        midpoint: clientPointToSvg(event.currentTarget, (a.x + b.x) / 2, (a.y + b.y) / 2),
      };
    }
  }, []);

  const onPointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const currentView = () => queuedView.current ?? liveView.current;

    if (pointers.current.size === 1 && lastPan.current) {
      const dx = event.clientX - lastPan.current.x;
      const dy = event.clientY - lastPan.current.y;
      pointerTravel.current += Math.hypot(dx, dy);
      if (pointerTravel.current > 5) {
        suppressPointerClick.current = true;
        if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      }
      lastPan.current = { x: event.clientX, y: event.clientY };
      const delta = screenDeltaToSvgUnits({ x: dx, y: dy }, viewportMetrics(event.currentTarget));
      const base = currentView();
      queueView({ ...base, x: base.x + delta.x, y: base.y + delta.y });
    } else if (pointers.current.size === 2) {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      const midpoint = clientPointToSvg(event.currentTarget, (a.x + b.x) / 2, (a.y + b.y) / 2);
      const previous = lastPinch.current;
      if (previous && previous.distance > 0) {
        const ratio = distance / previous.distance;
        const base = currentView();
        const nextScale = clampTreeScale(base.scale * ratio);
        const appliedRatio = nextScale / base.scale;
        queueView({
          x: midpoint.x - (previous.midpoint.x - base.x) * appliedRatio,
          y: midpoint.y - (previous.midpoint.y - base.y) * appliedRatio,
          scale: nextScale,
        });
      }
      suppressPointerClick.current = true;
      lastPinch.current = { distance, midpoint };
    }
  }, [queueView]);

  const endPointer = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size === 0) {
      if (onTransientView.current) commitLiveView();
      onInteractionChange.current?.(false);
      lastPan.current = null;
      lastPinch.current = null;
      if (suppressPointerClick.current) {
        suppressionTimer.current = setTimeout(() => {
          suppressPointerClick.current = false;
          suppressionTimer.current = null;
        }, 0);
      }
    } else if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      lastPan.current = p;
      lastPinch.current = null;
    }
  }, [commitLiveView]);

  const consumePointerClick = useCallback(() => {
    const suppressed = suppressPointerClick.current;
    suppressPointerClick.current = false;
    return suppressed;
  }, []);

  const resetView = useCallback(() => {
    setView(initial);
    onInteractionChange.current?.(false);
  }, [initial, setView]);

  useEffect(() => () => {
    if (updateFrame.current !== null) window.cancelAnimationFrame(updateFrame.current);
    if (suppressionTimer.current) clearTimeout(suppressionTimer.current);
    if (wheelCommitTimer.current) clearTimeout(wheelCommitTimer.current);
  }, []);

  return {
    view,
    setView,
    resetView,
    consumePointerClick,
    bind: { onWheel, onPointerDown, onPointerMove, onPointerUp: endPointer, onPointerCancel: endPointer },
  };
}
