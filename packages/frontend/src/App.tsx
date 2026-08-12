import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { lazy, Suspense, useEffect } from 'react';
import BottomNav from './components/BottomNav';

// Route-level code splitting: each page loads on first visit.
const AuthPage = lazy(() => import('./pages/AuthPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const TransactionListPage = lazy(() => import('./pages/TransactionListPage'));
const TransactionFormPage = lazy(() => import('./pages/TransactionFormPage'));
const CategoriesPage = lazy(() => import('./pages/CategoriesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AccountInfoPage = lazy(() => import('./pages/AccountInfoPage'));
const SharingPage = lazy(() => import('./pages/SharingPage'));
const DepositsPage = lazy(() => import('./pages/DepositsPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const BackupPage = lazy(() => import('./pages/BackupPage'));

function PageLoader() {
  return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" /></div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <AuthPage />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <AuthPage />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <div className="page-container">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/transactions" element={<TransactionListPage />} />
                <Route path="/transactions/new" element={<TransactionFormPage />} />
                <Route path="/transactions/:id/edit" element={<TransactionFormPage />} />
                <Route path="/categories" element={<CategoriesPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/settings/account" element={<AccountInfoPage />} />
                <Route path="/settings/sharing" element={<SharingPage />} />
                <Route path="/settings/backup" element={<BackupPage />} />
                <Route path="/deposits" element={<DepositsPage />} />
                <Route path="/admin" element={<AdminPage />} />
              </Routes>
            </Suspense>
          </div>
          <BottomNav />
        </ProtectedRoute>
      } />
    </Routes>
  );
}

export default function App() {
  // Dark mode: follow system preference
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = (e: MediaQueryListEvent | MediaQueryList) => {
      document.documentElement.classList.toggle('dark', e.matches);
    };
    update(mq);
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
