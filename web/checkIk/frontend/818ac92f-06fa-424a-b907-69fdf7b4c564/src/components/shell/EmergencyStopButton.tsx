import React, { useState } from 'react';
import { OctagonXIcon, RotateCcwIcon } from 'lucide-react';
import { useLab } from '../../contexts/LabContext';
import { cx } from '../../lib/format';
import { Button } from '../ui/Button';

export function EmergencyStopButton({ compact = false }: {compact?: boolean;}) {
  const { estop, triggerEStop, resetEStop } = useLab();
  const [confirming, setConfirming] = useState(false);

  if (estop === 'active') {
    return (
      <div className="flex items-center gap-2">
        <span
          className={cx(
            'inline-flex items-center gap-2 rounded-lg border border-danger bg-danger/15 px-3 text-danger font-semibold',
            compact ? 'h-9 text-sm' : 'h-10 text-base'
          )}
          role="status">
          
          <OctagonXIcon className="h-4 w-4" />
          E-STOP ACTIVE
        </span>
        <Button size={compact ? 'sm' : 'md'} icon={RotateCcwIcon} onClick={resetEStop}>
          Reset
        </Button>
      </div>);

  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => confirming ? triggerEStop() : setConfirming(true)}
        onBlur={() => setConfirming(false)}
        aria-label="Emergency stop"
        className={cx(
          'inline-flex items-center gap-2 rounded-lg border font-semibold transition-colors duration-150 ease-smooth px-3',
          compact ? 'h-9 text-sm' : 'h-10 text-base',
          confirming ?
          'border-danger bg-danger text-[#2a0b0b]' :
          'border-danger/50 bg-danger/10 text-danger hover:bg-danger/20'
        )}>
        
        <OctagonXIcon className="h-4 w-4" />
        {confirming ? 'Confirm stop' : 'Emergency Stop'}
      </button>
      {confirming ?
      <p className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-line bg-elev p-3 text-sm text-ink2 shadow-pop z-30">
          Releases torque on all connected arms and ends the active session. Physical stop behaviour
          depends on backend and hardware support — the interface alone does not guarantee it.
        </p> :
      null}
    </div>);

}