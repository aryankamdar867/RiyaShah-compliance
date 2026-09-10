import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Layout from '../components/Layout';
import { Link } from 'react-router-dom';
import {
  ptrcYearStatus, currentFyStartYear, ptrcMonthlySchedule,
  ptrcAnnualDueDate, computeLineItem, clientPTRCAmountForMonth,
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

function MonthlyClientGrid({ client, employees, fy, payments, onSave }) {
  const schedule = ptrcMonthlySchedule(fy);
  const clientEmployees = employees.filter((e) => e.client_id === client.id);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-4">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
        <Link to={`/client/${client.id}`} className="font-semibold text-slate-800 hover:text-brand-gold">
          {client.name}
        </Link>
        <p className="text-xs text-slate-500">Previous FY liability ₹{(client.previous_fy_pt_liability || 0).toLocaleString('en-IN')} — monthly filing</p>
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
                    onBlur={(e) => onSave(client.id, 'monthly', fy, period.monthNo, computedAmount, e.target.value || null, payment)}
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

function AnnualClientRow({ client, employees, fy, payment, onSave }) {
  const dueDate = ptrcAnnualDueDate(fy);
  const clientEmployees = employees.filter((e) => e.client_id === client.id);
  // Annual amount = sum of the auto amount across all 12 months of the FY
  const schedule = ptrcMonthlySchedule(fy);
  const computedAmount = schedule.reduce((sum, period) => {
    const calendarMonth = period.returnPeriodDate.getMonth() + 1;
    return sum + clientPTRCAmountForMonth(clientEmployees, calendarMonth);
  }, 0);
  const calc = computeLineItem(computedAmount, dueDate, payment?.payment_date);

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3">
        <Link to={`/client/${client.id}`} className="text-brand-dark font-medium hover:text-brand-gold">
          {client.name}
        </Link>
      </td>
      <td className="px-4 py-3 text-slate-500">
        {dueDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
      </td>
      <td className="px-4 py-3 font-medium text-slate-700">₹{computedAmount}</td>
      <td className="px-4 py-3">
        <input
          type="date"
          defaultValue={payment?.payment_date || ''}
          onBlur={(e) => onSave(client.id, 'annual', fy, null, computedAmount, e.target.value || null, payment)}
          className="border border-slate-300 rounded-md px-2 py-1 text-xs"
        />
      </td>
      <td className="px-4 py-3"><StatusBadge status={calc.status} /></td>
      <td className="px-4 py-3 text-slate-600">{calc.interest > 0 ? `₹${calc.interest}` : '—'}</td>
      <td className="px-4 py-3 font-medium text-slate-800">₹{calc.totalPayable}</td>
    </tr>
  );
}

export default function FromYear2PTRC() {
  const [threshold, setThreshold] = useState(50000);
  const [editingThreshold, setEditingThreshold] = useState(false);
  const [thresholdInput, setThresholdInput] = useState('50000');
  const [clients, setClients] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const fy = currentFyStartYear();

  const load = async () => {
    setLoading(true);
    const [{ data: setting }, { data: allClients }, { data: allEmployees }, { data: allPayments }] = await Promise.all([
      supabase.from('settings').select('*').eq('key', 'ptrc_monthly_threshold').single(),
      supabase.from('clients').select('*').eq('state', 'Maharashtra').not('ptrc_regn_date', 'is', null),
      supabase.from('employees').select('*').eq('active', true),
      supabase.from('ptrc_payments').select('*'),
    ]);
    const t = setting ? Number(setting.value) : 50000;
    setThreshold(t);
    setThresholdInput(String(t));

    const fromYear2 = (allClients || []).filter((c) => ptrcYearStatus(c.ptrc_regn_date) === 'From 2nd Year');
    setClients(fromYear2);
    setEmployees(allEmployees || []);
    setPayments(allPayments || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const saveThreshold = async () => {
    const val = Number(thresholdInput);
    if (!val || val <= 0) return;
    await supabase.from('settings').update({ value: String(val) }).eq('key', 'ptrc_monthly_threshold');
    setThreshold(val);
    setEditingThreshold(false);
  };

  const handleSave = async (clientId, periodType, fyStart, monthNo, amount, paymentDate, existingPayment) => {
    const { error } = await supabase.from('ptrc_payments').upsert(
      {
        client_id: clientId,
        period_type: periodType,
        fy_start_year: fyStart,
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

  const monthlyClients = clients.filter((c) => (c.previous_fy_pt_liability || 0) >= threshold);
  const annualClients = clients.filter((c) => (c.previous_fy_pt_liability || 0) < threshold);

  return (
    <Layout>
      <header className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">PTRC — From 2nd Year</h2>
          <p className="text-sm text-slate-500">
            {monthlyClients.length} monthly filer{monthlyClients.length !== 1 ? 's' : ''} · {annualClients.length} annual filer{annualClients.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="text-sm">
          {editingThreshold ? (
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Threshold ₹</span>
              <input
                type="number"
                value={thresholdInput}
                onChange={(e) => setThresholdInput(e.target.value)}
                className="w-28 border border-slate-300 rounded-md px-2 py-1"
                autoFocus
              />
              <button onClick={saveThreshold} className="text-xs bg-brand-gold text-brand-dark px-3 py-1.5 rounded-md font-medium">Save</button>
              <button onClick={() => setEditingThreshold(false)} className="text-xs text-slate-400">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setEditingThreshold(true)} className="text-slate-500 hover:text-brand-gold">
              Monthly threshold: <span className="font-medium">₹{threshold.toLocaleString('en-IN')}</span> ✎
            </button>
          )}
        </div>
      </header>

      <div className="px-8 py-8">
        {loading ? (
          <p className="text-slate-500">Loading...</p>
        ) : clients.length === 0 ? (
          <p className="text-slate-500">No clients currently in "From 2nd Year" PTRC.</p>
        ) : (
          <>
            {monthlyClients.length > 0 && (
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-slate-600 mb-3 uppercase tracking-wide">
                  Monthly Filers (liability ≥ ₹{threshold.toLocaleString('en-IN')})
                </h3>
                {monthlyClients.map((c) => (
                  <MonthlyClientGrid key={c.id} client={c} employees={employees} fy={fy} payments={payments} onSave={handleSave} />
                ))}
              </div>
            )}

            {annualClients.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-600 mb-3 uppercase tracking-wide">
                  Annual Filers (liability &lt; ₹{threshold.toLocaleString('en-IN')})
                </h3>
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                      <tr>
                        <th className="text-left px-4 py-3">Client</th>
                        <th className="text-left px-4 py-3">Due Date</th>
                        <th className="text-left px-4 py-3">Amount (auto)</th>
                        <th className="text-left px-4 py-3">Filing Date</th>
                        <th className="text-left px-4 py-3">Status</th>
                        <th className="text-left px-4 py-3">Interest</th>
                        <th className="text-left px-4 py-3">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {annualClients.map((c) => {
                        const payment = payments.find(
                          (p) => p.client_id === c.id && p.fy_start_year === fy && p.month_no === null
                        );
                        return <AnnualClientRow key={c.id} client={c} employees={employees} fy={fy} payment={payment} onSave={handleSave} />;
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}