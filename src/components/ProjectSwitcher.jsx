import React from 'react';
import { PROJECT_LIST } from '../config/projects.js';

function ProjectSwitcher({ activeProjectId, onChange, disabled = false }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        Aktivní projekt
      </div>
      <div className="inline-flex rounded-2xl border border-slate-300/80 bg-white/55 p-1.5 shadow-inner backdrop-blur-sm">
        {PROJECT_LIST.map((project) => {
          const active = project.id === activeProjectId;
          return (
            <button
              key={project.id}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onChange(project.id)}
              className={`h-14 min-w-40 rounded-xl border-2 px-6 text-lg font-black tracking-wide transition ${
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
