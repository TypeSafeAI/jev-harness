import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Header } from "../components/header";
import "./globals.css";
export const metadata: Metadata = { title: "Jev Harness · Agent arena", icons: { icon: "/favicon.svg" }, description: "Compare Codex with and without Jev tool routing, and track results locally over time." };
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><a className="skip" href="#arena-workspace">Skip to arena</a><Header />{children}</body></html>;
}
