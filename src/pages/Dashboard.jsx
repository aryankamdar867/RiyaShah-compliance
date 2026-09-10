import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Layout from '../components/Layout';

export default function Dashboard() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [entityFilter, setEntityFilter] = useState('All');

  useEffect(() => {
    const fetchClients = async () => {
      setLoading(true);
      const { data } = await supabase.from('clients').select('*').order('name');
      setClients(data || []);
      setLoading(false);
    };
    fetchClients();
  }, []);

  const entityTypes = ['All', ...new Set(clients.map((c) => c.entity_type).filter(Boolean))];

  const filtered = clients.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.pan || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.group_name || '').toLowerCase().includes(search.toLowerCase());
    const matchesEntity = entityFilter === 'All' || c.entity_type === entityFilter;
    return matchesSearch && matchesEntity;
  });

  const mhCount = clients.filter((c) => c.state === 'Maharashtra').length;

  return (
    <Layout>
      <header className="bg-white border-b border-slate-200 px-8 py-5">
        <h2 className="text-xl font-semibold text-slate-800">Clients</h2>
        <p className="text-sm text-slate-500">
          {clients.length} total · {mhCount} Maharashtra (PT applicable)
        </p>
      </header>

      <div className="max-w-5xl px-8 py-8">
        <div className="flex gap-3 mb-6">
          <input
            type="text"
            placeholder="Search by name, PAN, or group..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 border border-slate-300 rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-gold"
          />
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2.5 text-sm"
          >
            {entityTypes.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>

        {loading ? (
          <p className="text-slate-500">Loading clients...</p>
        ) : filtered.length === 0 ? (
          <p className="text-slate-500">No clients match your search.</p>
        ) : (
          <div className="grid gap-2.5">
            {filtered.map((c) => (
              <Link
                key={c.id}
                to={`/client/${c.id}`}
                className="bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-center hover:border-brand-gold hover:shadow-md transition"
              >
                <div>
                  <p className="font-semibold text-slate-800">{c.name}</p>
                  <p className="text-sm text-slate-500">
                    {c.entity_type} {c.group_name && `· ${c.group_name}`} {c.pan && `· PAN: ${c.pan}`}
                  </p>
                </div>
                <div className="flex gap-2 items-center">
                  {c.state !== 'Maharashtra' && (
                    <span className="text-xs bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full font-medium">
                      Not Applicable
                    </span>
                  )}
                  {c.ptec_regn_date && (
                    <span className="text-xs bg-blue-50 text-blue-600 px-2.5 py-1 rounded-full font-medium">PTEC</span>
                  )}
                  {c.ptrc_regn_date && (
                    <span className="text-xs bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full font-medium">PTRC</span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}