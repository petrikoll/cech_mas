import React, { createContext, useContext, useMemo, useState } from 'react';
import { PROJECT_IDS, getProject, normalizeProjectId } from '../config/projects.js';

const STORAGE_KEY = 'cechMasReporting.activeProject';
const ProjectContext = createContext(null);

function readInitialProjectId() {
  if (typeof window === 'undefined') return PROJECT_IDS.CECH;
  try {
    return normalizeProjectId(window.localStorage.getItem(STORAGE_KEY)) || PROJECT_IDS.CECH;
  } catch {
    return PROJECT_IDS.CECH;
  }
}

function ProjectProvider({ children }) {
  const [activeProjectId, setActiveProjectIdState] = useState(readInitialProjectId);

  const setActiveProjectId = (nextProjectId) => {
    const normalized = normalizeProjectId(nextProjectId);
    if (!normalized) return false;
    setActiveProjectIdState(normalized);
    try {
      window.localStorage.setItem(STORAGE_KEY, normalized);
    } catch {
      // Aplikace funguje i v režimu, kde prohlížeč localStorage blokuje.
    }
    return true;
  };

  const value = useMemo(() => ({
    activeProjectId,
    activeProject: getProject(activeProjectId),
    setActiveProjectId
  }), [activeProjectId]);

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

function useProject() {
  const context = useContext(ProjectContext);
  if (!context) throw new Error('useProject musí být použit uvnitř ProjectProvider.');
  return context;
}

export { ProjectProvider, useProject };
