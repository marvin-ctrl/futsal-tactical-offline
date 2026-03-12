import type { PropsWithChildren, ReactNode } from "react";
import type { ViewportMode } from "../../types/ui";

interface AppFrameProps extends PropsWithChildren {
  viewportMode: ViewportMode;
  topBar: ReactNode;
  leftRail: ReactNode;
  rightRail: ReactNode;
  bottomDock: ReactNode;
  devDrawer: ReactNode;
}

export function AppFrame({
  viewportMode,
  topBar,
  leftRail,
  rightRail,
  bottomDock,
  devDrawer,
  children
}: AppFrameProps) {
  return (
    <main className={`app-frame viewport-${viewportMode}`}>
      <div className="app-frame__texture" />
      <header className="app-frame__top">{topBar}</header>
      <aside className="app-frame__left">{leftRail}</aside>
      <section className="app-frame__center">{children}</section>
      <aside className="app-frame__right">{rightRail}</aside>
      <footer className="app-frame__bottom">{bottomDock}</footer>
      {devDrawer}
    </main>
  );
}
