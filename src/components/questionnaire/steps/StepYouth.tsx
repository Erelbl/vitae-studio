"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { youthSchema } from "@/lib/validation/questionnaire";

type FormData = z.input<typeof youthSchema>;

interface Props {
  defaultValues: Partial<FormData>;
  onSubmit: (data: FormData) => void;
  onBack: () => void;
}

export function StepYouth({ defaultValues, onSubmit, onBack }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(youthSchema),
    defaultValues: defaultValues as FormData,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="schools">בתי ספר ולימודים</Label>
        <Input
          id="schools"
          placeholder="בתי ספר, מוסדות להשכלה גבוהה..."
          {...register("schools")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="military_service">שירות צבאי</Label>
        <Input
          id="military_service"
          placeholder="יחידה, תפקיד, שנות שירות..."
          {...register("military_service")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="formative_experiences">חוויות מעצבות בגיל הנעורים *</Label>
        <Textarea
          id="formative_experiences"
          placeholder="אירועים, מפגשים, החלטות שעיצבו את האדם..."
          rows={4}
          {...register("formative_experiences")}
        />
        {errors.formative_experiences && (
          <p className="text-sm text-destructive">{errors.formative_experiences.message}</p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
        <Button type="button" variant="outline" onClick={onBack} className="w-full sm:w-auto">
          חזרה
        </Button>
        <Button type="submit" className="w-full sm:w-auto">הבא</Button>
      </div>
    </form>
  );
}
