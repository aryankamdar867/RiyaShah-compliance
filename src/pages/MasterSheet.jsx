import { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import Layout from '../components/Layout';
import {
  currentFyStartYear, fyLabel, fyStartYear, ptecYearType, ptecDueDate,
  ptrcYearStatus, ptrcMonthlySchedule, ptrcAnnualDueDate, computeLineItem,
  clientPTRCAmountForMonth,
} from '../utils/ptRules';

const ENTITY_EXEMPT_FROM_PTEC = ['Partnership Firm', 'HUF'];

function fmtDate(d) {
  if (!d) return '';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }) {
  if (!status) return <span className="text-xs text-slate-400">—</span>;
  const cls = {
    'Overdue': 'bg-red-100 text-red-700',
    'Pending': 'bg-slate-100 text-slate-700',
    'Paid on Time': 'bg-green-100 text-green-700',
    'Filed on Time': 'bg-green-100 text-green-700',
    'Paid Late': 'bg-amber-100 text-amber-800',
    'Filed Late': 'bg-amber-100 text-amber-800',
    'Yes': 'bg-green-100 text-green-700',
    'No': 'bg-slate-100 text-slate-600',
  }[status] || 'bg-slate-100 text-slate-700';
  return <span className={`inline-block text-xs px-2.5 py-0.5 rounded-full font-medium ${cls}`}>{status}</span>;
}

export default function MasterSheet() {
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [activeTab, setActiveTab] = useState('clients');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [clientsData, setClientsData] = useState([]);
  const [ptecData, setPtecData] = useState([]);
  const [ptrcMonthlyData, setPtrcMonthlyData] = useState([]);
  const [ptrcAnnualData, setPtrcAnnualData] = useState([]);
  const [employeesData, setEmployeesData] = useState([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const fy = currentFyStartYear();
      const [
        { data: clients },
        { data: people },
        { data: ptecPayments },
        { data: ptrcPayments },
        { data: employees },
        { data: settingRow },
      ] = await Promise.all([
        supabase.from('clients').select('*').order('name'),
        supabase.from('directors_partners').select('*'),
        supabase.from('ptec_payments').select('*').eq('financial_year', fyLabel(fy)),
        supabase.from('ptrc_payments').select('*'),
        supabase.from('employees').select('*'),
        supabase.from('settings').select('*').eq('key', 'ptrc_monthly_threshold').single(),
      ]);
      const threshold = settingRow ? Number(settingRow.value) : 50000;

      // ---------- Sheet 1: Clients Master ----------
      const clientsSheet = (clients || []).map((c) => ({
        'Client Name': c.name,
        'Entity Type': c.entity_type,
        'State': c.state,
        'PAN': c.pan || '',
        'GSTIN': c.gstin || '',
        'Incorporation Date': c.incorporation_date || '',
        'Onboarding Date': c.onboarding_date || '',
        'PTEC Regn No.': c.ptec_regn_no || '',
        'PTEC Regn Date': c.ptec_regn_date || '',
        'PTRC Regn No.': c.ptrc_regn_no || '',
        'PTRC Regn Date': c.ptrc_regn_date || '',
        'Previous FY PT Liability': c.previous_fy_pt_liability || 0,
        'Group / Contact': c.group_name || '',
        'Importance': c.importance || '',
        'Remarks': c.remarks || '',
      }));

      // ---------- Sheet 2: PTEC ----------
      const ptecSheet = [];
      for (const c of clients || []) {
        if (c.state !== 'Maharashtra') continue;
        const entityExempt = ENTITY_EXEMPT_FROM_PTEC.includes(c.entity_type);

        if (!entityExempt && c.ptec_regn_date) {
          const payment = (ptecPayments || []).find((p) => p.client_id === c.id && p.director_id === null);
          const dueDate = ptecDueDate(c.ptec_regn_date, fy);
          const calc = computeLineItem(2500, dueDate, payment?.payment_date);
          ptecSheet.push({
            'Client Name': c.name,
            'Holder': `${c.name} (entity)`,
            'Category': 'Entity',
            'Year Type': ptecYearType(c.ptec_regn_date, fy),
            'Amount': 2500,
            'Due Date': fmtDate(dueDate),
            'Payment Date': payment?.payment_date || '',
            'Status': calc.status,
            'Days Late': calc.delayDays,
            'Interest': calc.interest,
            'Total Payable': calc.totalPayable,
          });
        }

        const clientPeople = (people || []).filter((p) => p.client_id === c.id && p.ptec_regn_date);
        for (const p of clientPeople) {
          const payment = (ptecPayments || []).find((pay) => pay.client_id === c.id && pay.director_id === p.id);
          const dueDate = ptecDueDate(p.ptec_regn_date, fy);
          const calc = computeLineItem(2500, dueDate, payment?.payment_date);
          ptecSheet.push({
            'Client Name': c.name,
            'Holder': `${p.name} (${p.role})`,
            'Category': p.role,
            'Year Type': ptecYearType(p.ptec_regn_date, fy),
            'Amount': 2500,
            'Due Date': fmtDate(dueDate),
            'Payment Date': payment?.payment_date || '',
            'Status': calc.status,
            'Days Late': calc.delayDays,
            'Interest': calc.interest,
            'Total Payable': calc.totalPayable,
          });
        }
      }

      // ---------- Sheet 3 & 4: PTRC ----------
      const ptrcMonthlySheet = [];
      const ptrcAnnualSheet = [];

      for (const c of clients || []) {
        if (c.state !== 'Maharashtra' || !c.ptrc_regn_date) continue;
        const clientEmployees = (employees || []).filter((e) => e.client_id === c.id && e.active);
        const yearStatus = ptrcYearStatus(c.ptrc_regn_date);
        const clientPtrcFy = yearStatus === 'First Year' ? fyStartYear(c.ptrc_regn_date) : fy;
        const isMonthly = yearStatus === 'First Year' || (c.previous_fy_pt_liability || 0) >= threshold;

        if (isMonthly) {
          const schedule = ptrcMonthlySchedule(clientPtrcFy);
          for (const period of schedule) {
            const payment = (ptrcPayments || []).find(
              (p) => p.client_id === c.id && p.fy_start_year === clientPtrcFy && p.month_no === period.monthNo
            );
            const calendarMonth = period.returnPeriodDate.getMonth() + 1;
            const amount = clientPTRCAmountForMonth(clientEmployees, calendarMonth);
            const calc = computeLineItem(amount, period.dueDate, payment?.payment_date);
            ptrcMonthlySheet.push({
              'Client Name': c.name,
              'Year Type': yearStatus,
              'Period': period.periodLabel,
              'Amount': amount,
              'Due Date': fmtDate(period.dueDate),
              'Filing Date': payment?.payment_date || '',
              'Status': calc.status,
              'Days Late': calc.delayDays,
              'Interest': calc.interest,
              'Total Payable': calc.totalPayable,
            });
          }
        } else {
          const dueDate = ptrcAnnualDueDate(fy);
          const schedule = ptrcMonthlySchedule(fy);
          const amount = schedule.reduce((sum, period) => {
            const calendarMonth = period.returnPeriodDate.getMonth() + 1;
            return sum + clientPTRCAmountForMonth(clientEmployees, calendarMonth);
          }, 0);
          const payment = (ptrcPayments || []).find((p) => p.client_id === c.id && p.fy_start_year === fy && p.month_no === null);
          const calc = computeLineItem(amount, dueDate, payment?.payment_date);
          ptrcAnnualSheet.push({
            'Client Name': c.name,
            'Previous FY Liability': c.previous_fy_pt_liability || 0,
            'FY': fyLabel(fy),
            'Amount': amount,
            'Due Date': fmtDate(dueDate),
            'Filing Date': payment?.payment_date || '',
            'Status': calc.status,
            'Days Late': calc.delayDays,
            'Interest': calc.interest,
            'Total Payable': calc.totalPayable,
          });
        }
      }

      // ---------- Sheet 5: Employees ----------
      const clientNameById = new Map((clients || []).map((c) => [c.id, c.name]));
      const employeesSheet = (employees || []).map((e) => ({
        'Client Name': clientNameById.get(e.client_id) || '(unknown)',
        'Employee Name': e.name,
        'Gender': e.gender,
        'Monthly Salary': e.monthly_salary,
        'Active': e.active ? 'Yes' : 'No',
      }));

      setClientsData(clientsSheet);
      setPtecData(ptecSheet);
      setPtrcMonthlyData(ptrcMonthlySheet);
      setPtrcAnnualData(ptrcAnnualSheet);
      setEmployeesData(employeesSheet);
    } catch (err) {
      console.error('Error loading master sheet data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const downloadExcel = () => {
    setDownloading(true);
    try {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clientsData), 'Clients Master');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ptecData), 'PTEC');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ptrcMonthlyData), 'PTRC Monthly');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ptrcAnnualData), 'PTRC Annual');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(employeesData), 'Employees');

      const today = new Date().toISOString().split('T')[0];
      XLSX.writeFile(wb, `TOSBS_PT_Master_Sheet_${today}.xlsx`);
    } catch (err) {
      console.error('Error generating Excel file:', err);
      alert('Failed to download Excel file: ' + err.message);
    } finally {
      setDownloading(false);
    }
  };

  const tabs = [
    { id: 'clients', label: 'Clients Master', icon: '🏢', data: clientsData },
    { id: 'ptec', label: 'PTEC', icon: '📋', data: ptecData },
    { id: 'ptrc_monthly', label: 'PTRC Monthly', icon: '📅', data: ptrcMonthlyData },
    { id: 'ptrc_annual', label: 'PTRC Annual', icon: '📆', data: ptrcAnnualData },
    { id: 'employees', label: 'Employees', icon: '👥', data: employeesData },
  ];

  const currentTabData = useMemo(() => {
    const active = tabs.find((t) => t.id === activeTab);
    return active ? active.data : [];
  }, [activeTab, clientsData, ptecData, ptrcMonthlyData, ptrcAnnualData, employeesData]);

  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return currentTabData;
    const q = searchQuery.toLowerCase();
    return currentTabData.filter((row) =>
      Object.values(row).some((val) => String(val).toLowerCase().includes(q))
    );
  }, [currentTabData, searchQuery]);

  const columns = useMemo(() => {
    if (!currentTabData || currentTabData.length === 0) return [];
    return Object.keys(currentTabData[0]);
  }, [currentTabData]);

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    if (activeTab === 'clients') {
      const mh = clientsData.filter((c) => c.State === 'Maharashtra').length;
      return [
        { label: 'Total Clients', value: clientsData.length },
        { label: 'Maharashtra (PT Applicable)', value: mh },
        { label: 'Other States', value: clientsData.length - mh },
      ];
    } else if (activeTab === 'ptec') {
      const overdue = ptecData.filter((p) => p.Status === 'Overdue').length;
      const totalPayable = ptecData.reduce((s, p) => s + (p['Total Payable'] || 0), 0);
      return [
        { label: 'Total PTEC Holders', value: ptecData.length },
        { label: 'Overdue', value: overdue, alert: overdue > 0 },
        { label: 'Total Payable', value: `₹${totalPayable.toLocaleString('en-IN')}` },
      ];
    } else if (activeTab === 'ptrc_monthly') {
      const overdue = ptrcMonthlyData.filter((p) => p.Status === 'Overdue').length;
      const totalAmt = ptrcMonthlyData.reduce((s, p) => s + (p['Amount'] || 0), 0);
      return [
        { label: 'Total Monthly Rows', value: ptrcMonthlyData.length },
        { label: 'Overdue Filings', value: overdue, alert: overdue > 0 },
        { label: 'Total Calculated Amount', value: `₹${totalAmt.toLocaleString('en-IN')}` },
      ];
    } else if (activeTab === 'ptrc_annual') {
      const overdue = ptrcAnnualData.filter((p) => p.Status === 'Overdue').length;
      const totalAmt = ptrcAnnualData.reduce((s, p) => s + (p['Amount'] || 0), 0);
      return [
        { label: 'Total Annual Filers', value: ptrcAnnualData.length },
        { label: 'Overdue', value: overdue, alert: overdue > 0 },
        { label: 'Total PT Amount', value: `₹${totalAmt.toLocaleString('en-IN')}` },
      ];
    } else if (activeTab === 'employees') {
      const active = employeesData.filter((e) => e.Active === 'Yes').length;
      return [
        { label: 'Total Employees', value: employeesData.length },
        { label: 'Active', value: active },
        { label: 'Inactive', value: employeesData.length - active },
      ];
    }
    return [];
  }, [activeTab, clientsData, ptecData, ptrcMonthlyData, ptrcAnnualData, employeesData]);

  return (
    <Layout>
      <header className="bg-white border-b border-slate-200 px-8 py-5 flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Master Sheet</h2>
          <p className="text-sm text-slate-500">
            View live calculated compliance data across all clients and export anytime.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="border border-slate-300 hover:bg-slate-100 text-slate-700 px-3.5 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 flex items-center gap-1.5"
            title="Refresh latest data"
          >
            🔄 {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={downloadExcel}
            disabled={downloading || loading || clientsData.length === 0}
            className="bg-brand-gold text-brand-dark font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition disabled:opacity-50 flex items-center gap-2 shadow-sm text-sm"
          >
            📊 {downloading ? 'Downloading...' : 'Download Excel (.xlsx)'}
          </button>
        </div>
      </header>

      <div className="px-8 py-6 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap border-b border-slate-200 gap-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSearchQuery('');
                }}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition -mb-px ${
                  isActive
                    ? 'border-brand-gold text-brand-dark font-semibold bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    isActive ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {tab.data.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* Summary Stats Cards */}
        {summaryStats.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {summaryStats.map((stat, i) => (
              <div
                key={i}
                className={`bg-white border rounded-xl p-4 shadow-sm ${
                  stat.alert ? 'border-red-300 bg-red-50/40' : 'border-slate-200'
                }`}
              >
                <p className="text-xs text-slate-500 font-medium">{stat.label}</p>
                <p
                  className={`text-xl font-bold mt-1 ${
                    stat.alert ? 'text-red-600' : 'text-slate-800'
                  }`}
                >
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Toolbar & Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 border border-slate-200 rounded-xl shadow-sm">
          <div className="flex-1 min-w-[240px]">
            <input
              type="text"
              placeholder={`Search in ${tabs.find((t) => t.id === activeTab)?.label}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-gold"
            />
          </div>
          <div className="text-xs text-slate-500">
            Showing <span className="font-semibold text-slate-700">{filteredData.length}</span> of{' '}
            <span className="font-semibold text-slate-700">{currentTabData.length}</span> rows
          </div>
        </div>

        {/* Table View */}
        {loading ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
            <p className="text-slate-500 text-sm">Loading master sheet data...</p>
          </div>
        ) : filteredData.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-sm">
            <p className="text-slate-500 text-sm">
              {searchQuery ? 'No matching rows found.' : 'No data available in this sheet.'}
            </p>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full text-sm text-left border-collapse">
                <thead className="bg-slate-50 text-slate-600 text-xs uppercase sticky top-0 z-10 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-slate-400 w-12 text-center">#</th>
                    {columns.map((col) => (
                      <th key={col} className="px-4 py-3 font-semibold whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredData.map((row, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition">
                      <td className="px-4 py-3 text-xs text-slate-400 text-center">{idx + 1}</td>
                      {columns.map((col) => {
                        const val = row[col];
                        const isStatusCol = col === 'Status' || col === 'Active';
                        const isCurrency =
                          typeof val === 'number' &&
                          (col.includes('Amount') ||
                            col.includes('Liability') ||
                            col.includes('Salary') ||
                            col.includes('Payable') ||
                            col.includes('Interest'));

                        return (
                          <td key={col} className="px-4 py-3 whitespace-nowrap text-slate-700">
                            {isStatusCol ? (
                              <StatusBadge status={val} />
                            ) : isCurrency ? (
                              <span className="font-mono">
                                ₹{Number(val).toLocaleString('en-IN')}
                              </span>
                            ) : val === '' || val === null || val === undefined ? (
                              <span className="text-slate-300">—</span>
                            ) : (
                              <span>{String(val)}</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}