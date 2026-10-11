import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";

import CustomCursor from "@/components/cursor/CustomCursor";
import { site } from "@/config/site";

import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name}: ${site.tagline}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  openGraph: {
    type: "website",
    siteName: site.name,
    title: site.tagline,
    description: site.description,
    url: "/",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: site.tagline,
    description: site.description,
  },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-AU" data-scroll-behavior="smooth" className={`${archivo.variable} antialiased`}>
      <body className="min-h-dvh">
        {children}
        <CustomCursor />
        <Analytics />
      </body>
    </html>
  );
}
