// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for package data, pricing, and Grow payment links.
// Used by: landing page PackagesSection, checkout ProductSelection,
//          PayButton, OrderConfiguration.
// ─────────────────────────────────────────────────────────────────────────────

import type { DeliveryMode, AlbumSize } from "@/types/order";

export type PackageKey = "video" | "album" | "combo";
export type Size = "25" | "30";

/* ── Grow payment links ─────────────────────────────────────────────────── */

export const GROW_LINKS: Record<string, string> = {
  video: "https://pay.grow.link/3124b214459eaf03d8c8fe0fea30af52-MzIwNDQxNg",
  album_25: "https://pay.grow.link/edbae41148bcea53b9220052c2c657d7-MzIwNDQxNA",
  album_30: "https://pay.grow.link/1c899426bbe840a727903f48557fb570-MzIwNDQxNQ",
  combo_25: "https://pay.grow.link/edbe3fab6cb50f2b4dc9c9e67daa253d-MzIwNDQxOA",
  combo_30: "https://pay.grow.link/9f22c34647fc749b1c6b0f9c90c170ba-MzIwNDQxOQ",
};

export function getGrowLink(pkg: PackageKey, size: Size): string {
  if (pkg === "video") return GROW_LINKS.video;
  if (pkg === "album") return size === "25" ? GROW_LINKS.album_25 : GROW_LINKS.album_30;
  return size === "25" ? GROW_LINKS.combo_25 : GROW_LINKS.combo_30;
}

/** Resolve Grow link using DeliveryMode + AlbumSize (for checkout flow). */
export function getGrowLinkByMode(mode: DeliveryMode, albumSize: AlbumSize | null): string | null {
  const pkg = DELIVERY_MODE_TO_PACKAGE[mode];
  const size = albumSize === "30x30" ? "30" : "25";
  return getGrowLink(pkg, size);
}

/* ── Mapping between DeliveryMode and PackageKey ─────────────────────── */

export const DELIVERY_MODE_TO_PACKAGE: Record<DeliveryMode, PackageKey> = {
  film: "video",
  print: "album",
  bundle: "combo",
};

export const PACKAGE_TO_DELIVERY_MODE: Record<PackageKey, DeliveryMode> = {
  video: "film",
  album: "print",
  combo: "bundle",
};

/* ── Package pricing ─────────────────────────────────────────────────── */

export interface PackagePricing {
  /** Price per size. Video has same price for both. */
  price: Record<Size, number>;
  /** For combo: original (undiscounted) price per size. */
  originalPrice?: Record<Size, number>;
  /** Discount label shown on combo card. */
  discountLabel?: string;
}

export interface PackageData {
  key: PackageKey;
  title: string;
  subtitle: string;
  badge?: string;
  featured: boolean;
  hasSize: boolean;
  pricing: PackagePricing;
  inclusions: string[];
}

export const PACKAGES: PackageData[] = [
  {
    key: "video",
    title: "סרטון סיפור חיים בחרוזים",
    subtitle:
      "הסיפור שלכם מתעורר לחיים עם קריינות מקצועית, מוזיקת רקע והנפשות עדינות",
    featured: false,
    hasSize: false,
    pricing: {
      price: { "25": 2400, "30": 2400 },
    },
    inclusions: [
      "שאלון אישי מעמיק",
      "התמונות שלכם הופכות לאיור ומקבלות הנפשה עדינה",
      "קריינות מקצועית",
      "קובץ להקרנה ולשיתוף ברשתות",
    ],
  },
  {
    key: "combo",
    title: "חבילה משולבת",
    subtitle: "אלבום + סרט - הכל בחבילה אחת",
    badge: "הכי משתלם",
    featured: true,
    hasSize: true,
    pricing: {
      price: { "25": 3920, "30": 4160 },
      originalPrice: { "25": 4900, "30": 5200 },
      discountLabel: "כולל 20% הנחה",
    },
    inclusions: [
      'כל מה שב"אלבום" +',
      "עריכת וידאו עם הנפשות עדינות",
      "קריינות מקצועית",
      "קובץ וידאו להורדה ולשיתוף",
    ],
  },
  {
    key: "album",
    title: "אלבום סיפור חיים בחרוזים",
    subtitle: "אפשרות 30×30 או 25×25 · עד 40 עמודים",
    featured: false,
    hasSize: true,
    pricing: {
      price: { "25": 2500, "30": 2800 },
    },
    inclusions: [
      "שאלון אישי מעמיק",
      "כתיבת סיפור בחרוזים",
      "עד 40 עמודים מאויירים בצבעי מים",
      "אישור גרסה לפני הדפסה",
      "משלוח עד הבית",
    ],
  },
];

/* ── Helpers ──────────────────────────────────────────────────────────── */

/** Format price as Hebrew string, e.g. "₪3,920" */
export function formatPrice(amount: number): string {
  return `₪${amount.toLocaleString("he-IL")}`;
}

/** Get starting (lowest) display price for a package. */
export function getDisplayPrice(pkg: PackageData): string {
  const min = Math.min(pkg.pricing.price["25"], pkg.pricing.price["30"]);
  if (!pkg.hasSize) return formatPrice(min);
  return `החל מ-${formatPrice(min)}`;
}

/** Find a package by key. */
export function getPackage(key: PackageKey): PackageData {
  const found = PACKAGES.find((p) => p.key === key);
  if (!found) throw new Error(`Unknown package: ${key}`);
  return found;
}
