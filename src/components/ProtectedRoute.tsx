import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import type { Role } from '@/types/api';

interface Props {
  roles?: Role[];
}

export function ProtectedRoute({ roles }: Props) {
  const location = useLocation();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const userRole = useAuthStore((s) => s.user?.role);

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && roles.length > 0 && (!userRole || !roles.includes(userRole))) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
