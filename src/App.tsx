import { Suspense, useEffect } from "react";
import { useGame } from "./game/store";
import { GameScene } from "./game/scene/GameScene";
import { MainMenu } from "./game/ui/MainMenu";
import { Hud } from "./game/ui/Hud";
import { Controls } from "./game/ui/Controls";
import { Overlays } from "./game/ui/Overlays";
import { installKeyboard, resetInput } from "./game/input/controls";
import { sfx } from "./game/audio/sfx";
import { haptics } from "./game/haptics/haptics";

export function App() {
  const screen = useGame((s) => s.screen);
  const sound = useGame((s) => s.settings.sound);
  const sfxVolume = useGame((s) => s.settings.sfxVolume);
  const hapticsOn = useGame((s) => s.settings.haptics);
  const online = useGame((s) => s.online);
  const setPaused = useGame((s) => s.setPaused);
  const togglePaused = useGame((s) => s.togglePaused);

  useEffect(() => {
    sfx.setEnabled(sound);
    sfx.setVolume(sfxVolume);
    haptics.setEnabled(hapticsOn);
    const cleanup = installKeyboard();
    const wake = () => {
      if (sound) sfx.ensure();
    };
    const keyPause = (e: KeyboardEvent) => {
      if (e.code !== "Escape" || e.repeat) return;
      if (screen !== "game" || online) return;
      e.preventDefault();
      resetInput();
      togglePaused();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden" && screen === "game" && !online) {
        resetInput();
        setPaused(true);
      }
    };
    window.addEventListener("pointerdown", wake, { once: false });
    window.addEventListener("keydown", keyPause);
    document.addEventListener("visibilitychange", visibility);
    const noCtx = (e: Event) => e.preventDefault();
    window.addEventListener("contextmenu", noCtx);
    return () => {
      cleanup();
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", keyPause);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("contextmenu", noCtx);
    };
  }, [hapticsOn, online, screen, setPaused, sound, sfxVolume, togglePaused]);

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
