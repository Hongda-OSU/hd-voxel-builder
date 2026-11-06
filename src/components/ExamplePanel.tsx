import { examples } from "../prompts/examples";
import { useModelStore } from "../store/modelStore";
import { useProjectStore } from "../store/projectStore";
import { GeneratePanel } from "./GeneratePanel";

export function ExamplePanel() {
  const loadSpec = useModelStore((state) => state.loadSpec);
  // A generated model has its own id, so no example stays highlighted.
  const modelId = useModelStore((state) => state.modelId);

  return (
    <section className="panel panel--left" aria-label="生成与示例">
      <div className="left-scroll">
        <h2 className="panel__heading" id="examples-heading">
          示例
        </h2>
        <ul className="example-list" aria-labelledby="examples-heading">
          {examples.map((example) => (
            <li key={example.id}>
              <button
                type="button"
                className="example-list__item"
                aria-pressed={example.id === modelId}
                onClick={() => {
                  useProjectStore.getState().close();
                  loadSpec(example.data, example.id);
                }}
              >
                {example.id}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <GeneratePanel />
    </section>
  );
}
