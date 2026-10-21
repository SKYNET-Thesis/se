import * as Blockly from 'blockly';
import type { Problem } from '../../types/robotProgram';

/**
 * VISTA robot block definitions. Every enabled block maps to exactly one structured
 * RobotCommand (see utils/robotProgram/generator.ts). Vision/AI blocks are defined
 * so the toolbox can show them as experimental, but they are disabled in the flyout
 * and rejected by the generator.
 */
const num = (name: string, value: number, extra: Record<string, number> = {}) => ({ type: 'field_number', name, value, ...extra });

const BLOCKS = [
{
  type: 'robot_start',
  message0: 'when program starts',
  nextStatement: null,
  style: 'start_blocks',
  tooltip: 'Every program begins here. Attached blocks run from top to bottom.'
},
{
  type: 'robot_select_arm',
  message0: 'use %1 arm',
  args0: [{ type: 'field_dropdown', name: 'ARM', options: [['left', 'left'], ['right', 'right']] }],
  message1: '%1',
  args1: [{ type: 'input_statement', name: 'DO' }],
  previousStatement: null,
  nextStatement: null,
  style: 'dual_blocks',
  tooltip: 'Movement and gripper blocks inside act on this arm.'
},
{
  type: 'robot_move_to',
  message0: 'move to x %1 y %2 z %3',
  args0: [num('X', 300), num('Y', 200), num('Z', 120)],
  message1: 'speed %1 %%',
  args1: [num('SPEED', 60, { min: 10, max: 100, precision: 1 })],
  previousStatement: null,
  nextStatement: null,
  style: 'movement_blocks',
  tooltip: 'Move the selected arm’s gripper to a point in millimetres. Table: x 0–600, y 0–400, z 10–300.'
},
{
  type: 'robot_move_joint',
  message0: 'rotate %1 joint to %2 °',
  args0: [
  { type: 'field_dropdown', name: 'JOINT', options: [['base', 'base'], ['shoulder', 'shoulder'], ['elbow', 'elbow'], ['wrist', 'wrist']] },
  num('ANGLE', 0)],

  previousStatement: null,
  nextStatement: null,
  style: 'movement_blocks',
  tooltip: 'Set one joint of the selected arm to an absolute angle. Limits: base ±100°, shoulder −20…160°, elbow −165…0°, wrist ±90°.'
},
{
  type: 'robot_move_home',
  message0: 'move %1 home',
  args0: [{ type: 'field_dropdown', name: 'TARGET', options: [['selected arm', 'selected'], ['both arms', 'both']] }],
  previousStatement: null,
  nextStatement: null,
  style: 'movement_blocks',
  tooltip: 'Return to the safe home pose above the arm base.'
},
{ type: 'robot_gripper_open', message0: 'open gripper', previousStatement: null, nextStatement: null, style: 'gripper_blocks', tooltip: 'Open the selected arm’s gripper, releasing anything it holds.' },
{ type: 'robot_gripper_close', message0: 'close gripper', previousStatement: null, nextStatement: null, style: 'gripper_blocks', tooltip: 'Close the selected arm’s gripper. Grasps an object within 30 mm and below 50 mm.' },
{
  type: 'robot_wait',
  message0: 'wait %1 seconds',
  args0: [num('SECONDS', 1, { min: 0.1, max: 30, precision: 0.1 })],
  previousStatement: null,
  nextStatement: null,
  style: 'timing_blocks',
  tooltip: 'Pause the program.'
},
{
  type: 'robot_repeat',
  message0: 'repeat %1 times',
  args0: [num('TIMES', 3, { min: 1, max: 50, precision: 1 })],
  message1: '%1',
  args1: [{ type: 'input_statement', name: 'DO' }],
  previousStatement: null,
  nextStatement: null,
  style: 'control_blocks',
  tooltip: 'Run the blocks inside a fixed number of times (1–50).'
},
{
  type: 'robot_if',
  message0: 'if %1',
  args0: [{ type: 'input_value', name: 'COND', check: 'Boolean' }],
  message1: 'do %1',
  args1: [{ type: 'input_statement', name: 'DO' }],
  message2: 'else %1',
  args2: [{ type: 'input_statement', name: 'ELSE' }],
  previousStatement: null,
  nextStatement: null,
  style: 'control_blocks',
  tooltip: 'Run one branch or the other depending on a condition.'
},
{
  type: 'robot_cond_holding',
  message0: '%1 is holding an object',
  args0: [{ type: 'field_dropdown', name: 'ARM', options: [['selected arm', 'selected'], ['left gripper', 'left'], ['right gripper', 'right']] }],
  output: 'Boolean',
  style: 'control_blocks',
  tooltip: 'True when the gripper holds an object. In simulation this reads simulated state; real hardware needs a gripper sensor.'
},
{
  type: 'robot_cond_zone',
  message0: 'zone %1 has an object',
  args0: [{ type: 'field_dropdown', name: 'ZONE', options: [['A · Bin A', 'A'], ['B · Handoff', 'B'], ['C · Bin C', 'C']] }],
  output: 'Boolean',
  style: 'control_blocks',
  tooltip: 'True when a released object rests inside the zone.'
},
{
  type: 'robot_move_both',
  message0: 'move both arms',
  message1: 'left x %1 y %2 z %3',
  args1: [num('LX', 220), num('LY', 200), num('LZ', 150)],
  message2: 'right x %1 y %2 z %3',
  args2: [num('RX', 380), num('RY', 200), num('RZ', 150)],
  previousStatement: null,
  nextStatement: null,
  style: 'dual_blocks',
  tooltip: 'Start moving both arms at once. The program continues immediately; use "wait for both arms" to synchronise.'
},
{ type: 'robot_wait_both', message0: 'wait for both arms to finish', previousStatement: null, nextStatement: null, style: 'dual_blocks', tooltip: 'Pause until neither arm is moving.' },
{
  type: 'vision_detect_object',
  message0: 'detect %1 object with camera',
  args0: [{ type: 'field_dropdown', name: 'COLOR', options: [['red', 'red'], ['blue', 'blue'], ['green', 'green']] }],
  previousStatement: null,
  nextStatement: null,
  style: 'vision_blocks',
  tooltip: 'Experimental. Requires a vision service that is not connected.'
},
{
  type: 'vision_ai_plan',
  message0: 'plan grasp with AI assistant',
  previousStatement: null,
  nextStatement: null,
  style: 'vision_blocks',
  tooltip: 'Experimental. Requires an AI planning service that is not connected.'
}];


const PALETTE = {
  start: '#2B2F35',
  movement: '#0F7A6E',
  gripper: '#A86A12',
  timing: '#5B6573',
  control: '#4C5C9E',
  dual: '#7A4F8F',
  vision: '#9A9FA6'
};

let registered = false;
let theme: Blockly.Theme | null = null;

export function registerVistaBlocks(): void {
  if (registered) return;
  Blockly.common.defineBlocksWithJsonArray(BLOCKS);
  registered = true;
}

function darken(hex: string, amount = 0.28): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round((n >> shift & 255) * (1 - amount));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

const style = (c: string) => ({ colourPrimary: c, colourSecondary: c, colourTertiary: darken(c) });

export function getVistaTheme(): Blockly.Theme {
  if (theme) return theme;
  theme = Blockly.Theme.defineTheme('vista', {
    name: 'vista',
    base: Blockly.Themes.Classic,
    blockStyles: {
      start_blocks: style(PALETTE.start),
      movement_blocks: style(PALETTE.movement),
      gripper_blocks: style(PALETTE.gripper),
      timing_blocks: style(PALETTE.timing),
      control_blocks: style(PALETTE.control),
      dual_blocks: style(PALETTE.dual),
      vision_blocks: style(PALETTE.vision)
    },
    categoryStyles: {
      start_category: { colour: PALETTE.start },
      movement_category: { colour: PALETTE.movement },
      gripper_category: { colour: PALETTE.gripper },
      timing_category: { colour: PALETTE.timing },
      control_category: { colour: PALETTE.control },
      dual_category: { colour: PALETTE.dual },
      vision_category: { colour: PALETTE.vision }
    },
    componentStyles: {
      workspaceBackgroundColour: '#FBFAF8',
      toolboxBackgroundColour: '#FFFFFF',
      toolboxForegroundColour: '#17191C',
      flyoutBackgroundColour: '#F0EFEB',
      flyoutForegroundColour: '#4E535A',
      flyoutOpacity: 1,
      scrollbarColour: '#CECBC4',
      scrollbarOpacity: 0.8,
      insertionMarkerColour: '#0D7369',
      insertionMarkerOpacity: 0.35,
      cursorColour: '#0D7369'
    },
    fontStyle: { family: 'Inter, sans-serif', weight: '500', size: 11 },
    startHats: true
  });
  return theme;
}

export const vistaToolbox = {
  kind: 'categoryToolbox',
  contents: [
  { kind: 'category', name: 'Program', categorystyle: 'start_category', contents: [{ kind: 'block', type: 'robot_start' }] },
  {
    kind: 'category',
    name: 'Movement',
    categorystyle: 'movement_category',
    contents: [
    { kind: 'label', text: 'Acts on the arm chosen by "use … arm"' },
    { kind: 'block', type: 'robot_select_arm' },
    { kind: 'block', type: 'robot_move_to' },
    { kind: 'block', type: 'robot_move_joint' },
    { kind: 'block', type: 'robot_move_home' }]

  },
  {
    kind: 'category',
    name: 'Gripper',
    categorystyle: 'gripper_category',
    contents: [
    { kind: 'block', type: 'robot_gripper_open' },
    { kind: 'block', type: 'robot_gripper_close' }]

  },
  { kind: 'category', name: 'Timing', categorystyle: 'timing_category', contents: [{ kind: 'block', type: 'robot_wait' }] },
  {
    kind: 'category',
    name: 'Control',
    categorystyle: 'control_category',
    contents: [
    { kind: 'block', type: 'robot_repeat' },
    { kind: 'block', type: 'robot_if' },
    { kind: 'label', text: 'Conditions' },
    { kind: 'block', type: 'robot_cond_holding' },
    { kind: 'block', type: 'robot_cond_zone' }]

  },
  {
    kind: 'category',
    name: 'Dual arm',
    categorystyle: 'dual_category',
    contents: [
    { kind: 'block', type: 'robot_select_arm' },
    { kind: 'block', type: 'robot_move_both' },
    { kind: 'block', type: 'robot_wait_both' }]

  },
  {
    kind: 'category',
    name: 'Vision / AI',
    categorystyle: 'vision_category',
    contents: [
    { kind: 'label', text: 'Experimental: no vision or AI service is connected.' },
    { kind: 'block', type: 'vision_detect_object', disabled: true },
    { kind: 'block', type: 'vision_ai_plan', disabled: true }]

  }]

};

/** The intentionally small toolbox for the first student mission.  It only
 * contains blocks that the current canonical Nest RobotProgram understands. */
export const openCloseGripperToolbox = {
  kind: 'categoryToolbox',
  contents: [
    { kind: 'category', name: 'Program', categorystyle: 'start_category', contents: [{ kind: 'block', type: 'robot_start' }, { kind: 'block', type: 'robot_select_arm' }, { kind: 'block', type: 'robot_move_home' }] },
    { kind: 'category', name: 'Gripper', categorystyle: 'gripper_category', contents: [{ kind: 'block', type: 'robot_gripper_open' }, { kind: 'block', type: 'robot_gripper_close' }] },
    { kind: 'category', name: 'Timing', categorystyle: 'timing_category', contents: [{ kind: 'block', type: 'robot_wait' }] }
  ]
};

/** C2 deliberately exposes only a coordinate declaration, not a physical move. */
export const reachTargetToolbox = {
  kind: 'categoryToolbox',
  contents: [
    { kind: 'category', name: 'Program', categorystyle: 'start_category', contents: [{ kind: 'block', type: 'robot_start' }, { kind: 'block', type: 'robot_select_arm' }] },
    { kind: 'category', name: 'Movement', categorystyle: 'movement_category', contents: [{ kind: 'label', text: 'Learning preview coordinates only' }, { kind: 'block', type: 'robot_move_to' }] }
  ]
};

/** Shows validation problems as warning icons on the blocks responsible. */
export function applyBlockWarnings(workspace: Blockly.WorkspaceSvg, problems: Problem[]): void {
  const byBlock = new Map<string, string[]>();
  problems.forEach((p) => {
    if (!p.blockId) return;
    byBlock.set(p.blockId, [...(byBlock.get(p.blockId) ?? []), p.message]);
  });
  workspace.getAllBlocks(false).forEach((b) => {
    const messages = byBlock.get(b.id);
    b.setWarningText(messages ? messages.join('\n') : null);
  });
}

export function focusBlock(workspace: Blockly.WorkspaceSvg, blockId: string): boolean {
  const block = workspace.getBlockById(blockId) as Blockly.BlockSvg | null;
  if (!block) return false;
  workspace.centerOnBlock(blockId);
  block.select();
  return true;
}

/** Throws if the serialized workspace contains unknown blocks or is malformed. */
export function assertLoadable(state: Record<string, unknown>): void {
  registerVistaBlocks();
  const probe = new Blockly.Workspace();
  try {
    Blockly.serialization.workspaces.load(state, probe);
  } finally {
    probe.dispose();
  }
}
