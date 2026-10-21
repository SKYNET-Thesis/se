import React, { useEffect, useRef } from 'react';
import * as Blockly from 'blockly';
import { getVistaTheme, registerVistaBlocks, vistaToolbox } from './blocklyConfig';

interface BlocklyCanvasProps {
  initialState: Record<string, unknown>;
  /** A lesson can deliberately expose a small, safe subset of VISTA blocks. */
  toolbox?: Blockly.utils.toolbox.ToolboxDefinition;
  readOnly?: boolean;
  onReady?: (workspace: Blockly.WorkspaceSvg) => void;
  onChange?: (event: Blockly.Events.Abstract) => void;
  onBeforeDispose?: (workspace: Blockly.WorkspaceSvg) => void;
  /** Called with null after a successful load, or an error message if the saved state was unreadable. */
  onLoadError?: (message: string | null) => void;
}

/**
 * Mounts a Google Blockly workspace. Re-mount (via React `key`) to load a different program.
 */
export function BlocklyCanvas({ initialState, toolbox, readOnly = false, onReady, onChange, onBeforeDispose, onLoadError }: BlocklyCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onReady, onChange, onBeforeDispose, onLoadError });
  callbacks.current = { onReady, onChange, onBeforeDispose, onLoadError };
  const initialRef = useRef(initialState);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    registerVistaBlocks();

    const workspace = Blockly.inject(host, {
      toolbox: readOnly ? undefined : toolbox ?? vistaToolbox as Blockly.utils.toolbox.ToolboxDefinition,
      theme: getVistaTheme(),
      // Zelos has the soft interlocking silhouettes learners recognise from
      // Scratch-style programming, while preserving the same block model.
      renderer: 'zelos',
      readOnly,
      trashcan: !readOnly,
      sounds: false,
      move: { scrollbars: true, drag: true, wheel: true },
      zoom: { controls: true, wheel: false, pinch: true, startScale: readOnly ? 0.75 : 0.9, maxScale: 2, minScale: 0.4, scaleSpeed: 1.15 },
      grid: { spacing: 24, length: 2, colour: '#E3E1DA', snap: true }
    });

    Blockly.Events.disable();
    try {
      Blockly.serialization.workspaces.load(initialRef.current, workspace);
      callbacks.current.onLoadError?.(null);
    } catch (err) {
      workspace.clear();
      callbacks.current.onLoadError?.(err instanceof Error ? err.message : 'The saved workspace could not be loaded.');
    } finally {
      Blockly.Events.enable();
    }
    workspace.clearUndo();

    const listener = (event: Blockly.Events.Abstract) => callbacks.current.onChange?.(event);
    workspace.addChangeListener(listener);
    callbacks.current.onReady?.(workspace);

    const observer = new ResizeObserver(() => Blockly.svgResize(workspace));
    observer.observe(host);

    return () => {
      observer.disconnect();
      callbacks.current.onBeforeDispose?.(workspace);
      workspace.removeChangeListener(listener);
      workspace.dispose();
    };
  }, [readOnly, toolbox]);

  return <div ref={hostRef} className="vista-blockly absolute inset-0" aria-label={readOnly ? 'Program blocks (read-only)' : 'Blockly programming canvas'} />;
}
