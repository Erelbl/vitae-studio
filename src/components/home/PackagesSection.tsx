"use client";

import { useState } from "react";
import { FadeIn } from "@/components/home/FadeIn";
import { PACKAGES_SECTION } from "@/content/landing-content";
import {
  PACKAGES,
  type PackageKey,
  type Size,
} from "@/content/packages";
import { PackageCard } from "@/components/shared/PackageCard";

interface Props {
  onSelectPackage: (key: PackageKey, size: Size) => void;
}

export function PackagesSection({ onSelectPackage }: Props) {
  const [albumSize, setAlbumSize] = useState<Size>("25");
  const [comboSize, setComboSize] = useState<Size>("25");

  function getSize(key: PackageKey): Size {
    if (key === "album") return albumSize;
    if (key === "combo") return comboSize;
    return "25";
  }

  function setSize(key: PackageKey, size: Size) {
    if (key === "album") setAlbumSize(size);
    if (key === "combo") setComboSize(size);
  }

  return (
    <section className="bg-background px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-5xl">

        <FadeIn>
          <div className="mb-10 text-center">
            <span className="mb-3 inline-block text-sm font-medium text-primary">
              {PACKAGES_SECTION.sectionLabel}
            </span>
            <h2 className="text-3xl font-semibold sm:text-4xl">{PACKAGES_SECTION.title}</h2>
            <p className="mt-3 text-base text-muted-foreground sm:text-lg">
              {PACKAGES_SECTION.subtitle}
            </p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {PACKAGES.map((pkg, i) => {
            const size = getSize(pkg.key);
            return (
              <FadeIn key={pkg.key} delay={i * 80}>
                <PackageCard
                  pkg={pkg}
                  size={size}
                  onSizeChange={(s) => setSize(pkg.key, s)}
                  ctaLabel="להזמנה"
                  ctaVariant={pkg.featured ? "default" : "outline"}
                  onCtaClick={() => onSelectPackage(pkg.key, size)}
                />
              </FadeIn>
            );
          })}
        </div>

      </div>
    </section>
  );
}
