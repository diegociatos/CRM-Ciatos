import React from 'react';

type Props = {
  eyebrow: string;
  title: string;
  description: string;
  steps?: string[];
  action?: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
};

export default function WorkspaceEmpty({ eyebrow, title, description, steps, action, secondary }: Props) {
  return <section className="workspace-empty" aria-label={title}>
    <div className="workspace-empty-copy">
      <p className="workspace-empty-eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p>{description}</p>
      <div className="workspace-empty-actions">
        {action && <button type="button" className="btn-navy" onClick={action.onClick}>{action.label} <span aria-hidden="true">→</span></button>}
        {secondary && <button type="button" className="ux-secondary" onClick={secondary.onClick}>{secondary.label}</button>}
      </div>
    </div>
    {steps && <ol className="workspace-empty-steps">{steps.map((step, index) => <li key={step}><span>{String(index + 1).padStart(2, '0')}</span><p>{step}</p></li>)}</ol>}
  </section>;
}
