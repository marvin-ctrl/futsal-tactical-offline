import { useCallback, useEffect, useMemo, useRef } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent, PropsWithChildren, ReactNode } from "react";
import type { ViewportMode } from "../../types/ui";

interface AppFrameProps extends PropsWithChildren {
  viewportMode: ViewportMode;
  topBar: ReactNode;
  leftRail?: ReactNode;
  rightRail: ReactNode;
  bottomDock: ReactNode;
  devDrawer: ReactNode;
  rightRailWidth: number;
  bottomDockHeight: number;
  onSetRightRailWidth: (width: number) => void;
  onSetBottomDockHeight: (height: number) => void;
}

type SplitterAxis = "vertical" | "horizontal";

interface ShellBounds {
  right: {
    min: number;
    max: number;
  };
  bottom: {
    min: number;
    max: number;
  };
}

interface DragState {
  axis: SplitterAxis;
  startClientX: number;
  startClientY: number;
  startRightWidth: number;
  startBottomHeight: number;
  bounds: ShellBounds;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getShellBounds(shellWidth: number, shellHeight: number, viewportMode: ViewportMode, hasLeftRail: boolean): ShellBounds {
  const minCenterWidth = viewportMode === "compact" ? 440 : 520;
  const leftRailWidth = hasLeftRail ? (viewportMode === "compact" ? 108 : 124) : 0;
  const chromeWidth = leftRailWidth + (hasLeftRail ? 42 : 0) + 110;
  const rightMin = viewportMode === "compact" ? 248 : 268;
  const rightPreferredMax = viewportMode === "compact" ? 360 : 420;
  const rightMax = Math.max(rightMin, Math.min(rightPreferredMax, shellWidth - minCenterWidth - chromeWidth));

  const bottomMin = 112;
  const bottomPreferredMax = viewportMode === "compact" ? 220 : 260;
  const bottomMax = Math.max(bottomMin, Math.min(bottomPreferredMax, shellHeight - 320));

  return {
    right: {
      min: rightMin,
      max: rightMax
    },
    bottom: {
      min: bottomMin,
      max: bottomMax
    }
  };
}

export function AppFrame({
  viewportMode,
  topBar,
  leftRail,
  rightRail,
  bottomDock,
  devDrawer,
  rightRailWidth,
  bottomDockHeight,
  onSetRightRailWidth,
  onSetBottomDockHeight,
  children
}: AppFrameProps) {
  const shellRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const hasLeftRail = Boolean(leftRail);

  const currentBounds = useMemo(() => {
    if (typeof window === "undefined") {
      return getShellBounds(1366, 768, viewportMode, hasLeftRail);
    }

    return getShellBounds(window.innerWidth, window.innerHeight, viewportMode, hasLeftRail);
  }, [hasLeftRail, viewportMode]);

  const clampShellSizes = useCallback(() => {
    if (viewportMode === "fallback") {
      return;
    }

    const shell = shellRef.current;
    if (!shell) {
      return;
    }

    const bounds = getShellBounds(shell.clientWidth, shell.clientHeight, viewportMode, hasLeftRail);
    const nextRight = clamp(rightRailWidth, bounds.right.min, bounds.right.max);
    const nextBottom = clamp(bottomDockHeight, bounds.bottom.min, bounds.bottom.max);

    if (nextRight !== rightRailWidth) {
      onSetRightRailWidth(nextRight);
    }

    if (nextBottom !== bottomDockHeight) {
      onSetBottomDockHeight(nextBottom);
    }
  }, [
    bottomDockHeight,
    hasLeftRail,
    onSetBottomDockHeight,
    onSetRightRailWidth,
    rightRailWidth,
    viewportMode
  ]);

  useEffect(() => {
    clampShellSizes();
  }, [clampShellSizes]);

  useEffect(() => {
    if (viewportMode === "fallback") {
      return;
    }

    const shell = shellRef.current;
    if (!shell) {
      return;
    }

    const observer = new ResizeObserver(() => {
      clampShellSizes();
    });

    observer.observe(shell);
    return () => observer.disconnect();
  }, [clampShellSizes, viewportMode]);

  useEffect(() => {
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const dragState = dragRef.current;
      if (!dragState) {
        return;
      }

      if (dragState.axis === "vertical") {
        const deltaX = dragState.startClientX - event.clientX;
        const nextWidth = clamp(
          dragState.startRightWidth + deltaX,
          dragState.bounds.right.min,
          dragState.bounds.right.max
        );
        onSetRightRailWidth(nextWidth);
        return;
      }

      const deltaY = dragState.startClientY - event.clientY;
      const nextHeight = clamp(
        dragState.startBottomHeight + deltaY,
        dragState.bounds.bottom.min,
        dragState.bounds.bottom.max
      );
      onSetBottomDockHeight(nextHeight);
    };

    const handlePointerUp = () => {
      dragRef.current = null;
      document.body.style.removeProperty("user-select");
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      document.body.style.removeProperty("user-select");
    };
  }, [onSetBottomDockHeight, onSetRightRailWidth]);

  const startResize =
    (axis: SplitterAxis) =>
    (event: PointerEvent<HTMLButtonElement>) => {
      if (viewportMode === "fallback" || !shellRef.current) {
        return;
      }

      event.preventDefault();

      const shell = shellRef.current;
      dragRef.current = {
        axis,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startRightWidth: rightRailWidth,
        startBottomHeight: bottomDockHeight,
        bounds: getShellBounds(shell.clientWidth, shell.clientHeight, viewportMode, hasLeftRail)
      };
      document.body.style.userSelect = "none";
    };

  const nudgeResize =
    (axis: SplitterAxis) =>
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const step = event.shiftKey ? 24 : 12;

      if (axis === "vertical") {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
          return;
        }
        event.preventDefault();
        const delta = event.key === "ArrowLeft" ? step : -step;
        onSetRightRailWidth(clamp(rightRailWidth + delta, currentBounds.right.min, currentBounds.right.max));
        return;
      }

      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
        return;
      }

      event.preventDefault();
      const delta = event.key === "ArrowUp" ? step : -step;
      onSetBottomDockHeight(
        clamp(bottomDockHeight + delta, currentBounds.bottom.min, currentBounds.bottom.max)
      );
    };

  return (
    <main
      ref={shellRef}
      className={`app-frame viewport-${viewportMode}${leftRail ? "" : " app-frame--no-left"}`}
      style={
        viewportMode === "fallback"
          ? undefined
          : ({
              "--app-frame-right-width": `${rightRailWidth}px`,
              "--app-frame-bottom-height": `${bottomDockHeight}px`
            } as CSSProperties)
      }
    >
      <div className="app-frame__texture" />
      <header className="app-frame__top">{topBar}</header>
      {leftRail ? <aside className="app-frame__left">{leftRail}</aside> : null}
      <section className="app-frame__center">{children}</section>
      {viewportMode !== "fallback" ? (
        <button
          type="button"
          className="app-frame__splitter app-frame__splitter--vertical"
          role="separator"
          aria-label="Resize right panel"
          aria-orientation="vertical"
          aria-valuemin={currentBounds.right.min}
          aria-valuemax={currentBounds.right.max}
          aria-valuenow={rightRailWidth}
          onPointerDown={startResize("vertical")}
          onKeyDown={nudgeResize("vertical")}
        />
      ) : null}
      <aside className="app-frame__right">{rightRail}</aside>
      {viewportMode !== "fallback" ? (
        <button
          type="button"
          className="app-frame__splitter app-frame__splitter--horizontal"
          role="separator"
          aria-label="Resize bottom dock"
          aria-orientation="horizontal"
          aria-valuemin={currentBounds.bottom.min}
          aria-valuemax={currentBounds.bottom.max}
          aria-valuenow={bottomDockHeight}
          onPointerDown={startResize("horizontal")}
          onKeyDown={nudgeResize("horizontal")}
        />
      ) : null}
      <footer className="app-frame__bottom">{bottomDock}</footer>
      {devDrawer}
    </main>
  );
}
