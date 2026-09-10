// Direct port of the formula logic in PT_Master_Tracker.xlsx
// (Client Master, PTEC Tracker, PTRC - First Year, PTRC - From Year 2)

// ---------- Financial year helpers ----------

export function fyStartYear(date) {
  const d = new Date(date);
  return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
}

export function fyLabel(startYear) {
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

export function currentFyStartYear() {
  return fyStartYear(new Date());
}

// ---------- PTEC ----------

export function ptecYearType(regDate, evaluatedFyStartYear) {
  if (!regDate) return null;
  return fyStartYear(regDate) === evaluatedFyStartYear ? 'First Year' : 'From Year 2';
}

export function ptecDueDate(regDate, evaluatedFyStartYear) {
  if (!regDate) return null;
  const yearType = ptecYearType(regDate, evaluatedFyStartYear);
  const reg = new Date(regDate);

  if (yearType === 'First Year') {
    const may15 = new Date(evaluatedFyStartYear, 4, 15);
    if (reg <= may15) {
      return new Date(evaluatedFyStartYear, 5, 15);
    }
    const due = new Date(reg);
    due.setMonth(due.getMonth() + 1);
    return due;
  }
  return new Date(evaluatedFyStartYear, 5, 15);
}

export function ptecApplicableFYs(regDate, uptoDate = new Date()) {
  if (!regDate) return [];
  const start = fyStartYear(regDate);
  const end = fyStartYear(uptoDate);
  const years = [];
  for (let y = start; y <= end; y++) years.push(y);
  return years;
}

// ---------- PTRC ----------

export function ptrcYearStatus(regDate, today = new Date()) {
  if (!regDate) return 'N/A';
  return fyStartYear(regDate) === fyStartYear(today) ? 'First Year' : 'From 2nd Year';
}

export function ptrcFilingFrequency(ptrcApplicable, yearStatus, previousFyLiability, threshold) {
  if (!ptrcApplicable) return 'N/A';
  if (yearStatus === 'First Year') return 'Monthly (mandatory - 1st year)';
  return previousFyLiability >= threshold
    ? `Monthly (liability >= ${threshold})`
    : `Annual (liability < ${threshold})`;
}

export function ptrcMonthPeriod(fyStart, monthNo) {
  const calendarYear = monthNo <= 9 ? fyStart : fyStart + 1;
  const calendarMonth = monthNo <= 9 ? monthNo + 3 : monthNo - 9;
  const returnPeriodDate = new Date(calendarYear, calendarMonth - 1, 1);
  const due = new Date(calendarYear, calendarMonth, 15);
  const periodLabel = returnPeriodDate.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
  return { periodLabel, returnPeriodDate, dueDate: due };
}

export function ptrcMonthlySchedule(fyStart) {
  const rows = [];
  for (let m = 1; m <= 12; m++) {
    rows.push({ monthNo: m, ...ptrcMonthPeriod(fyStart, m) });
  }
  return rows;
}

export function ptrcAnnualDueDate(fyStart) {
  return new Date(fyStart + 1, 2, 15);
}

// ---------- Status, delay, interest ----------

export function computeStatus(dueDate, paidOrFiledDate, today = new Date()) {
  if (!dueDate) return null;
  if (!paidOrFiledDate) {
    return today > dueDate ? 'Overdue' : 'Pending';
  }
  return new Date(paidOrFiledDate) <= dueDate ? 'Paid on Time' : 'Paid Late';
}

export function computeDelayDays(dueDate, paidOrFiledDate, status, today = new Date()) {
  if (!dueDate) return 0;
  if (status === 'Paid Late') {
    return Math.round((new Date(paidOrFiledDate) - dueDate) / 86400000);
  }
  if (status === 'Overdue') {
    return Math.round((today - dueDate) / 86400000);
  }
  return 0;
}

export function computeMonthsLate(delayDays) {
  if (delayDays <= 0) return 0;
  return Math.ceil(delayDays / 30);
}

export function computeInterest(amount, monthsLate) {
  if (!amount || monthsLate === 0) return 0;
  const m1 = Math.min(monthsLate, 1) * 0.0125;
  const m2to3 = Math.max(Math.min(monthsLate, 3) - 1, 0) * 0.015;
  const beyond3 = Math.max(monthsLate - 3, 0) * 0.02;
  return Math.round(amount * (m1 + m2to3 + beyond3));
}

export function computeLineItem(amount, dueDate, paidDate, today = new Date()) {
  const status = computeStatus(dueDate, paidDate, today);
  const delayDays = computeDelayDays(dueDate, paidDate, status, today);
  const monthsLate = computeMonthsLate(delayDays);
  const interest = computeInterest(amount, monthsLate);
  return {
    status,
    delayDays,
    monthsLate,
    interest,
    totalPayable: (amount || 0) + interest,
  };
}
// ---------- PTRC employee slab calculation ----------
// Per PT_2025-26 note: annual cap ₹2,500/employee, met via ₹200 × 11 + ₹300 in February.

export function employeeMonthlyPT(monthlySalary, gender, calendarMonth) {
  // calendarMonth: 1=Jan, 2=Feb, ... 12=Dec (standard JS-style 1-indexed)
  const isFeb = calendarMonth === 2;

  if (gender === 'Female') {
    if (monthlySalary <= 25000) return 0;
    return isFeb ? 300 : 200;
  }
  // Male
  if (monthlySalary <= 7500) return 0;
  if (monthlySalary <= 10000) return 175;
  return isFeb ? 300 : 200;
}

// Sum PT across all active employees for a given calendar month
export function clientPTRCAmountForMonth(employees, calendarMonth) {
  return (employees || [])
    .filter((e) => e.active)
    .reduce((sum, e) => sum + employeeMonthlyPT(Number(e.monthly_salary) || 0, e.gender, calendarMonth), 0);
}