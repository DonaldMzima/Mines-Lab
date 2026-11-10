"use client";

import { useId } from "react";

/** Supplied vector artwork, with transparent margins trimmed and theme-aware lettering. */
export function BrandLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  const gradientId = useId();
  return <svg className={className} xmlns="http://www.w3.org/2000/svg" width={390} height={compact ? 225 : 245} viewBox={compact ? "90 75 390 225" : "90 75 390 245"} role="img" aria-label="The Winning Edge">
    <defs><linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#B85CFF" /><stop offset="1" stopColor="#6932F5" /></linearGradient></defs>
    <path d="M160 149 C285 74 427 82 460 118 C476 135 467 157 456 171 C465 126 415 112 352 114 C272 117 202 136 160 149Z" fill={"url(#" + gradientId + ")"} />
    <path d="M107 249 C145 284 215 273 254 256 C208 292 142 307 112 283 C97 272 97 260 107 249Z" fill={"url(#" + gradientId + ")"} />
    <text x="280" y="246" fill="currentColor" fontFamily="Arial Black, Arial, Helvetica, sans-serif" fontWeight="900" fontSize="150" fontStyle="italic" letterSpacing="-14" textAnchor="middle">WE</text>
    <path d="M330 219 H401 L390 237 H319Z" fill={"url(#" + gradientId + ")"} />
    {!compact && <text x="280" y="305" fill="currentColor" fontFamily="Arial, Helvetica, sans-serif" fontSize="20" fontWeight="700" letterSpacing="8" textAnchor="middle">WINNING EDGE</text>}
  </svg>;
}
