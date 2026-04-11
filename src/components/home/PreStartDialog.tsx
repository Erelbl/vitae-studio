"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (buyerName: string, buyerEmail: string) => Promise<void>;
  loading: boolean;
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function PreStartDialog({ open, onOpenChange, onSubmit, loading }: Props) {
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});

  function validate() {
    const errs: { name?: string; email?: string } = {};
    if (!buyerName.trim()) errs.name = "נא להזין שם מלא";
    if (!buyerEmail.trim()) {
      errs.email = "נא להזין כתובת אימייל";
    } else if (!isValidEmail(buyerEmail)) {
      errs.email = "כתובת האימייל אינה תקינה";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    await onSubmit(buyerName.trim(), buyerEmail.trim().toLowerCase());
  }

  return (
    <Dialog open={open} onOpenChange={loading ? undefined : onOpenChange}>
      <DialogContent className="sm:max-w-sm" dir="rtl">
        <DialogHeader className="text-center sm:text-center">
          <DialogTitle className="text-xl font-bold">
            מתחילים את הסיפור שלכם
          </DialogTitle>
          <DialogDescription className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            נשמור את ההתקדמות שלכם ונשלח לכם את האלבום המוכן למייל לפני ההדפסה.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-2 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="buyer-name" className="text-sm font-medium">
              שם מלא
            </Label>
            <Input
              id="buyer-name"
              type="text"
              autoComplete="name"
              value={buyerName}
              onChange={(e) => {
                setBuyerName(e.target.value);
                if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
              }}
              disabled={loading}
              className={errors.name ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="buyer-email" className="text-sm font-medium">
              אימייל
            </Label>
            <Input
              id="buyer-email"
              type="email"
              autoComplete="email"
              value={buyerEmail}
              dir="ltr"
              onChange={(e) => {
                setBuyerEmail(e.target.value);
                if (errors.email) setErrors((prev) => ({ ...prev, email: undefined }));
              }}
              disabled={loading}
              className={errors.email ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {errors.email && (
              <p className="text-xs text-destructive">{errors.email}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full rounded-full py-5 text-base font-semibold"
          >
            {loading ? "מכינים..." : "מתחילים ✦"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
