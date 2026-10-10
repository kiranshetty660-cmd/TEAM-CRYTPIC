"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShieldAlert,
  Search,
  Boxes,
  Bell,
  ShoppingCart,
  Cpu,
  Sparkles,
  CheckSquare,
  Lock,
  FlaskConical,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  ChevronDown,
  UserCheck,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { useUser } from "../lib/UserContext";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  badge?: string;
  highlight?: boolean;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    group: "Overview",
    items: [
      {
        href: "/",
        label: "Dashboard",
        icon: LayoutDashboard,
        description: "Live overview of stock alerts, urgent recalls, and key metrics",
      },
    ],
  },
  {
    group: "Operations",
    items: [
      {
        href: "/cases",
        label: "Recall Cases",
        icon: ShieldAlert,
        description: "Track and manage quality incidents and recall cases",
      },
      {
        href: "/trace",
        label: "Batch Traceability",
        icon: Search,
        description: "Trace medicine batches to hospitals and pharmacies",
      },
      {
        href: "/inventory",
        label: "Inventory",
        icon: Boxes,
        description: "View warehouse stock levels, expiry dates, and imports",
      },
      {
        href: "/notifications",
        label: "Notifications",
        icon: Bell,
        description: "Patient complaints, recall notices, and email/SMS broadcasts",
      },
      {
        href: "/purchase-orders",
        label: "Purchase Orders",
        icon: ShoppingCart,
        description: "Emergency replenishment orders and supplier procurement",
      },
    ],
  },
  {
    group: "Intelligence",
    items: [
      {
        href: "/agents",
        label: "AI Agents",
        icon: Cpu,
        description: "Autonomous agents checking safety, stock math, and rules",
      },
      {
        href: "/findings",
        label: "Findings & Advice",
        icon: Sparkles,
        description: "Plain-English summaries of risks and recommended actions",
      },
    ],
  },
  {
    group: "Governance",
    items: [
      {
        href: "/approvals",
        label: "Approvals",
        icon: CheckSquare,
        description: "Human-in-the-loop sign-offs required before executing actions",
      },
      {
        href: "/verify",
        label: "Audit & Ledger",
        icon: Lock,
        description: "Permanent audit log with SHA-256 tamper verification",
      },
    ],
  },
  {
    group: "Testing & Demos",
    items: [
      {
        href: "/recall-demo",
        label: "Recall Demo & CSV Test",
        icon: FlaskConical,
        description: "1-Click B2231 recall flow & custom expired CSV testing suite",
        highlight: true,
      },
    ],
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentUser, setCurrentUser, users } = useUser();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userDropdown, setUserDropdown] = useState(false);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Find current active item title
  const activeItem = NAV_GROUPS.flatMap((g) => g.items).find(
    (item) => item.href === pathname || (item.href !== "/" && pathname.startsWith(item.href))
  );
  const pageTitle = activeItem ? activeItem.label : "TraceRx Compliance Desk";
  const pageDescription = activeItem ? activeItem.description : "Arogya Pharma Distributors";

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col md:flex-row antialiased selection:bg-teal-100 selection:text-teal-900">
      {/* Mobile Backdrop */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 bg-slate-900/40 z-40 md:hidden backdrop-blur-xs transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Sidebar (Desktop Collapsible & Mobile Drawer) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col bg-white border-r border-slate-200 transition-all duration-200 ease-in-out md:sticky md:top-0 md:h-screen md:shrink-0 ${
          mobileOpen ? "translate-x-0 w-72" : "-translate-x-full md:translate-x-0"
        } ${collapsed ? "md:w-20" : "md:w-64"}`}
        aria-label="Main Navigation"
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 shrink-0">
          <Link href="/" className="flex items-center gap-2.5 overflow-hidden group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-xs shrink-0 group-hover:opacity-95 transition">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            {(!collapsed || mobileOpen) && (
              <div className="min-w-0 transition-opacity">
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-base tracking-tight text-slate-900 leading-none">TraceRx</span>
                  <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 leading-none">
                    Arogya
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">Medicine Safety Desk</p>
              </div>
            )}
          </Link>

          {/* Mobile close button */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            aria-label="Close navigation drawer"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Desktop collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex items-center justify-center w-7 h-7 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Links */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {NAV_GROUPS.map((group) => (
            <div key={group.group} className="space-y-1">
              {(!collapsed || mobileOpen) && (
                <div className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  {group.group}
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={collapsed ? item.label : undefined}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all group relative min-h-[38px] ${
                      isActive
                        ? "bg-blue-50 text-blue-700 font-semibold shadow-xs"
                        : "text-slate-600 hover:text-slate-900 hover:bg-slate-50 font-medium"
                    } ${collapsed && !mobileOpen ? "justify-center px-0" : ""}`}
                  >
                    <span
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition ${
                        isActive
                          ? "bg-blue-100 text-blue-600"
                          : "bg-slate-100 text-slate-500 group-hover:bg-slate-200/80 group-hover:text-slate-700"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                    </span>
                    {(!collapsed || mobileOpen) && (
                      <div className="flex-1 min-w-0 flex items-center justify-between">
                        <span className={`truncate ${isActive ? "text-blue-700 font-semibold" : "text-slate-700 group-hover:text-slate-900"}`}>
                          {item.label}
                        </span>
                        {item.badge && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                            {item.badge}
                          </span>
                        )}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>

        {/* Sidebar Footer: Quick Demo Recall Shortcut */}
        {(!collapsed || mobileOpen) && (
          <div className="p-3 border-t border-slate-200 bg-slate-50/70">
            <Link
              href="/recall-demo"
              className="block p-3 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-blue-300 hover:shadow-md transition group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wide">B2231 Recall Demo</span>
                <ArrowRight className="w-3.5 h-3.5 text-blue-600 group-hover:translate-x-0.5 transition" />
              </div>
              <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                Step-by-step recall workflow & custom expired CSV tests.
              </p>
            </Link>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setMobileOpen(true)}
              className="md:hidden p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 min-h-[40px] min-w-[40px] flex items-center justify-center"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Dynamic Page Header Title */}
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight truncate leading-tight">
                {pageTitle}
              </h1>
              <p className="text-[11px] text-slate-500 hidden sm:block truncate leading-tight">
                {pageDescription}
              </p>
            </div>
          </div>

          {/* Right Header Controls: Network Status & Demo Persona Switcher */}
          <div className="flex items-center gap-3">
            {/* Live Status Pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live System</span>
            </div>

            {/* Demo Persona Switcher */}
            <div className="relative">
              <button
                onClick={() => setUserDropdown(!userDropdown)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition min-h-[40px]"
                aria-label="Switch active user persona"
              >
                <div
                  className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0 ${currentUser.avatar}`}
                >
                  {currentUser.initials}
                </div>
                <div className="text-left hidden lg:block">
                  <div className="text-xs font-semibold text-slate-900 leading-tight truncate max-w-[120px]">
                    {currentUser.name}
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium capitalize truncate">
                    {currentUser.role}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              </button>

              {userDropdown && (
                <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-1.5rem)] bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-50 animate-in fade-in duration-150 max-h-[80vh] overflow-y-auto">
                  <div className="px-3 py-2 border-b border-slate-100 mb-1">
                    <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                      Demo Persona Switcher
                    </p>
                    <p className="text-[11px] text-slate-500">Switch user role to test approvals</p>
                  </div>
                  <div className="space-y-1">
                    {users.map((u) => (
                      <button
                        key={u.id}
                        onClick={() => {
                          setCurrentUser(u);
                          setUserDropdown(false);
                        }}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs transition ${
                          currentUser.id === u.id
                            ? "bg-teal-50 border border-teal-200 text-teal-900 font-medium"
                            : "hover:bg-slate-50 text-slate-700"
                        }`}
                      >
                        <div className={`w-7 h-7 rounded-md flex items-center justify-center font-bold shrink-0 ${u.avatar}`}>
                          {u.initials}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-900 truncate">{u.name}</div>
                          <div className="text-[11px] text-slate-500 truncate">{u.roleTitle}</div>
                        </div>
                        {currentUser.id === u.id && <UserCheck className="w-4 h-4 text-teal-700 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content Viewport */}
        <main className="flex-1 bg-white p-3.5 sm:p-6 lg:p-8 pb-24 md:pb-8 max-w-7xl w-full mx-auto overflow-x-hidden">
          {children}
        </main>

        {/* Mobile Bottom Navigation Bar (Phone Screens < 768px, ~390px) */}
        <nav
          className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 md:hidden flex items-center justify-around h-16 px-1 shadow-lg"
          aria-label="Mobile Bottom Navigation"
        >
          <Link
            href="/"
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center min-w-[56px] transition ${
              pathname === "/" ? "text-blue-600 font-bold" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <div className={`p-1 rounded-lg ${pathname === "/" ? "bg-blue-50" : ""}`}>
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <span className="text-[10px] leading-tight tracking-tight mt-0.5">Home</span>
          </Link>

          <Link
            href="/recall-demo"
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center min-w-[56px] relative transition ${
              pathname === "/recall-demo" ? "text-rose-700 font-bold" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <div className={`p-1 rounded-lg ${pathname === "/recall-demo" ? "bg-rose-50" : ""}`}>
              <FlaskConical className="w-5 h-5" />
            </div>
            <span className="text-[10px] leading-tight tracking-tight mt-0.5">B2231 Demo</span>
            <span className="absolute top-2 right-1/4 w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
          </Link>

          <Link
            href="/cases"
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center min-w-[56px] transition ${
              pathname === "/cases" ? "text-blue-600 font-bold" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <div className={`p-1 rounded-lg ${pathname === "/cases" ? "bg-blue-50" : ""}`}>
              <ShieldAlert className="w-5 h-5" />
            </div>
            <span className="text-[10px] leading-tight tracking-tight mt-0.5">Cases</span>
          </Link>

          <Link
            href="/approvals"
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-center min-w-[56px] transition ${
              pathname === "/approvals" ? "text-blue-600 font-bold" : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <div className={`p-1 rounded-lg ${pathname === "/approvals" ? "bg-blue-50" : ""}`}>
              <CheckSquare className="w-5 h-5" />
            </div>
            <span className="text-[10px] leading-tight tracking-tight mt-0.5">Approvals</span>
          </Link>

          <button
            onClick={() => setMobileOpen(true)}
            className="flex flex-col items-center justify-center flex-1 h-full py-1 text-center min-w-[56px] text-slate-500 hover:text-slate-800 transition"
            aria-label="Open more navigation menu"
          >
            <div className="p-1 rounded-lg">
              <Menu className="w-5 h-5" />
            </div>
            <span className="text-[10px] leading-tight tracking-tight mt-0.5">Menu</span>
          </button>
        </nav>
      </div>
    </div>
  );
}
