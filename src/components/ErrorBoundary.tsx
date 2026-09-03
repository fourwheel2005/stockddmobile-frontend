import { Component, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level ErrorBoundary — ป้องกันทั้งแอป unmount เมื่อ component พังจาก render error.
 * แสดงหน้า fallback + ปุ่ม "ลองใหม่" และ "กลับหน้าแรก".
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // log to console (และอนาคต — sentry/datadog)
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary] caught:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="min-h-screen grid place-items-center bg-slate-50 p-4">
        <div className="max-w-md w-full rounded-lg border border-red-200 bg-white p-6 shadow-lg">
          <div className="text-3xl"><TriangleAlert className="inline h-3.5 w-3.5 align-[-2px]" /></div>
          <h1 className="mt-2 text-xl font-bold text-red-700">เกิดข้อผิดพลาด</h1>
          <p className="mt-1 text-sm text-slate-600">
            หน้าเว็บโหลดไม่สำเร็จ — กรุณาลองใหม่ หรือกลับหน้าแรก
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded bg-slate-100 p-2 text-xs text-slate-700">
            {error.message}
          </pre>
          <div className="mt-4 flex gap-2">
            <button onClick={this.reset} className="btn-primary flex-1">
              ลองใหม่
            </button>
            <button
              onClick={() => { window.location.href = '/'; }}
              className="btn-secondary flex-1">
              กลับหน้าแรก
            </button>
          </div>
        </div>
      </div>
    );
  }
}
