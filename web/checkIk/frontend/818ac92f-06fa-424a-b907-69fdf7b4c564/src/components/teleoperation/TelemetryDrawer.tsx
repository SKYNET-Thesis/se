import React, { useEffect, useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import { useLab } from '../../contexts/LabContext';
import { cx, formatDuration } from '../../lib/format';
import { useSessionClock } from '../../hooks/useLabDerived';

interface Point {
  t: number;
  left: number;
  right: number;
}

export function TelemetryDrawer() {
  const { devices, session, services, backendTask } = useLab();
  const [open, setOpen] = useState(false);
  const [series, setSeries] = useState<Point[]>([]);
  const elapsed = useSessionClock();

  const leftFollower = devices.find((d) => d.id === 'left-follower')!;
  const rightFollower = devices.find((d) => d.id === 'right-follower')!;

  useEffect(() => {
    const i = window.setInterval(() => {
      setSeries((prev) =>
      [
      ...prev,
      {
        t: Date.now(),
        left: leftFollower.joints[1].value ?? 0,
        right: rightFollower.joints[1].value ?? 0
      }].
      slice(-60)
      );
    }, 900);
    return () => window.clearInterval(i);
  }, [leftFollower, rightFollower]);

  const ws = services.find((s) => s.id === 'ws')!;
  const backendLines = (backendTask?.output ?? [])
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-12);

  return (
    <section
      className="telemetry-drawer rounded-2xl border border-line bg-card"
      aria-label="Telemetry drawer">
      
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-3 text-left">
        
        <span className="text-base font-medium text-ink">Telemetry</span>
        <span className="font-mono text-xs text-faint">
          {session ? `${formatDuration(elapsed)} · ${session.commandRateHz} Hz · ${session.latencyMs} ms` : 'no active session'}
        </span>
        <span className="ml-auto text-ink2">
          {open ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronUpIcon className="h-4 w-4" />}
        </span>
      </button>

      {open ?
      <div className="grid gap-4 border-t border-line p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <div className="grid gap-3 sm:grid-cols-2">
            <Plot title="Left shoulder_lift" dataKey="left" color="#35c9d0" data={series} />
            <Plot title="Right shoulder_lift" dataKey="right" color="#a78bfa" data={series} />
          </div>
          <div className="space-y-3">
            <dl className="space-y-1.5 text-sm">
              <Row label="Session duration" value={session ? formatDuration(elapsed) : '—'} />
              <Row label="Command update rate" value={session ? `${session.commandRateHz} Hz` : '—'} />
              <Row label="WebSocket" value={ws.status === 'connected' ? `healthy · ${ws.latencyMs} ms` : 'unavailable'} />
              <Row label="Safety events" value="0 since session start" />
            </dl>
            <div className="rounded-lg border border-line bg-elev/60 p-3">
              <p className="mb-1.5 text-xs uppercase tracking-wider text-faint">Backend log</p>
              {backendLines.length > 0 ?
                <ul className="max-h-44 space-y-1 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-ink2">
                  {backendLines.map((line, index) => <li key={`${index}-${line}`}>{line}</li>)}
                </ul> :
                <p className="font-mono text-xs text-faint">
                  {backendTask?.running ? 'Waiting for LeRobot process output…' : 'No backend task output yet.'}
                </p>}
            </div>
          </div>
        </div> :
      null}
    </section>);

}

function Plot({
  title,
  dataKey,
  color,
  data





}: {title: string;dataKey: 'left' | 'right';color: string;data: Point[];}) {
  return (
    <div className={cx('telemetry-plot rounded-xl border border-line bg-elev/60 p-3')}>
      <p className="mb-2 font-mono text-xs text-ink2">{title}</p>
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -30 }}>
            <YAxis
              tick={{ fontSize: 10, fill: 'rgb(var(--c-muted))' }}
              axisLine={false}
              tickLine={false}
              width={38}
              domain={[-90, 90]} />
            
            <Area
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              fill={color}
              fillOpacity={0.15}
              strokeWidth={1.8}
              isAnimationActive={false}
              dot={false} />
            
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>);

}

function Row({ label, value }: {label: string;value: string;}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink2">{label}</dt>
      <dd className="font-mono text-ink">{value}</dd>
    </div>);

}
