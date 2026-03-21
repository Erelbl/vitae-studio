import type { DeliveryMode, AlbumSize, PricingSnapshot } from "@/types/order";

/**
 * Canonical server-side pricing source of truth.
 * All price calculations MUST go through this function.
 * Client may display values, but server validates via this.
 */

const PRICE_TABLE: Record<string, number> = {
  "film:": 2000,
  "print:25x25": 2200,
  "print:30x30": 2500,
  "bundle:25x25": 3780,
  "bundle:30x30": 4050,
};

export interface PricingInput {
  deliveryMode: DeliveryMode;
  albumSize: AlbumSize | null;
}

export interface PricingResult {
  includesPrintedAlbum: boolean;
  includesNarratedFilm: boolean;
  totalPriceIls: number;
}

export function calculateOrderPricing(input: PricingInput): PricingResult {
  const { deliveryMode, albumSize } = input;

  const includesPrintedAlbum = deliveryMode === "print" || deliveryMode === "bundle";
  const includesNarratedFilm = deliveryMode === "film" || deliveryMode === "bundle";

  const key = `${deliveryMode}:${albumSize ?? ""}`;
  const totalPriceIls = PRICE_TABLE[key];

  if (totalPriceIls === undefined) {
    throw new Error(
      `Invalid pricing combination: delivery_mode=${deliveryMode}, album_size=${albumSize}`
    );
  }

  return { includesPrintedAlbum, includesNarratedFilm, totalPriceIls };
}

/** Build a full pricing snapshot for persisting on the order. */
export function buildPricingSnapshot(input: PricingInput): PricingSnapshot {
  const result = calculateOrderPricing(input);
  return {
    delivery_mode: input.deliveryMode,
    album_size: input.albumSize,
    includes_printed_album: result.includesPrintedAlbum,
    includes_narrated_film: result.includesNarratedFilm,
    total_price_ils: result.totalPriceIls,
    currency: "ILS",
    computed_at: new Date().toISOString(),
  };
}

/** Whether a delivery mode requires a physical album (and thus shipping). */
export function requiresShipping(deliveryMode: DeliveryMode): boolean {
  return deliveryMode === "print" || deliveryMode === "bundle";
}

/** Whether a delivery mode requires album size selection. */
export function requiresAlbumSize(deliveryMode: DeliveryMode): boolean {
  return deliveryMode === "print" || deliveryMode === "bundle";
}

/** Get the starting price for a delivery mode (for display). */
export function getStartingPrice(deliveryMode: DeliveryMode): number {
  switch (deliveryMode) {
    case "film":
      return 2000;
    case "print":
      return 2200;
    case "bundle":
      return 3780;
  }
}
