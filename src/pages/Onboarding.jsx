import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Layout from '../components/Layout';
import { ptecYearType, ptrcYearStatus, currentFyStartYear, fyLabel } from '../utils/ptRules';

const ENTITY_TYPES = ['Private Limited Company', 'LLP', 'Partnership Firm', 'HUF', 'Sole Proprietor'];
const ENTITY_EXEMPT_FROM_PTEC = ['Partnership Firm', 'HUF'];

const emptyPerson = () => ({ name: '', role: 'Director', ptec_regn_no: '', ptec_regn_date: '' });

export default function Onboarding() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    name: '',
    entity_type: 'Private Limited Company',
    state: 'Maharashtra',
    pan: '',
    gstin: '',
    incorporation_date: '',
    onboarding_date: new Date().toISOString().split('T')[0],
    employees_on_payroll: false,
    no_of_employees: 0,
    previous_fy_pt_liability: 0,
    ptec_regn_no: '',
    ptec_regn_date: '',
    ptrc_regn_no: '',
    ptrc_regn_date: '',
    group_name: '',
    remarks: '',
  });

  const [people, setPeople] = useState([]);

  const isMaharashtra = form.state === 'Maharashtra';
  const entityPtecExempt = ENTITY_EXEMPT_FROM_PTEC.includes(form.entity_type);
  const needsPeople = ['Private Limited Company', 'LLP', 'Partnership Firm'].includes(form.entity_type);

  const currentFy = currentFyStartYear();
  const ptecPreview = form.ptec_regn_date
    ? ptecYearType(form.ptec_regn_date, currentFy)
    : null;
  const ptrcPreview = form.ptrc_regn_date
    ? ptrcYearStatus(form.ptrc_regn_date)
    : null;
  const backlogFlag =
    form.ptec_regn_date &&
    form.onboarding_date &&
    new Date(form.ptec_regn_date) < new Date(new Date(form.onboarding_date).setDate(new Date(form.onboarding_date).getDate() - 30));

  const updatePerson = (idx, field, value) => {
    setPeople((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  };
  const addPerson = () => setPeople((prev) => [...prev, emptyPerson()]);
  const removePerson = (idx) => setPeople((prev) => prev.filter((_, i) => i !== idx));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .insert({
        name: form.name,
        entity_type: form.entity_type,
        state: form.state,
        pan: form.pan || null,
        gstin: form.gstin || null,
        incorporation_date: form.incorporation_date || null,
        onboarding_date: form.onboarding_date || null,
        employees_on_payroll: form.employees_on_payroll,
        no_of_employees: Number(form.no_of_employees) || 0,
        previous_fy_pt_liability: Number(form.previous_fy_pt_liability) || 0,
        ptec_regn_no: form.ptec_regn_no || null,
        ptec_regn_date: form.ptec_regn_date || null,
        ptrc_regn_no: form.ptrc_regn_no || null,
        ptrc_regn_date: form.ptrc_regn_date || null,
        group_name: form.group_name || null,
        remarks: form.remarks || null,
      })
      .select()
      .single();

    if (clientError) {
      setError(clientError.message);
      setSaving(false);
      return;
    }

    if (people.length > 0) {
      const rows = people
        .filter((p) => p.name.trim())
        .map((p) => ({
          client_id: client.id,
          name: p.name,
          role: p.role,
          ptec_regn_no: p.ptec_regn_no || null,
          ptec_regn_date: p.ptec_regn_date || null,
        }));
      if (rows.length > 0) {
        const { error: peopleError } = await supabase.from('directors_partners').insert(rows);
        if (peopleError) {
          setError(`Client saved, but directors/partners failed: ${peopleError.message}`);
          setSaving(false);
          return;
        }
      }
    }

    setSaving(false);
    navigate(`/client/${client.id}`);
  };

  return (
    <Layout>
      <header className="bg-white border-b border-slate-200 px-8 py-5">
        <h2 className="text-xl font-semibold text-slate-800">Onboard Client</h2>
        <p className="text-sm text-slate-500">Entity details drive all PTEC/PTRC calculations automatically.</p>
      </header>

      <div className="max-w-3xl px-8 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && <div className="bg-red-50 text-red-600 text-sm rounded-md px-4 py-3">{error}</div>}

          {/* Entity details */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-4">Entity Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium mb-1">Client / Firm Name</label>
                <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Type of Entity</label>
                <select value={form.entity_type} onChange={(e) => setForm({ ...form, entity_type: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2">
                  {ENTITY_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
                {entityPtecExempt && (
                  <p className="text-xs text-amber-600 mt-1">
                    {form.entity_type} is exempt from entity-level PTEC — only individual partners/co-parceners are liable.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">State of Registration</label>
                <select value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2">
                  <option>Maharashtra</option>
                  <option>Other</option>
                </select>
                {!isMaharashtra && (
                  <p className="text-xs text-slate-400 mt-1">Non-Maharashtra clients are excluded from PT tracking.</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">PAN</label>
                <input value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">GSTIN</label>
                <input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Date of Incorporation</label>
                <input type="date" value={form.incorporation_date} onChange={(e) => setForm({ ...form, incorporation_date: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Onboarding Date (with us)</label>
                <input type="date" value={form.onboarding_date} onChange={(e) => setForm({ ...form, onboarding_date: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2" />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Group / Contact Person</label>
                <input value={form.group_name} onChange={(e) => setForm({ ...form, group_name: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2" />
              </div>
            </div>
          </div>

          {/* Payroll */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-4">Payroll (drives PTRC applicability)</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Employees on Payroll?</label>
                <select
                  value={form.employees_on_payroll ? 'Yes' : 'No'}
                  onChange={(e) => setForm({ ...form, employees_on_payroll: e.target.value === 'Yes' })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2"
                >
                  <option>No</option>
                  <option>Yes</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">No. of Employees</label>
                <input type="number" value={form.no_of_employees} onChange={(e) => setForm({ ...form, no_of_employees: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Previous FY PT Liability (₹)</label>
                <input type="number" value={form.previous_fy_pt_liability} onChange={(e) => setForm({ ...form, previous_fy_pt_liability: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2" />
              </div>
            </div>
          </div>

          {/* PTEC / PTRC registration */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <h3 className="font-semibold text-slate-800 mb-1">PTEC / PTRC Registration (entity level)</h3>
            <p className="text-xs text-slate-400 mb-4">
              Leave blank if not yet registered. If already registered years ago, enter the ORIGINAL date —
              the system will classify this correctly as "From Year 2" automatically.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">PTEC Regn No.</label>
                <input value={form.ptec_regn_no} onChange={(e) => setForm({ ...form, ptec_regn_no: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">PTEC Regn Date</label>
                <input type="date" value={form.ptec_regn_date} onChange={(e) => setForm({ ...form, ptec_regn_date: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">PTRC Regn No.</label>
                <input value={form.ptrc_regn_no} onChange={(e) => setForm({ ...form, ptrc_regn_no: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">PTRC Regn Date</label>
                <input type="date" value={form.ptrc_regn_date} onChange={(e) => setForm({ ...form, ptrc_regn_date: e.target.value })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2" />
              </div>
            </div>

            {(ptecPreview || ptrcPreview || backlogFlag) && (
              <div className="mt-4 bg-slate-50 border border-slate-200 rounded-md p-3 text-xs space-y-1">
                <p className="font-medium text-slate-600">Auto-calculated preview (FY {fyLabel(currentFy)}):</p>
                {ptecPreview && <p>PTEC Year Type: <span className="font-medium">{ptecPreview}</span></p>}
                {ptrcPreview && <p>PTRC Year Status: <span className="font-medium">{ptrcPreview}</span></p>}
                {backlogFlag && (
                  <p className="text-amber-600 font-medium">
                    ⚠ Registration pre-dates onboarding by 30+ days — verify past-year payments for backlog.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Directors / Partners */}
          {needsPeople && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="font-semibold text-slate-800">Directors / Partners</h3>
                  <p className="text-xs text-slate-400">PTEC is per-person — ₹2,500 each, tracked individually.</p>
                </div>
                <button type="button" onClick={addPerson}
                  className="text-xs bg-brand-gold text-brand-dark font-medium px-3 py-1.5 rounded-md hover:opacity-90">
                  + Add Person
                </button>
              </div>

              {people.length === 0 && <p className="text-sm text-slate-400">No directors/partners added yet.</p>}

              <div className="space-y-3">
                {people.map((p, idx) => (
                  <div key={idx} className="border border-slate-200 rounded-lg p-3 grid grid-cols-5 gap-2 items-end">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium mb-1">Name</label>
                      <input value={p.name} onChange={(e) => updatePerson(idx, 'name', e.target.value)}
                        className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">Role</label>
                      <select value={p.role} onChange={(e) => updatePerson(idx, 'role', e.target.value)}
                        className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm">
                        <option>Director</option>
                        <option>Partner</option>
                        <option>Proprietor</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">PTEC Regn Date</label>
                      <input type="date" value={p.ptec_regn_date} onChange={(e) => updatePerson(idx, 'ptec_regn_date', e.target.value)}
                        className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-sm" />
                    </div>
                    <button type="button" onClick={() => removePerson(idx)}
                      className="text-xs text-red-500 hover:text-red-700 pb-1.5">
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
            <label className="block text-sm font-medium mb-1">Remarks</label>
            <textarea value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-3 py-2" rows={2} />
          </div>

          <button type="submit" disabled={saving}
            className="bg-brand-dark text-white px-6 py-2.5 rounded-md font-medium hover:bg-slate-800 transition disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Client'}
          </button>
        </form>
      </div>
    </Layout>
  );
}