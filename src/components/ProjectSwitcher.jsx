import React from 'react';
import { PROJECT_LIST } from '../config/projects.js';

function ProjectSwitcher({ activeProjectId, onChange, disabled = false }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Aktivní projekt
      </div>
      <div className="inline-flex rounded-2xl border border-white bg-white/80 p-1.5 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] ring-1 ring-slate-900/[0.06] backdrop-blur-xl">
        {PROJECT_LIST.map((project) => {
          const active = project.id === activeProjectId;
          return (
            <button
              key={project.id}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(project.id)}
              className={`h-14 min-w-40 rounded-xl border px-6 text-lg font-black tracking-wide transition-all duration-200 ${
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
