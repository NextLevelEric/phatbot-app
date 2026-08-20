import type { Metadata, Viewport } from "next";
import ScorePersistenceAgent from "@/components/ScorePersistenceAgent";
import "./globals.css";

export const metadata: Metadata = {
  title: "PHATBOT",
  description: "Strength performance tracking and progressive overload analysis.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <ScorePersistenceAgent />
        {children}
      </body>
    </html>
  );
}
