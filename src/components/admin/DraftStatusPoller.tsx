"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// When `active` is true (any draft is in "generating" status), refreshes the
// page every 5 seconds so the admin sees the draft complete without manual reload.
export function DraftStatusPoller({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [active, router]);

  return null;
}
