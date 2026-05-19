import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "ATLY Axis",
  description: "The internal operating system for ATLY Studios.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="relative flex-1 overflow-x-hidden">
            <div className="relative z-10 px-10 py-10 max-w-[1400px]">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
