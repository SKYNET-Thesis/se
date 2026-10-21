import {
  BookOpenIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  Cpu,
  LayoutDashboardIcon,
  LibraryIcon,
  PuzzleIcon,
  Settings2Icon,
  UsersIcon,
  InboxIcon,
  type LucideIcon } from
'lucide-react';
import type { Role } from '../types/user';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const navigationByRole: Record<Role, NavSection[]> = {
  student: [
  {
    items: [
    { to: '/', label: 'Dashboard', icon: LayoutDashboardIcon, end: true },
    { to: '/courses', label: 'Courses', icon: BookOpenIcon },
    { to: '/assignments', label: 'Assignments', icon: ClipboardListIcon }]

  },
  {
    title: 'Build',
    items: [
    { to: '/studio', label: 'Programming Studio', icon: PuzzleIcon },
    { to: '/lab', label: 'Robot Lab', icon: Cpu }]

  }],

  teacher: [
  {
    title: 'Teaching',
    items: [
    { to: '/teacher', label: 'Overview', icon: LayoutDashboardIcon, end: true },
    { to: '/teacher/courses', label: 'Courses & lessons', icon: LibraryIcon },
    { to: '/teacher/assignments', label: 'Assignments', icon: ClipboardCheckIcon },
    { to: '/teacher/submissions', label: 'Submissions', icon: InboxIcon }]

  },
  {
    title: 'Build',
    items: [
    { to: '/studio', label: 'Programming Studio', icon: PuzzleIcon },
    { to: '/lab', label: 'Robot Lab', icon: Cpu },
    { to: '/courses', label: 'Student catalogue', icon: BookOpenIcon }]

  }],

  admin: [
  {
    title: 'Administration',
    items: [
    { to: '/admin/users', label: 'Users & roles', icon: UsersIcon },
    { to: '/admin/robots', label: 'Robot resources', icon: Cpu },
    { to: '/admin/settings', label: 'System settings', icon: Settings2Icon }]

  },
  {
    title: 'Platform',
    items: [
    { to: '/lab', label: 'Robot Lab', icon: Cpu },
    { to: '/courses', label: 'Course catalogue', icon: BookOpenIcon }]

  }]

};