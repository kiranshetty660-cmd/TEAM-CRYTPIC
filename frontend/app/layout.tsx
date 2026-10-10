import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "../components/AppShell";
import { UserProvider } from "../lib/UserContext";
import { ToastProvider } from "../components/ui/Toast";

export const metadata: Metadata = {
  title: "TraceRx — Pharmaceutical Safety & Recall Management",
  description: "AI-powered pharmaceutical supply-chain monitoring and recall management system for Arogya Pharma Distributors.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <body
        className="bg-white text-slate-900 min-h-screen antialiased selection:bg-teal-100 selection:text-teal-900"
        suppressHydrationWarning
      >
        <UserProvider>
          <ToastProvider>
            <AppShell>{children}</AppShell>
          </ToastProvider>
        </UserProvider>
      </body>
    </html>
  );
}
