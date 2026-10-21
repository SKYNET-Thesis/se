import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FileQuestionIcon, PlusIcon, PuzzleIcon } from 'lucide-react';
import { usePrograms } from '../contexts/ProgramsContext';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { StudioWorkspace } from '../components/studio/StudioWorkspace';
import { StudioMobile } from '../components/studio/StudioMobile';
import { NewProgramDialog } from '../components/studio/NewProgramDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { LinkButton } from '../components/ui/LinkButton';

export function Studio() {
  const { programId } = useParams();
  const navigate = useNavigate();
  const { programs, getProgram, createProgram } = usePrograms();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const [newOpen, setNewOpen] = useState(false);

  const mostRecent = useMemo(() => [...programs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0], [programs]);

  useEffect(() => {
    if (!programId && mostRecent) navigate(`/studio/${mostRecent.id}`, { replace: true });
  }, [programId, mostRecent, navigate]);

  const record = programId ? getProgram(programId) : undefined;

  if (!programId && !mostRecent) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas">
        <EmptyState
          icon={<PuzzleIcon />}
          title="No programs yet"
          description="Create a Blockly draft, validate its RobotProgram structure, and save an immutable version before submitting it."
          action={
          <Button variant="primary" icon={<PlusIcon className="h-4 w-4" />} onClick={() => setNewOpen(true)}>
              New program
            </Button>
          } />
        
        <NewProgramDialog
          open={newOpen}
          onClose={() => setNewOpen(false)}
          onCreate={(input) => {
            const created = createProgram(input);
            setNewOpen(false);
            navigate(`/studio/${created.id}`);
          }} />
        
      </div>);

  }

  if (programId && !record) {
    return (
      <div className="flex h-full items-center justify-center bg-canvas">
        <EmptyState
          icon={<FileQuestionIcon />}
          title="Program not found"
          description="It may have been deleted, or it was saved in a different browser."
          action={<LinkButton to="/studio">Open latest program</LinkButton>} />
        
      </div>);

  }

  if (!record) return null;
  return isDesktop ? <StudioWorkspace record={record} /> : <div className="h-full overflow-y-auto"><StudioMobile record={record} /></div>;
}
