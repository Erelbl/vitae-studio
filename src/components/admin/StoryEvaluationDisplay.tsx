interface RhymeEvaluation {
  rhyme_score: number;
  hebrew_flow_score: number;
  overall_story_score: number;
  evaluation_notes: string;
  evaluated_at: string;
}

interface StoryEvaluationDisplayProps {
  evaluation: RhymeEvaluation;
}

function ScoreBadge({ score, label }: { score: number; label: string }) {
  const color =
    score >= 8
      ? "bg-green-100 text-green-800 border-green-200"
      : score >= 6
      ? "bg-yellow-50 text-yellow-800 border-yellow-200"
      : score >= 4
      ? "bg-orange-50 text-orange-800 border-orange-200"
      : "bg-red-50 text-red-700 border-red-200";

  return (
    <div className={`flex flex-col items-center rounded-lg border px-3 py-2 ${color}`}>
      <span className="text-xl font-bold leading-none">{score}</span>
      <span className="text-xs mt-1 text-center leading-tight">{label}</span>
    </div>
  );
}

export function StoryEvaluationDisplay({
  evaluation,
}: StoryEvaluationDisplayProps) {
  const { rhyme_score, hebrew_flow_score, overall_story_score, evaluation_notes, evaluated_at } =
    evaluation;

  // Don't show if all scores are 0 (evaluation failed silently)
  if (rhyme_score === 0 && hebrew_flow_score === 0 && overall_story_score === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3">
      <p className="text-xs font-medium text-muted-foreground">הערכת איכות</p>

      <div className="flex gap-3">
        <ScoreBadge score={rhyme_score} label="חריזה" />
        <ScoreBadge score={hebrew_flow_score} label="עברית / זרימה" />
        <ScoreBadge score={overall_story_score} label="כללי" />
      </div>

      {evaluation_notes && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {evaluation_notes}
        </p>
      )}

      <p className="text-[11px] text-muted-foreground/60">
        הוערך:{" "}
        {new Date(evaluated_at).toLocaleString("he-IL", {
          timeZone: "Asia/Jerusalem",
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </div>
  );
}
