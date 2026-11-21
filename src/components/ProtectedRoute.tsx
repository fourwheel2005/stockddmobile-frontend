import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import type { Role } from '@/types/api';
import { homePathFor } from '@/lib/auth/homePath';

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

  // FIX-159: FREEDOM (เจ้าของ) ผ่านทุกหน้า
  if (roles && roles.length > 0 && userRole !== 'FREEDOM' && (!userRole || !roles.includes(userRole))) {
    // ส่งกลับหน้าแรกของ role (STAFF → POS, ช่าง → งานซ่อม) ไม่งั้นจะเด้งวน (FIX-102, FIX-234)
    return <Navigate to={homePathFor(userRole)} replace />;
  }

  return <Outlet />;
}
