"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AlbumType } from "@/questionnaires/types";

interface Props {
  orderId: string;
  token: string;
  currentAlbumType?: string;
}

const ALBUM_TYPE_CARDS: {
  type: AlbumType;
  title: string;
  description: string;
  icon: string;
}[] = [
  {
    type: "single",
    title: "סיפור חיים אישי",
    description: "אלבום סיפור חיים מרגש לאדם אחד — ליום הולדת, פרישה, או סתם כי מגיע לו",
    icon: "👤",
  },
  {
    type: "couple",
    title: "לזוג / חתונה / יום נישואין",
    description: "סיפור זוגי מרגש — מההכרות ועד היום, לחגיגת האהבה שלכם",
    icon: "💑",
  },
  {
    type: "memorial",
    title: "הנצחה",
    description: "אלבום זיכרון מכבד ומרגש לאדם יקר שאיננו עוד",
    icon: "🕯️",
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
        <p className="mt-2 text-sm text-muted-foreground">
          בחרו את סוג האלבום כדי שנתאים את השאלון בדיוק עבורכם
        </p>
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
            <span className="text-3xl sm:text-4xl" role="img">{card.icon}</span>
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
