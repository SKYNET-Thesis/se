import React from 'react';
import type { RobotDevice } from '../../types';

function armPath(
originX: number,
pan: number,
lift: number,
elbow: number,
color: string,
dim: boolean,
labelSide: 'left' | 'right')
{
  const rad = (d: number) => d * Math.PI / 180;
  const baseY = 250;
  const l1 = 92;
  const l2 = 74;
  const l3 = 42;

  const a1 = rad(-90 + lift * 0.55 + pan * 0.18);
  const j1 = { x: originX + Math.cos(a1) * l1, y: baseY + Math.sin(a1) * l1 };
  const a2 = a1 + rad(elbow * 0.7);
  const j2 = { x: j1.x + Math.cos(a2) * l2, y: j1.y + Math.sin(a2) * l2 };
  const a3 = a2 + rad(28);
  const tip = { x: j2.x + Math.cos(a3) * l3, y: j2.y + Math.sin(a3) * l3 };

  const opacity = dim ? 0.28 : 1;

  return (
    <g opacity={opacity}>
      <rect
        x={originX - 26}
        y={baseY}
        width="52"
        height="16"
        rx="4"
        fill="rgb(var(--c-subtle))"
        stroke={color}
        strokeOpacity="0.5" />
      
      <line x1={originX} y1={baseY} x2={j1.x} y2={j1.y} stroke={color} strokeWidth="9" strokeLinecap="round" />
      <line x1={j1.x} y1={j1.y} x2={j2.x} y2={j2.y} stroke={color} strokeWidth="7" strokeLinecap="round" />
      <line x1={j2.x} y1={j2.y} x2={tip.x} y2={tip.y} stroke={color} strokeWidth="5" strokeLinecap="round" />
      <circle cx={originX} cy={baseY} r="7" fill="rgb(var(--c-card))" stroke={color} strokeWidth="2" />
      <circle cx={j1.x} cy={j1.y} r="6" fill="rgb(var(--c-card))" stroke={color} strokeWidth="2" />
      <circle cx={j2.x} cy={j2.y} r="5" fill="rgb(var(--c-card))" stroke={color} strokeWidth="2" />
      <circle cx={tip.x} cy={tip.y} r="4.5" fill={color} />
      <text
        x={originX}
        y={baseY + 32}
        textAnchor="middle"
        fontSize="11"
        fontFamily="JetBrains Mono, monospace"
        fill={color}>
        
        {labelSide === 'left' ? 'LEFT' : 'RIGHT'}
      </text>
    </g>);

}

export function DualArmWorkspaceViz({
  left,
  right,
  active




}: {left: RobotDevice;right: RobotDevice;active: boolean;}) {
  const val = (d: RobotDevice, i: number) => d.joints[i].value ?? 0;

  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-elev">
      <svg viewBox="0 0 520 300" className="h-full w-full" role="img" aria-label="Top-down workspace view of both SO-101 arms">
        <defs>
          <pattern id="wsgrid" width="26" height="26" patternUnits="userSpaceOnUse">
            <path d="M26 0H0V26" fill="none" stroke="rgb(var(--c-border))" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width="520" height="300" fill="url(#wsgrid)" />
        <rect
          x="150"
          y="196"
          width="220"
          height="54"
          rx="6"
          fill="rgb(var(--c-subtle))"
          stroke="rgb(var(--c-border))" />
        
        <text x="260" y="228" textAnchor="middle" fontSize="11" fontFamily="JetBrains Mono, monospace" fill="rgb(var(--c-muted))">
          shared task area
        </text>
        {armPath(150, val(left, 0), val(left, 1), val(left, 2), '#35c9d0', left.connection !== 'connected', 'left')}
        {armPath(
          370,
          val(right, 0),
          val(right, 1),
          val(right, 2),
          '#a78bfa',
          right.connection !== 'connected',
          'right'
        )}
        {right.connection !== 'connected' ?
        <text x="370" y="130" textAnchor="middle" fontSize="12" fontFamily="Inter, sans-serif" fill="#f87171">
            right follower offline
          </text> :
        null}
      </svg>
      <span className="absolute left-3 top-3 rounded-md border border-line bg-card/85 px-2 py-0.5 text-xs text-ink2">
        Workspace view · {active ? 'live joint feed' : 'last known pose'}
      </span>
    </div>);

}