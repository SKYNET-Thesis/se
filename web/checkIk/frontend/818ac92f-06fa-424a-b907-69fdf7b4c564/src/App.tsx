import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LabProvider } from './contexts/LabContext';
import { AppShell } from './layouts/AppShell';
import { WorkspacePorts } from './pages/WorkspacePorts';
import { Calibration } from './pages/Calibration';
import { Teleoperation } from './pages/Teleoperation';
import { DualArm } from './pages/DualArm';
import { VRControl } from './pages/VRControl';
import { Cameras } from './pages/Cameras';
import { Recording } from './pages/Recording';
import { DatasetLibrary } from './pages/DatasetLibrary';
import { DatasetDetail } from './pages/DatasetDetail';
import { TrainingSetup } from './pages/TrainingSetup';
import { TrainingJobs } from './pages/TrainingJobs';
import { Models } from './pages/Models';
import { Inference } from './pages/Inference';
import { Integrations } from './pages/Integrations';
import { Settings } from './pages/Settings';
import { Overview } from './pages/Overview';

export function App() {
  return (
    <LabProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Overview />} />
            <Route path="/workspace" element={<WorkspacePorts />} />
            <Route path="/calibration" element={<Calibration />} />
            <Route path="/teleoperation" element={<Teleoperation />} />
            <Route path="/dual-arm" element={<DualArm />} />
            <Route path="/vr" element={<VRControl />} />
            <Route path="/cameras" element={<Cameras />} />
            <Route path="/recording" element={<Recording />} />
            <Route path="/datasets" element={<DatasetLibrary />} />
            <Route path="/datasets/:datasetId" element={<DatasetDetail />} />
            <Route path="/training" element={<TrainingSetup />} />
            <Route path="/training/jobs" element={<TrainingJobs />} />
            <Route path="/models" element={<Models />} />
            <Route path="/inference" element={<Inference />} />
            <Route path="/integrations" element={<Integrations />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/workspace" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </LabProvider>);

}
