import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Layout from '../components/Layout';
import * as XLSX from 'xlsx';
import {
  currentFyStartYear, fyLabel, fyStartYear, ptecYearType, ptecDueDate,
  ptrcYearStatus, ptrcMonthlySchedule, ptrcAnnualDueDate, computeLineItem,
  clientPTRCAmountForMonth,
} from '../utils/ptRules';

const ENTITY_EXEMPT_FROM_PTEC = ['Partnership Firm', 'HUF'];

function StatusBadge({ status }) {
  if (!status) return <span className="text-xs text-slate-400">—</span>;
  const cls = {
    'Overdue': 'bg-red-100 text-red-600',
    'Pending': 'bg-slate-100 text-slate-600',
    'Paid on Time': 'bg-green-100 text-green-700',
    'Filed on Time': 'bg-green-100 text-green-700',
    'Paid Late': 'bg-amber-100 text-amber-700',
    'Filed Late': 'bg-amber-100 text-amber-700',
  }[status] || 'bg-slate-100 text-slate-600';
  return <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${cls}`}>{status}</span>;
}

export default function ClientDetail() {
  const { id } = useParams();
  const [client, setClient] = useState(null);
  const [people, setPeople] = useState([]);
  const [ptecPayments, setPtecPayments] = useState([]);
  const [ptrcPayments, setPtrcPayments] = useState([]);
  const [notices, setNotices] = useState([]);
  const [noticeDetails, setNoticeDetails] = useState({});
  const [logins, setLogins] = useState([]);
  const [showCreds, setShowCreds] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [newEmp, setNewEmp] = useState({ name: '', gender: 'Male', monthly_salary: '' });
  const [loading, setLoading] = useState(true);
  const [uploadPreview, setUploadPreview] = useState(null); // { rows, fileName }
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  const fy = currentFyStartYear();

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: c }, { data: ppl }, { data: pe }, { data: pr }, { data: n }, { data: l }, { data: emp }] = await Promise.all([
      supabase.from('clients').select('*').eq('id', id).single(),
      supabase.from('directors_partners').select('*').eq('client_id', id),
      supabase.from('ptec_payments').select('*').eq('client_id', id).eq('financial_year', fyLabel(fy)),
      supabase.from('ptrc_payments').select('*').eq('client_id', id),
      supabase.from('notices').select('*').eq('client_id', id),
      supabase.from('login_credentials').select('*').eq('client_id', id),
      supabase.from('employees').select('*').eq('client_id', id),
    ]);
    setClient(c);
    setPeople(ppl || []);
    setPtecPayments(pe || []);
    setPtrcPayments(pr || []);
    setNotices(n || []);
    setLogins(l || []);
    setEmployees(emp || []);

    if (n && n.length > 0) {
      const noticeIds = n.map((x) => x.id);
      const { data: details } = await supabase
        .from('notice_year_details').select('*').in('notice_id', noticeIds).order('financial_year');
      const grouped = {};
      (details || []).forEach((d) => {
        if (!grouped[d.notice_id]) grouped[d.notice_id] = [];
        grouped[d.notice_id].push(d);
      });
      setNoticeDetails(grouped);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [id]);

  const addEmployee = async () => {
    if (!newEmp.name.trim() || !newEmp.monthly_salary) return;
    const { error } = await supabase.from('employees').insert({
      client_id: id,
      name: newEmp.name,
      gender: newEmp.gender,
      monthly_salary: Number(newEmp.monthly_salary),
    });
    if (error) { alert(error.message); return; }
    setNewEmp({ name: '', gender: 'Male', monthly_salary: '' });
    fetchAll();
  };

  const toggleEmployeeActive = async (emp) => {
    await supabase.from('employees').update({ active: !emp.active }).eq('id', emp.id);
    fetchAll();
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadResult(null);

    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

    // Flexible column matching — only needs Employee Name, Gender, Monthly Salary
    const parsed = rows.map((r) => {
      const keys = Object.keys(r);
      const findKey = (patterns) => keys.find((k) => patterns.some((p) => k.toLowerCase().includes(p)));
      const nameKey = findKey(['employee', 'name']);
      const genderKey = findKey(['gender', 'sex']);
      const salaryKey = findKey(['salary', 'wage', 'pay']);

      const genderRaw = genderKey ? String(r[genderKey] || '').trim().toLowerCase() : '';
      return {
        name: nameKey ? String(r[nameKey] || '').trim() : '',
        gender: genderRaw.startsWith('f') ? 'Female' : 'Male',
        monthly_salary: salaryKey ? Number(r[salaryKey]) || 0 : 0,
      };
    }).filter((r) => r.name);

    setUploadPreview({ rows: parsed, fileName: file.name });
    e.target.value = ''; // allow re-selecting the same file later
  };

  const confirmUpload = async () => {
    if (!uploadPreview) return;
    setUploading(true);
    const rows = uploadPreview.rows.map((r) => ({
      client_id: id,
      name: r.name,
      gender: r.gender,
      monthly_salary: r.monthly_salary,
    }));
    const { error } = await supabase.from('employees').insert(rows);
    setUploading(false);
    if (error) {
      setUploadResult({ success: false, message: error.message });
      return;
    }
    setUploadResult({ success: true, message: `Added ${rows.length} employees.` });
    setUploadPreview(null);
    fetchAll();
  };

  if (loading) return <Layout><p className="p-8 text-slate-500">Loading...</p></Layout>;
  if (!client) return <Layout><p className="p-8 text-slate-500">Client not found.</p></Layout>;

  const isMaharashtra = client.state === 'Maharashtra';
  const entityExempt = ENTITY_EXEMPT_FROM_PTEC.includes(client.entity_type);

  // ---- PTEC rows ----
  const ptecRows = [];
  if (isMaharashtra && !entityExempt && client.ptec_regn_date) {
    const payment = ptecPayments.find((p) => p.director_id === null);
    const dueDate = ptecDueDate(client.ptec_regn_date, fy);
    ptecRows.push({
      holder: `${client.name} (entity)`,
      yearType: ptecYearType(client.ptec_regn_date, fy),
      dueDate, amount: 2500, payment,
      ...computeLineItem(2500, dueDate, payment?.payment_date),
    });
  }
  if (isMaharashtra) {
    for (const p of people.filter((p) => p.ptec_regn_date)) {
      const payment = ptecPayments.find((pay) => pay.director_id === p.id);
      const dueDate = ptecDueDate(p.ptec_regn_date, fy);
      ptecRows.push({
        holder: `${p.name} (${p.role})`,
        yearType: ptecYearType(p.ptec_regn_date, fy),
        dueDate, amount: 2500, payment,
        ...computeLineItem(2500, dueDate, payment?.payment_date),
      });
    }
  }

  // ---- PTRC status ----
  const ptrcStatus = isMaharashtra && client.ptrc_regn_date ? ptrcYearStatus(client.ptrc_regn_date) : 'N/A';
  const ptrcFy = client.ptrc_regn_date ? fyStartYear(client.ptrc_regn_date) : fy;
  const ptrcSchedule = ptrcStatus !== 'N/A' ? ptrcMonthlySchedule(ptrcFy === fy || ptrcStatus === 'First Year' ? ptrcFy : fy) : [];
  const activeEmployees = employees.filter((e) => e.active);
  const annualDueDate = ptrcStatus === 'From 2nd Year' ? ptrcAnnualDueDate(fy) : null;
  const annualPayment = ptrcPayments.find((p) => p.fy_start_year === fy && p.month_no === null);

  return (
    <Layout>
      <header className="bg-white border-b border-slate-200 px-8 py-5">
        <Link to="/" className="text-sm text-slate-500 hover:text-brand-gold">← Back to Clients</Link>
        <h1 className="text-xl font-bold text-slate-800 mt-1">{client.name}</h1>
        <p className="text-sm text-slate-500">
          {client.entity_type} · {client.state} {client.pan && `· PAN: ${client.pan}`}
          {!isMaharashtra && <span className="ml-2 text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Not Applicable (non-MH)</span>}
        </p>
      </header>

      <div className="max-w-4xl px-8 py-8 space-y-8">
        {/* Entity info */}
        <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm grid grid-cols-3 gap-4 text-sm">
          <div><p className="text-xs text-slate-400">Incorporation Date</p><p className="font-medium">{client.incorporation_date || '—'}</p></div>
          <div><p className="text-xs text-slate-400">Onboarding Date</p><p className="font-medium">{client.onboarding_date || '—'}</p></div>
          <div><p className="text-xs text-slate-400">GSTIN</p><p className="font-medium">{client.gstin || '—'}</p></div>
          <div><p className="text-xs text-slate-400">Employees</p><p className="font-medium">{activeEmployees.length}</p></div>
          <div><p className="text-xs text-slate-400">Previous FY PT Liability</p><p className="font-medium">₹{(client.previous_fy_pt_liability || 0).toLocaleString('en-IN')}</p></div>
          <div><p className="text-xs text-slate-400">Group / Contact</p><p className="font-medium">{client.group_name || '—'}</p></div>
        </section>

        {/* Employees */}
        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-3">Employees (drives PTRC amount)</h2>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-3">
            {employees.length === 0 ? (
              <p className="text-sm text-slate-400 p-4">No employees added yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                  <tr>
                    <th className="text-left px-4 py-2">Name</th>
                    <th className="text-left px-4 py-2">Gender</th>
                    <th className="text-left px-4 py-2">Monthly Salary</th>
                    <th className="text-left px-4 py-2">PT (non-Feb)</th>
                    <th className="text-left px-4 py-2">Active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employees.map((e) => (
                    <tr key={e.id} className={e.active ? '' : 'opacity-40'}>
                      <td className="px-4 py-2">{e.name}</td>
                      <td className="px-4 py-2 text-slate-500">{e.gender}</td>
                      <td className="px-4 py-2 text-slate-500">₹{Number(e.monthly_salary).toLocaleString('en-IN')}</td>
                      <td className="px-4 py-2 text-slate-500">₹{clientPTRCAmountForMonth([e], 4)}</td>
                      <td className="px-4 py-2">
                        <button onClick={() => toggleEmployeeActive(e)} className="text-xs text-brand-gold hover:underline">
                          {e.active ? 'Mark Inactive' : 'Mark Active'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Manual add */}
          <div className="flex gap-2 items-end bg-white border border-slate-200 rounded-xl p-3 shadow-sm mb-3">
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1">Name</label>
              <input value={newEmp.name} onChange={(e) => setNewEmp({ ...newEmp, name: e.target.value })}
                className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Gender</label>
              <select value={newEmp.gender} onChange={(e) => setNewEmp({ ...newEmp, gender: e.target.value })}
                className="border border-slate-300 rounded-md px-2 py-1.5 text-sm">
                <option>Male</option>
                <option>Female</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Monthly Salary</label>
              <input type="number" value={newEmp.monthly_salary} onChange={(e) => setNewEmp({ ...newEmp, monthly_salary: e.target.value })}
                className="w-32 border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
            </div>
            <button onClick={addEmployee} className="text-xs bg-brand-gold text-brand-dark font-medium px-3 py-2 rounded-md">
              + Add
            </button>
          </div>

          {/* Excel upload — scoped to this client only, no Client Name column needed */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-700 mb-1">Or upload an Excel for this client</p>
            <p className="text-xs text-slate-400 mb-3">
              Columns needed: <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">Employee Name</span>,{' '}
              <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">Gender</span>,{' '}
              <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">Monthly Salary</span> — no Client Name column needed, since this uploads only for {client.name}.
            </p>
            <input type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="text-sm" />

            {uploadPreview && (
              <div className="mt-4">
                <p className="text-xs text-slate-500 mb-2">
                  {uploadPreview.fileName} — {uploadPreview.rows.length} employees found, ready to add:
                </p>
                <div className="border border-slate-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto mb-3">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-1.5">Name</th>
                        <th className="text-left px-3 py-1.5">Gender</th>
                        <th className="text-left px-3 py-1.5">Salary</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {uploadPreview.rows.map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-1.5">{r.name}</td>
                          <td className="px-3 py-1.5 text-slate-500">{r.gender}</td>
                          <td className="px-3 py-1.5 text-slate-500">₹{r.monthly_salary.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-2">
                  <button onClick={confirmUpload} disabled={uploading}
                    className="text-xs bg-brand-gold text-brand-dark font-medium px-4 py-2 rounded-md disabled:opacity-50">
                    {uploading ? 'Adding...' : `Add ${uploadPreview.rows.length} Employees`}
                  </button>
                  <button onClick={() => setUploadPreview(null)} className="text-xs text-slate-400 px-2">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {uploadResult && (
              <div className={`mt-3 text-sm rounded-md px-3 py-2 ${uploadResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                {uploadResult.message}
              </div>
            )}
          </div>
        </section>

        {isMaharashtra && (
          <>
            {/* PTEC */}
            <section>
              <h2 className="text-lg font-semibold text-slate-800 mb-3">PTEC — FY {fyLabel(fy)}</h2>
              {entityExempt && (
                <p className="text-xs text-amber-600 mb-2">
                  {client.entity_type} is exempt from entity-level PTEC — only individual partners/co-parceners shown below.
                </p>
              )}
              {ptecRows.length === 0 ? (
                <p className="text-sm text-slate-400">No PTEC holders registered yet.</p>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl divide-y shadow-sm">
                  {ptecRows.map((row, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3">
                      <div>
                        <p className="font-medium text-sm">{row.holder}</p>
                        <p className="text-xs text-slate-500">
                          {row.yearType} · Due {row.dueDate?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          {row.interest > 0 && ` · Interest ₹${row.interest}`}
                        </p>
                      </div>
                      <StatusBadge status={row.status} />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* PTRC */}
            <section>
              <h2 className="text-lg font-semibold text-slate-800 mb-3">
                PTRC {ptrcStatus !== 'N/A' && <span className="text-sm font-normal text-slate-500">({ptrcStatus})</span>}
              </h2>
              {ptrcStatus === 'N/A' ? (
                <p className="text-sm text-slate-400">No PTRC registration on file.</p>
              ) : ptrcStatus === 'First Year' ? (
                <div className="bg-white border border-slate-200 rounded-xl divide-y shadow-sm">
                  {ptrcSchedule.map((period) => {
                    const payment = ptrcPayments.find((p) => p.fy_start_year === ptrcFy && p.month_no === period.monthNo);
                    const calendarMonth = period.returnPeriodDate.getMonth() + 1;
                    const computedAmount = clientPTRCAmountForMonth(activeEmployees, calendarMonth);
                    const calc = computeLineItem(computedAmount, period.dueDate, payment?.payment_date);
                    return (
                      <div key={period.monthNo} className="flex items-center justify-between px-4 py-2.5">
                        <p className="text-sm font-medium text-slate-700">{period.periodLabel}</p>
                        <p className="text-xs text-slate-500">₹{computedAmount}</p>
                        <StatusBadge status={calc.status} />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex justify-between items-center">
                  <div>
                    <p className="text-sm font-medium">Annual/Monthly filing — see PTRC From Year 2 tracker for exact frequency &amp; grid</p>
                    <p className="text-xs text-slate-500">
                      Due {annualDueDate?.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      {annualPayment?.amount && ` · ₹${annualPayment.amount}`}
                    </p>
                  </div>
                  <Link to="/ptrc/from-year-2" className="text-xs text-brand-gold hover:underline">Open tracker →</Link>
                </div>
              )}
            </section>
          </>
        )}

        {/* Notices */}
        {notices.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-slate-800 mb-3">Notices</h2>
            <div className="space-y-4">
              {notices.map((n) => (
                <div key={n.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <p className="font-medium text-sm text-slate-800 mb-1">{n.entity_name}</p>
                  <p className="text-xs text-slate-400 mb-3">{n.constitution || '—'} {n.income_type && `· Income: ${n.income_type}`}</p>
                  {(noticeDetails[n.id] || []).length > 0 && (
                    <div className="divide-y border-t border-slate-100">
                      {noticeDetails[n.id].map((d) => (
                        <div key={d.id} className="flex justify-between items-center py-2 text-sm">
                          <span className="text-slate-600">{d.financial_year}</span>
                          <span className="text-slate-500">{d.amount ? `₹${d.amount}` : '—'}</span>
                          <StatusBadge status={d.filing_status} />
                          <StatusBadge status={d.paid_status} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Login credentials */}
        {logins.length > 0 && (
          <section>
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-semibold text-slate-800">Portal Login Credentials</h2>
              <button onClick={() => setShowCreds(!showCreds)}
                className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-md font-medium">
                {showCreds ? 'Hide' : 'Show'}
              </button>
            </div>
            {showCreds && (
              <div className="bg-white border border-slate-200 rounded-xl divide-y shadow-sm">
                {logins.map((l) => (
                  <div key={l.id} className="px-4 py-3 grid grid-cols-2 gap-2 text-sm">
                    <div><p className="text-xs text-slate-400">PTEC Login</p><p className="font-mono">{l.ptec_login || '—'}</p></div>
                    <div><p className="text-xs text-slate-400">PTEC Password</p><p className="font-mono">{l.ptec_password || '—'}</p></div>
                    <div><p className="text-xs text-slate-400">PTRC Login</p><p className="font-mono">{l.ptrc_login || '—'}</p></div>
                    <div><p className="text-xs text-slate-400">PTRC Password</p><p className="font-mono">{l.ptrc_password || '—'}</p></div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </Layout>
  );
}
