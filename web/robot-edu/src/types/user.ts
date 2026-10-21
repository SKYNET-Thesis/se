export type Role = 'student' | 'teacher' | 'admin';

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'active' | 'invited' | 'suspended';
  group: string;
  lastActive: string | null;
}

export interface RoleDefinition {
  role: Role;
  label: string;
  description: string;
  permissions: string[];
}

export interface RobotResource {
  id: string;
  name: string;
  model: string;
  location: string;
  integration: 'not_configured' | 'pending_verification';
  notes: string;
}

export interface SystemSettings {
  institutionName: string;
  defaultSimulationSpeed: 1 | 2 | 4;
  autosaveSeconds: number;
  allowStudentExport: boolean;
  requireValidationBeforeSubmit: boolean;
}