import "./globals.css";
import type { Metadata } from "next";
import type { ReactNode } from "react";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";
const title = "Ship -> Social";
const description =
  "Connect GitHub, pick repos, and let AI write your social content";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title,
  description,
  applicationName: title,
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
  },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    url: "/",
    siteName: title,
    title,
    description,
    images: [
      {
        url: "/ship-social-logo.png",
        width: 500,
        height: 500,
        alt: "Ship Social astronaut logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title,
    description,
    images: ["/ship-social-logo.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
