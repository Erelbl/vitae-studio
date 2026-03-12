"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { buyerDetailsSchema } from "@/lib/validation/questionnaire";

type FormData = z.input<typeof buyerDetailsSchema>;

interface Props {
  defaultValues: Partial<FormData>;
  onSubmit: (data: FormData) => void;
  onBack: () => void;
  submitting?: boolean;
}

const OptionalBadge = () => (
  <span className="ms-1 text-sm font-normal text-muted-foreground">(רשות)</span>
);

export function Step9BuyerDetails({
  defaultValues,
  onSubmit,
  onBack,
  submitting,
}: Props) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(buyerDetailsSchema),
    defaultValues: defaultValues as FormData,
  });

  const additionalNotes = watch("additional_notes") ?? "";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* buyer_name */}
      <div className="space-y-1.5">
        <Label htmlFor="buyer_name">שם המזמין/ה *</Label>
        <Input
          id="buyer_name"
          placeholder="למשל: דנה לוי"
          {...register("buyer_name")}
        />
        {errors.buyer_name && (
          <p className="text-sm text-destructive">{errors.buyer_name.message}</p>
        )}
      </div>

      {/* relationship_to_buyer */}
      <div className="space-y-1.5">
        <Label htmlFor="relationship_to_buyer">הקשר לבעל/ת השמחה *</Label>
        <Input
          id="relationship_to_buyer"
          placeholder="למשל: בת, בן זוג, נכדה, חבר קרוב"
          {...register("relationship_to_buyer")}
        />
        {errors.relationship_to_buyer && (
          <p className="text-sm text-destructive">
            {errors.relationship_to_buyer.message}
          </p>
        )}
      </div>

      {/* buyer_phone */}
      <div className="space-y-1.5">
        <Label htmlFor="buyer_phone">טלפון *</Label>
        <Input
          id="buyer_phone"
          type="tel"
          placeholder="למשל: 052-1234567"
          dir="ltr"
          {...register("buyer_phone")}
        />
        {errors.buyer_phone && (
          <p className="text-sm text-destructive">{errors.buyer_phone.message}</p>
        )}
      </div>

      {/* buyer_email – optional */}
      <div className="space-y-1.5">
        <Label htmlFor="buyer_email">
          אימייל <OptionalBadge />
        </Label>
        <Input
          id="buyer_email"
          type="email"
          placeholder="למשל: dana@example.com"
          dir="ltr"
          {...register("buyer_email")}
        />
        {errors.buyer_email && (
          <p className="text-sm text-destructive">{errors.buyer_email.message}</p>
        )}
      </div>

      {/* additional_notes – optional */}
      <div className="space-y-1.5">
        <Label htmlFor="additional_notes">
          הערות נוספות <OptionalBadge />
        </Label>
        <Textarea
          id="additional_notes"
          placeholder="כל דבר נוסף שחשוב שנדע לפני כתיבת הסיפור"
          rows={3}
          {...register("additional_notes")}
        />
        <p className="text-xs text-muted-foreground text-end">
          {additionalNotes.length} / 500
        </p>
      </div>

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="w-full sm:w-auto"
        >
          חזרה
        </Button>
        <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
          {submitting ? "שומר..." : "סיום השאלון"}
        </Button>
      </div>
    </form>
  );
}
