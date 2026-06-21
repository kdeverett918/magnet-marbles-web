import { Suspense, useEffect } from "react";
import { useGame } from "./game/store";
import { GameScene } from "./game/scene/GameScene";
import { MainMenu } from "./game/ui/MainMenu";
import { Hud } from "./game/ui/Hud";
import { Controls } from "./game/ui/Controls";
import { Overlays } from "./game/ui/Overlays";
import { installKeyboard } from "./game/input/controls";
import { sfx } from "./game/audio/sfx";

export function App() {
  const screen = useGame((s) => s.screen);

  useEffect(() => {
    const cleanup = installKeyboard();
    const wake = () => sfx.ensure();
    window.addEventListener("pointerdown", wake, { once: false });
    const noCtx = (e: Event) => e.preventDefault();
    window.addEventListener("contextmenu", noCtx);
    return () => {
      cleanup();
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("contextmenu", noCtx);
    };
  }, []);

  return (
    <div className="app">
      {screen === "menu" ? (
        <MainMenu />
      ) : (
        <>
          <div className="canvas-wrap">
            <Suspense fallback={<Loading />}>
              <GameScene />
            </Suspense>
          </div>
          <Hud />
          <Controls />
          <Overlays />
        </>
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="loading">
      <div className="spinner" />
      <div style={{ color: "var(--muted)", fontWeight: 700 }}>Setting up the table…</div>
    </div>
  );
}
