import { useState } from 'react';
import {
  FileTextIcon,
  VideoIcon,
  BotIcon,
  DatabaseIcon,
  EyeIcon,
  SearchIcon,
  UploadCloudIcon,
} from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { LearningMediaPreviewModal } from './LearningMediaPreviewModal';

export interface MediaAsset {
  id: string;
  name: string;
  type: 'video' | 'document' | 'robot_model' | 'dataset';
  format: string;
  size: string;
  duration?: string;
  url: string;
  uploadedAt: string;
  description: string;
}

export const CANONICAL_MEDIA_ASSETS: MediaAsset[] = [
  {
    id: 'asset-1',
    name: 'SO-101 Tabletop Arm Kinematics Walkthrough',
    type: 'video',
    format: 'MP4',
    size: '84.2 MB',
    duration: '11:45',
    url: 'https://storage.vista.education/videos/so101_kinematics_walkthrough.mp4',
    uploadedAt: '2026-11-01',
    description: 'Detailed video explanation of 6-DOF joint angles and coordinate frame transforms.',
  },
  {
    id: 'asset-2',
    name: 'SO-101 Hardware Safety & E-Stop Protocol Guide',
    type: 'document',
    format: 'PDF',
    size: '2.4 MB',
    url: 'https://storage.vista.education/docs/safety_estop_protocols.pdf',
    uploadedAt: '2026-10-28',
    description: 'Standard operating safety guidelines for student physical robot lab operations.',
  },
  {
    id: 'asset-3',
    name: 'SO-101 Dual-Arm URDF Package & Meshes',
    type: 'robot_model',
    format: 'URDF',
    size: '14.8 MB',
    url: 'https://storage.vista.education/models/so101_dual_arm.urdf',
    uploadedAt: '2026-10-15',
    description: 'Canonical 3D URDF model with collision geometries used in 3D simulation.',
  },
  {
    id: 'asset-4',
    name: 'Dual-Arm Tabletop Pick-and-Place Demonstration Episode',
    type: 'dataset',
    format: 'H5/MP4',
    size: '128.5 MB',
    duration: '01:30',
    url: 'https://storage.vista.education/episodes/demo_pick_place_01.h5',
    uploadedAt: '2026-11-04',
    description: 'Recorded teleoperation demonstration trajectory with gripper state transitions.',
  },
  {
    id: 'asset-5',
    name: 'Symbolic Safety Check Rules Reference Sheet',
    type: 'document',
    format: 'PDF',
    size: '1.1 MB',
    url: 'https://storage.vista.education/docs/symbolic_evaluation_rules.pdf',
    uploadedAt: '2026-11-02',
    description: 'Reference sheet for deterministic simulation evaluation rules.',
  },
];

export interface MediaAssetLibraryModalProps {
  open: boolean;
  onClose: () => void;
  onSelectAsset?: (asset: MediaAsset) => void;
  selectionMode?: boolean;
}

export function MediaAssetLibraryModal({
  open,
  onClose,
  onSelectAsset,
  selectionMode = false,
}: MediaAssetLibraryModalProps) {
  const [filterType, setFilterType] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);

  const filteredAssets = CANONICAL_MEDIA_ASSETS.filter((item) => {
    const matchesType = filterType === 'all' || item.type === filterType;
    const matchesSearch =
      !search ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase());
    return matchesType && matchesSearch;
  });

  const getIcon = (type: MediaAsset['type']) => {
    switch (type) {
      case 'video':
        return <VideoIcon className="h-5 w-5 text-blue-500" />;
      case 'document':
        return <FileTextIcon className="h-5 w-5 text-emerald-500" />;
      case 'robot_model':
        return <BotIcon className="h-5 w-5 text-indigo-500" />;
      case 'dataset':
        return <DatabaseIcon className="h-5 w-5 text-purple-500" />;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Asset & File Library"
      description="Manage instructional media, video lectures, reading documents and 3D robot models."
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-xs text-ink-muted">
            {filteredAssets.length} asset{filteredAssets.length === 1 ? '' : 's'} available
          </span>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Search & Type Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 py-1.5 focus-within:border-accent">
            <SearchIcon className="h-4 w-4 text-ink-subtle" />
            <input
              type="text"
              placeholder="Search assets by name or keyword..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-sm outline-none placeholder:text-ink-subtle text-ink"
              aria-label="Search library assets"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {['all', 'video', 'document', 'robot_model', 'dataset'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFilterType(t)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold capitalize whitespace-nowrap transition-colors ${
                  filterType === t
                    ? 'bg-accent text-accent-contrast'
                    : 'bg-sunken text-ink-muted hover:text-ink'
                }`}
              >
                {t.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Upload Zone Notice (Preserves S3 Architecture) */}
        <div className="rounded-lg border border-dashed border-line-strong p-4 text-center bg-sunken/20 hover:bg-sunken/40 transition-colors cursor-pointer">
          <UploadCloudIcon className="mx-auto h-6 w-6 text-ink-subtle mb-1" />
          <p className="text-xs font-semibold text-ink">Upload new instructional media</p>
          <p className="text-2xs text-ink-muted mt-0.5">
            Supported formats: MP4, PDF, DOCX, URDF, H5 (max 250 MB). Assets are stored in canonical VISTA media bucket.
          </p>
        </div>

        {/* Assets List */}
        <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {filteredAssets.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line p-8 text-center text-sm text-ink-muted" role="status">
              {search ? 'No files match your search.' : 'No learning media is available yet.'}
            </p>
          ) : filteredAssets.map((asset) => (
            <div
              key={asset.id}
              className="flex items-center justify-between rounded-lg border border-line bg-surface p-3.5 hover:border-accent/40 transition-colors"
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="mt-0.5 shrink-0">{getIcon(asset.type)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h5 className="text-sm font-semibold text-ink truncate">{asset.name}</h5>
                    <Badge tone="neutral">
                      {asset.format}
                    </Badge>
                  </div>
                  <p className="text-xs text-ink-muted line-clamp-1 mt-0.5">
                    {asset.description}
                  </p>
                  <div className="flex items-center gap-3 text-2xs text-ink-subtle mt-1">
                    <span>{asset.size}</span>
                    {asset.duration && <span>• {asset.duration}</span>}
                    <span>• {asset.uploadedAt}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 ml-3 shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<EyeIcon className="h-3.5 w-3.5" />}
                  onClick={() => setPreviewAsset(asset)}
                  aria-label={`Preview ${asset.name}`}
                >
                  Preview
                </Button>
                {selectionMode && onSelectAsset && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => {
                      onSelectAsset(asset);
                      onClose();
                    }}
                  >
                    Select
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <LearningMediaPreviewModal
        open={Boolean(previewAsset)}
        media={previewAsset}
        onClose={() => setPreviewAsset(null)}
        onOpenFull={selectionMode && onSelectAsset && previewAsset
          ? () => {
              onSelectAsset(previewAsset);
              setPreviewAsset(null);
              onClose();
            }
          : undefined}
        openLabel={selectionMode ? 'Use this asset' : 'Open full content'}
      />
    </Dialog>
  );
}
