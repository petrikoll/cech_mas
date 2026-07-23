import React from 'react';
import { createRoot } from 'react-dom/client';

import ProjectReportingApp from './app/ProjectReportingApp.jsx';
import { ProjectProvider } from './context/ProjectContext.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ProjectProvider>
      <ProjectReportingApp />
    </ProjectProvider>
  </React.StrictMode>
);
