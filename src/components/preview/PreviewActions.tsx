"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, MessageSquare, Loader2 } from "lucide-react";

interface PreviewActionsProps {
  orderId: string;
  token: string;
  previewStatus: string;
}

type View = "actions" | "feedback" | "submitting" | "approved" | "feedback_sent";

export function PreviewActions({
  orderId,
  token,
  previewStatus,
}: PreviewActionsProps) {
  const [view, setView] = useState<View>(() => {
    if (previewStatus === "approved") return "approved";
    if (previewStatus === "changes_requested") return "feedback_sent";
    return "actions";
  });
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setView("submitting");
    setError(null);
    try {
      const res = await fetch(
        `/api/orders/${orderId}/preview-approve?token=${token}`,
        { method: "POST" }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "שגיאה באישור");
      }
      setView("approved");
    } catch (err) {
      setError((err as Error).message);
      setView("actions");
    }
  }

  async function handleSubmitFeedback() {
    if (!feedback.trim()) return;
    setView("submitting");
    setError(null);
    try {
      const res = await fetch(
        `/api/orders/${orderId}/preview-feedback?token=${token}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedback: feedback.trim() }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "שגיאה בשליחה");
      }
      setView("feedback_sent");
    } catch (err) {
      setError((err as Error).message);
      setView("feedback");
    }
  }

  if (view === "approved") {
    return (
      <div className="border-t border-border/60 bg-card px-4 py-6 text-center">
        <div className="mx-auto max-w-md">
          <CheckCircle2 className="mx-auto mb-3 text-green-600" size={36} />
          <p className="text-lg font-semibold text-green-800">האלבום אושר!</p>
          <p className="mt-1 text-sm text-muted-foreground">
            תודה! נמשיך בהכנת האלבום הסופי שלכם.
          </p>
        </div>
      </div>
    );
  }

  if (view === "feedback_sent") {
    return (
      <div className="border-t border-border/60 bg-card px-4 py-6 text-center">
        <div className="mx-auto max-w-md">
          <MessageSquare className="mx-auto mb-3 text-primary" size={36} />
          <p className="text-lg font-semibold">ההערות נשלחו!</p>
          <p className="mt-1 text-sm text-muted-foreground">
            קיבלנו את ההערות שלכם. נעדכן אתכם כשהגרסה המעודכנת תהיה מוכנה.
          </p>
        </div>
      </div>
    );
  }

  if (view === "submitting") {
    return (
      <div className="border-t border-border/60 bg-card px-4 py-6 text-center">
        <Loader2 className="mx-auto animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (view === "feedback") {
    return (
      <div className="border-t border-border/60 bg-card px-4 py-6">
        <div className="mx-auto max-w-lg space-y-3">
          <label className="block text-sm font-medium">
            ספרו לנו מה תרצו לשנות:
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/30"
            rows={4}
            maxLength={5000}
            placeholder="כתבו כאן את ההערות שלכם..."
            autoFocus
            dir="rtl"
          />
          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
          <div className="flex gap-2 justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setView("actions");
                setError(null);
              }}
            >
              ביטול
            </Button>
            <Button
              size="sm"
              onClick={handleSubmitFeedback}
              disabled={!feedback.trim()}
            >
              שליחת הערות
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Default: action buttons
  return (
    <div className="border-t border-border/60 bg-card px-4 py-5">
      <div className="mx-auto max-w-lg">
        {error && (
          <p className="mb-3 text-center text-sm text-red-600">{error}</p>
        )}
        <div className="flex gap-3 justify-center">
          <Button
            size="lg"
            className="rounded-xl text-base"
            onClick={handleApprove}
          >
            <CheckCircle2 className="me-2" size={18} />
            אישור הגרסה
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="rounded-xl text-base"
            onClick={() => setView("feedback")}
          >
            <MessageSquare className="me-2" size={18} />
            יש לי הערות
          </Button>
        </div>
      </div>
    </div>
  );
}
