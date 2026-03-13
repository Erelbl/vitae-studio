"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { blessingSchema } from "@/lib/validation/questionnaire";

type FormData = z.input<typeof blessingSchema>;

interface Props {
  defaultValues: Partial<FormData>;
  onNavigate: (data: Record<string, unknown>) => void;
  onBack: () => void;
}

const OptionalBadge = () => (
  <span className="ms-1 text-sm font-normal text-muted-foreground">(רשות)</span>
);

export function Step8Blessing({ defaultValues, onNavigate, onBack }: Props) {
  const {
    register,
    trigger,
    getValues,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(blessingSchema),
    defaultValues: defaultValues as FormData,
  });

  const blessingWish = watch("blessing_wish") ?? "";
  const extraDescription = watch("extra_description") ?? "";

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
      {/* blessing_wish */}
      <div className="space-y-1.5">
        <Label htmlFor="blessing_wish">איזו הקדשה תרצו להוסיף לספר? *</Label>
        <Textarea
          id="blessing_wish"
          placeholder="למשל: בריאות, שמחה, אהבה ונחת מכל המשפחה"
          rows={3}
          {...register("blessing_wish")}
        />
        <p className="text-xs text-muted-foreground text-end">
          {blessingWish.length} / 400
        </p>
        {errors.blessing_wish && (
          <p className="text-sm text-destructive">{errors.blessing_wish.message}</p>
        )}
      </div>

      {/* extra_description – optional */}
      <div className="space-y-1.5">
        <Label htmlFor="extra_description">
          דברים נוספים שחשוב לכם שנדע ונכתוב על הגיבור/ה שלנו? <OptionalBadge />
        </Label>
        <Textarea
          id="extra_description"
          placeholder="משפט אחרון שהייתם רוצים שייכנס לסיפור"
          rows={2}
          {...register("extra_description")}
        />
        <p className="text-xs text-muted-foreground text-end">
          {extraDescription.length} / 300
        </p>
      </div>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" onClick={onBack} className="w-full sm:w-auto">
          חזרה
        </Button>
        <Button
          type="button"
          className="w-full sm:w-auto"
          onClick={() => { trigger(); onNavigate(getValues()); }}
        >
          הבא
        </Button>
      </div>
    </form>
  );
}
