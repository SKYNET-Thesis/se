import React from 'react';
import type { ArmId, SimState } from '../../types/robotProgram';
import { sceneZones } from '../../data/simulationScene';
import { ARM_BASES, TABLE } from '../../utils/robotProgram/kinematics';

const ARM_COLORS: Record<ArmId, {link: string;joint: string;}> = {
  left: { link: '#3D434B', joint: '#17191C' },
  right: { link: '#0F7A6E', joint: '#08524A' }
};

/** Top-down schematic. SVG y is flipped so the table front (y = 0) sits at the bottom. */
const sy = (y: number) => TABLE.depth - y;

export function SimulationView({ state }: {state: SimState;}) {
  return (
    <svg viewBox="-24 -20 648 486" className="h-full w-full" role="img" aria-label="Schematic top-down view of the tabletop with both arms and objects">
      <rect x={0} y={0} width={TABLE.width} height={TABLE.depth} rx={6} fill="#FFFFFF" stroke="#CECBC4" strokeWidth={1.5} />
      {[100, 200, 300, 400, 500].map((x) =>
      <line key={`gx${x}`} x1={x} y1={0} x2={x} y2={TABLE.depth} stroke="#ECEAE4" strokeWidth={1} />
      )}
      {[100, 200, 300].map((y) =>
      <line key={`gy${y}`} x1={0} y1={sy(y)} x2={TABLE.width} y2={sy(y)} stroke="#ECEAE4" strokeWidth={1} />
      )}

      {sceneZones.map((z) =>
      <g key={z.id}>
          <rect x={z.x} y={sy(z.y + z.h)} width={z.w} height={z.h} rx={4} fill="#F3F2EE" stroke="#BDB9B0" strokeDasharray="5 4" strokeWidth={1.2} />
          <text x={z.x + 8} y={sy(z.y + z.h) + 17} fontSize={12} fontFamily="Inter, sans-serif" fontWeight={600} fill="#70757D">
            {z.label}
          </text>
        </g>
      )}

      {state.objects.map((o) => {
        const lifted = o.heldBy !== null;
        const cx = o.x;
        const cy = sy(o.y);
        return (
          <g key={o.id}>
            {lifted && <ellipse cx={cx + 6} cy={cy + 8} rx={15} ry={9} fill="#17191C" opacity={0.08} />}
            {o.id === 'green' ?
            <circle cx={cx} cy={cy} r={14} fill={o.color} stroke="#FFFFFF" strokeWidth={2} /> :

            <rect x={cx - 14} y={cy - 14} width={28} height={28} rx={3} fill={o.color} stroke="#FFFFFF" strokeWidth={2} />
            }
          </g>);

      })}

      {(Object.keys(state.arms) as ArmId[]).map((arm) => {
        const a = state.arms[arm];
        const base = { x: ARM_BASES[arm].x, y: sy(ARM_BASES[arm].y) };
        const elbow = { x: a.elbow.x, y: sy(a.elbow.y) };
        const tool = { x: a.tool.x, y: sy(a.tool.y) };
        const angle = Math.atan2(tool.y - elbow.y, tool.x - elbow.x);
        const spread = a.gripper === 'open' ? 11 : 5;
        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);
        const fx = Math.cos(angle) * 12;
        const fy = Math.sin(angle) * 12;
        const c = ARM_COLORS[arm];
        return (
          <g key={arm}>
            <line x1={base.x} y1={base.y} x2={elbow.x} y2={elbow.y} stroke={c.link} strokeWidth={14} strokeLinecap="round" opacity={0.92} />
            <line x1={elbow.x} y1={elbow.y} x2={tool.x} y2={tool.y} stroke={c.link} strokeWidth={10} strokeLinecap="round" opacity={0.92} />
            {[-1, 1].map((s) =>
            <line
              key={s}
              x1={tool.x + nx * spread * s}
              y1={tool.y + ny * spread * s}
              x2={tool.x + nx * spread * s + fx}
              y2={tool.y + ny * spread * s + fy}
              stroke={c.joint}
              strokeWidth={4}
              strokeLinecap="round" />

            )}
            <circle cx={elbow.x} cy={elbow.y} r={6} fill="#FFFFFF" stroke={c.joint} strokeWidth={2.5} />
            <circle cx={base.x} cy={base.y} r={18} fill={c.joint} />
            <text x={base.x} y={base.y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fontFamily="Inter, sans-serif" fill="#FFFFFF">
              {arm === 'left' ? 'L' : 'R'}
            </text>
            {a.busy && <circle cx={base.x} cy={base.y} r={23} fill="none" stroke={c.link} strokeWidth={1.5} strokeDasharray="3 3" />}
          </g>);

      })}

      <text x={0} y={TABLE.depth + 58} fontSize={11} fontFamily="JetBrains Mono, monospace" fill="#8A8F96">
        origin (0,0)
      </text>
      <text x={TABLE.width} y={-6} textAnchor="end" fontSize={11} fontFamily="JetBrains Mono, monospace" fill="#8A8F96">
        600 × 400 mm
      </text>
    </svg>);

}