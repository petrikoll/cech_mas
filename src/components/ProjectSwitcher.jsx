import React from 'react';
import { PROJECT_LIST } from '../config/projects.js';

function ProjectSwitcher({ activeProjectId, onChange, disabled = false }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Aktivní projekt
      </div>
      <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 shadow-inner">
        {PROJECT_LIST.map((project) => {
          const active = project.id === activeProjectId;
          return (
            <button
              key={project.id}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(project.id)}
              className={`min-w-24 rounded-lg border px-4 py-2 text-sm font-extrabold transition ${
                active ? project.theme.active : project.theme.idle
              } disabled:cursor-not-allowed disabled:opacity-60`}
              title={project.title}
            >
              {project.shortName}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ProjectSwitcher;
