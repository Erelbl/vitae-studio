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
import { buyerDetailsSchema } from "@/lib/validation/questionnaire";

type FormData = z.infer<typeof buyerDetailsSchema>;

interface Props {
  defaultValues: Partial<FormData>;
  onSubmit: (data: FormData) => void;
  onBack: () => void;
  submitting?: boolean;
}

export function StepBuyer({ defaultValues, onSubmit, onBack, submitting }: Props) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(buyerDetailsSchema),
    defaultValues: defaultValues as FormData,
  });

  const occasion = watch("occasion");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="buyer_name">שם המזמין/ה *</Label>
        <Input
          id="buyer_name"
          placeholder="שם מלא"
          {...register("buyer_name")}
        />
        {errors.buyer_name && (
          <p className="text-sm text-destructive">{errors.buyer_name.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="buyer_email">אימייל *</Label>
        <Input
          id="buyer_email"
          type="email"
          placeholder="your@email.com"
          dir="ltr"
          {...register("buyer_email")}
        />
        {errors.buyer_email && (
          <p className="text-sm text-destructive">{errors.buyer_email.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="buyer_phone">טלפון *</Label>
        <Input
          id="buyer_phone"
          type="tel"
          placeholder="05X-XXXXXXX"
          dir="ltr"
          {...register("buyer_phone")}
        />
        {errors.buyer_phone && (
          <p className="text-sm text-destructive">{errors.buyer_phone.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>אירוע *</Label>
        <Select
          value={occasion}
          onValueChange={(v) =>
            setValue(
              "occasion",
              v as "birthday" | "retirement" | "memorial" | "anniversary" | "other"
            )
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="לאיזה אירוע האלבום?" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="birthday">יום הולדת</SelectItem>
            <SelectItem value="retirement">פרישה</SelectItem>
            <SelectItem value="memorial">הנצחה</SelectItem>
            <SelectItem value="anniversary">יום נישואים</SelectItem>
            <SelectItem value="other">אחר</SelectItem>
          </SelectContent>
        </Select>
        {errors.occasion && (
          <p className="text-sm text-destructive">{errors.occasion.message}</p>
        )}
      </div>

      <div className="flex justify-between pt-2">
        <Button type="button" variant="outline" onClick={onBack}>
          חזרה
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "שומר..." : "סיום השאלון"}
        </Button>
      </div>
    </form>
  );
}
