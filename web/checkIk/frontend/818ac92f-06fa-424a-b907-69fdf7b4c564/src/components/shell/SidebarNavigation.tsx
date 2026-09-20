import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  ActivityIcon, BoxesIcon, ChevronDownIcon, CircuitBoardIcon, CpuIcon,
  DatabaseIcon, GaugeIcon, GlassesIcon, GraduationCapIcon, PlugZapIcon,
  SettingsIcon, SlidersHorizontalIcon, VideoIcon, WrenchIcon,
} from 'lucide-react';
import { cx } from '../../lib/format';
import { useLab } from '../../contexts/LabContext';

interface Item { to: string; label: string; icon: React.ComponentType<{ className?: string }> }

const sections: { title: string; icon: Item['icon']; items: Item[] }[] = [
  { title: 'Robot Setup', icon: PlugZapIcon, items: [
    { to: '/workspace', label: 'Devices & Ports', icon: PlugZapIcon },
    { to: '/calibration', label: 'Calibration', icon: ActivityIcon },
    { to: '/cameras', label: 'Diagnostics', icon: WrenchIcon },
  ]},
  { title: 'Control', icon: SlidersHorizontalIcon, items: [
    { to: '/dual-arm', label: 'Leader Control', icon: SlidersHorizontalIcon },
    { to: '/vr', label: 'VR Control', icon: GlassesIcon },
  ]},
  { title: 'Data', icon: DatabaseIcon, items: [
    { to: '/recording', label: 'Recording', icon: VideoIcon },
    { to: '/datasets', label: 'Datasets', icon: DatabaseIcon },
  ]},
  { title: 'AI Training', icon: GraduationCapIcon, items: [
    { to: '/training', label: 'New Training', icon: GraduationCapIcon },
    { to: '/training/jobs', label: 'Training Jobs', icon: CpuIcon },
    { to: '/models', label: 'Models', icon: BoxesIcon },
  ]},
];

function NavItem({ item, onNavigate }: { item: Item; onNavigate?: () => void }) {
  return <NavLink title={item.label} to={item.to} onClick={onNavigate} className={({ isActive }) => cx(
    'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors',
    isActive ? 'bg-subtle font-medium text-ink' : 'text-ink2 hover:bg-subtle/70 hover:text-ink',
  )}>
    {({ isActive }) => <><item.icon className={cx('h-4 w-4 shrink-0', isActive ? 'text-brand' : 'text-faint')} /><span className="app-nav-label">{item.label}</span></>}
  </NavLink>;
}

export function SidebarNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const { workspace, session, estop } = useLab();
  const location = useLocation();
  const activeSection = sections.find((section) => section.items.some((item) => location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)))?.title ?? null;
  const [openSection, setOpenSection] = useState<string | null>(activeSection);
  useEffect(() => { if (activeSection) setOpenSection(activeSection); }, [activeSection]);

  return <nav aria-label="Main" className="app-navigation flex h-full flex-col bg-sidebar">
    <div className="app-brand flex h-[4.5rem] shrink-0 items-center gap-3 border-b border-line px-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-[#1a0d05] shadow-[0_1px_0_rgb(255_255_255_/_0.14)_inset]"><CircuitBoardIcon className="h-5 w-5" /></span>
      <div className="app-brand-copy min-w-0"><p className="font-semibold tracking-[-0.02em] text-ink">leLab Control</p><p className="font-mono text-[11px] text-faint">SO-101 / CONTROL PLANE</p></div>
    </div>
    <div className="border-b border-line px-4 py-3">
      <p className="eyebrow-label">Workspace</p>
      <p className="app-workspace-name mt-1 truncate font-medium text-ink">{workspace.name}</p>
      <p className="app-workspace-meta mt-0.5 font-mono text-xs text-faint">{workspace.dirty ? 'Unsaved changes' : `Saved · ${workspace.updatedAt}`}</p>
    </div>
    <div className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
      <NavItem item={{ to: '/dashboard', label: 'Dashboard', icon: GaugeIcon }} onNavigate={onNavigate} />
      {sections.map((section) => {
        const open = openSection === section.title;
        const active = activeSection === section.title;
        return <div key={section.title} className="pt-1">
          <button title={section.title} type="button" onClick={() => setOpenSection(open ? null : section.title)} className={cx('app-nav-section flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors', active ? 'text-ink' : 'text-ink2 hover:bg-subtle/60')}>
            <section.icon className={cx('h-4 w-4 shrink-0', active ? 'text-brand' : 'text-faint')} /><span className="app-nav-label font-medium">{section.title}</span>
            <ChevronDownIcon className={cx('app-nav-chevron ml-auto h-4 w-4 transition-transform', open && 'rotate-180')} />
          </button>
          {open ? <div className="ml-4 mt-1 space-y-0.5 border-l border-line pl-2">{section.items.map((item) => <NavItem key={item.to} item={item} onNavigate={onNavigate} />)}</div> : null}
        </div>;
      })}
      <div className="pt-1"><NavItem item={{ to: '/settings', label: 'Settings', icon: SettingsIcon }} onNavigate={onNavigate} /></div>
    </div>
    <div className="space-y-1.5 border-t border-line px-4 py-3 text-sm">
      <div className="flex justify-between"><span className="text-ink2">Session</span><span className="font-mono text-ink">{session?.state === 'active' ? 'Live' : 'Idle'}</span></div>
      <div className="flex justify-between"><span className="text-ink2">Safety</span><span className={cx('font-mono', estop === 'ready' ? 'text-ok' : 'text-danger')}>{estop === 'ready' ? 'E-STOP READY' : 'E-STOP ACTIVE'}</span></div>
    </div>
  </nav>;
}
