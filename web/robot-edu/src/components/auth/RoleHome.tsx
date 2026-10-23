import React from 'react';
import { Navigate } from 'react-router-dom';
import { useRole } from '../../contexts/RoleContext';
const home={student:'/my-learning',teacher:'/teacher',school_admin:'/school/classrooms',admin:'/admin/users'} as const;
export function RoleHome(){const {role,loading,error}=useRole();if(loading)return <main className="grid min-h-full place-items-center text-sm text-ink-muted">Loading your workspace…</main>;if(error||!role)return <main className="grid min-h-full place-items-center p-8 text-center"><p className="text-sm text-danger">{error??'No active VISTA role is available.'}</p></main>;return <Navigate to={home[role]} replace/>;}
