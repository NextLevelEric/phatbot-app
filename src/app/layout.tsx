import type { Metadata, Viewport } from "next";
import ScorePersistenceAgent from "@/components/ScorePersistenceAgent";
import RoleModeSwitcher from "@/components/RoleModeSwitcher";
import AthleteBottomNav from "@/components/AthleteBottomNav";
import LiveWorkoutAccordion from "@/components/LiveWorkoutAccordion";
import LiveWorkoutConnectionStatus from "@/components/LiveWorkoutConnectionStatus";
import AppFooter from "@/components/AppFooter";
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
        <RoleModeSwitcher />
        <LiveWorkoutAccordion />
        <LiveWorkoutConnectionStatus />
        {children}
        <AppFooter />
        <AthleteBottomNav />
      </body>
    </html>
  );
}
