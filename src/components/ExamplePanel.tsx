import { useState } from "react";
import { examples } from "../prompts/examples";
import { useModelStore } from "../store/modelStore";

export function ExamplePanel() {
  const loadSpec = useModelStore((state) => state.loadSpec);
  const [active, setActive] = useState(examples[0]?.id);

  return (
    <section className="panel panel--left" aria-labelledby="examples-heading">
      <h2 className="panel__heading" id="examples-heading">示例</h2>
      <ul className="example-list">
        {examples.map((example) => (
          <li key={example.id}>
            <button
              type="button"
              className="example-list__item"
              aria-pressed={example.id === active}
              onClick={() => {
                setActive(example.id);
                loadSpec(example.data, example.id);
              }}
            >
              {example.id}
            </button>
          </li>
        ))}
      </ul>
      <p className="panel__note">描述生成和对话修改在 M2 加入。</p>
    </section>
  );
}
