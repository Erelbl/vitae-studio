"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { childhoodSchema } from "@/lib/validation/questionnaire";

type FormData = z.input<typeof childhoodSchema>;

interface Props {
  defaultValues: Partial<FormData>;
  onSubmit: (data: FormData) => void;
  onBack: () => void;
}

export function StepChildhood({ defaultValues, onSubmit, onBack }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(childhoodSchema),
    defaultValues: defaultValues as FormData,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="childhood_city">עיר מגורים בילדות *</Label>
        <Input
          id="childhood_city"
          placeholder="עיר בה גדלתם"
          {...register("childhood_city")}
        />
        {errors.childhood_city && (
          <p className="text-sm text-destructive">{errors.childhood_city.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="siblings">אחים ואחיות</Label>
        <Input
          id="siblings"
          placeholder="שמות ומספר"
          {...register("siblings")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="childhood_memories">זיכרונות ילדות בולטים *</Label>
        <Textarea
          id="childhood_memories"
          placeholder="ספרו על זיכרונות, אירועים, מקומות אהובים..."
          rows={4}
          {...register("childhood_memories")}
        />
        {errors.childhood_memories && (
          <p className="text-sm text-destructive">{errors.childhood_memories.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="childhood_hobbies">תחביבי ילדות</Label>
        <Input
          id="childhood_hobbies"
          placeholder="משחקים, ספורט, עיסוקים אהובים..."
          {...register("childhood_hobbies")}
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
