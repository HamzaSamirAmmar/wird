import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/auth-context';
import Login from './routes/Login';
import ChangePassword from './routes/ChangePassword';
import Unauthorized from './routes/Unauthorized';
import ProtectedRoute from './routes/ProtectedRoute';
import DashboardLayout from './routes/DashboardLayout';
import DutiesPage from './routes/DutiesPage';
import GroupsPage from './routes/GroupsPage';
import EmployeesPage from './routes/EmployeesPage';
import FollowupPage from './routes/FollowupPage';
import BannersPage from './routes/BannersPage';
import NotificationsPage from './routes/NotificationsPage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<DutiesPage />} />
            <Route path="/groups" element={<GroupsPage />} />
            <Route path="/employees" element={<EmployeesPage />} />
            <Route path="/followup" element={<FollowupPage />} />
            <Route path="/banners" element={<BannersPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
