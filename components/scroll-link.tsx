"use client";

import type { ReactNode } from "react";

/** In-page anchor that reliably scrolls to its target every click. Next's
 *  <Link> only scrolls when the URL hash *changes*, so a second click on the
 *  same #target no-ops — this always calls scrollIntoView instead. Respects
 *  reduced-motion and the target's scroll-margin (scroll-mt-*). */
export function ScrollLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    const el = document.getElementById(href.replace(/^#/, ""));
    if (!el) return; // no target on this page — fall back to default behavior
    e.preventDefault();
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", href);
  }
  return (
    <a href={href} className={className} onClick={onClick}>
      {children}
    </a>
  );
}
