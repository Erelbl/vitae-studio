"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { legacySchema } from "@/lib/validation/questionnaire";

type FormData = z.input<typeof legacySchema>;

interface Props {
  defaultValues: Partial<FormData>;
  onNavigate: (data: Record<string, unknown>) => void;
  onBack: () => void;
}

const OptionalBadge = () => (
  <span className="ms-1 text-sm font-normal text-muted-foreground">(רשות)</span>
);

export function Step7Legacy({ defaultValues, onNavigate, onBack }: Props) {
  const {
    register,
    getValues,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(legacySchema),
    defaultValues: defaultValues as FormData,
  });

  const importantValues = watch("important_values") ?? "";
  const mostProudOf = watch("most_proud_of") ?? "";
  const taughtChildren = watch("taught_children") ?? "";

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
      <p className="text-sm text-muted-foreground -mt-1">
        כל השדות בשלב זה הם רשות – שתפו מה שרלוונטי לסיפור.
      </p>

      {/* important_values */}
      <div className="space-y-1.5">
        <Label htmlFor="important_values">
          ערכים חשובים <OptionalBadge />
        </Label>
        <Textarea
          id="important_values"
          placeholder="למשל: משפחה, יושר, עבודה קשה, נתינה"
          rows={2}
          {...register("important_values")}
        />
        <p className="text-xs text-muted-foreground text-end">
          {importantValues.length} / 300
        </p>
      </div>

      {/* most_proud_of */}
      <div className="space-y-1.5">
        <Label htmlFor="most_proud_of">
          במה הוא/היא הכי גאים <OptionalBadge />
        </Label>
        <Textarea
          id="most_proud_of"
          placeholder="למשל: במשפחה שבנו, בעסק, בדרך שלהם"
          rows={3}
          {...register("most_proud_of")}
        />
        <p className="text-xs text-muted-foreground text-end">
          {mostProudOf.length} / 400
        </p>
      </div>

      {/* taught_children */}
      <div className="space-y-1.5">
        <Label htmlFor="taught_children">
          מה לימדו את הילדים <OptionalBadge />
        </Label>
        <Textarea
          id="taught_children"
          placeholder="למשל: לכבד, להתאמץ, להישאר צנועים"
          rows={3}
          {...register("taught_children")}
        />
        <p className="text-xs text-muted-foreground text-end">
          {taughtChildren.length} / 400
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
