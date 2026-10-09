import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "../components/Navbar";
import { UserProvider } from "../lib/UserContext";
import { ToastProvider } from "../components/ui/Toast";

export const metadata: Metadata = {
  title: "TraceRx | Agentic Compliance Desk",
  description: "Tamper-evident agentic compliance desk for Arogya Pharma Distributors with deterministic risk evaluation, hash-chained ledger, and EVM anchoring.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-slate-100 min-h-screen flex flex-col pb-16 md:pb-0">
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
