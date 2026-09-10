import { useState } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import Layout from '../components/Layout';

function normName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export default function EmployeeUpload() {
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState([]);
  const [matched, setMatched] = useState([]);
  const [unmatched, setUnmatched] = useState([]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setParsing(true);
    setResult(null);

    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

    // Expected columns (case-insensitive, flexible naming):
    // Client Name | Employee Name | Gender | Monthly Salary
    const normalized = rows.map((r) => {
      const keys = Object.keys(r);
      const findKey = (patterns) => keys.find((k) => patterns.some((p) => k.toLowerCase().includes(p)));
      const clientKey = findKey(['client', 'company', 'firm']);
      const nameKey = findKey(['employee', 'name']) && keys.find((k) => k.toLowerCase().includes('employee') || (k.toLowerCase().includes('name') && !k.toLowerCase().includes('client')));
      const genderKey = findKey(['gender', 'sex']);
      const salaryKey = findKey(['salary', 'wage', 'pay']);

      return {
        clientName: clientKey ? r[clientKey] : null,
        employeeName: nameKey ? r[nameKey] : null,
        gender: genderKey ? String(r[genderKey] || '').trim() : null,
        salary: salaryKey ? Number(r[salaryKey]) || 0 : 0,
      };
    }).filter((r) => r.clientName && r.employeeName);

    setParsedRows(normalized);

    // Match against existing clients
    const { data: clients } = await supabase.from('clients').select('id, name');
    const clientIndex = new Map((clients || []).map((c) => [normName(c.name), c]));

    const matchedRows = [];
    const unmatchedRows = [];

    for (const row of normalized) {
      const client = clientIndex.get(normName(row.clientName));
      const gender = row.gender.toLowerCase().startsWith('f') ? 'Female' : 'Male';
      if (client) {
        matchedRows.push({ ...row, gender, client_id: client.id, matchedClientName: client.name });
      } else {
        unmatchedRows.push({ ...row, gender });
      }
    }

    setMatched(matchedRows);
    setUnmatched(unmatchedRows);
    setParsing(false);
  };

  const handleImport = async () => {
    setImporting(true);
    const rows = matched.map((r) => ({
      client_id: r.client_id,
      name: r.employeeName,
      gender: r.gender,
      monthly_salary: r.salary,
    }));

    const chunkSize = 500;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabase.from('employees').insert(chunk);
      if (error) {
        setResult({ success: false, message: error.message });
        setImporting(false);
        return;
      }
      inserted += chunk.length;
    }
    setResult({ success: true, message: `Imported ${inserted} employees successfully.` });
    setImporting(false);
  };

  return (
    <Layout>
      <header className="bg-white border-b border-slate-200 px-8 py-5">
        <h2 className="text-xl font-semibold text-slate-800">Bulk Upload Employees</h2>
        <p className="text-sm text-slate-500">
          Excel with columns: <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">Client Name</span>,{' '}
          <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">Employee Name</span>,{' '}
          <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">Gender</span>,{' '}
          <span className="font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">Monthly Salary</span>
        </p>
      </header>

      <div className="max-w-4xl px-8 py-8 space-y-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <input type="file" accept=".xlsx,.xls" onChange={handleFile}
            className="text-sm" />
          {fileName && <p className="text-xs text-slate-500 mt-2">Selected: {fileName}</p>}
        </div>

        {parsing && <p className="text-slate-500">Parsing file...</p>}

        {!parsing && parsedRows.length > 0 && (
          <>
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
              <p className="text-sm">
                <span className="font-medium text-green-700">{matched.length} matched</span> to existing clients ·{' '}
                <span className="font-medium text-red-600">{unmatched.length} unmatched</span> (client name not found)
              </p>
            </div>

            {matched.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-slate-600 mb-2">Ready to import ({matched.length})</h3>
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2">Client</th>
                        <th className="text-left px-4 py-2">Employee</th>
                        <th className="text-left px-4 py-2">Gender</th>
                        <th className="text-left px-4 py-2">Salary</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {matched.map((r, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2">{r.matchedClientName}</td>
                          <td className="px-4 py-2">{r.employeeName}</td>
                          <td className="px-4 py-2 text-slate-500">{r.gender}</td>
                          <td className="px-4 py-2 text-slate-500">₹{r.salary.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="mt-4 bg-brand-gold text-brand-dark font-medium px-5 py-2.5 rounded-md hover:opacity-90 disabled:opacity-50"
                >
                  {importing ? 'Importing...' : `Import ${matched.length} Employees`}
                </button>
              </div>
            )}

            {unmatched.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-red-600 mb-2">
                  Unmatched — client name doesn't exist in the system ({unmatched.length})
                </h3>
                <div className="bg-white border border-red-200 rounded-xl shadow-sm overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-red-50 text-red-500 text-xs uppercase sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2">Client Name (in file)</th>
                        <th className="text-left px-4 py-2">Employee</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {unmatched.map((r, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2">{r.clientName}</td>
                          <td className="px-4 py-2 text-slate-500">{r.employeeName}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  Fix the client name in your Excel to match exactly, or onboard these as new clients first, then re-upload.
                </p>
              </div>
            )}
          </>
        )}

        {result && (
          <div className={`rounded-md px-4 py-3 text-sm ${result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {result.message}
          </div>
        )}
      </div>
    </Layout>
  );
}