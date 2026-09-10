import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Layout from '../components/Layout';
import { Link } from 'react-router-dom';
import {
  ptrcYearStatus, fyStartYear, ptrcMonthlySchedule, computeLineItem, clientPTRCAmountForMonth,
} from '../utils/ptRules';

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

function ClientMonthlyGrid({ client, employees, payments, onSave }) {
  const fy = fyStartYear(client.ptrc_regn_date);
  const schedule = ptrcMonthlySchedule(fy);
  const clientEmployees = employees.filter((e) => e.client_id === client.id);
  const hasEmployees = clientEmployees.length > 0;

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-4">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
        <div>
          <Link to={`/client/${client.id}`} className="font-semibold text-slate-800 hover:text-brand-gold">
            {client.name}
          </Link>
          <p className="text-xs text-slate-500">
            PTRC registered {new Date(client.ptrc_regn_date).toLocaleDateString('en-IN')} · FY {fy}-{String(fy + 1).slice(-2)}
          </p>
        </div>
        {!hasEmployees && (
          <Link to={`/client/${client.id}`} className="text-xs text-amber-600 hover:underline">
            ⚠ No employees added — amount will show ₹0
          </Link>
        )}
      </div>
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
          <tr>
            <th className="text-left px-4 py-2">Period</th>
            <th className="text-left px-4 py-2">Due Date</th>
            <th className="text-left px-4 py-2">Amount (auto)</th>
            <th className="text-left px-4 py-2">Filing Date</th>
            <th className="text-left px-4 py-2">Status</th>
            <th className="text-left px-4 py-2">Interest</th>
            <th className="text-left px-4 py-2">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {schedule.map((period) => {
            const payment = payments.find(
              (p) => p.client_id === client.id && p.fy_start_year === fy && p.month_no === period.monthNo
            );
            const calendarMonth = period.returnPeriodDate.getMonth() + 1;
            const computedAmount = clientPTRCAmountForMonth(clientEmployees, calendarMonth);
            const calc = computeLineItem(computedAmount, period.dueDate, payment?.payment_date);
            return (
              <tr key={period.monthNo} className="hover:bg-slate-50">
                <td className="px-4 py-2 font-medium text-slate-700">{period.periodLabel}</td>
                <td className="px-4 py-2 text-slate-500">
                  {period.dueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </td>
                <td className="px-4 py-2 font-medium text-slate-700">₹{computedAmount}</td>
                <td className="px-4 py-2">
                  <input
                    type="date"
                    defaultValue={payment?.payment_date || ''}
                    onBlur={(e) => onSave(client.id, fy, period.monthNo, computedAmount, e.target.value || null, payment)}
                    className="border border-slate-300 rounded-md px-2 py-1 text-xs"
                  />
                </td>
                <td className="px-4 py-2"><StatusBadge status={calc.status} /></td>
                <td className="px-4 py-2 text-slate-600">{calc.interest > 0 ? `₹${calc.interest}` : '—'}</td>
                <td className="px-4 py-2 font-medium text-slate-800">₹{calc.totalPayable}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function FirstYearPTRC() {
  const [clients, setClients] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: allClients }, { data: allEmployees }, { data: allPayments }] = await Promise.all([
      supabase.from('clients').select('*').eq('state', 'Maharashtra').not('ptrc_regn_date', 'is', null),
      supabase.from('employees').select('*').eq('active', true),
      supabase.from('ptrc_payments').select('*'),
    ]);
    const firstYearClients = (allClients || []).filter((c) => ptrcYearStatus(c.ptrc_regn_date) === 'First Year');
    setClients(firstYearClients);
    setEmployees(allEmployees || []);
    setPayments(allPayments || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleSave = async (clientId, fy, monthNo, amount, paymentDate, existingPayment) => {
    const { error } = await supabase.from('ptrc_payments').upsert(
      {
        client_id: clientId,
        period_type: 'monthly',
        fy_start_year: fy,
        month_no: monthNo,
        amount,
        payment_date: paymentDate,
      },
      { onConflict: 'client_id,fy_start_year,month_no' }
    );
    if (error) {
      alert(error.message);
      return;
    }
    const { data: refreshed } = await supabase.from('ptrc_payments').select('*');
    setPayments(refreshed || []);
  };

  return (
    <Layout>
      <header className="bg-white border-b border-slate-200 px-8 py-5">
        <h2 className="text-xl font-semibold text-slate-800">PTRC — First Year Filings</h2>
        <p className="text-sm text-slate-500">
          {clients.length} client{clients.length !== 1 ? 's' : ''} in compulsory monthly filing (year 1 of PTRC registration)
        </p>
      </header>

      <div className="px-8 py-8">
        {loading ? (
          <p className="text-slate-500">Loading...</p>
        ) : clients.length === 0 ? (
          <p className="text-slate-500">No clients currently in their first PTRC year.</p>
        ) : (
          clients.map((c) => (
            <ClientMonthlyGrid key={c.id} client={c} employees={employees} payments={payments} onSave={handleSave} />
          ))
        )}
      </div>
    </Layout>
  );
}