"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/feeds", label: "Feeds" },
  { href: "/trades", label: "Trades" },
  { href: "/pricing", label: "Pricing" },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="mx-auto max-w-6xl px-4 sm:px-6 pt-6 sm:pt-8">
      <div className="neo-raised-sm flex items-center gap-6 px-5 sm:px-7 py-3">
        {/* brand */}
        <Link
          href="/"
          onClick={() => setOpen(false)}
          className="flex items-center gap-2 font-semibold tracking-tight text-base sm:text-[15px] shrink-0"
        >
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl neo-raised-sm text-accent text-sm">
            ◐
          </span>
          <span>Signal Trade</span>
        </Link>

        {/* desktop links */}
        <div className="hidden md:flex items-center gap-1 ml-2 flex-1">
          {LINKS.map((l) => {
            const active = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                  active ? "text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {l.label}
                {active && (
                  <span className="absolute left-1/2 -translate-x-1/2 -bottom-0.5 w-1.5 h-1.5 rounded-full bg-accent" />
                )}
              </Link>
            );
          })}
        </div>

        {/* desktop CTA */}
        <Link
          href="/feeds"
          className="hidden md:inline-flex neo-button px-4 py-2 text-sm font-medium text-foreground items-center gap-2"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          Live Feed
        </Link>

        {/* mobile toggle */}
        <button
          aria-label="Toggle menu"
          onClick={() => setOpen((o) => !o)}
          className="md:hidden ml-auto neo-button w-10 h-10 flex items-center justify-center"
        >
          <span className="flex flex-col gap-1">
            <span className="block w-4 h-0.5 bg-foreground rounded" />
            <span className="block w-4 h-0.5 bg-foreground rounded" />
            <span className="block w-4 h-0.5 bg-foreground rounded" />
          </span>
        </button>
      </div>

      {/* mobile drawer */}
      {open && (
        <div className="md:hidden mt-3 neo-raised-sm flex flex-col p-3 gap-1">
          {LINKS.map((l) => {
            const active = isActive(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className={`px-4 py-3 rounded-2xl text-sm font-medium transition ${
                  active
                    ? "neo-pressed text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
