import { useModelStore } from "../store/modelStore";

export function IssueList() {
  const issues = useModelStore((state) => state.issues);

  return (
    <section className="issues" aria-labelledby="issues-heading">
      <h2 className="panel__heading" id="issues-heading">校验</h2>
      {issues.length === 0 ? (
        <p className="issues__none">没有问题</p>
      ) : (
        <ul className="issues__list">
          {issues.map((issue) => (
            <li key={issue.message} className={`issue issue--${issue.level}`}>
              <span aria-hidden="true">{issue.level === "error" ? "●" : "▲"}</span>
              <span className="issue__message">{issue.message}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
