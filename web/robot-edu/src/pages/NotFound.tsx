import React from 'react';
import { CompassIcon } from 'lucide-react';
import { EmptyState } from '../components/ui/EmptyState';
import { LinkButton } from '../components/ui/LinkButton';

export function NotFound() {
  return (
    <div className="flex min-h-full items-center justify-center">
      <EmptyState icon={<CompassIcon />} title="Page not found" description="This page doesn’t exist, or the link is out of date." action={<LinkButton to="/">Go to your home page</LinkButton>} />
    </div>);

}