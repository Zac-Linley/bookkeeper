import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { useEffect } from 'react';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AuthPage from './pages/AuthPage';
import DashboardPage from './pages/DashboardPage';
import TransactionListPage from './pages/TransactionListPage';
import TransactionFormPage from './pages/TransactionFormPage';
import CategoriesPage from './pages/CategoriesPage';
import SettingsPage from './pages/SettingsPage';
import AccountInfoPage from './pages/AccountInfoPage';
import SharingPage from './pages/SharingPage';
import DepositsPage from './pages/DepositsPage';
import AdminPage from './pages/AdminPage';
import BottomNav from './components/BottomNav';

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
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/transactions" element={<TransactionListPage />} />
              <Route path="/transactions/new" element={<TransactionFormPage />} />
              <Route path="/transactions/:id/edit" element={<TransactionFormPage />} />
              <Route path="/categories" element={<CategoriesPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/settings/account" element={<AccountInfoPage />} />
              <Route path="/settings/sharing" element={<SharingPage />} />
              <Route path="/deposits" element={<DepositsPage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Routes>
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
