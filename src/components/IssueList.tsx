import { useModelStore } from "../store/modelStore";

/** Shown only when the model has problems; a clean model needs no panel. */
export function IssueList() {
  const issues = useModelStore((state) => state.issues);
  if (issues.length === 0) return null;

  return (
    <section className="issues" aria-labelledby="issues-heading">
      <h2 className="panel__heading" id="issues-heading">
        校验
      </h2>
      <ul className="issues__list">
        {issues.map((issue) => (
          <li key={issue.message} className={`issue issue--${issue.level}`}>
            <span aria-hidden="true">{issue.level === "error" ? "●" : "▲"}</span>
            <span className="issue__message">{issue.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
