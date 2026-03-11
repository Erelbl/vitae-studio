"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { familySchema } from "@/lib/validation/questionnaire";

type FormData = z.input<typeof familySchema>;

interface Props {
  defaultValues: Partial<FormData>;
  onSubmit: (data: FormData) => void;
  onBack: () => void;
}

export function StepFamily({ defaultValues, onSubmit, onBack }: Props) {
  const {
    register,
    handleSubmit,
  } = useForm<FormData>({
    resolver: zodResolver(familySchema),
    defaultValues: defaultValues as FormData,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="partner">בן/בת זוג</Label>
        <Input
          id="partner"
          placeholder="שם, שנות נישואין, כיצד נפגשתם..."
          {...register("partner")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="children">ילדים</Label>
        <Input
          id="children"
          placeholder="שמות ומידע בולט על כל ילד/ה..."
          {...register("children")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="grandchildren">נכדים</Label>
        <Input
          id="grandchildren"
          placeholder="שמות ומידע..."
          {...register("grandchildren")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="family_traditions">מסורות ומנהגים משפחתיים</Label>
        <Textarea
          id="family_traditions"
          placeholder="חגים, ארוחות, חגיגות, דברים ייחודיים שהמשפחה עושה יחד..."
          rows={3}
          {...register("family_traditions")}
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
