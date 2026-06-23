import { Component, type ErrorInfo, type ReactNode } from "react";
import { PROGRESSION_KEY } from "../data/progression";
import { SETTINGS_KEY, TUTORIAL_KEY } from "../store";

const RECOVERY_STORAGE_KEYS = [SETTINGS_KEY, PROGRESSION_KEY, TUTORIAL_KEY] as const;

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
  supportCode: string;
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message || error.name;
  return String(error || "Unknown error");
}

export function supportCodeForError(error: unknown, componentStack = "") {
  const source = `${errorMessage(error)}|${error instanceof Error ? error.stack || "" : ""}|${componentStack}`;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `MM-${(hash >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(0, 7)}`;
}

function browserStorage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function clearCrashRecoveryStorage(storage: Pick<Storage, "removeItem"> | null = browserStorage()) {
  if (!storage) return 0;
  let cleared = 0;
  for (const key of RECOVERY_STORAGE_KEYS) {
    try {
      storage.removeItem(key);
      cleared += 1;
    } catch {
      // Embedded/private browsers can deny storage access; reload still remains useful.
    }
  }
  return cleared;
}

function reloadPage() {
  if (typeof window !== "undefined") window.location.reload();
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, supportCode: "" };

  static getDerivedStateFromError(error: unknown): State {
    return {
      error: error instanceof Error ? error : new Error(errorMessage(error)),
      supportCode: supportCodeForError(error),
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const supportCode = supportCodeForError(error, info.componentStack ?? "");
    this.setState({ supportCode });
    console.error("[Magnet Marbles] recovered from render crash", {
      supportCode,
      error,
      componentStack: info.componentStack,
    });
  }

  private reload = () => {
    reloadPage();
  };

  private resetAndReload = () => {
    clearCrashRecoveryStorage();
    reloadPage();
  };

  render() {
    const { error, supportCode } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="crash-screen" role="alert" aria-live="assertive">
        <section className="crash-card" aria-labelledby="crash-title">
          <span className="section-label">Recovery</span>
          <h1 id="crash-title">Table reset needed</h1>
          <p>
            Magnet Marbles hit a runtime error before it could keep the match stable. Reloading usually
            recovers without changing your local progress.
          </p>
          <div className="crash-code" aria-label={`Support code ${supportCode}`}>
            <small>Support code</small>
            <strong>{supportCode}</strong>
          </div>
          <div className="crash-actions">
            <button type="button" className="btn primary" onClick={this.reload}>
              Reload
            </button>
            <button type="button" className="btn ghost" onClick={this.resetAndReload}>
              Reset local data
            </button>
          </div>
          <p className="crash-note">
            Reset local data only clears this game's settings, tutorial flag, stars, records, daily streaks,
            and cosmetics on this device.
          </p>
        </section>
      </main>
    );
  }
}
