import { classifyExecution, satisfiesPhysicalPractical } from './execution-provenance';

describe('execution provenance', () => {
  it('classifies simulations without any runtime statement', () => {
    for (const executionMode of ['simulation', 'offline_replay', 'schematic']) expect(classifyExecution({ executionMode, runtimeMode: 'physical_x' }, {})).toBe('SIMULATION');
  });
  it('never treats a fake or mock runtime as physical, even if it is declared physical', () => {
    const env = { VISTA_PHYSICAL_RUNTIME_MODES: 'fake_follower,mock_robot' };
    expect(classifyExecution({ executionMode: 'real_robot', runtimeMode: 'fake_follower' }, env)).toBe('MOCK_RUNTIME');
    expect(classifyExecution({ executionMode: 'real_robot', runtimeMode: 'mock_robot' }, env)).toBe('MOCK_RUNTIME');
  });
  it('accepts only declared adapter modes as physical; nothing is physical by default', () => {
    expect(classifyExecution({ executionMode: 'real_robot', runtimeMode: 'checkik_follower' }, {})).toBe('UNVERIFIED_RUNTIME');
    expect(classifyExecution({ executionMode: 'real_robot', runtimeMode: 'checkik_follower' }, { VISTA_PHYSICAL_RUNTIME_MODES: ' checkik_follower , other' })).toBe('PHYSICAL_ROBOT');
    expect(classifyExecution({ executionMode: 'real_robot', runtimeMode: 'undeclared' }, { VISTA_PHYSICAL_RUNTIME_MODES: 'checkik_follower' })).toBe('UNVERIFIED_RUNTIME');
  });
  it('an unstated runtime is unverified unless the transitional flag is set', () => {
    expect(classifyExecution({ executionMode: 'real_robot', runtimeMode: null }, {})).toBe('UNVERIFIED_RUNTIME');
    expect(classifyExecution({ executionMode: 'real_robot' }, { VISTA_ACCEPT_UNSTATED_RUNTIME_AS_PHYSICAL: '1' })).toBe('PHYSICAL_ROBOT');
    expect(classifyExecution({ executionMode: 'real_robot', runtimeMode: 'fake_follower' }, { VISTA_ACCEPT_UNSTATED_RUNTIME_AS_PHYSICAL: '1' })).toBe('MOCK_RUNTIME');
  });
  it('only PHYSICAL_ROBOT satisfies a physical practical', () => {
    expect((['SIMULATION', 'MOCK_RUNTIME', 'UNVERIFIED_RUNTIME', 'PHYSICAL_ROBOT'] as const).filter(satisfiesPhysicalPractical)).toEqual(['PHYSICAL_ROBOT']);
  });
});
