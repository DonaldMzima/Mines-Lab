"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useAppState } from "@/components/app-provider";

/** Keeps secondary pages available without competing with the one-screen game flow. */
export function AppShell({ children }: { children: ReactNode }) {
  const { preferences, notice, dismissNotice } = useAppState();
  return (
    <main className={`simple-app-shell ${preferences.theme === "light" ? "theme-light" : ""}`}>
      <header className="simple-app-bar"><Link href="/" className="simple-app-brand">Mines Lab</Link><nav className="simple-app-links" aria-label="Main navigation"><Link href="/history">History</Link><Link href="/signals">Signals</Link><Link href="/football">Football</Link><a href="https://t.me/MinesLabSignalsBot" target="_blank" rel="noreferrer">Telegram</a><Link href="/settings">Settings</Link></nav></header>
      <div className="simple-app-content">{notice && <div className="simple-app-notice" role="status"><span>{notice}</span><button type="button" aria-label="Dismiss message" onClick={dismissNotice}>×</button></div>}{children}</div>
    </main>
  );
}
