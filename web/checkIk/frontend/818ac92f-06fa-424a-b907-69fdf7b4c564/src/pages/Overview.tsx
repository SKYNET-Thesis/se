import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayIcon, VideoIcon } from 'lucide-react';
import { PageHeader, Section } from '../components/ui/PageHeader';
import { WorkflowProgress } from '../components/robotics/WorkflowProgress';
import {
  IntegrationAlertNotice,
  OperationalAlertBanner } from
'../components/robotics/AlertBanners';
import { TeleoperationReadinessCard } from '../components/teleoperation/TeleoperationReadinessCard';
import { RobotPairSection } from '../components/robotics/RobotPairSection';
import { CameraGrid } from '../components/cameras/CameraViews';
import { DatasetSummaryCard } from '../components/datasets/DatasetSummaryCard';
import { TrainingSummaryCard } from '../components/training/TrainingSummaryCard';
import { BackendServicesCard } from '../components/system/BackendServicesCard';
import { OperatorDevicesCard } from '../components/system/OperatorDevicesCard';
import { RecentActivityFeed } from '../components/system/RecentActivityFeed';
import { TelemetryModeToggle } from '../components/robotics/JointTelemetryList';
import { Button } from '../components/ui/Button';
import { SimulatedBadge } from '../components/ui/Badge';
import { useLab } from '../contexts/LabContext';
import {
  useArmPairReadiness,
  useDualArmAvailability,
  useOperationalAlerts,
  useWorkflowSteps } from
'../hooks/useLabDerived';

export function Overview() {
  const { cameras, telemetryMode, setTelemetryMode, startSession, estop } = useLab();
  const pairs = useArmPairReadiness();
  const dual = useDualArmAvailability();
  const alerts = useOperationalAlerts();
  const steps = useWorkflowSteps();
  const navigate = useNavigate();

  const critical = alerts.filter((a) => a.severity === 'critical');
  const optional = alerts.filter((a) => a.severity === 'optional');

  return (
    <div className="dashboard-page mx-auto max-w-[112rem] space-y-7">
      <PageHeader
        title="Rig overview"
        description="Live state of both robotic arm pairs, cameras, datasets, training jobs, and backend services."
        meta={<SimulatedBadge />}
        actions={
        <>
            <Button icon={VideoIcon} onClick={() => navigate('/recording')}>
              Record episode
            </Button>
            {dual.available ?
          <Button
            variant="primary"
            icon={PlayIcon}
            onClick={() => {
              startSession('dual', ['left', 'right']);
              navigate('/dual-arm');
            }}>
            
                Start Dual-Arm Teleoperation
              </Button> :

          <Button
            variant="primary"
            icon={PlayIcon}
            disabled={!pairs.left.ready && !pairs.right.ready}
            onClick={() => {
              const side = pairs.left.ready ? 'left' : 'right';
              startSession('single', [side]);
              navigate('/teleoperation');
            }}
            title={dual.reason ?? undefined}>
            
                Start teleoperation
              </Button>
          }
          </>
        } />
      

      <div className="dashboard-command-deck">
        <WorkflowProgress steps={steps} />
        <div className="dashboard-command-deck__session">
          <TeleoperationReadinessCard />
        </div>
      </div>

      {critical.length ? <OperationalAlertBanner alerts={critical} /> : null}

      <div className="grid gap-5 2xl:grid-cols-2">
        <RobotPairSection pair={pairs.left} detailed={telemetryMode === 'detailed'} />
        <RobotPairSection pair={pairs.right} detailed={telemetryMode === 'detailed'} />
        <div className="flex justify-end 2xl:col-span-2">
          <TelemetryModeToggle mode={telemetryMode} onChange={setTelemetryMode} />
        </div>
      </div>

      <Section
        title="Camera feeds"
        description={`${cameras.filter((c) => c.connection === 'connected').length} of ${cameras.length} configured cameras are streaming`}
        actions={
        <Button size="sm" variant="ghost" onClick={() => navigate('/cameras')}>
            Manage cameras
          </Button>
        }>
        
        <CameraGrid cameras={cameras} />
      </Section>

      <div className="grid gap-4 xl:grid-cols-2">
        <DatasetSummaryCard />
        <TrainingSummaryCard />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <BackendServicesCard />
        <OperatorDevicesCard />
      </div>

      {optional.length ? <IntegrationAlertNotice alerts={optional} /> : null}

      <RecentActivityFeed />

      {estop === 'active' ?
      <p className="text-sm text-danger">
          Emergency stop is engaged — all motion actions stay disabled until it is reset.
        </p> :
      null}
    </div>);

}
