import type { PlayTemplateDefinition } from "../../lib/projectTemplates";
import { formatPlayLabel } from "../../lib/playMetadata";

interface QuickCreateGridProps {
  templates: PlayTemplateDefinition[];
  onCreateFromTemplate: (templateId: string) => void;
}

export function QuickCreateGrid({ templates, onCreateFromTemplate }: QuickCreateGridProps) {
  return (
    <div className="template-grid">
      {templates.map((template) => (
        <button
          key={template.id}
          type="button"
          className="template-card"
          onClick={() => onCreateFromTemplate(template.id)}
        >
          <p className="eyebrow">{formatPlayLabel(template.restartType)}</p>
          <h3>{template.name}</h3>
          <p>{template.description}</p>
          <div className="template-card__meta">
            <span className="status-pill">{formatPlayLabel(template.category)}</span>
            {template.system ? <span className="status-pill">{template.system}</span> : null}
          </div>
        </button>
      ))}
    </div>
  );
}
