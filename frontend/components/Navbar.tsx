"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ShieldAlert,
  Search,
  CheckSquare,
  Boxes,
  Lock,
  ChevronDown,
  UserCheck,
  Activity,
  Menu,
  X,
} from "lucide-react";
import { useUser } from "../lib/UserContext";

export function Navbar() {
  const pathname = usePathname();
  const { currentUser, setCurrentUser, users } = useUser();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: "/", label: "Compliance Board", icon: Activity },
    { href: "/trace", label: "Batch Trace", icon: Search },
    { href: "/approvals", label: "Approvals Queue", icon: CheckSquare },
    { href: "/inventory", label: "Batch Inventory", icon: Boxes },
    { href: "/verify", label: "Ledger & Verify", icon: Lock },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-lg bg-slate-900 flex items-center justify-center text-white shadow-sm transition">
              <ShieldAlert className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-bold tracking-tight text-slate-900 font-sans">TraceRx</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  Arogya Pharma
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium hidden sm:block">Agentic Compliance Intelligence</p>
            </div>
          </Link>
        </div>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  isActive
                    ? "bg-slate-100 text-slate-900 font-semibold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-slate-900" : "text-slate-400"}`} />
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right Section: Role Switcher */}
        <div className="flex items-center gap-3">
          {/* Role Switcher Menu */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition min-h-[44px]"
              aria-label="Switch active demo persona"
            >
              <div
                className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold ${currentUser.avatar}`}
              >
                {currentUser.initials}
              </div>
              <div className="text-left hidden lg:block">
                <div className="text-xs font-semibold text-slate-900 leading-tight">{currentUser.name}</div>
                <div className="text-[10px] text-slate-500 font-medium capitalize">{currentUser.role}</div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-xl p-2 z-50 animate-in fade-in duration-150">
                <div className="px-3 py-2 border-b border-slate-100 mb-1">
                  <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    Demo Persona Switcher
                  </p>
                  <p className="text-[11px] text-slate-500">Switch persona to test role-gated approvals</p>
                </div>
                <div className="space-y-1">
                  {users.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        setCurrentUser(u);
                        setDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs transition ${
                        currentUser.id === u.id
                          ? "bg-blue-50 border border-blue-200 text-blue-900 font-medium"
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
                      {currentUser.id === u.id && <UserCheck className="w-4 h-4 text-blue-600 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-2 pb-4 space-y-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-xs font-medium ${
                  isActive ? "bg-slate-100 text-slate-900 font-bold" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Icon className="w-4 h-4" />
                {link.label}
              </Link>
            );
          })}
        </div>
      )}

      {/* Mobile Sticky Bottom Navigation (<768px) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 border-t border-slate-200 z-40 backdrop-blur-md px-2 py-1 flex justify-around">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center justify-center p-2 rounded-lg text-[10px] font-medium min-w-[56px] min-h-[48px] ${
                isActive ? "text-blue-700 font-bold" : "text-slate-500"
              }`}
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span>{link.label.split(" ")[0]}</span>
            </Link>
          );
        })}
      </div>
    </header>
  );
}
