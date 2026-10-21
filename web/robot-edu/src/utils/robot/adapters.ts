import { RealRobotAdapter } from './realRobotAdapter';
import { SimulationRobotAdapter } from './simulationAdapter';

export const simulationAdapter = new SimulationRobotAdapter();
/** No transport is configured: the real adapter reports "not configured" and refuses execution. */
export const realRobotAdapter = new RealRobotAdapter(null);