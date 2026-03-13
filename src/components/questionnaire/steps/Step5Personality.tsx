"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { personalitySchema } from "@/lib/validation/questionnaire";

type FormData = z.input<typeof personalitySchema>;

interface Props {
  defaultValues: Partial<FormData>;
  onNavigate: (data: Record<string, unknown>) => void;
  onBack: () => void;
}

const OptionalBadge = () => (
  <span className="ms-1 text-sm font-normal text-muted-foreground">(רשות)</span>
);

export function Step5Personality({ defaultValues, onNavigate, onBack }: Props) {
  const {
    register,
    trigger,
    getValues,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(personalitySchema),
    defaultValues: defaultValues as FormData,
  });

  const traits = watch("personality_traits") ?? "";
  const knownFor = watch("known_for") ?? "";
  const funnyDetail = watch("funny_detail") ?? "";

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
      {/* personality_traits */}
      <div className="space-y-1.5">
        <Label htmlFor="personality_traits">שלוש התכונות הבולטות ביותר *</Label>
        <Textarea
          id="personality_traits"
          placeholder="למשל: נדיב, מצחיק, עקשן"
          rows={2}
          {...register("personality_traits")}
        />
        <p className="text-xs text-muted-foreground text-end">
          {traits.length} / 300
        </p>
        {errors.personality_traits && (
          <p className="text-sm text-destructive">{errors.personality_traits.message}</p>
        )}
      </div>

      {/* known_for */}
      <div className="space-y-1.5">
        <Label htmlFor="known_for">מה הדבר הכי אופייני לו/לה *</Label>
        <Textarea
          id="known_for"
          placeholder="למשל: תמיד מגיע ראשון, תמיד דואג לכולם, תמיד עם כוס קפה"
          rows={3}
          {...register("known_for")}
        />
        <p className="text-xs text-muted-foreground text-end">
          {knownFor.length} / 300
        </p>
        {errors.known_for && (
          <p className="text-sm text-destructive">{errors.known_for.message}</p>
        )}
      </div>

      {/* favorite_sayings – optional */}
      <div className="space-y-1.5">
        <Label htmlFor="favorite_sayings">
          משפט שהוא/היא תמיד אומר/ת <OptionalBadge />
        </Label>
        <Input
          id="favorite_sayings"
          placeholder="למשל: יהיה בסדר / העיקר הבריאות"
          {...register("favorite_sayings")}
        />
      </div>

      {/* hobbies – optional */}
      <div className="space-y-1.5">
        <Label htmlFor="hobbies">
          תחביבים <OptionalBadge />
        </Label>
        <Input
          id="hobbies"
          placeholder="למשל: גינון, בישול, טיולים, ברידג׳"
          {...register("hobbies")}
        />
      </div>

      {/* funny_detail – optional */}
      <div className="space-y-1.5">
        <Label htmlFor="funny_detail">
          פרט מצחיק <OptionalBadge />
        </Label>
        <Textarea
          id="funny_detail"
          placeholder="למשל: תמיד נרדם מול הטלוויזיה / שומר כל קופסה"
          rows={2}
          {...register("funny_detail")}
        />
        <p className="text-xs text-muted-foreground text-end">
          {funnyDetail.length} / 300
        </p>
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
