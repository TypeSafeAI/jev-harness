import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Header } from "../components/header";
import "./globals.css";
export const metadata: Metadata = {
  metadataBase: new URL("https://jev.guru"),
  title: "Jev Harness · Agent arena",
  icons: { icon: "/favicon.svg" },
  description: "Unofficial community experiments in Jev review and tool routing. Model evidence is not execution authorization.",
  openGraph: {
    type: "website",
    siteName: "Jev Harness",
    title: "Jev Harness — evidence is not authorization",
    description: "Unofficial community review and routing experiments with host-owned authorization.",
  },
  twitter: {
    card: "summary_large_image",
    images: [{ url: "/opengraph-image", alt: "Jev Harness — unofficial community review and routing experiments" }],
  },
};
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><a className="skip" href="#arena-workspace">Skip to arena</a><Header />{children}</body></html>;
}
