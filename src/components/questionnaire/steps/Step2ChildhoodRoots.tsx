"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { childhoodRootsSchema } from "@/lib/validation/questionnaire";

type FormData = z.input<typeof childhoodRootsSchema>;

interface Props {
  defaultValues: Partial<FormData>;
  onNavigate: (data: Record<string, unknown>) => void;
  onBack: () => void;
}

const OptionalBadge = () => (
  <span className="ms-1 text-sm font-normal text-muted-foreground">(רשות)</span>
);

export function Step2ChildhoodRoots({ defaultValues, onNavigate, onBack }: Props) {
  const {
    register,
    trigger,
    getValues,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(childhoodRootsSchema),
    defaultValues: defaultValues as FormData,
  });

  const childhoodMemories = watch("childhood_memories") ?? "";
  const specialMemory = watch("childhood_special_memory") ?? "";

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
      {/* person_birth_city */}
      <div className="space-y-1.5">
        <Label htmlFor="person_birth_city">איפה נולד/ה *</Label>
        <Input
          id="person_birth_city"
          placeholder="למשל: חיפה"
          {...register("person_birth_city")}
        />
        {errors.person_birth_city && (
          <p className="text-sm text-destructive">{errors.person_birth_city.message}</p>
        )}
      </div>

      {/* childhood_city */}
      <div className="space-y-1.5">
        <Label htmlFor="childhood_city">איפה גדל/ה *</Label>
        <Input
          id="childhood_city"
          placeholder="למשל: באר שבע"
          {...register("childhood_city")}
        />
        {errors.childhood_city && (
          <p className="text-sm text-destructive">{errors.childhood_city.message}</p>
        )}
      </div>

      {/* siblings */}
      <div className="space-y-1.5">
        <Label htmlFor="siblings">כמה אחים ואחיות ומה מקומו/ה ביניהם *</Label>
        <Input
          id="siblings"
          placeholder="למשל: 4 אחים, הבן השלישי"
          {...register("siblings")}
        />
        {errors.siblings && (
          <p className="text-sm text-destructive">{errors.siblings.message}</p>
        )}
      </div>

      {/* childhood_memories */}
      <div className="space-y-1.5">
        <Label htmlFor="childhood_memories">איך היית מתאר/ת אותו/ה כילד/ה *</Label>
        <Textarea
          id="childhood_memories"
          placeholder="למשל: שובב, סקרן, חברותי ואהוב"
          rows={3}
          {...register("childhood_memories")}
        />
        <p className="text-xs text-muted-foreground text-end">
          {childhoodMemories.length} / 300
        </p>
        {errors.childhood_memories && (
          <p className="text-sm text-destructive">{errors.childhood_memories.message}</p>
        )}
      </div>

      {/* parent_names – optional */}
      <div className="space-y-1.5">
        <Label htmlFor="parent_names">
          שמות ההורים <OptionalBadge />
        </Label>
        <Input
          id="parent_names"
          placeholder="למשל: מרים ויצחק"
          {...register("parent_names")}
        />
      </div>

      {/* childhood_special_memory – optional */}
      <div className="space-y-1.5">
        <Label htmlFor="childhood_special_memory">
          זיכרון ילדות מיוחד <OptionalBadge />
        </Label>
        <Textarea
          id="childhood_special_memory"
          placeholder="ספרו על רגע קטן, מצחיק או מרגש מהילדות"
          rows={3}
          {...register("childhood_special_memory")}
        />
        <p className="text-xs text-muted-foreground text-end">
          {specialMemory.length} / 400
        </p>
      </div>

      {/* childhood_hobbies – optional */}
      <div className="space-y-1.5">
        <Label htmlFor="childhood_hobbies">
          תחביבים בילדות <OptionalBadge />
        </Label>
        <Input
          id="childhood_hobbies"
          placeholder="למשל: כדורגל, ציור, רכיבה על אופניים"
          {...register("childhood_hobbies")}
        />
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
