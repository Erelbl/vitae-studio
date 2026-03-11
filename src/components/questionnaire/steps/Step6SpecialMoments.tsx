"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { specialMomentsSchema } from "@/lib/validation/questionnaire";

type FormData = z.input<typeof specialMomentsSchema>;

interface Props {
  defaultValues: Partial<FormData>;
  onSubmit: (data: FormData) => void;
  onBack: () => void;
}

const OptionalBadge = () => (
  <span className="ms-1 text-sm font-normal text-muted-foreground">(רשות)</span>
);

export function Step6SpecialMoments({ defaultValues, onSubmit, onBack }: Props) {
  const {
    register,
    handleSubmit,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(specialMomentsSchema),
    defaultValues: defaultValues as FormData,
  });

  const funnyMoment = watch("funny_moment") ?? "";
  const emotionalMoment = watch("emotional_moment") ?? "";
  const characteristicMoment = watch("characteristic_moment") ?? "";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <p className="text-sm text-muted-foreground -mt-1">
        כל השדות בשלב זה הם רשות – שתפו מה שחשוב לכם.
      </p>

      {/* funny_moment */}
      <div className="space-y-1.5">
        <Label htmlFor="funny_moment">
          רגע מצחיק <OptionalBadge />
        </Label>
        <Textarea
          id="funny_moment"
          placeholder="ספרו על רגע מצחיק שכולם זוכרים"
          rows={3}
          {...register("funny_moment")}
        />
        <p className="text-xs text-muted-foreground text-end">
          {funnyMoment.length} / 500
        </p>
      </div>

      {/* emotional_moment */}
      <div className="space-y-1.5">
        <Label htmlFor="emotional_moment">
          רגע מרגש <OptionalBadge />
        </Label>
        <Textarea
          id="emotional_moment"
          placeholder="ספרו על רגע מרגש במיוחד"
          rows={3}
          {...register("emotional_moment")}
        />
        <p className="text-xs text-muted-foreground text-end">
          {emotionalMoment.length} / 500
        </p>
      </div>

      {/* characteristic_moment */}
      <div className="space-y-1.5">
        <Label htmlFor="characteristic_moment">
          רגע שמאפיין אותו/ה <OptionalBadge />
        </Label>
        <Textarea
          id="characteristic_moment"
          placeholder="ספרו על רגע שממחיש בדיוק מי הוא/היא"
          rows={3}
          {...register("characteristic_moment")}
        />
        <p className="text-xs text-muted-foreground text-end">
          {characteristicMoment.length} / 500
        </p>
      </div>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" onClick={onBack} className="w-full sm:w-auto">
          חזרה
        </Button>
        <Button type="submit" className="w-full sm:w-auto">
          הבא
        </Button>
      </div>
    </form>
  );
}
