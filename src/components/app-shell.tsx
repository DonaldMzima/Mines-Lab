"use client";

import Link from "next/link";
import { BrandLogo } from "./brand-logo";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAppState } from "@/components/app-provider";
import { useHelp } from "@/components/help-provider";

const groups = [
  { label: "Workspace", items: [{ href: "/", label: "Overview", short: "OV" }] },
  { label: "Game analysis", items: [{ href: "/#game-analysis", label: "Game modules", short: "GM" }, { href: "/signals", label: "Signals", short: "SG" }, { href: "/history", label: "History", short: "HI" }] },
  { label: "Football", items: [{ href: "/football", label: "Generate tickets", short: "FT" }, { href: "/football#saved-tickets", label: "Saved tickets", short: "ST" }, { href: "/football#match-analysis", label: "Match analysis", short: "MA" }] },
  { label: "Integrations", items: [{ href: "/football#telegram-link", label: "Telegram", short: "TG" }, { href: "/settings#game-connection", label: "Game connection", short: "GC" }] },
  { label: "Preferences", items: [{ href: "/settings", label: "Settings", short: "SE" }] },
];
const titles: Record<string, string> = { "/": "Overview", "/football": "Football Lab", "/history": "Round history", "/signals": "Signal workspace", "/settings": "Settings" };

export function AppShell({ children }: { children: ReactNode }) {
  const { preferences, updatePreferences, notice, dismissNotice } = useAppState();
  const { openTutorial } = useHelp();
  const pathname = usePathname();
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme;
  }, [preferences.theme]);
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const drawer = useRef<HTMLDialogElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => { drawer.current?.close(); setDrawerOpen(false); };
  useEffect(() => {
    const query = window.matchMedia("(min-width: 960px)");
    const closeOnDesktop = () => { if (query.matches) { drawer.current?.close(); setDrawerOpen(false); } };
    query.addEventListener("change", closeOnDesktop);
    return () => query.removeEventListener("change", closeOnDesktop);
  }, []);
  function themeControl() {
    return <button type="button" className="lab-appearance-control" role="switch" aria-label="Dark mode" aria-checked={preferences.theme === "dark"} title={preferences.theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} onClick={() => updatePreferences({ ...preferences, theme: preferences.theme === "dark" ? "light" : "dark" })}>
      <span className="lab-appearance-copy">Dark mode</span>
      <span className="lab-appearance-track" aria-hidden="true"><span className="lab-appearance-thumb" /></span>
    </button>;
  }
  function navigation(mobile = false) {
    return <nav aria-label={mobile ? "Mobile navigation" : "Main navigation"}>{groups.map(group => {
      const stateKey = pathname + ":" + group.label;
      const open = openGroups[stateKey] ?? group.items.some(item => item.href === pathname);
      const compact = collapsed && !mobile;
      const contentId = "lab-nav-" + (mobile ? "mobile-" : "desktop-") + group.label.toLowerCase().replaceAll(" ", "-");
      return <div className="lab-nav-group" key={group.label}>
        {group.label === "Workspace" ? <p className="lab-nav-label">{group.label}</p> : <button type="button" className="lab-nav-category" aria-expanded={open} aria-controls={contentId} onClick={() => setOpenGroups(values => ({ ...values, [stateKey]: !open }))}><span>{group.label}</span><span className="lab-category-indicator" aria-hidden="true">{open ? "−" : "+"}</span></button>}
        <div id={contentId} hidden={group.label !== "Workspace" && !open && !compact}>{group.items.map(item => <Link prefetch={false} key={item.href} href={item.href} className={"lab-nav-link" + (pathname === item.href ? " is-active" : "")} aria-current={pathname === item.href ? "page" : undefined} title={item.label} aria-label={item.label} onClick={closeDrawer}><span className="lab-nav-monogram" aria-hidden="true">{item.short}</span><span className="lab-nav-text">{item.label}</span></Link>)}</div>
      </div>;
    })}<button type="button" className="lab-nav-link" title="Help and tutorial" onClick={() => { closeDrawer(); openTutorial(); }}><span className="lab-nav-monogram" aria-hidden="true">?</span><span className="lab-nav-text">Help &amp; tutorial</span></button></nav>;
  }

  return <div className={"simple-app-shell lab-shell" + (collapsed ? " is-collapsed" : "") + (preferences.theme === "light" ? " theme-light" : "")}>
    <a className="lab-skip" href="#workspace-content">Skip to content</a>
    <aside className="lab-sidebar" aria-label="Workspace sidebar"><Link href="/" className="lab-brand" aria-label="The Winning Edge home"><BrandLogo className="lab-logo-full" /><BrandLogo className="lab-logo-compact" compact /></Link>{navigation()}<div className="lab-sidebar-footer">{themeControl()}<span className="lab-nav-text">Experimental analysis.<br />Transparent limitations.</span><button type="button" className="lab-collapse" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? "Expand" : "Collapse sidebar"}</button></div></aside>
    <div className="lab-main"><header className="lab-topbar"><div className="lab-topbar-start"><button type="button" className="lab-mobile-toggle secondary-button" aria-haspopup="dialog" aria-controls="lab-mobile-nav" aria-expanded={drawerOpen} onClick={() => { drawer.current?.showModal(); setDrawerOpen(true); }}>Menu</button><div className="lab-breadcrumb"><span>Workspace</span><span aria-hidden="true">/</span><strong>{titles[pathname] ?? "The Winning Edge"}</strong></div></div><div className="lab-topbar-actions"><span className="lab-environment">Analysis &amp; planning</span><a className="lab-bot-link" href="https://t.me/MinesLabSignalsBot" target="_blank" rel="noreferrer">Telegram bot</a><button type="button" className="text-button" onClick={openTutorial}>Quick guide</button></div></header>
    <main id="workspace-content" tabIndex={-1} className="simple-app-content lab-content">{notice && <div className="simple-app-notice" role="status"><span>{notice}</span><button type="button" aria-label="Dismiss message" onClick={dismissNotice}>×</button></div>}{children}<footer className="lab-page-footer"><span>The Winning Edge · Game analysis &amp; football planning</span><span>Estimates are not guarantees.</span></footer></main></div>
    <dialog ref={drawer} id="lab-mobile-nav" className="lab-mobile-drawer" aria-label="Workspace navigation" onClose={() => setDrawerOpen(false)} onClick={event => { if (event.target === event.currentTarget) closeDrawer(); }}><div className="lab-drawer-inner"><div className="lab-drawer-heading"><Link href="/" className="lab-mobile-brand" aria-label="The Winning Edge home" onClick={closeDrawer}><BrandLogo /></Link><button type="button" className="secondary-button" onClick={closeDrawer}>Close menu</button></div>{navigation(true)}<div className="lab-drawer-appearance">{themeControl()}</div></div></dialog>
  </div>;
}
