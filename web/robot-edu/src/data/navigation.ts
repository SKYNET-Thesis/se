import {
  BookOpenIcon,
  BuildingIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  FileQuestionIcon,
  Cpu,
  InboxIcon,
  LayoutDashboardIcon, RouteIcon,
  LayersIcon,
  LibraryIcon,
  PuzzleIcon,
  UsersIcon,
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
    { to: '/my-learning', label: 'My Learning', icon: ClipboardListIcon },
    { to: '/catalog', label: 'Course Catalog', icon: BookOpenIcon },
    { to: '/learning-path', label: 'Learning Path', icon: RouteIcon },
    { to: '/assignments', label: 'Assignments', icon: ClipboardCheckIcon }]

  },
  {
    title: 'Build',
    items: [
    { to: '/studio', label: 'Programming Studio', icon: PuzzleIcon },
    { to: '/lab', label: 'Robot Control & Practice', icon: Cpu }]

  }],

  teacher: [
  {
    title: 'Teaching',
    items: [
    { to: '/teacher', label: 'Overview', icon: LayoutDashboardIcon, end: true },
    { to: '/teacher/classes', label: 'My Classes', icon: UsersIcon },
    { to: '/admin/courses', label: 'Course builder', icon: BookOpenIcon },
    { to: '/teacher/assignments', label: 'Assignments', icon: ClipboardCheckIcon },
    { to: '/teacher/challenges', label: 'Blockly challenges', icon: PuzzleIcon },
    { to: '/teacher/quizzes', label: 'Quizzes', icon: FileQuestionIcon },
    { to: '/teacher/submissions', label: 'Submissions', icon: InboxIcon }]

  },
  {
    title: 'Build',
    items: [
    { to: '/studio', label: 'Programming Studio', icon: PuzzleIcon },
    { to: '/lab', label: 'Robot Control & Practice', icon: Cpu },
    { to: '/courses', label: 'Student catalogue', icon: BookOpenIcon }]

  }],

  teaching_assistant: [
  {
    title: 'Teaching',
    items: [
    { to: '/teacher', label: 'Overview', icon: LayoutDashboardIcon, end: true },
    { to: '/teacher/classes', label: 'My Classes', icon: UsersIcon },
    { to: '/teacher/submissions', label: 'Submissions', icon: InboxIcon }]
  }],

  admin: [
  {
    title: 'Administration',
    items: [
    { to: '/admin/organizations', label: 'Organizations', icon: BuildingIcon }]

  },
  {
    title: 'Platform',
    items: [
    { to: '/lab', label: 'Robot Control & Practice', icon: Cpu },
    { to: '/admin/courses', label: 'Course catalogue', icon: BookOpenIcon }]

  }],

  school_admin: [
  {
    title: 'School administration',
    items: [
    { to: '/school', label: 'School overview', icon: LayoutDashboardIcon, end: true },
    { to: '/school/users', label: 'Teachers & students', icon: UsersIcon },
    { to: '/school/classrooms', label: 'Classrooms', icon: LibraryIcon },
    { to: '/school/import', label: 'Import users', icon: InboxIcon },
    { to: '/school/roles', label: 'Roles & permissions', icon: ClipboardCheckIcon },
    { to: '/school/profile', label: 'School profile', icon: BuildingIcon }]
  },
  {
    title: 'Learning',
    items: [
    { to: '/school/courses', label: 'Courses', icon: BookOpenIcon },
    { to: '/school/offerings', label: 'Offerings', icon: LayersIcon },
    { to: '/courses', label: 'Course catalogue', icon: BookOpenIcon },
    { to: '/lab', label: 'Robot Control & Practice', icon: Cpu }]
  }]

};
