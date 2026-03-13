"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { milestonesSchema } from "@/lib/validation/questionnaire";

type FormData = z.input<typeof milestonesSchema>;

interface Props {
  defaultValues: Partial<FormData>;
  onNavigate: (data: Record<string, unknown>) => void;
  onBack: () => void;
}

const OptionalBadge = () => (
  <span className="ms-1 text-sm font-normal text-muted-foreground">(רשות)</span>
);

export function Step3Milestones({ defaultValues, onNavigate, onBack }: Props) {
  const {
    register,
    trigger,
    getValues,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(milestonesSchema),
    defaultValues: defaultValues as FormData,
  });

  const workChars = watch("work_characteristics") ?? "";
  const defMoments = watch("defining_moments") ?? "";

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
      {/* profession */}
      <div className="space-y-1.5">
        <Label htmlFor="profession">מה היה העיסוק המרכזי בחיים *</Label>
        <Input
          id="profession"
          placeholder="למשל: מורה, קבלן, אחות, עצמאי"
          {...register("profession")}
        />
        {errors.profession && (
          <p className="text-sm text-destructive">{errors.profession.message}</p>
        )}
      </div>

      {/* work_characteristics */}
      <div className="space-y-1.5">
        <Label htmlFor="work_characteristics">
          מה הכי אפיין אותו/ה בעבודה או בעשייה *
        </Label>
        <Textarea
          id="work_characteristics"
          placeholder="למשל: חריצות, מסירות, דיוק, לב רחב"
          rows={3}
          {...register("work_characteristics")}
        />
        <p className="text-xs text-muted-foreground text-end">
          {workChars.length} / 300
        </p>
        {errors.work_characteristics && (
          <p className="text-sm text-destructive">
            {errors.work_characteristics.message}
          </p>
        )}
      </div>

      {/* military_service – optional */}
      <div className="space-y-1.5">
        <Label htmlFor="military_service">
          שירות צבאי <OptionalBadge />
        </Label>
        <Input
          id="military_service"
          placeholder="למשל: חיל האוויר, גולני, שירות לאומי"
          {...register("military_service")}
        />
      </div>

      {/* cities_over_years – optional */}
      <div className="space-y-1.5">
        <Label htmlFor="cities_over_years">
          מקומות מגורים לאורך השנים <OptionalBadge />
        </Label>
        <Input
          id="cities_over_years"
          placeholder="למשל: ירושלים, חולון, קיבוץ דגניה"
          {...register("cities_over_years")}
        />
      </div>

      {/* defining_moments – optional */}
      <div className="space-y-1.5">
        <Label htmlFor="defining_moments">
          רגע משמעותי בחיים <OptionalBadge />
        </Label>
        <Textarea
          id="defining_moments"
          placeholder="ספרו על רגע חשוב שהשפיע על מהלך החיים"
          rows={3}
          {...register("defining_moments")}
        />
        <p className="text-xs text-muted-foreground text-end">
          {defMoments.length} / 400
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
