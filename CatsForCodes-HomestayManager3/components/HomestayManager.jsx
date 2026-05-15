'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'chart.js/auto';

const DETAILS = [
  { key: 'Pemasukan', label: 'Pemasukan', cls: 'hl', rev: true, cp: false, ac: false },
  { key: 'Tambahan Kasur', label: 'Tambahan Kasur', cls: '', rev: false, cp: true, ac: true },
  { key: 'Sarapan', label: 'Sarapan', cls: '', rev: false, cp: true, ac: true },
  { key: 'Tips', label: 'Tips', cls: '', rev: false, cp: true, ac: true },
  { key: 'Laundry', label: 'Laundry', cls: '', rev: false, cp: true, ac: true },
  { key: 'Chef', label: 'Chef', cls: '', rev: false, cp: true, ac: true },
  { key: 'Owner', label: 'Owner', cls: 'owner', rev: false, cp: true, ac: true, isOwner: true },
  { key: 'Karyawan', label: 'Karyawan', cls: '', rev: false, cp: true, ac: true },
  { key: 'Listrik', label: 'Listrik', cls: 'util', rev: false, cp: true, ac: true },
  { key: 'Air (PDAM)', label: 'Air (PDAM)', cls: 'util', rev: false, cp: true, ac: true },
  { key: 'Others', label: 'Others', cls: '', rev: false, cp: true, ac: true },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const OWNER_TYPES = new Set(['Owner']);
const UTIL_TYPES = new Set(['Listrik', 'Air (PDAM)']);
const LOG_ICONS = { ADD: '✅', DELETE: '🗑️', SAVE: '💾', LOAD: '⬇️' };
const CHART_COLORS = [
  'rgba(74,103,65,.75)',
  'rgba(201,168,76,.75)',
  'rgba(196,96,58,.7)',
  'rgba(58,100,148,.7)',
  'rgba(107,74,138,.7)',
  'rgba(180,166,138,.75)',
  'rgba(90,132,180,.7)',
];

const emptyForm = {
  booking_no: '',
  invoice_no: '',
  property: 'PetRa Homestay',
  payment_method: '',
  guest_name: '',
  persons: '',
  check_in_date: '',
  month: '',
  stay_dates: '',
  nights: '',
  remark: '',
};

function initialDetailState() {
  return Object.fromEntries(
    DETAILS.map((detail) => [detail.key, { rev: '', cp: '', ac: '', owner_pct: detail.isOwner ? '5' : '' }]),
  );
}

function rp(value) {
  if (value == null || value === '') return '';
  return `Rp ${Number(value).toLocaleString('id-ID')}`;
}

function fd(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' });
}

function fts(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

async function readJson(res) {
  const json = await res.json();
  if (!res.ok || json.success === false) throw new Error(json.error || `Request failed: ${res.status}`);
  return json;
}

export default function HomestayManager() {
  const [activeTab, setActiveTab] = useState('bookings');
  const [allBookings, setAllBookings] = useState([]);
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [details, setDetails] = useState(initialDetailState);
  const [overrides, setOverrides] = useState({ rev: '', cp: '', ac: '' });
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [logs, setLogs] = useState([]);
  const [statesMeta, setStatesMeta] = useState({ current: null, slots: [null, null, null, null, null] });
  const [slotLabels, setSlotLabels] = useState(['', '', '', '', '']);
  const [saving, setSaving] = useState(false);
  const [toastState, setToastState] = useState({ message: '', type: '', show: false });
  const chartInstances = useRef({});
  const toastTimer = useRef(null);

  const showToast = useCallback((message, type = '') => {
    setToastState({ message, type, show: true });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastState((old) => ({ ...old, show: false })), 3800);
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const json = await readJson(await fetch('/api/stats'));
      setStats(json.data);
    } catch (err) {
      console.error('Stats:', err);
    }
  }, []);

  const loadBookings = useCallback(async () => {
    try {
      const json = await readJson(await fetch('/api/bookings'));
      setAllBookings(json.data || []);
    } catch (err) {
      showToast(`Load error: ${err.message}`, 'err');
    }
  }, [showToast]);

  const loadLog = useCallback(async () => {
    try {
      const json = await readJson(await fetch('/api/log'));
      setLogs(json.data || []);
    } catch (err) {
      console.error('Log error:', err);
    }
  }, []);

  const loadStatesMeta = useCallback(async () => {
    try {
      const json = await readJson(await fetch('/api/states'));
      setStatesMeta(json.data || { current: null, slots: [null, null, null, null, null] });
      setSlotLabels((old) =>
        (json.data?.slots || []).map((slot, index) => (old[index] || slot?.label || '')),
      );
    } catch (err) {
      console.error('States meta error:', err);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadBookings();
  }, [loadStats, loadBookings]);

  useEffect(() => {
    if (activeTab === 'record') {
      loadLog();
      loadStatesMeta();
    }
  }, [activeTab, loadLog, loadStatesMeta]);

  const getRevTotal = useCallback(() => {
    return DETAILS.filter((detail) => detail.rev && !detail.isOwner).reduce(
      (sum, detail) => sum + (Number(details[detail.key]?.rev) || 0),
      0,
    );
  }, [details]);

  const ownerAuto = useMemo(() => {
    const pct = Number(details.Owner?.owner_pct) || 5;
    return Math.round((getRevTotal() * pct) / 100);
  }, [details.Owner?.owner_pct, getRevTotal]);

  const totals = useMemo(() => {
    const sumRev = getRevTotal();
    let sumCP = 0;
    let sumAC = 0;

    DETAILS.forEach((detail) => {
      const row = details[detail.key] || {};
      sumCP += detail.isOwner ? (row.cp !== '' ? Number(row.cp) : ownerAuto) : Number(row.cp) || 0;
      sumAC += Number(row.ac) || 0;
    });

    const finalRev = overrides.rev !== '' ? Number(overrides.rev) : sumRev;
    const finalCP = overrides.cp !== '' ? Number(overrides.cp) : sumCP;
    const finalAC = overrides.ac !== '' ? Number(overrides.ac) : sumAC;
    const profit = finalRev - (finalAC > 0 ? finalAC : finalCP);

    return { sumRev, sumCP, sumAC, finalRev, finalCP, finalAC, profit };
  }, [details, ownerAuto, overrides, getRevTotal]);

  const filteredBookings = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return allBookings;
    return allBookings.filter((booking) =>
      [booking.guest_name, booking.invoice_no, booking.month, booking.payment_method]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [allBookings, search]);

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setForm((old) => ({ ...old, [name]: value }));
  };

  const handleDetailChange = (key, field, value) => {
    setDetails((old) => ({ ...old, [key]: { ...old[key], [field]: value } }));
  };

  const getLineItems = () => {
    return DETAILS.map((detail) => {
      const row = details[detail.key] || {};
      return {
        detail_type: detail.key,
        rev_total: detail.isOwner ? null : row.rev ? Number(row.rev) : null,
        cost_plan_rp: detail.isOwner ? (row.cp !== '' ? Number(row.cp) : ownerAuto) : row.cp ? Number(row.cp) : null,
        actual_cost: row.ac ? Number(row.ac) : null,
        owner_pct: detail.isOwner ? Number(row.owner_pct) || 5 : null,
      };
    }).filter((item) => item.rev_total || item.cost_plan_rp || item.actual_cost);
  };

  const clearForm = () => {
    setForm(emptyForm);
    setDetails(initialDetailState());
    setOverrides({ rev: '', cp: '', ac: '' });
  };

  const prependLog = (entry) => {
    if (!entry) return;
    setLogs((old) => [entry, ...old].slice(0, 200));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    const body = {
      booking_no: form.booking_no ? Number(form.booking_no) : null,
      invoice_no: form.invoice_no || null,
      property: form.property || null,
      payment_method: form.payment_method || null,
      guest_name: form.guest_name,
      persons: form.persons ? Number(form.persons) : null,
      check_in_date: form.check_in_date || null,
      month: form.month || null,
      stay_dates: form.stay_dates || null,
      nights: form.nights || null,
      remark: form.remark || null,
      revenue_total_override: overrides.rev !== '' ? Number(overrides.rev) : null,
      cost_plan_total_override: overrides.cp !== '' ? Number(overrides.cp) : null,
      actual_cost_total_override: overrides.ac !== '' ? Number(overrides.ac) : null,
      line_items: getLineItems(),
    };

    try {
      const json = await readJson(
        await fetch('/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );
      showToast('✓ Booking saved to Neon!');
      prependLog(json.log);
      clearForm();
      await Promise.all([loadBookings(), loadStats(), loadStatesMeta()]);
    } catch (err) {
      showToast(`Error: ${err.message}`, 'err');
    } finally {
      setSaving(false);
    }
  };

  const deleteBooking = async (id) => {
    if (!confirm('Delete this booking and all its detail items?')) return;
    try {
      const json = await readJson(await fetch(`/api/bookings/${id}`, { method: 'DELETE' }));
      showToast('Booking deleted.');
      prependLog(json.log);
      await Promise.all([loadBookings(), loadStats(), loadStatesMeta()]);
    } catch (err) {
      showToast(`Error: ${err.message}`, 'err');
    }
  };

  const clearLog = async () => {
    if (!confirm('Clear all activity log entries?')) return;
    try {
      await readJson(await fetch('/api/log', { method: 'DELETE' }));
      setLogs([]);
      showToast('Log cleared.', 'info');
    } catch (err) {
      showToast('Error clearing log', 'err');
    }
  };

  const saveState = async (slot) => {
    const label = slotLabels[slot - 1]?.trim();
    if (!confirm(`Save current database state to Slot ${slot}?${label ? ` Label: "${label}"` : ''}`)) return;
    try {
      const json = await readJson(
        await fetch(`/api/states/${slot}/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: label || null }),
        }),
      );
      showToast(`✓ Saved to Slot ${slot}`);
      prependLog(json.log);
      loadStatesMeta();
    } catch (err) {
      showToast(`Save failed: ${err.message}`, 'err');
    }
  };

  const loadState = async (slot) => {
    const slotName = slot === 0 ? 'Current State' : `Slot ${slot}`;
    if (!confirm(`Restore database from ${slotName}? This will REPLACE all current bookings.`)) return;
    try {
      const json = await readJson(await fetch(`/api/states/${slot}/load`, { method: 'POST' }));
      showToast(`✓ Database restored from ${slotName}`, 'info');
      prependLog(json.log);
      await Promise.all([loadBookings(), loadStats(), loadStatesMeta()]);
    } catch (err) {
      showToast(`Error: ${err.message}`, 'err');
    }
  };

  const destroyChart = (id) => {
    if (chartInstances.current[id]) {
      chartInstances.current[id].destroy();
      delete chartInstances.current[id];
    }
  };

  useEffect(() => {
    if (activeTab !== 'stats' || !allBookings.length) return;

    const totalRevenue = allBookings.reduce((sum, booking) => sum + (Number(booking.revenue_total) || 0), 0);
    const totalCostPlan = allBookings.reduce((sum, booking) => sum + (Number(booking.cost_plan_total) || 0), 0);
    const totalProfit = allBookings.reduce((sum, booking) => sum + (Number(booking.result_rp) || 0), 0);

    const byMonth = {};
    allBookings.forEach((booking) => {
      const month = booking.month || '?';
      if (!byMonth[month]) byMonth[month] = { rev: 0, cp: 0, profit: 0, count: 0 };
      byMonth[month].rev += Number(booking.revenue_total) || 0;
      byMonth[month].cp += Number(booking.cost_plan_total) || 0;
      byMonth[month].profit += Number(booking.result_rp) || 0;
      byMonth[month].count += 1;
    });
    const months = MONTHS.filter((month) => byMonth[month]);

    destroyChart('monthly');
    chartInstances.current.monthly = new Chart(document.getElementById('ch-monthly'), {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          { label: 'Revenue', data: months.map((m) => byMonth[m].rev), backgroundColor: 'rgba(74,103,65,.7)', borderRadius: 4 },
          { label: 'Cost Plan', data: months.map((m) => byMonth[m].cp), backgroundColor: 'rgba(196,96,58,.65)', borderRadius: 4 },
          {
            label: 'Profit',
            data: months.map((m) => byMonth[m].profit),
            type: 'line',
            borderColor: 'rgba(201,168,76,.9)',
            backgroundColor: 'rgba(201,168,76,.15)',
            pointBackgroundColor: 'rgba(201,168,76,.9)',
            tension: 0.3,
            fill: true,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { font: { family: 'DM Sans' }, color: '#4a3728' } } },
        scales: {
          y: { ticks: { callback: (value) => `Rp ${Number(value).toLocaleString('id-ID')}`, font: { family: 'DM Mono', size: 10 }, color: '#4a3728' }, grid: { color: 'rgba(0,0,0,.05)' } },
          x: { ticks: { font: { family: 'DM Sans' }, color: '#4a3728' }, grid: { display: false } },
        },
      },
    });

    destroyChart('count');
    chartInstances.current.count = new Chart(document.getElementById('ch-count'), {
      type: 'bar',
      data: { labels: months, datasets: [{ label: 'Bookings', data: months.map((m) => byMonth[m].count), backgroundColor: 'rgba(107,74,138,.6)', borderRadius: 4 }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { ticks: { stepSize: 1, font: { family: 'DM Mono', size: 10 }, color: '#4a3728' }, grid: { color: 'rgba(0,0,0,.05)' } },
          x: { ticks: { font: { family: 'DM Sans' }, color: '#4a3728' }, grid: { display: false } },
        },
      },
    });

    const categoryRevenue = {};
    allBookings.forEach((booking) =>
      (booking.line_items || []).forEach((item) => {
        if (item.rev_total) categoryRevenue[item.detail_type] = (categoryRevenue[item.detail_type] || 0) + Number(item.rev_total);
      }),
    );
    const revenueKeys = Object.keys(categoryRevenue).filter((key) => categoryRevenue[key] > 0);

    destroyChart('cat-rev');
    chartInstances.current['cat-rev'] = new Chart(document.getElementById('ch-category-rev'), {
      type: 'doughnut',
      data: { labels: revenueKeys, datasets: [{ data: revenueKeys.map((key) => categoryRevenue[key]), backgroundColor: CHART_COLORS, borderWidth: 1 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { family: 'DM Sans', size: 11 }, color: '#4a3728', boxWidth: 12 } } } },
    });

    const categoryCost = {};
    allBookings.forEach((booking) =>
      (booking.line_items || []).forEach((item) => {
        if (item.cost_plan_rp) categoryCost[item.detail_type] = (categoryCost[item.detail_type] || 0) + Number(item.cost_plan_rp);
      }),
    );
    const costKeys = Object.keys(categoryCost).filter((key) => categoryCost[key] > 0);

    destroyChart('cat-cost');
    chartInstances.current['cat-cost'] = new Chart(document.getElementById('ch-category-cost'), {
      type: 'doughnut',
      data: { labels: costKeys, datasets: [{ data: costKeys.map((key) => categoryCost[key]), backgroundColor: CHART_COLORS, borderWidth: 1 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { family: 'DM Sans', size: 11 }, color: '#4a3728', boxWidth: 12 } } } },
    });

    const paymentMap = {};
    allBookings.forEach((booking) => {
      const payment = booking.payment_method || 'Unknown';
      paymentMap[payment] = (paymentMap[payment] || 0) + 1;
    });
    const paymentKeys = Object.keys(paymentMap);

    destroyChart('payment');
    chartInstances.current.payment = new Chart(document.getElementById('ch-payment'), {
      type: 'pie',
      data: { labels: paymentKeys, datasets: [{ data: paymentKeys.map((key) => paymentMap[key]), backgroundColor: CHART_COLORS, borderWidth: 1 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { font: { family: 'DM Sans', size: 11 }, color: '#4a3728', boxWidth: 12 } } } },
    });

    return () => Object.keys(chartInstances.current).forEach(destroyChart);
  }, [activeTab, allBookings]);

  const totalRevenue = allBookings.reduce((sum, booking) => sum + (Number(booking.revenue_total) || 0), 0);
  const totalCostPlan = allBookings.reduce((sum, booking) => sum + (Number(booking.cost_plan_total) || 0), 0);
  const totalProfit = allBookings.reduce((sum, booking) => sum + (Number(booking.result_rp) || 0), 0);
  const margin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0';

  return (
    <>
      <header>
        <div className="logo">PetRa <em>Garden</em> Homestay</div>
        <div className="hbadge">PADANG · 2026</div>
      </header>

      <div className="stats">
        <div className="stat"><span className="slbl">Bookings</span><span className="sval au">{stats?.total_bookings ?? ''}</span></div>
        <div className="stat"><span className="slbl">Total Revenue</span><span className="sval g">{rp(stats?.total_revenue)}</span></div>
        <div className="stat"><span className="slbl">Cost Plan</span><span className="sval r">{rp(stats?.total_cost_plan)}</span></div>
        <div className="stat"><span className="slbl">Actual Cost</span><span className="sval p">{rp(stats?.total_actual_cost)}</span></div>
        <div className="stat"><span className="slbl">Net Profit</span><span className={`sval ${Number(stats?.total_profit) >= 0 ? 'g' : 'r'}`}>{rp(stats?.total_profit)}</span></div>
        <div className="stat"><span className="slbl">Guests</span><span className="sval">{stats?.total_guests ?? ''}</span></div>
      </div>

      <div className="tab-bar">
        <button className={`tab-btn ${activeTab === 'bookings' ? 'active' : ''}`} onClick={() => setActiveTab('bookings')}>📋 Bookings</button>
        <button className={`tab-btn ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')}>📊 Statistics</button>
        <button className={`tab-btn ${activeTab === 'record' ? 'active' : ''}`} onClick={() => setActiveTab('record')}>🗂 Record</button>
      </div>

      <div className={`tab-page ${activeTab === 'bookings' ? 'active' : ''}`}>
        <div className="main">
          <aside className="fpanel">
            <div className="ptitle">New Booking</div>
            <div className="psub">Fill the details  Owner auto-calculates at 5% of revenue</div>
            <form onSubmit={handleSubmit} autoComplete="off">
              <div className="sec">
                <div className="slabel">Booking Info</div>
                <div className="r2">
                  <div className="fld"><label>Booking No.</label><input type="number" name="booking_no" placeholder="e.g. 33" value={form.booking_no} onChange={handleFormChange} /></div>
                  <div className="fld"><label>Invoice No.</label><input type="text" name="invoice_no" placeholder="e.g. 00114" value={form.invoice_no} onChange={handleFormChange} /></div>
                </div>
                <div className="r2">
                  <div className="fld"><label>Property</label><input type="text" name="property" value={form.property} onChange={handleFormChange} /></div>
                  <div className="fld"><label>Payment Method</label>
                    <select name="payment_method" value={form.payment_method} onChange={handleFormChange}>
                      <option value=""> select </option>
                      <option>Cash / Tunai</option><option>Transfer Mandiri TA</option>
                      <option>booking Via Baby</option><option>Transfer BCA</option>
                      <option>OVO / GoPay</option><option>Other</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="sec">
                <div className="slabel">Guest</div>
                <div className="r2">
                  <div className="fld"><label>Guest Name *</label><input type="text" name="guest_name" placeholder="Full name" required value={form.guest_name} onChange={handleFormChange} /></div>
                  <div className="fld"><label>No. of Persons</label><input type="number" name="persons" placeholder="2" min="1" value={form.persons} onChange={handleFormChange} /></div>
                </div>
              </div>

              <div className="sec">
                <div className="slabel">Stay Period</div>
                <div className="r3">
                  <div className="fld"><label>Check-in Date</label><input type="date" name="check_in_date" value={form.check_in_date} onChange={handleFormChange} /></div>
                  <div className="fld"><label>Month</label>
                    <select name="month" value={form.month} onChange={handleFormChange}>
                      <option value=""></option>
                      {MONTHS.map((month) => <option key={month}>{month}</option>)}
                    </select>
                  </div>
                  <div className="fld"><label>Nights</label><input type="text" name="nights" placeholder="1" value={form.nights} onChange={handleFormChange} /></div>
                </div>
                <div className="r1"><div className="fld"><label>Stay Dates (e.g. 07~08)</label>
                  <input type="text" name="stay_dates" placeholder="07~08" value={form.stay_dates} onChange={handleFormChange} /></div></div>
              </div>

              <div className="sec">
                <div className="slabel">Revenue &amp; Cost Breakdown by Category</div>
                <div className="dtl-wrap">
                  <div className="dtl-hdr">
                    <span>Details</span>
                    <span style={{ color: 'var(--goldl)' }}>Revenue (Rp)</span>
                    <span style={{ color: 'var(--terral)' }}>Cost Plan (Rp)</span>
                    <span style={{ color: 'var(--bluel)' }}>Actual Cost (Rp)</span>
                  </div>

                  <div>
                    {DETAILS.map((detail) => {
                      const row = details[detail.key] || {};
                      return (
                        <div className="dtl-row" data-dt={detail.key} key={detail.key}>
                          <div className={`dt-lbl ${detail.cls}`}>
                            {detail.label}
                            {detail.isOwner && (
                              <>
                                <div className="owner-pct-wrap">
                                  <input type="number" value={row.owner_pct} min="0" max="100" step="0.1" onChange={(event) => handleDetailChange(detail.key, 'owner_pct', event.target.value)} />
                                  <span>% of rev</span>
                                </div>
                                <small style={{ fontSize: '.6rem', color: 'var(--gold)', opacity: .7, marginTop: '1px' }}>= {row.owner_pct || 5}% → {rp(ownerAuto)}</small>
                              </>
                            )}
                          </div>

                          {detail.rev ? (
                            <div className="c-rv"><input type="number" className="rev-inp" value={row.rev} min="0" onChange={(event) => handleDetailChange(detail.key, 'rev', event.target.value)} /></div>
                          ) : <div className="c-rv" style={{ opacity: .22, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 7px', fontSize: '.72rem' }} />}

                          {detail.cp ? (
                            <div className="c-cp"><input type="number" className="cp-inp" value={row.cp} placeholder={detail.isOwner ? Number(ownerAuto).toLocaleString('id-ID') : ''} min="0" onChange={(event) => handleDetailChange(detail.key, 'cp', event.target.value)} /></div>
                          ) : <div className="c-cp" style={{ opacity: .22, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 7px', fontSize: '.72rem' }} />}

                          {detail.ac ? (
                            <div className="c-ac"><input type="number" className="ac-inp" value={row.ac} min="0" onChange={(event) => handleDetailChange(detail.key, 'ac', event.target.value)} /></div>
                          ) : <div className="c-ac" style={{ opacity: .22, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 7px', fontSize: '.72rem' }} />}
                        </div>
                      );
                    })}
                  </div>

                  <div className="dtl-footer">
                    <span>Sub Total</span>
                    <span className="t-rv">{rp(totals.sumRev)}</span>
                    <span className="t-cp">{rp(totals.sumCP)}</span>
                    <span className="t-ac">{rp(totals.sumAC)}</span>
                  </div>
                </div>

                <div className="ov-strip">
                  <div className="fld"><label>Revenue Total <em style={{ opacity: .5, fontStyle: 'normal' }}>(auto/override)</em></label><input type="number" className="ov-field" placeholder="auto" value={overrides.rev} onChange={(event) => setOverrides((old) => ({ ...old, rev: event.target.value }))} /></div>
                  <div className="fld"><label>Cost Plan Total <em style={{ opacity: .5, fontStyle: 'normal' }}>(auto/override)</em></label><input type="number" className="ov-field" placeholder="auto" value={overrides.cp} onChange={(event) => setOverrides((old) => ({ ...old, cp: event.target.value }))} /></div>
                  <div className="fld"><label>Actual Cost Total <em style={{ opacity: .5, fontStyle: 'normal' }}>(auto/override)</em></label><input type="number" className="ov-field" placeholder="auto" value={overrides.ac} onChange={(event) => setOverrides((old) => ({ ...old, ac: event.target.value }))} /></div>
                  <div className="fld"><label>Profit <em style={{ opacity: .5, fontStyle: 'normal' }}>(auto)</em></label><input type="number" className="auto-field" placeholder="auto" readOnly value={Number.isFinite(totals.profit) ? totals.profit : ''} style={{ color: totals.profit >= 0 ? 'var(--moss)' : 'var(--terra)' }} /></div>
                </div>
              </div>

              <div className="sec">
                <div className="slabel">Notes</div>
                <div className="r1"><div className="fld"><textarea name="remark" placeholder="Any remarks or special notes…" value={form.remark} onChange={handleFormChange} /></div></div>
              </div>

              <button type="submit" className="submit-btn" disabled={saving}>
                {saving ? 'Saving…' : <><span>＋</span> Save Booking to Neon Database</>}
              </button>
            </form>
          </aside>

          <section className="tpanel">
            <div className="thead-row">
              <div>
                <div className="ttitle">All Bookings</div>
                <div className="tcount">{filteredBookings.length} booking{filteredBookings.length !== 1 ? 's' : ''}</div>
              </div>
              <div className="sbox">
                <span style={{ opacity: .45 }}>🔍</span>
                <input type="text" placeholder="Search guest, invoice…" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="dtable">
                <thead><tr>
                  <th style={{ width: '18px' }}></th>
                  <th>#</th><th>Invoice</th><th>Guest</th><th>Month</th>
                  <th>Check-in</th><th>Nights</th><th>Pax</th><th>Payment</th>
                  <th>Revenue</th><th>Cost Plan</th><th>Actual Cost</th><th>Profit</th>
                  <th style={{ textAlign: 'center' }}>Del</th>
                </tr></thead>
                <tbody>
                  {!filteredBookings.length ? (
                    <tr><td colSpan="14"><div className="empty"><div className="ei">🌿</div><p>No bookings yet</p></div></td></tr>
                  ) : filteredBookings.map((booking) => {
                    const profitClass = booking.result_rp == null ? '' : booking.result_rp >= 0 ? 'pos' : 'neg';
                    const monthClass = (booking.month || '').toLowerCase();
                    const isExpanded = expandedId === booking.id;
                    return (
                      <FragmentRow
                        key={booking.id}
                        booking={booking}
                        isExpanded={isExpanded}
                        profitClass={profitClass}
                        monthClass={monthClass}
                        onToggle={() => setExpandedId(isExpanded ? null : booking.id)}
                        onDelete={() => deleteBooking(booking.id)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      <div className={`tab-page ${activeTab === 'stats' ? 'active' : ''}`}>
        <div className="charts-page">
          <div className="charts-title">Statistics &amp; Analytics</div>
          <div className="kpi-row">
            <div className="kpi-card"><div className="kpi-label">Total Bookings</div><div className="kpi-val au">{allBookings.length}</div></div>
            <div className="kpi-card"><div className="kpi-label">Total Revenue</div><div className="kpi-val g">{rp(totalRevenue)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Total Cost Plan</div><div className="kpi-val r">{rp(totalCostPlan)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Total Profit</div><div className={`kpi-val ${totalProfit >= 0 ? 'g' : 'r'}`}>{rp(totalProfit)}</div></div>
            <div className="kpi-card"><div className="kpi-label">Avg Revenue / Booking</div><div className="kpi-val au">{rp(Math.round(totalRevenue / (allBookings.length || 1)))}</div></div>
            <div className="kpi-card"><div className="kpi-label">Profit Margin</div><div className={`kpi-val ${Number(margin) >= 0 ? 'g' : 'r'}`}>{margin}%</div></div>
          </div>
          <div className="charts-grid">
            <div className="chart-card wide"><h3>Revenue vs Cost Plan vs Profit  by Month</h3><div className="chart-wrap tall"><canvas id="ch-monthly"></canvas></div></div>
            <div className="chart-card"><h3>Revenue by Detail Category</h3><div className="chart-wrap"><canvas id="ch-category-rev"></canvas></div></div>
            <div className="chart-card"><h3>Cost Plan by Detail Category</h3><div className="chart-wrap"><canvas id="ch-category-cost"></canvas></div></div>
            <div className="chart-card"><h3>Payment Method Breakdown</h3><div className="chart-wrap"><canvas id="ch-payment"></canvas></div></div>
            <div className="chart-card"><h3>Bookings per Month</h3><div className="chart-wrap"><canvas id="ch-count"></canvas></div></div>
          </div>
        </div>
      </div>

      <div className={`tab-page ${activeTab === 'record' ? 'active' : ''}`}>
        <div className="record-page">
          <div>
            <div className="record-section-title">Activity Log</div>
            <div className="log-wrap">
              <div className="log-toolbar">
                <span>📜 All actions recorded here</span>
                <button className="log-clear-btn" onClick={clearLog}>Clear Log</button>
              </div>
              <div className="log-list">
                {!logs.length ? <div className="log-empty">No activity yet</div> : logs.map((entry, index) => (
                  <div className="log-entry" key={`${entry.ts}-${index}`}>
                    <span className="log-icon">{LOG_ICONS[entry.action] || '📌'}</span>
                    <div className="log-body">
                      <div className={`log-action ${entry.action}`}>{entry.action}</div>
                      <div className="log-detail" title={entry.detail}>{entry.detail}</div>
                    </div>
                    <span className="log-ts">{fts(entry.ts)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="record-section-title">Save States</div>
            <div className="states-wrap">
              <div className="state-card current-card">
                <div className="state-card-header">
                  <span className="state-card-title cur">⚡ Current State</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: '.58rem', color: 'var(--gold)' }}>AUTO-SAVED</span>
                </div>
                <div className="state-meta">
                  {statesMeta.current ? <><strong>{statesMeta.current.bookings} bookings</strong> &nbsp;·&nbsp; {fts(statesMeta.current.ts)}</> : 'No snapshot yet'}
                </div>
                <div className="state-actions"><button className="state-btn load-btn" onClick={() => loadState(0)} disabled={!statesMeta.current}>⬇ Load</button></div>
              </div>

              {[1, 2, 3, 4, 5].map((slot) => {
                const state = statesMeta.slots?.[slot - 1];
                return (
                  <div id={`slot-${slot}`} className={`state-card ${state ? 'filled' : ''}`} key={slot}>
                    <div className="state-card-header">
                      <span className={`state-card-title ${state ? 'filled-slot' : 'empty-slot'}`}>{state ? `Slot ${slot}${state.label ? `  "${state.label}"` : ''}` : `Slot ${slot}  Empty`}</span>
                    </div>
                    <div className="state-meta">{state ? <><strong>{state.bookings} bookings</strong> &nbsp;·&nbsp; {fts(state.ts)}</> : 'No save yet'}</div>
                    <input className="slot-label-input" placeholder="Label (optional)…" value={slotLabels[slot - 1] || ''} onChange={(event) => setSlotLabels((old) => old.map((label, index) => index === slot - 1 ? event.target.value : label))} />
                    <div className="state-actions">
                      <button className="state-btn save-btn" onClick={() => saveState(slot)}>💾 Save Here</button>
                      <button className="state-btn load-btn" onClick={() => loadState(slot)} disabled={!state}>⬇ Load</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className={`toast ${toastState.show ? 'show' : ''} ${toastState.type}`}>{toastState.message}</div>
    </>
  );
}

function FragmentRow({ booking, isExpanded, profitClass, monthClass, onToggle, onDelete }) {
  const cards = (booking.line_items || []).map((item) => {
    const isOwner = OWNER_TYPES.has(item.detail_type);
    const isUtil = UTIL_TYPES.has(item.detail_type);
    const hasData = item.rev_total || item.cost_plan_rp || item.actual_cost;
    return (
      <div className={`bk-card${isOwner ? ' owner-card' : isUtil ? ' util-card' : ''}`} key={item.id || item.detail_type}>
        <div className={`bk-title${isOwner ? ' owner' : isUtil ? ' util' : ''}`}>
          {item.detail_type}{isOwner && item.owner_pct ? ` (${item.owner_pct}%)` : ''}
        </div>
        {!hasData ? <div className="bk-empty"></div> : <>
          {item.rev_total != null && <div className="bk-line"><span className="bk-k">Revenue</span><span className={`bk-v ${isOwner ? 'ow' : 'rv'}`}>{rp(item.rev_total)}</span></div>}
          {item.cost_plan_rp != null && <div className="bk-line"><span className="bk-k">Cost Plan</span><span className="bk-v cp">{rp(item.cost_plan_rp)}</span></div>}
          {item.actual_cost != null && <div className="bk-line"><span className="bk-k">Actual</span><span className="bk-v ac">{rp(item.actual_cost)}</span></div>}
        </>}
      </div>
    );
  });

  return (
    <>
      <tr className={`brow ${isExpanded ? 'expanded' : ''}`} onClick={onToggle}>
        <td><span className="exp-icon">▶</span></td>
        <td className="mono">{booking.booking_no ?? booking.id}</td>
        <td className="mono">{booking.invoice_no ?? ''}</td>
        <td className="bold" title={booking.guest_name ?? ''}>{booking.guest_name ?? ''}</td>
        <td><span className={`mbadge ${monthClass}`}>{booking.month ?? ''}</span></td>
        <td className="mono">{fd(booking.check_in_date)}</td>
        <td>{booking.nights ?? ''}</td>
        <td>{booking.persons ?? ''}</td>
        <td style={{ maxWidth: '110px' }}>{booking.payment_method ?? ''}</td>
        <td className="mono rv-col">{rp(booking.revenue_total)}</td>
        <td className="mono cp-col">{rp(booking.cost_plan_total)}</td>
        <td className="mono ac-col">{rp(booking.actual_cost_total)}</td>
        <td className={`mono ${profitClass}`}>{rp(booking.result_rp)}</td>
        <td style={{ textAlign: 'center' }}><button className="del-btn" onClick={(event) => { event.stopPropagation(); onDelete(); }}>✕</button></td>
      </tr>
      <tr className="drow"><td colSpan="14">
        <div className={`drow-inner ${isExpanded ? 'open' : ''}`}>
          <div className="breakdown-grid">{cards.length ? cards : <div style={{ opacity: .4, fontSize: '.76rem' }}>No detail breakdown</div>}</div>
          <div className="summary-totals">
            <div className="sum-item"><span className="sk">Revenue</span><span className="sv rv">{rp(booking.revenue_total)}</span></div>
            <div className="sum-item"><span className="sk">Cost Plan</span><span className="sv cp">{rp(booking.cost_plan_total)}</span></div>
            <div className="sum-item"><span className="sk">Actual Cost</span><span className="sv ac">{rp(booking.actual_cost_total)}</span></div>
            <div className="sum-item"><span className="sk">Profit</span><span className={`sv ${Number(booking.result_rp) >= 0 ? 'pos' : 'neg'}`}>{rp(booking.result_rp)}</span></div>
            {booking.remark && <div className="sum-item"><span className="sk">Remark</span><span className="sv" style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '.78rem' }}>{booking.remark}</span></div>}
          </div>
        </div>
      </td></tr>
    </>
  );
}
