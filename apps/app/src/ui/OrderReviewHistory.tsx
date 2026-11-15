import type { Question } from "@aimo/contracts";
import { day, eur, qty, when } from "../format";

/** Keep the submitted terms and decisions available outside the concise action panel. */
export function OrderReviewHistory({ questions }: { questions: Question[] }) {
  const reviews = questions.filter((q) => q.type === "order_review");
  if (!reviews.length) return null;
  return (
    <details className="card order-review-history">
      <summary>Order review history</summary>
      <ol>
        {reviews.map((q) => {
          const facts = q.facts as { lines?: { lineId: string; product: string; quantity: number; unit: string | null; lineTotal: number | null }[]; items?: { text: string }[]; deliveryDate?: string };
          return (
            <li key={q.id}>
              <h3>{q.state === "answered" ? q.answer === "reject" ? "Returned for changes" : "Approval decision recorded" : q.state === "open" ? "Waiting for approval" : q.state === "expired" ? "Review expired" : q.state === "replaced" ? "Review replaced" : "Waiting for the chef"}</h3>
              <p className="small muted">Submitted {when(q.createdAt)}{q.answeredBy && <> · {q.answeredBy.name}, {when(q.answeredAt)}</>}</p>
              <p className="small">{q.body}</p>
              {q.answerNote && <p className="decision-note"><strong>Note to order builder: </strong>{q.answerNote}</p>}
              {facts.deliveryDate && <p className="small">Delivery {day(facts.deliveryDate)}</p>}
              {!!facts.items?.length && <ul className="small">{facts.items.map((item, index) => <li key={index}>{item.text}</li>)}</ul>}
              {!!facts.lines?.length && <ul className="small">{facts.lines.map((line) => <li key={line.lineId}>{line.product} · {qty(line.quantity)} {line.unit} · {eur(line.lineTotal)} ex VAT</li>)}</ul>}
            </li>
          );
        })}
      </ol>
    </details>
  );
}
