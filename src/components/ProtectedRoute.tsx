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

  // FIX-159: FREEDOM (เจ้าของ) ผ่านทุกหน้า
  if (roles && roles.length > 0 && userRole !== 'FREEDOM' && (!userRole || !roles.includes(userRole))) {
    // STAFF ไม่มีสิทธิ์หน้า Dashboard แล้ว (FIX-102) → ส่งกลับหน้าขาย ไม่งั้นจะเด้งวน
    return <Navigate to={userRole === 'STAFF' ? '/pos' : '/'} replace />;
  }

  return <Outlet />;
}
