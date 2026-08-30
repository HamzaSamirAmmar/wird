import { Outlet } from 'react-router-dom';
import { BottomNav } from '../components/BottomNav';

/** Shell for the signed-in employee screens: the routed screen plus the bottom tab bar. */
export default function AppLayout() {
  return (
    <>
      <Outlet />
      <BottomNav />
    </>
  );
}
