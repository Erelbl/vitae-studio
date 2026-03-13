"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { familyLoveSchema } from "@/lib/validation/questionnaire";

type FormData = z.input<typeof familyLoveSchema>;

interface Props {
  defaultValues: Partial<FormData>;
  onNavigate: (data: Record<string, unknown>) => void;
  onBack: () => void;
}

const OptionalBadge = () => (
  <span className="ms-1 text-sm font-normal text-muted-foreground">(רשות)</span>
);

export function Step4FamilyLove({ defaultValues, onNavigate, onBack }: Props) {
  const {
    register,
    getValues,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(familyLoveSchema),
    defaultValues: defaultValues as FormData,
  });

  const howTheyMet = watch("how_they_met") ?? "";
  const weddingStory = watch("wedding_story") ?? "";
  const parentingStyle = watch("parenting_style") ?? "";

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
      <p className="text-sm text-muted-foreground -mt-1">
        כל השדות בשלב זה הם רשות – מלאו מה שרלוונטי לסיפור.
      </p>

      {/* partner */}
      <div className="space-y-1.5">
        <Label htmlFor="partner">
          בן/בת זוג <OptionalBadge />
        </Label>
        <Input
          id="partner"
          placeholder="למשל: דוד"
          {...register("partner")}
        />
      </div>

      {/* how_they_met */}
      <div className="space-y-1.5">
        <Label htmlFor="how_they_met">
          איך הכירו <OptionalBadge />
        </Label>
        <Textarea
          id="how_they_met"
          placeholder="ספרו בקצרה איך התחיל הסיפור שלהם"
          rows={3}
          {...register("how_they_met")}
        />
        <p className="text-xs text-muted-foreground text-end">
          {howTheyMet.length} / 400
        </p>
      </div>

      {/* wedding_story */}
      <div className="space-y-1.5">
        <Label htmlFor="wedding_story">
          סיפור חתונה <OptionalBadge />
        </Label>
        <Textarea
          id="wedding_story"
          placeholder="אם יש רגע מיוחד, מרגש או מצחיק מהחתונה"
          rows={3}
          {...register("wedding_story")}
        />
        <p className="text-xs text-muted-foreground text-end">
          {weddingStory.length} / 400
        </p>
      </div>

      {/* children */}
      <div className="space-y-1.5">
        <Label htmlFor="children">
          ילדים ושמותיהם <OptionalBadge />
        </Label>
        <Input
          id="children"
          placeholder="למשל: 3 ילדים – יעל, ניר ועומר"
          {...register("children")}
        />
      </div>

      {/* parenting_style */}
      <div className="space-y-1.5">
        <Label htmlFor="parenting_style">
          איך היית מתאר/ת אותו/ה כהורה <OptionalBadge />
        </Label>
        <Textarea
          id="parenting_style"
          placeholder="למשל: הורה חם, נוכח, מכיל ומצחיק"
          rows={2}
          {...register("parenting_style")}
        />
        <p className="text-xs text-muted-foreground text-end">
          {parentingStyle.length} / 300
        </p>
      </div>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" onClick={onBack} className="w-full sm:w-auto">
          חזרה
        </Button>
        <Button
          type="button"
          className="w-full sm:w-auto"
          onClick={() => onNavigate(getValues())}
        >
          הבא
        </Button>
      </div>
    </form>
  );
}
