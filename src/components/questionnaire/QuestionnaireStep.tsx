"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod/v4";
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
import type { StepConfig } from "@/questionnaires/types";

interface Props {
  config: StepConfig;
  schema: z.ZodObject<z.ZodRawShape>;
  defaultValues: Record<string, unknown>;
  onNavigate: (data: Record<string, unknown>) => void;
  onBack?: () => void;
  /** If true, this is the last step — show submit button instead of next */
  isLast?: boolean;
  onSubmit?: (data: Record<string, unknown>) => void;
  submitting?: boolean;
}

const OptionalBadge = () => (
  <span className="ms-1 text-sm font-normal text-muted-foreground">(רשות)</span>
);

export function QuestionnaireStep({
  config,
  schema,
  defaultValues,
  onNavigate,
  onBack,
  isLast,
  onSubmit,
  submitting,
}: Props) {
  const {
    register,
    trigger,
    getValues,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: defaultValues as Record<string, string>,
  });

  function handleNext() {
    trigger();
    onNavigate(getValues());
  }

  return (
    <form
      onSubmit={isLast ? handleSubmit((data) => onSubmit?.(data)) : (e) => e.preventDefault()}
      className="space-y-5"
    >
      {config.fields.map((field) => {
        const error = (errors as Record<string, { message?: string }>)[field.name];
        const watchedValue = watch(field.name) ?? "";

        if (field.type === "select" && field.options) {
          return (
            <div key={field.name} className="space-y-1.5">
              <Label>
                {field.label} {field.required ? "*" : <OptionalBadge />}
              </Label>
              <Select
                value={watchedValue as string}
                onValueChange={(v) =>
                  setValue(field.name, v, { shouldValidate: true })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={`בחרו ${field.label}`} />
                </SelectTrigger>
                <SelectContent>
                  {field.options!.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {error && (
                <p className="text-sm text-destructive">{error.message}</p>
              )}
            </div>
          );
        }

        if (field.type === "textarea") {
          return (
            <div key={field.name} className="space-y-1.5">
              <Label htmlFor={field.name}>
                {field.label} {field.required ? "*" : <OptionalBadge />}
              </Label>
              <Textarea
                id={field.name}
                placeholder={field.placeholder}
                rows={3}
                {...register(field.name)}
              />
              {field.maxLength && (
                <p className="text-xs text-muted-foreground text-end">
                  {String(watchedValue).length} / {field.maxLength}
                </p>
              )}
              {error && (
                <p className="text-sm text-destructive">{error.message}</p>
              )}
            </div>
          );
        }

        // text or date
        return (
          <div key={field.name} className="space-y-1.5">
            <Label htmlFor={field.name}>
              {field.label} {field.required ? "*" : <OptionalBadge />}
            </Label>
            <Input
              id={field.name}
              type={field.type === "date" ? "date" : "text"}
              dir={field.dir}
              placeholder={field.placeholder}
              {...register(field.name)}
            />
            {error && (
              <p className="text-sm text-destructive">{error.message}</p>
            )}
          </div>
        );
      })}

      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-between">
        {onBack && (
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            className="w-full sm:w-auto"
          >
            חזרה
          </Button>
        )}
        {isLast ? (
          <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
            {submitting ? "שומר..." : "סיום השאלון"}
          </Button>
        ) : (
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={handleNext}
          >
            הבא
          </Button>
        )}
      </div>
    </form>
  );
}
