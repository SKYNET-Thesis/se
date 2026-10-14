export function deriveDashboardOverview({ pairs, estop, session }) {
  if (session?.state === 'active') {
    const mode = session.mode === 'dual' ? 'Dual-arm' : session.mode === 'vr' ? 'VR' : 'Single-arm';
    return { state: 'live', title: `${mode} session live`, detail: `${session.latencyMs} ms latency${session.recording ? ' · recording' : ''}`, actionLabel: 'Open controls', actionTo: session.mode === 'dual' ? '/dual-arm' : session.mode === 'vr' ? '/vr' : '/teleoperation' };
  }
  if (estop !== 'ready') return { state: 'blocked', title: 'Emergency stop active', detail: 'Motion stays disabled until the safety state is reset.', actionLabel: 'Review safety', actionTo: '/settings' };
  const unavailable = Object.values(pairs).find((pair) => !pair.ready);
  if (unavailable) {
    const side = unavailable.side[0].toUpperCase() + unavailable.side.slice(1);
    return { state: 'attention', title: `${side} pair needs attention`, detail: unavailable.reason ?? 'Finish setup before starting teleoperation.', actionLabel: 'Open calibration', actionTo: '/calibration' };
  }
  return { state: 'ready', title: 'Rig ready for teleoperation', detail: 'Both arm pairs are connected and calibrated.', actionLabel: 'Start dual-arm', actionTo: '/dual-arm' };
}
