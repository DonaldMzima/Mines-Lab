import type { ReactNode } from "react";

export function WorkspaceHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <header className="lab-page-heading"><div><p className="lab-eyebrow">{eyebrow}</p><h1>{title}</h1><p className="lab-page-description">{description}</p></div>{actions && <div className="lab-header-actions">{actions}</div>}</header>;
}

export function WorkspaceMetrics({ items }: { items: { label: string; value: ReactNode; detail: string }[] }) {
  return <dl className="lab-metrics">{items.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}<small>{item.detail}</small></dd></div>)}</dl>;
}
