"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { introductionSchema } from "@/lib/validation/questionnaire";

type FormData = z.input<typeof introductionSchema>;

interface Props {
  defaultValues: Partial<FormData>;
  onSubmit: (data: FormData) => void;
}

const OptionalBadge = () => (
  <span className="ms-1 text-sm font-normal text-muted-foreground">(רשות)</span>
);

export function Step1Introduction({ defaultValues, onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(introductionSchema),
    defaultValues: defaultValues as FormData,
  });

  const albumType = watch("album_type");
  const gender = watch("person_gender");
  const descValue = watch("one_sentence_description") ?? "";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* person_name */}
      <div className="space-y-1.5">
        <Label htmlFor="person_name">שם בעל/ת השמחה *</Label>
        <Input
          id="person_name"
          placeholder="למשל: רחל כהן"
          {...register("person_name")}
        />
        {errors.person_name && (
          <p className="text-sm text-destructive">{errors.person_name.message}</p>
        )}
      </div>

      {/* album_type */}
      <div className="space-y-1.5">
        <Label>סוג האלבום *</Label>
        <Select
          value={albumType}
          onValueChange={(v) =>
            setValue("album_type", v as FormData["album_type"], {
              shouldValidate: true,
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="בחרו סוג אלבום" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="life_story_birthday">סיפור חיים / יום הולדת</SelectItem>
            <SelectItem value="wedding">חתונה / סיפור זוגי</SelectItem>
            <SelectItem value="anniversary">יום נישואין</SelectItem>
            <SelectItem value="retirement">פרישה</SelectItem>
            <SelectItem value="memorial">הנצחה</SelectItem>
            <SelectItem value="other">אחר</SelectItem>
          </SelectContent>
        </Select>
        {errors.album_type && (
          <p className="text-sm text-destructive">{errors.album_type.message}</p>
        )}
      </div>

      {/* person_gender */}
      <div className="space-y-1.5">
        <Label>מגדר *</Label>
        <Select
          value={gender}
          onValueChange={(v) =>
            setValue("person_gender", v as "male" | "female", {
              shouldValidate: true,
            })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="בחרו מגדר" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="male">זכר</SelectItem>
            <SelectItem value="female">נקבה</SelectItem>
          </SelectContent>
        </Select>
        {errors.person_gender && (
          <p className="text-sm text-destructive">{errors.person_gender.message}</p>
        )}
      </div>

      {/* one_sentence_description */}
      <div className="space-y-1.5">
        <Label htmlFor="one_sentence_description">
          איך היית מתאר/ת אותו/ה במשפט אחד? *
        </Label>
        <Textarea
          id="one_sentence_description"
          placeholder="למשל: אדם חם, מצחיק ומלא אהבה"
          rows={2}
          {...register("one_sentence_description")}
        />
        <p className="text-xs text-muted-foreground text-end">
          {descValue.length} / 200
        </p>
        {errors.one_sentence_description && (
          <p className="text-sm text-destructive">
            {errors.one_sentence_description.message}
          </p>
        )}
      </div>

      {/* nickname – optional */}
      <div className="space-y-1.5">
        <Label htmlFor="nickname">
          כינוי חיבה <OptionalBadge />
        </Label>
        <Input
          id="nickname"
          placeholder="למשל: רחל׳ה, סבא יוסי, מומו"
          {...register("nickname")}
        />
      </div>

      {/* first_impression – optional */}
      <div className="space-y-1.5">
        <Label htmlFor="first_impression">
          מה הדבר הראשון שאנשים שמים לב אליו? <OptionalBadge />
        </Label>
        <Input
          id="first_impression"
          placeholder="למשל: החיוך, ההומור, השקט, הנוכחות"
          {...register("first_impression")}
        />
      </div>

      <div className="pt-2">
        <Button type="submit" className="w-full sm:w-auto">
          הבא
        </Button>
      </div>
    </form>
  );
}
