'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Briefcase,
  CaretRight,
  FileText,
  Gear,
  House,
  Kanban,
  List,
  SignOut,
  UsersThree,
  X,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/bench', label: 'Today', icon: House, exact: true },
  { href: '/bench/requirements', label: 'Requirements', icon: Briefcase },
  { href: '/bench/candidates', label: 'Candidates', icon: UsersThree },
  { href: '/bench/pipeline', label: 'Pipeline', icon: Kanban },
];

const SECONDARY = [
  { href: '/dashboard', label: 'Resume tools', icon: FileText },
  { href: '/settings', label: 'AI settings', icon: Gear },
];

function isActive(pathname: string, href: string, exact?: boolean): boolean {
  return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  const linkClass = (active: boolean) =>
    cn(
      'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
      'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white',
      active
        ? 'bg-white/12 text-white font-medium'
        : 'text-bp-sidebar-text hover:bg-white/8 hover:text-white'
    );
  return (
    <>
      <ul className="flex flex-col gap-0.5">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(pathname, href, exact);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={linkClass(active)}
              >
                <Icon className="size-5" weight={active ? 'fill' : 'regular'} aria-hidden="true" />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
      <ul className="mt-auto flex flex-col gap-0.5 border-t border-white/10 pt-3">
        {SECONDARY.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} onClick={onNavigate} className={linkClass(false)}>
              <Icon className="size-5" aria-hidden="true" />
              {label}
              <CaretRight className="ml-auto size-3.5 opacity-60" aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function Brand() {
  return (
    <Link
      href="/bench"
      className="flex items-center gap-2.5 px-3 text-white focus-visible:outline-2 focus-visible:outline-white"
    >
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-md bg-white text-sm font-bold text-bp-pine-deep"
      >
        BP
      </span>
      <span className="text-base font-semibold tracking-tight">BenchPilot</span>
    </Link>
  );
}

function SignOutButton({ className }: { className?: string }) {
  return (
    <form action="/logout" method="post" className={className}>
      <button
        type="submit"
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-bp-sidebar-text hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
      >
        <SignOut className="size-5" aria-hidden="true" />
        Sign out
      </button>
    </form>
  );
}

/** Sidebar + content frame for every /bench page. */
export function WorkspaceShell({
  authEnabled,
  children,
}: {
  authEnabled: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? '/bench';
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-bp-canvas font-plex text-bp-ink antialiased">
      <a
        href="#workspace-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-bp-surface focus:px-4 focus:py-2"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col gap-6 bg-bp-pine-deep px-3 py-5 lg:flex">
        <Brand />
        <nav aria-label="Workspace" className="flex flex-1 flex-col">
          <NavLinks pathname={pathname} />
          {authEnabled && <SignOutButton className="mt-0.5" />}
        </nav>
      </aside>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-bp-pine-deep px-4 py-3 lg:hidden">
        <Brand />
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-controls="workspace-mobile-nav"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          className="rounded-md p-2 text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white"
        >
          {menuOpen ? (
            <X className="size-5" aria-hidden="true" />
          ) : (
            <List className="size-5" aria-hidden="true" />
          )}
        </button>
      </div>
      {menuOpen && (
        <nav
          id="workspace-mobile-nav"
          aria-label="Workspace"
          className="sticky top-14 z-20 flex flex-col gap-3 bg-bp-pine-deep px-3 pb-4 lg:hidden"
        >
          <NavLinks pathname={pathname} onNavigate={() => setMenuOpen(false)} />
          {authEnabled && <SignOutButton />}
        </nav>
      )}

      <main id="workspace-main" className="lg:pl-60">
        <div className="mx-auto w-full max-w-[90rem] px-4 py-6 md:px-8 md:py-8">{children}</div>
      </main>
    </div>
  );
}
