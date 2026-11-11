import { useState, useRef, useEffect } from 'react';
import {
  BookOpenIcon,
  BotIcon,
  ChevronDownIcon,
  Code2Icon,
  FileTextIcon,
  HelpCircleIcon,
  LayersIcon,
  PlusIcon,
  SparklesIcon,
  UsersIcon,
  VideoIcon,
  WrenchIcon,
} from 'lucide-react';
import { Button } from '../ui/Button';

export interface AddContentMenuProps {
  onSelectType: (type: string) => void;
  disabled?: boolean;
  disabledTypes?: Record<string, string>;
  buttonSize?: 'sm' | 'md';
}

interface ContentTypeItem {
  type: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  supported: boolean;
  badge?: string;
  unsupportedReason?: string;
}

export const CONTENT_TYPE_REGISTRY: ContentTypeItem[] = [
  {
    type: 'video',
    label: 'Video',
    description: 'Lecture, robot demonstration or instructional video clip',
    icon: <VideoIcon className="h-4 w-4 text-blue-500" />,
    supported: true,
  },
  {
    type: 'reading',
    label: 'Reading',
    description: 'Text article, documentation, slides or reference materials',
    icon: <FileTextIcon className="h-4 w-4 text-emerald-500" />,
    supported: true,
  },
  {
    type: 'demonstration',
    label: 'Demonstration',
    description: 'Instructional demonstration or step-by-step walkthrough',
    icon: <VideoIcon className="h-4 w-4 text-blue-500" />,
    supported: true,
  },
  {
    type: 'knowledge_check',
    label: 'Quiz',
    description: 'Knowledge check with single/multiple choice questions',
    icon: <HelpCircleIcon className="h-4 w-4 text-amber-500" />,
    supported: true,
    badge: 'Formative',
  },
  {
    type: 'guided_practice',
    label: 'Programming Assignment',
    description: 'Structured Blockly programming activity with criteria',
    icon: <Code2Icon className="h-4 w-4 text-purple-500" />,
    supported: true,
  },
  {
    type: 'simulation',
    label: '3D Simulation',
    description: 'Interactive SO-101 kinematic simulation activity',
    icon: <BotIcon className="h-4 w-4 text-indigo-500" />,
    supported: true,
  },
  {
    type: 'challenge',
    label: 'Robot Challenge',
    description: 'Evaluated task with symbolic rules and automated verification',
    icon: <SparklesIcon className="h-4 w-4 text-cyan-500" />,
    supported: true,
  },
  {
    type: 'physical_lab',
    label: 'Physical Robot Lab',
    description: 'Physical tabletop robot manipulation on hardware',
    icon: <WrenchIcon className="h-4 w-4 text-orange-500" />,
    supported: true,
  },
  {
    type: 'reflection',
    label: 'Reflection',
    description: 'Self-assessment and learning takeaways write-up',
    icon: <BookOpenIcon className="h-4 w-4 text-teal-500" />,
    supported: true,
  },
  {
    type: 'result',
    label: 'Result',
    description: 'Share a result or follow-up learning resource',
    icon: <FileTextIcon className="h-4 w-4 text-emerald-500" />,
    supported: true,
  },
  // Unsupported Coursera activity types (documented gaps per Phase 4)
  {
    type: 'peer_review',
    label: 'Peer Review',
    description: 'Students review each other’s robot program submissions',
    icon: <UsersIcon className="h-4 w-4 text-ink-subtle" />,
    supported: false,
    unsupportedReason: 'Requires peer grading engine (unsupported by VISTA backend)',
  },
  {
    type: 'dialogue',
    label: 'Dialogue',
    description: 'Interactive conversational chat activity with virtual coach',
    icon: <SparklesIcon className="h-4 w-4 text-ink-subtle" />,
    supported: false,
    badge: 'New',
    unsupportedReason: 'Requires dialogue model service (unsupported by VISTA backend)',
  },
  {
    type: 'app_item',
    label: 'App Item',
    description: 'External LTI tool integration or third-party web app',
    icon: <LayersIcon className="h-4 w-4 text-ink-subtle" />,
    supported: false,
    unsupportedReason: 'Requires LTI 1.3 tool provider (unsupported by VISTA backend)',
  },
  {
    type: 'teammate_review',
    label: 'Teammate Review',
    description: 'Multi-student group robotics project collaboration review',
    icon: <UsersIcon className="h-4 w-4 text-ink-subtle" />,
    supported: false,
    unsupportedReason: 'Requires group assessment service (unsupported by VISTA backend)',
  },
];

export function AddContentMenu({ onSelectType, disabled = false, disabledTypes = {}, buttonSize = 'sm' }: AddContentMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block" ref={menuRef}>
      {/* Quick Add Bar (Coursera Reference 3 & 4 style) */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button
          size={buttonSize}
          variant="secondary"
          disabled={disabled || Boolean(disabledTypes.video)}
          title={disabledTypes.video}
          icon={<PlusIcon className="h-3 w-3" />}
          onClick={() => onSelectType('video')}
          aria-label="Quick Add Video"
        >
          Video
        </Button>
        <Button
          size={buttonSize}
          variant="secondary"
          disabled={disabled}
          icon={<PlusIcon className="h-3 w-3" />}
          onClick={() => onSelectType('reading')}
          aria-label="Quick Add Reading"
        >
          Reading
        </Button>
        <Button
          size={buttonSize}
          variant="secondary"
          disabled={disabled}
          icon={<PlusIcon className="h-3 w-3" />}
          onClick={() => onSelectType('knowledge_check')}
          aria-label="Quick Add Quiz"
        >
          Quiz
        </Button>

        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(!open)}
          aria-label="More content types"
          aria-expanded={open}
          className="inline-flex items-center gap-1 rounded-md border border-line-strong bg-surface px-2.5 py-1 text-xs font-semibold text-ink hover:bg-sunken/60 disabled:opacity-40 transition-colors"
        >
          <span>More</span>
          <ChevronDownIcon className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {disabledTypes.knowledge_check && <p className="mt-1 text-2xs text-ink-muted">Quiz unavailable: {disabledTypes.knowledge_check}</p>}

      {/* Extended Dropdown Menu (Coursera Reference 2 & 5 style) */}
      {open && (
        <div
          role="menu"
          aria-label="Add content menu"
          className="absolute left-0 top-full z-30 mt-1.5 w-80 rounded-xl border border-line bg-surface p-1.5 shadow-xl animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-3 py-2 border-b border-line">
            <p className="text-2xs font-semibold uppercase tracking-wider text-ink-subtle">
              Add new item
            </p>
          </div>

          <div className="max-h-80 overflow-y-auto py-1 divide-y divide-line/30">
            {/* Supported Activities */}
            <div className="py-1">
              <span className="px-3 py-1 text-2xs font-bold text-accent-ink uppercase tracking-wider block">
                Supported Activities
              </span>
              {CONTENT_TYPE_REGISTRY.filter((i) => i.supported).map((item) => (
                <button
                  key={item.type}
                  type="button"
                  role="menuitem"
                  disabled={disabled || Boolean(disabledTypes[item.type])}
                  title={disabledTypes[item.type]}
                  onClick={() => {
                    onSelectType(item.type);
                    setOpen(false);
                  }}
                  className="w-full flex items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent-soft/40 transition-colors group disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <div className="mt-0.5 shrink-0">{item.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-ink group-hover:text-accent transition-colors">
                        {item.label}
                      </span>
                      {item.badge && (
                        <span className="rounded bg-accent/10 text-accent px-1.5 py-0.2 text-3xs font-bold">
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-2xs text-ink-muted truncate mt-0.5">
                      {disabledTypes[item.type] ?? item.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {/* Unsupported Types (Phase 4 Gap Documentation) */}
            <div className="py-1 bg-sunken/20">
              <span className="px-3 py-1 text-2xs font-bold text-ink-subtle uppercase tracking-wider block">
                External / Future Gaps
              </span>
              {CONTENT_TYPE_REGISTRY.filter((i) => !i.supported).map((item) => (
                <div
                  key={item.type}
                  className="px-3 py-2 flex items-start gap-3 opacity-60 cursor-not-allowed select-none"
                  title={item.unsupportedReason}
                >
                  <div className="mt-0.5 shrink-0">{item.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-ink-muted line-through">
                        {item.label}
                      </span>
                      <span className="rounded bg-sunken px-1.5 py-0.5 text-3xs text-ink-subtle">
                        Unavailable
                      </span>
                    </div>
                    <p className="text-3xs text-ink-subtle mt-0.5">
                      {item.unsupportedReason}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
