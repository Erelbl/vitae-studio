"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { characterSchema } from "@/lib/validation/questionnaire";

type FormData = z.input<typeof characterSchema>;

interface Props {
  defaultValues: Partial<FormData>;
  onSubmit: (data: FormData) => void;
  onBack: () => void;
}

export function StepCharacter({ defaultValues, onSubmit, onBack }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(characterSchema),
    defaultValues: defaultValues as FormData,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="personality_traits">תכונות אופי בולטות *</Label>
        <Textarea
          id="personality_traits"
          placeholder="מה מאפיין את האדם? איך חברים ומשפחה מתארים אותו/ה?"
          rows={3}
          {...register("personality_traits")}
        />
        {errors.personality_traits && (
          <p className="text-sm text-destructive">{errors.personality_traits.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="favorite_sayings">אמרות ובדיחות אהובות</Label>
        <Input
          id="favorite_sayings"
          placeholder="משפטים שחוזרים, בדיחות מוכרות..."
          {...register("favorite_sayings")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="known_for">ידוע/ה בזכות *</Label>
        <Input
          id="known_for"
          placeholder="מה הדבר הראשון שאנשים מזכירים כשמדברים עליו/ה?"
          {...register("known_for")}
        />
        {errors.known_for && (
          <p className="text-sm text-destructive">{errors.known_for.message}</p>
        )}
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
