"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { careerSchema } from "@/lib/validation/questionnaire";

type FormData = z.input<typeof careerSchema>;

interface Props {
  defaultValues: Partial<FormData>;
  onSubmit: (data: FormData) => void;
  onBack: () => void;
}

export function StepCareer({ defaultValues, onSubmit, onBack }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(careerSchema),
    defaultValues: defaultValues as FormData,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="profession">מקצוע ותחום עיסוק *</Label>
        <Input
          id="profession"
          placeholder="כותרת תפקיד, תחום, מקום עבודה בולט..."
          {...register("profession")}
        />
        {errors.profession && (
          <p className="text-sm text-destructive">{errors.profession.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="achievements">הישגים ורגעי גאווה</Label>
        <Textarea
          id="achievements"
          placeholder="הישגים מקצועיים, פרסים, מפנות חשובות..."
          rows={3}
          {...register("achievements")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="passions">תשוקות ועניינים</Label>
        <Input
          id="passions"
          placeholder="תחביבים, עיסוקים אהובים מחוץ לעבודה..."
          {...register("passions")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="defining_moments">רגעים מכוננים בחיים</Label>
        <Textarea
          id="defining_moments"
          placeholder="אירועים שבלטו ושינו את מהלך החיים..."
          rows={3}
          {...register("defining_moments")}
        />
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="outline" onClick={onBack}>
          חזרה
        </Button>
        <Button type="submit">הבא</Button>
      </div>
    </form>
  );
}
