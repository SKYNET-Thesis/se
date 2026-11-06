// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HardwareCalibrationPanel } from './HardwareCalibrationPanel';

let root: Root | undefined;
let host: HTMLDivElement | undefined;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  host?.remove();
  root = undefined;
  host = undefined;
});

describe('HardwareCalibrationPanel', () => {
  it('renders hardware configuration panel with device selector and find port button', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(<HardwareCalibrationPanel robotId="test-robot-123" />);
    });

    expect(host.textContent).toContain('Calibrate');
    expect(host.textContent).toContain('Configuration');
    expect(host.textContent).toContain('Device Type');
    expect(host.textContent).toContain('test-robot-123');

    const select = host.querySelector('select');
    expect(select).not.toBeNull();
    expect(select?.value).toBe('LEADER');

    const startBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Start Calibration')
    );
    expect(startBtn).toBeDefined();
    // Start calibration is disabled because operator token is empty
    expect(startBtn?.disabled).toBe(true);
  });

  it('allows switching role between Leader and Follower', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(<HardwareCalibrationPanel robotId="test-robot-123" />);
    });

    const select = host.querySelector('select')!;
    await act(async () => {
      select.value = 'FOLLOWER';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(select.value).toBe('FOLLOWER');
    const portInput = host.querySelector('input[type="text"]') as HTMLInputElement;
    expect(portInput.value).toBe('/dev/ttyACM0');
  });

  it('toggles advanced settings for operator token and LeLab profile name', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(<HardwareCalibrationPanel robotId="test-robot-123" />);
    });

    expect(host.textContent).not.toContain('Operator Session Token');

    const advancedBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Advanced Settings')
    );
    expect(advancedBtn).toBeDefined();

    await act(async () => {
      advancedBtn?.click();
    });

    expect(host.textContent).toContain('Operator Session Token');
    expect(host.textContent).toContain('Calibration Profile Name');
  });

  it('calls onClose when back arrow button is clicked', async () => {
    const handleClose = vi.fn();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    await act(async () => {
      root?.render(<HardwareCalibrationPanel robotId="test-robot-123" onClose={handleClose} />);
    });

    const backBtn = host.querySelector('button[title="Back to Digital Twin"]') as HTMLButtonElement;
    expect(backBtn).not.toBeNull();

    await act(async () => {
      backBtn.click();
    });

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
