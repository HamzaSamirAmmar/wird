import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './lib/auth-context';
import Login from './routes/Login';
import ChangePassword from './routes/ChangePassword';
import SupervisorNotice from './routes/SupervisorNotice';
import ProtectedRoute from './routes/ProtectedRoute';
import AppLayout from './routes/AppLayout';
import MyDuties from './routes/MyDuties';
import Leaderboard from './routes/Leaderboard';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/supervisor" element={<SupervisorNotice />} />
          <Route element={<AppLayout />}>
            <Route path="/" element={<MyDuties />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  );
}
