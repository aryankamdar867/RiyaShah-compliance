import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Layout from '../components/Layout';
import { Link } from 'react-router-dom';
import {
  currentFyStartYear, fyLabel, ptecYearType, ptecDueDate, computeLineItem,
} from '../utils/ptRules';

const ENTITY_EXEMPT_FROM_PTEC = ['Partnership Firm', 'HUF'];

function StatusBadge({ status }) {
  if (!status) return null;
  const cls = {
    'Overdue': 'bg-red-100 text-red-600',
    'Pending': 'bg-slate-100 text-slate-600',
    'Paid on Time': 'bg-green-100 text-green-700',
    'Paid Late': 'bg-amber-100 text-amber-700',
  }[status] || 'bg-slate-100 text-slate-600';
  return <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${cls}`}>{status}</span>;
}

export default function PTECTracker() {
  const [fy, setFy] = useState(currentFyStartYear());
  const [lineItems, setLineItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const fyOptions = [fy - 1, fy, fy + 1];

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: clients }, { data: people }, { data: payments }] = await Promise.all([
        supabase.from('clients').select('*').eq('state', 'Maharashtra'),
        supabase.from('directors_partners').select('*'),
        supabase.from('ptec_payments').select('*').eq('financial_year', fyLabel(fy)),
      ]);

      const paymentFor = (clientId, directorId) =>
        (payments || []).find((p) => p.client_id === clientId && p.director_id === directorId) || null;

      const items = [];

      for (const c of clients || []) {
        // Entity-level row (unless exempt entity type)
        if (!ENTITY_EXEMPT_FROM_PTEC.includes(c.entity_type) && c.ptec_regn_date) {
          const payment = paymentFor(c.id, null);
          const yearType = ptecYearType(c.ptec_regn_date, fy);
          const dueDate = ptecDueDate(c.ptec_regn_date, fy);
          const calc = computeLineItem(2500, dueDate, payment?.payment_date);
          items.push({
            key: `${c.id}-entity`,
            client_id: c.id,
            director_id: null,
            client_name: c.name,
            holder_name: `${c.name} (entity)`,
            category: 'Entity',
            regn_date: c.ptec_regn_date,
            yearType, dueDate, amount: 2500, payment, ...calc,
          });
        }

        // Per-person rows
        const clientPeople = (people || []).filter((p) => p.client_id === c.id && p.ptec_regn_date);
        for (const p of clientPeople) {
          const payment = paymentFor(c.id, p.id);
          const yearType = ptecYearType(p.ptec_regn_date, fy);
          const dueDate = ptecDueDate(p.ptec_regn_date, fy);
          const calc = computeLineItem(2500, dueDate, payment?.payment_date);
          items.push({
            key: `${c.id}-${p.id}`,
            client_id: c.id,
            director_id: p.id,
            client_name: c.name,
            holder_name: `${p.name} (${p.role})`,
            category: p.role,
            regn_date: p.ptec_regn_date,
            yearType, dueDate, amount: 2500, payment, ...calc,
          });
        }
      }

      items.sort((a, b) => (a.dueDate && b.dueDate ? a.dueDate - b.dueDate : 0));
      setLineItems(items);
      setLoading(false);
    };
    load();
  }, [fy]);

  const markPaid = async (item, dateValue) => {
    setSavingId(item.key);
    const { error } = await supabase.from('ptec_payments').upsert(
      {
        client_id: item.client_id,
        director_id: item.director_id,
        financial_year: fyLabel(fy),
        amount: item.amount,
        payment_date: dateValue || null,
      },
      { onConflict: 'client_id,director_id,financial_year' }
    );
    setSavingId(null);
    if (error) {
      alert(error.message);
      return;
    }
    // refresh
    const { data: payments } = await supabase.from('ptec_payments').select('*').eq('financial_year', fyLabel(fy));
    setLineItems((prev) =>
      prev.map((li) => {
        if (li.key !== item.key) return li;
        const payment = payments.find((p) => p.client_id === li.client_id && p.director_id === li.director_id);
        const calc = computeLineItem(li.amount, li.dueDate, payment?.payment_date);
        return { ...li, payment, ...calc };
      })
    );
  };

  const overdueCount = lineItems.filter((i) => i.status === 'Overdue').length;
  const totalOutstanding = lineItems.filter((i) => !i.payment?.payment_date).reduce((s, i) => s + i.totalPayable, 0);

  return (
    <Layout>
      <header className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">PTEC Tracker</h2>
          <p className="text-sm text-slate-500">
            {lineItems.length} holders · {overdueCount} overdue · ₹{totalOutstanding.toLocaleString('en-IN')} outstanding
          </p>
        </div>
        <select value={fy} onChange={(e) => setFy(Number(e.target.value))}
          className="border border-slate-300 rounded-md px-3 py-2 text-sm">
          {fyOptions.map((y) => <option key={y} value={y}>FY {fyLabel(y)}</option>)}
        </select>
      </header>

      <div className="px-8 py-8">
        {loading ? (
          <p className="text-slate-500">Loading...</p>
        ) : lineItems.length === 0 ? (
          <p className="text-slate-500">No PTEC holders for FY {fyLabel(fy)}.</p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Client</th>
                  <th className="text-left px-4 py-3">Holder</th>
                  <th className="text-left px-4 py-3">Year Type</th>
                  <th className="text-left px-4 py-3">Due Date</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Interest</th>
                  <th className="text-left px-4 py-3">Total Payable</th>
                  <th className="text-left px-4 py-3">Payment Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lineItems.map((item) => (
                  <tr key={item.key} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <Link to={`/client/${item.client_id}`} className="text-brand-dark font-medium hover:text-brand-gold">
                        {item.client_name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{item.holder_name}</td>
                    <td className="px-4 py-3 text-slate-500">{item.yearType}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {item.dueDate ? item.dueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                    <td className="px-4 py-3 text-slate-600">{item.interest > 0 ? `₹${item.interest}` : '—'}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">₹{item.totalPayable}</td>
                    <td className="px-4 py-3">
                      <input
                        type="date"
                        defaultValue={item.payment?.payment_date || ''}
                        onBlur={(e) => e.target.value !== (item.payment?.payment_date || '') && markPaid(item, e.target.value)}
                        disabled={savingId === item.key}
                        className="border border-slate-300 rounded-md px-2 py-1 text-xs"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}