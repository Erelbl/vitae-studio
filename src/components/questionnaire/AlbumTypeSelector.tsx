"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { User, Heart, Flame } from "lucide-react";
import type { AlbumType } from "@/questionnaires/types";

interface Props {
  orderId: string;
  token: string;
  currentAlbumType?: string;
}

const ICON_COLOR = "#757D65";

const ALBUM_TYPE_CARDS: {
  type: AlbumType;
  title: string;
  description: string;
  Icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number; className?: string }>;
}[] = [
  {
    type: "single",
    title: "סיפור חיים אישי",
    description: "אלבום שמספר את סיפורו של אדם לכבוד יום ההולדת, פרישה או סתם כי הוא יקר לליבכם",
    Icon: User,
  },
  {
    type: "couple",
    title: "סיפור בחרוזים לספר לנכדים",
    description: "סיפור זוגי מרגע ההיכרות ועד היום, יתאים לכל חגיגת אהבה, יום נישואין או חתונה",
    Icon: Heart,
  },
  {
    type: "memorial",
    title: "זוכרים ומתגעגעים",
    description: "סיפור חייו של אדם יקר שאיננו עוד, דרכו ננציח את הערכים והמורשת שהשאיר אחריו",
    Icon: Flame,
  },
];

export function AlbumTypeSelector({ orderId, token, currentAlbumType }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<AlbumType | null>(
    (currentAlbumType as AlbumType) || null
  );
  const [saving, setSaving] = useState(false);

  async function handleSelect(type: AlbumType) {
    setSelected(type);
    setSaving(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/album-type?token=${token}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ album_type: type }),
      });
      if (!res.ok) throw new Error("Failed to save");
      router.push(`/order/${orderId}/questionnaire?token=${token}`);
    } catch {
      toast.error("שגיאה בשמירה. נסו שוב.");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:max-w-2xl sm:px-8">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-semibold sm:text-3xl">
          איזה סיפור תרצו לספר?
        </h1>
      </div>

      <div className="grid gap-4">
        {ALBUM_TYPE_CARDS.map((card) => (
          <button
            key={card.type}
            type="button"
            disabled={saving}
            onClick={() => handleSelect(card.type)}
            className={`flex items-start gap-4 rounded-2xl border-2 p-5 text-start transition-all sm:p-6 ${
              selected === card.type
                ? "border-primary bg-primary/5 shadow-md"
                : "border-border/60 bg-card hover:border-primary/40 hover:shadow-sm"
            } ${saving ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
          >
            <card.Icon
              size={24}
              color={ICON_COLOR}
              strokeWidth={1.5}
              className="mt-1 shrink-0"
            />
            <div className="flex-1">
              <h2 className="text-base font-semibold sm:text-lg">{card.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                {card.description}
              </p>
            </div>
          </button>
        ))}
      </div>

      {saving && (
        <p className="mt-4 text-center text-sm text-muted-foreground">
          שומר...
        </p>
      )}
    </div>
  );
}
