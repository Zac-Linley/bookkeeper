import { NavLink, useLocation } from 'react-router-dom';
import { IconLayoutDashboard, IconList, IconSettings } from '../lib/icons';

const navItems = [
  { to: '/transactions', label: '账单', Icon: IconList, end: true },
  { to: '/', label: '首页', Icon: IconLayoutDashboard, end: true },
  { to: '/settings', label: '设置', Icon: IconSettings },
];

export default function BottomNav() {
  const location = useLocation();
  if (['/login', '/register'].includes(location.pathname)) return null;

  return (
    <nav className="bottom-nav">
      {navItems.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${
              isActive ? 'text-primary-600' : 'text-gray-400'
            }`
          }
        >
          <Icon size={22} stroke={1.5} />
          <span className="text-[10px] font-medium">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
