import type { MetadataRoute } from "next";

import { site } from "@/config/site";

// Fixed dates only: reading the clock here would make the route dynamic under Cache Components.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: new URL("/", site.url).toString(), changeFrequency: "weekly", priority: 1 },
    { url: new URL("/privacy", site.url).toString(), lastModified: site.privacyVersion, changeFrequency: "yearly", priority: 0.3 },
  ];
}
