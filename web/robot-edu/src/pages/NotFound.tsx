import React from 'react';
import { CompassIcon } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { LinkButton } from '../components/ui/LinkButton';

export function NotFound() {
  return (
    <div className="flex min-h-full items-center justify-center">
      <EmptyState icon={<CompassIcon />} title="Page not found" description="The page you're looking for doesn't exist." action={<LinkButton to="/">Go to dashboard</LinkButton>} />
    </div>);

}