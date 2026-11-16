import { DigitalTwinWorkspace } from '../components/digital-twin/DigitalTwinWorkspace';
import { PageHeader } from '../components/ui/PageHeader';
import { LinkButton } from '../components/ui/LinkButton';
import { ArrowLeft } from 'lucide-react';

export function DigitalTwinPage() {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-8 md:py-8">
      <div className="mb-6">
        <PageHeader
          title="SO-101 3D Simulation & Monitoring"
          description="High-fidelity 3D robotics visualization, leader–follower synchronization inspection, and kinematic simulation for tabletop manipulation."
          actions={
            <LinkButton to="/lab" variant="secondary" icon={<ArrowLeft className="h-4 w-4" />}>
              Back to Robot Control &amp; Practice
            </LinkButton>
          }
        />
      </div>

      <DigitalTwinWorkspace />
    </div>
  );
}
