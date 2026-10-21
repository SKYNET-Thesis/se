/** Small helpers for authoring Blockly JSON workspaces (starter programs, templates). */
export interface BlockJson {
  type: string;
  x?: number;
  y?: number;
  fields?: Record<string, string | number>;
  inputs?: Record<string, {block: BlockJson;}>;
  next?: {block: BlockJson;};
}

export function stack(blocks: BlockJson[]): BlockJson | undefined {
  if (blocks.length === 0) return undefined;
  const [head, ...rest] = blocks;
  const tail = stack(rest);
  return tail ? { ...head, next: { block: tail } } : { ...head };
}

export function block(
type: string,
fields?: Record<string, string | number>,
statements?: Record<string, BlockJson[]>,
values?: Record<string, BlockJson>)
: BlockJson {
  const inputs: Record<string, {block: BlockJson;}> = {};
  Object.entries(statements ?? {}).forEach(([name, children]) => {
    const s = stack(children);
    if (s) inputs[name] = { block: s };
  });
  Object.entries(values ?? {}).forEach(([name, child]) => {
    inputs[name] = { block: child };
  });
  return { type, ...(fields ? { fields } : {}), ...(Object.keys(inputs).length ? { inputs } : {}) };
}

export function program(...stacks: Array<{x: number;y: number;blocks: BlockJson[];}>): Record<string, unknown> {
  return {
    blocks: {
      languageVersion: 0,
      blocks: stacks.map((s) => ({ ...stack(s.blocks), x: s.x, y: s.y }))
    }
  };
}

export const moveTo = (x: number, y: number, z: number, speed = 60) => block('robot_move_to', { X: x, Y: y, Z: z, SPEED: speed });
export const withArm = (arm: 'left' | 'right', children: BlockJson[]) => block('robot_select_arm', { ARM: arm }, { DO: children });
export const start = () => block('robot_start');
