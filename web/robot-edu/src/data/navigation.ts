import {
  BookOpenIcon,
  BotIcon,
  BuildingIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  DatabaseIcon,
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
  /** Extra routes that belong to this item, e.g. a student's course and lesson pages belong to My Learning. */
  activePattern?: RegExp;
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
    { to: '/courses', label: 'Courses', icon: BookOpenIcon, end: true },
    // Course paths, lessons and practice need an active enrollment: for a student they are part of My Learning.
    { to: '/my-learning', label: 'My Learning', icon: ClipboardListIcon, activePattern: /^\/(courses\/[^/]+|practice\/)/ },
    { to: '/catalog', label: 'Course Catalog', icon: BookOpenIcon },
    { to: '/learning-path', label: 'Learning Path', icon: RouteIcon },
    { to: '/assignments', label: 'Assignments', icon: ClipboardCheckIcon }]

  },
  {
    title: 'Build',
    items: [
    { to: '/studio', label: 'Programming Studio', icon: PuzzleIcon },
    { to: '/lab', label: 'Robot Control & Practice', icon: Cpu },
    { to: '/ai-registry', label: 'AI models & data', icon: DatabaseIcon }]

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
    { to: '/ai-registry', label: 'AI models & data', icon: DatabaseIcon },
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
    { to: '/admin/organizations', label: 'Organizations', icon: BuildingIcon },
    { to: '/admin/robots', label: 'Robot Resources', icon: BotIcon },
    { to: '/admin/students', label: 'Student accounts', icon: UsersIcon }]

  },
  {
    title: 'Platform',
    items: [
    { to: '/lab', label: 'Robot Control & Practice', icon: Cpu },
    { to: '/ai-registry', label: 'AI models & data', icon: DatabaseIcon },
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
    { to: '/school/quizzes', label: 'Quizzes', icon: FileQuestionIcon },
    { to: '/courses', label: 'Course catalogue', icon: BookOpenIcon },
    { to: '/lab', label: 'Robot Control & Practice', icon: Cpu }]
  }]

};
