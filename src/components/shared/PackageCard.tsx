import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  formatPrice,
  type PackageData,
  type Size,
} from "@/content/packages";

interface PackageCardProps {
  pkg: PackageData;
  size: Size;
  onSizeChange?: (size: Size) => void;
  /** Label shown on the CTA button. */
  ctaLabel: string;
  ctaVariant?: "default" | "outline";
  onCtaClick?: () => void;
  /** When true, shows a selected ring + check indicator (for selection UIs). */
  isSelected?: boolean;
  /** Override card to be a clickable button (for selection UIs). */
  asButton?: boolean;
  onCardClick?: () => void;
}

export function PackageCard({
  pkg,
  size,
  onSizeChange,
  ctaLabel,
  ctaVariant,
  onCtaClick,
  isSelected,
  asButton,
  onCardClick,
}: PackageCardProps) {
  const { pricing } = pkg;
  const currentPrice = pricing.price[size];
  const originalPrice = pricing.originalPrice?.[size];
  const variant = ctaVariant ?? (pkg.featured ? "default" : "outline");

  const cardClasses = `relative flex h-full flex-col rounded-2xl transition-shadow ${
    isSelected
      ? "ring-2 ring-primary shadow-lg"
      : pkg.featured
        ? "bg-primary/10 ring-2 ring-primary/35 shadow-xl"
        : "border border-border/50 bg-secondary/30 shadow-sm"
  } ${pkg.featured && !isSelected ? "" : ""} ${
    asButton ? "cursor-pointer hover:shadow-md text-start" : ""
  }`;

  const content = (
    <>
      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute top-3 end-3 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check size={14} strokeWidth={3} />
        </div>
      )}

      {/* Card header */}
      <div className="px-7 pt-7 pb-5">
        {pkg.badge && (
          <span className="mb-4 inline-block rounded-full bg-primary/20 px-3 py-1 text-xs font-semibold tracking-wide text-primary">
            {pkg.badge}
          </span>
        )}
        <h3 className="text-xl font-semibold leading-snug">{pkg.title}</h3>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          {pkg.subtitle}
        </p>
      </div>

      {/* Divider */}
      <div className="mx-7 border-t border-border/40" />

      {/* Inclusions */}
      <div className="flex-1 px-7 py-5">
        <ul className="space-y-2.5">
          {pkg.inclusions.map((line, li) => (
            <li key={li} className="flex items-start gap-2.5">
              <Check
                size={15}
                className={`mt-0.5 shrink-0 ${
                  pkg.featured || isSelected ? "text-primary" : "text-primary/50"
                }`}
                strokeWidth={2.5}
              />
              <span className="text-base leading-relaxed text-foreground/80">
                {line}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Price footer */}
      <div
        className={`mx-7 mb-7 mt-2 border-t pt-5 ${
          pkg.featured ? "border-primary/20" : "border-border/40"
        }`}
      >
        {/* Size selector */}
        {pkg.hasSize && onSizeChange && (
          <div className="mb-4 flex gap-2">
            {(["25", "30"] as Size[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSizeChange(s);
                }}
                className={`flex-1 rounded-lg py-1.5 text-sm font-medium transition-colors ${
                  size === s
                    ? pkg.featured
                      ? "bg-primary text-primary-foreground"
                      : "bg-foreground/10 text-foreground"
                    : "border border-border/50 text-muted-foreground hover:border-primary/40"
                }`}
              >
                {s}×{s}
              </button>
            ))}
          </div>
        )}

        {/* Original price (strikethrough) for combo */}
        {originalPrice && (
          <p className="text-lg text-muted-foreground line-through">
            {formatPrice(originalPrice)}
          </p>
        )}

        <p
          className={`text-4xl font-bold tracking-tight ${
            pkg.featured || isSelected ? "text-primary" : "text-foreground"
          }`}
        >
          {formatPrice(currentPrice)}
        </p>

        {pricing.discountLabel && (
          <p className="mt-1 text-sm text-primary/70">{pricing.discountLabel}</p>
        )}

        {onCtaClick && (
          <Button
            className="mt-4 w-full"
            variant={variant}
            onClick={(e) => {
              e.stopPropagation();
              onCtaClick();
            }}
          >
            {ctaLabel}
          </Button>
        )}
      </div>
    </>
  );

  if (asButton) {
    return (
      <button type="button" onClick={onCardClick} className={cardClasses}>
        {content}
      </button>
    );
  }

  return <div className={cardClasses}>{content}</div>;
}
