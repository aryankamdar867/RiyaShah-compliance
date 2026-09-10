import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const navItems = [
  { to: '/', label: 'Clients' },
  { to: '/onboard', label: '+ Onboard Client' },
  { to: '/employees/upload', label: '📤 Upload Employees' },
  { to: '/master-sheet', label: '📊 Master Sheet' },
  { to: '/ptec', label: 'PTEC Tracker' },
  { to: '/ptrc/first-year', label: 'PTRC — First Year' },
  { to: '/ptrc/from-year-2', label: 'PTRC — From Year 2' },
];
export default function Layout({ children }) {
  const { signOut } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-64 bg-brand-dark text-white flex flex-col fixed h-screen">
        <div className="px-6 py-6 border-b border-slate-700">
          <img src="/logo.png" alt="TOSBS" className="w-full max-w-[160px]" />
          <p className="text-[11px] text-slate-400 mt-2 tracking-wide">
            MAHARASHTRA PT COMPLIANCE
          </p>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          {navItems.map((item) => {
            const active = location.pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`block px-3 py-2 rounded-md text-sm font-medium transition ${
                  active ? 'bg-brand-gold text-brand-dark' : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-slate-700">
          <button
            onClick={signOut}
            className="w-full text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded-md px-3 py-2 text-left transition"
          >
            Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 ml-64">{children}</main>
    </div>
  );
}