"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { specialRequestsSchema } from "@/lib/validation/questionnaire";

type FormData = z.input<typeof specialRequestsSchema>;

interface Props {
  defaultValues: Partial<FormData>;
  onSubmit: (data: FormData) => void;
  onBack: () => void;
}

export function StepSpecial({ defaultValues, onSubmit, onBack }: Props) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(specialRequestsSchema),
    defaultValues: defaultValues as FormData,
  });

  const tone = watch("tone_preference");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="dedications">הקדשות</Label>
        <Textarea
          id="dedications"
          placeholder="מה תרצו לכתוב בדף ההקדשה? למי האלבום מיועד?"
          rows={3}
          {...register("dedications")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="specific_events">אירועים ספציפיים לכלול</Label>
        <Textarea
          id="specific_events"
          placeholder="אירועים, סיפורים, רגעים שחשוב שיכללו בסיפור..."
          rows={3}
          {...register("specific_events")}
        />
      </div>

      <div className="space-y-1.5">
        <Label>סגנון מועדף *</Label>
        <Select
          value={tone}
          onValueChange={(v) =>
            setValue("tone_preference", v as "humorous" | "emotional" | "mixed")
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="בחרו סגנון לסיפור" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="humorous">הומוריסטי — קליל וכיפי</SelectItem>
            <SelectItem value="emotional">רגשי — מרגש ומחמם לב</SelectItem>
            <SelectItem value="mixed">משולב — גם וגם</SelectItem>
          </SelectContent>
        </Select>
        {errors.tone_preference && (
          <p className="text-sm text-destructive">{errors.tone_preference.message}</p>
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
