import type * as Blockly from 'blockly';

export const CURRICULUM_BLOCK_REGISTRY = {
  'arm.select': { blockType: 'robot_select_arm', category: 'Program', categoryStyle: 'start_category' },
  home: { blockType: 'robot_move_home', category: 'Movement', categoryStyle: 'movement_category' },
  'preview.move_xyz': { blockType: 'robot_move_to', category: 'Movement', categoryStyle: 'movement_category' },
  wait: { blockType: 'robot_wait', category: 'Timing', categoryStyle: 'timing_category' },
  'gripper.open': { blockType: 'robot_gripper_open', category: 'Gripper', categoryStyle: 'gripper_category' },
  'gripper.close': { blockType: 'robot_gripper_close', category: 'Gripper', categoryStyle: 'gripper_category' },
} as const;

export type CurriculumCapabilityId = keyof typeof CURRICULUM_BLOCK_REGISTRY;
type ToolboxResult =
  | { ok: true; toolbox: Blockly.utils.toolbox.ToolboxDefinition; blockTypes: string[] }
  | { ok: false; unknownIds: string[] };

export function buildCurriculumToolbox(ids: readonly string[]): ToolboxResult {
  const unknownIds = [...new Set(ids.filter((id) => !(id in CURRICULUM_BLOCK_REGISTRY)))];
  if (unknownIds.length) return { ok: false, unknownIds };
  const blockTypes = ['robot_start', ...ids.map((id) => CURRICULUM_BLOCK_REGISTRY[id as CurriculumCapabilityId].blockType)];
  const categories = new Map<string, { style: string; types: string[] }>();
  categories.set('Program', { style: 'start_category', types: ['robot_start'] });
  for (const id of ids as CurriculumCapabilityId[]) {
    const item = CURRICULUM_BLOCK_REGISTRY[id];
    const category = categories.get(item.category) ?? { style: item.categoryStyle, types: [] };
    if (!category.types.includes(item.blockType)) category.types.push(item.blockType);
    categories.set(item.category, category);
  }
  return {
    ok: true,
    blockTypes,
    toolbox: {
      kind: 'categoryToolbox',
      contents: [...categories.entries()].filter(([, category]) => category.types.length).map(([name, category]) => ({
        kind: 'category', name, categorystyle: category.style,
        contents: category.types.map((type) => ({ kind: 'block', type })),
      })),
    } as Blockly.utils.toolbox.ToolboxDefinition,
  };
}

/** Reads block type tags only. It never loads, normalizes, or mutates saved work. */
export function validateWorkspaceBlockTypes(state: unknown, allowedTypes: ReadonlySet<string>): string[] {
  const found = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.type === 'string' && !allowedTypes.has(record.type)) found.add(record.type);
    Object.values(record).forEach(visit);
  };
  visit(state);
  return [...found].sort();
}
