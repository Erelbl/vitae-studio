import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Vitae Studio - סיפור חיים בחרוזים",
    short_name: "Vitae Studio",
    description: "אלבום סיפור חיים מאויר בחרוזים - מתנה אישית ומרגשת",
    start_url: "/",
    display: "standalone",
    background_color: "#FAF8F2",
    theme_color: "#8F9F7A",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
