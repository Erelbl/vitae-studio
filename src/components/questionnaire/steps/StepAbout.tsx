"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { aboutPersonSchema } from "@/lib/validation/questionnaire";

type FormData = z.infer<typeof aboutPersonSchema>;

interface Props {
  defaultValues: Partial<FormData>;
  onSubmit: (data: FormData) => void;
}

export function StepAbout({ defaultValues, onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(aboutPersonSchema),
    defaultValues: defaultValues as FormData,
  });

  const gender = watch("person_gender");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="person_name">שם מלא *</Label>
        <Input
          id="person_name"
          placeholder="שם פרטי ושם משפחה"
          {...register("person_name")}
        />
        {errors.person_name && (
          <p className="text-sm text-destructive">{errors.person_name.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="person_birth_date">תאריך לידה *</Label>
        <Input id="person_birth_date" type="date" {...register("person_birth_date")} />
        {errors.person_birth_date && (
          <p className="text-sm text-destructive">{errors.person_birth_date.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="person_birth_city">עיר לידה *</Label>
        <Input
          id="person_birth_city"
          placeholder="עיר הלידה"
          {...register("person_birth_city")}
        />
        {errors.person_birth_city && (
          <p className="text-sm text-destructive">{errors.person_birth_city.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>מגדר *</Label>
        <Select
          value={gender}
          onValueChange={(v) => setValue("person_gender", v as "male" | "female")}
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

      <div className="space-y-1.5">
        <Label htmlFor="relationship_to_buyer">הקשר שלכם אל האדם *</Label>
        <Input
          id="relationship_to_buyer"
          placeholder="לדוגמה: ילד/ה, בן/בת זוג, חבר/ה"
          {...register("relationship_to_buyer")}
        />
        {errors.relationship_to_buyer && (
          <p className="text-sm text-destructive">{errors.relationship_to_buyer.message}</p>
        )}
      </div>

      <div className="pt-2">
        <Button type="submit" className="w-full sm:w-auto">הבא</Button>
      </div>
    </form>
  );
}
