import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Header } from "../components/header";
import "./globals.css";
export const metadata: Metadata = { title: "Jev Harness · demo", icons: { icon: "/favicon.svg" }, description: "An independent community demonstration of typed routing and agent context." };
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><a className="skip" href="#task">Skip to task</a><Header />{children}</body></html>;
}
