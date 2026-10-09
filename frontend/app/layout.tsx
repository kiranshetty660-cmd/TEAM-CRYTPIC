import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "../components/Navbar";
import { UserProvider } from "../lib/UserContext";
import { ToastProvider } from "../components/ui/Toast";

export const metadata: Metadata = {
  title: "TraceRx — Compliance Intelligence Desk",
  description: "Enterprise agentic compliance desk for Arogya Pharma Distributors with deterministic risk auditing, hash-chained ledger, and EVM anchoring.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="light">
      <body className="bg-slate-50 text-slate-900 min-h-screen flex flex-col pb-16 md:pb-0 antialiased selection:bg-blue-100 selection:text-blue-900">
        <UserProvider>
          <ToastProvider>
            <Navbar />
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
              {children}
            </main>
          </ToastProvider>
        </UserProvider>
      </body>
    </html>
  );
}
