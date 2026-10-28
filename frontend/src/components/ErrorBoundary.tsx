import { Component, type ReactNode } from "react";
import i18n from "../i18n";

// Catches a crash in a page so the rest of the app (menus, tab bar) keeps
// working, and offers a reload. Layout re-keys it per route, so moving to
// another page starts fresh.
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[ErrorBoundary]", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center" role="alert">
        <span className="h-3 w-3 rounded-full bg-jz-red" aria-hidden />
        <h1 className="mt-5 text-lg font-bold text-jz-ink">{i18n.t("errors.crashTitle")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">{i18n.t("errors.crashBody")}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-6 rounded-full bg-jz-red px-6 py-2.5 text-sm font-bold text-white"
        >
          {i18n.t("errors.reload")}
        </button>
      </div>
    );
  }
}
