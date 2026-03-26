document.addEventListener("DOMContentLoaded", () => {
    
    // --- SHARED STATE ---
    let rosterData = [];
    let needsData = { year: 2024, month: 3, daily_needs: {}, overrides: {} };
    let scheduleResults = null;
    let history = [];
    const MAX_HISTORY = 20;

    // --- DOM ELEMENTS ---
    const tbody = document.getElementById("roster-tbody");
    const calendarGrid = document.getElementById("calendar-grid");
    const scheduleGrid = document.getElementById("schedule-grid");

    // Physicians Tab Stats
    const totalPhysStat = document.getElementById("total-physicians-stat");
    const activePhysStat = document.getElementById("active-physicians-stat");
    const capacityPct = document.getElementById("capacity-pct");
    const capacityBar = document.getElementById("capacity-bar");
    const capacityTargets = document.getElementById("capacity-targets");
    const capacityNeeds = document.getElementById("capacity-needs");
    const frictionList = document.getElementById("friction-list");

    // Schedule Tab Elements
    const scheduleStatsBody = document.getElementById("schedule-stats-body");
    const scheduleAlertsList = document.getElementById("schedule-alerts-list");
    const currentPeriodLabel = document.getElementById("current-period");

    // Buttons
    const saveRosterBtn = document.getElementById("save-btn");
    const saveNeedsBtn = document.getElementById("save-needs-btn");
    const regenerateBtn = document.getElementById("regenerate-btn");
    const monthSelect = document.getElementById("month-select");
    const yearSelect = document.getElementById("year-select");
    const addBtn = document.getElementById("add-physician-btn");

    // --- API CALLS ---
    async function loadAllData() {
        try {
            const rosterResp = await fetch("/api/roster");
            const rosterJson = await rosterResp.json();
            if (rosterJson.success) rosterData = rosterJson.physicians;

            const needsResp = await fetch("/api/needs");
            const needsJson = await needsResp.json();
            if (needsJson.success && needsJson.data) {
                needsData = { ...needsData, ...needsJson.data };
                if (!needsData.overrides) needsData.overrides = {};
            }

            const schedResp = await fetch("/api/schedule");
            const schedJson = await schedResp.json();
            if (schedJson.success) scheduleResults = schedJson.data;

            renderAll();
        } catch (e) { console.error("Failed to load data", e); }
    }

    async function saveData(type = "roster") {
        try {
            const url = type === "roster" ? "/api/roster" : "/api/needs";
            const body = type === "roster" ? { physicians: rosterData } : needsData;
            const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const data = await resp.json();
            if (data.success) showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} Saved`, "success");
        } catch (e) { showToast("Save error", "error"); }
    }

    async function generateSchedule() {
        showToast("Generating Schedule...", "info");
        try {
            await saveData("roster");
            await saveData("needs");
            const resp = await fetch("/api/generate", { method: "POST" });
            const data = await resp.json();
            if (data.success) {
                showToast("Generation Complete!", "success");
                await loadAllData();
                if (window.location.pathname.includes("physicians")) {
                    window.location.href = "/schedule";
                }
            } else { alert("Generation failed: " + data.error); }
        } catch (e) { console.error(e); }
    }

    // --- GLOBAL HELPERS (for inline HTML handlers) ---
    window.updateRow = (index, field, value) => {
        saveSnapshot();
        rosterData[index][field] = value;
        updateCalculations();
    };

    window.updateHalfMode = (index, mode) => {
        saveSnapshot();
        rosterData[index].half_month = mode;
        renderRoster();
        updateCalculations();
    };

    window.toggleOverrideInput = (index) => {
        const row = document.querySelector(`tr[data-index="${index}"]`);
        if (!row) return;
        const input = row.querySelector('.override-input');
        const btn = row.querySelector('.override-btn');
        if (input.classList.contains('hidden')) {
            input.classList.remove('hidden'); btn.classList.add('hidden'); input.focus();
        } else {
            input.classList.add('hidden'); btn.classList.remove('hidden');
        }
    };

    window.deleteRow = (index) => {
        if(confirm(`Remove ${rosterData[index].name}?`)) {
            saveSnapshot();
            rosterData.splice(index, 1);
            renderRoster();
            updateCalculations();
        }
    };

    window.updateDayNeed = (day, slot, value) => {
        if (!needsData.overrides[day.toString()]) needsData.overrides[day.toString()] = {};
        needsData.overrides[day.toString()][slot] = parseInt(value);
        updateCalculations();
    };

    window.toggleDayClosed = (day) => {
        const dayKey = day.toString();
        const isCurrentlyClosed = (needsData.overrides[dayKey]?.AM === 0 && needsData.overrides[dayKey]?.PM === 0);
        if (isCurrentlyClosed) {
            delete needsData.overrides[dayKey];
        } else {
            needsData.overrides[dayKey] = { AM: 0, PM: 0 };
        }
        renderCalendar();
    };

    function saveSnapshot() {
        history.push(JSON.parse(JSON.stringify(rosterData)));
        if (history.length > MAX_HISTORY) history.shift();
    }

    window.undo = () => {
        if (history.length > 0) {
            rosterData = history.pop();
            renderAll();
        } else showToast("Nothing to undo", "info");
    };

    // --- RENDERING ---
    function renderAll() {
        renderRoster();
        renderCalendar();
        renderSchedule();
        updateCalculations();
    }

    function renderRoster() {
        if (!tbody) return;
        tbody.innerHTML = "";
        rosterData.forEach((p, i) => {
            const tr = document.createElement("tr");
            tr.setAttribute("data-index", i);
            tr.className = "hover:bg-surface-container-high/50 transition-colors border-b border-outline-variant/5";
            tr.innerHTML = `
                <td class="px-4 py-2.5"><input type="checkbox" ${p.active ? 'checked' : ''} onchange="updateRow(${i}, 'active', this.checked)" class="w-3.5 h-3.5 rounded bg-surface-container-high text-secondary cursor-pointer"/></td>
                <td class="px-4 py-2.5">
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black" style="background-color: ${p.color}22; color: ${p.color}; border: 1px solid ${p.color}44;">${p.name.substring(0,2).toUpperCase()}</div>
                        <input type="text" class="bg-transparent border-none text-xs font-bold text-on-surface p-0 focus:ring-0 w-32" value="${p.name}" onchange="updateRow(${i}, 'name', this.value)"/>
                    </div>
                </td>
                <td class="px-4 py-2.5 text-center"><input class="w-10 bg-surface-container-lowest border border-outline-variant/10 rounded py-1 text-[11px] font-black text-center text-on-surface" type="number" value="${p.target}" onchange="updateRow(${i}, 'target', parseInt(this.value))"/></td>
                <td class="px-4 py-2.5 text-center"><input type="radio" name="half-${i}" ${p.half_month === '1st' ? 'checked' : ''} onchange="updateHalfMode(${i}, '1st')" class="w-3.5 h-3.5 text-primary cursor-pointer"/></td>
                <td class="px-4 py-2.5 text-center"><input type="radio" name="half-${i}" ${p.half_month === '2nd' ? 'checked' : ''} onchange="updateHalfMode(${i}, '2nd')" class="w-3.5 h-3.5 text-primary cursor-pointer"/></td>
                <td class="px-4 py-2.5 text-center"><input type="checkbox" ${p.full_day_ok ? 'checked' : ''} onchange="updateRow(${i}, 'full_day_ok', this.checked)" class="w-3.5 h-3.5 text-primary cursor-pointer"/></td>
                <td class="px-4 py-2.5"><input type="text" class="bg-surface-container-lowest border border-outline-variant/10 rounded px-2 py-1 text-[10px] text-secondary font-mono w-28" value="${p.preferred}" onchange="updateRow(${i}, 'preferred', this.value)"/></td>
                <td class="px-4 py-2.5"><input type="text" class="bg-surface-container-lowest border border-outline-variant/10 rounded px-2 py-1 text-[10px] text-error/70 font-mono w-28" value="${p.avoid}" onchange="updateRow(${i}, 'avoid', this.value)"/></td>
                <td class="px-4 py-2.5 text-center relative">
                    <button onclick="toggleOverrideInput(${i})" class="override-btn px-2 py-1 rounded border border-outline-variant/20 text-[9px] font-bold ${p.override ? 'bg-error/10 text-error border-error/50' : 'text-outline'} transition-all">${p.override ? 'SET' : 'Set'}</button>
                    <input type="text" class="override-input hidden absolute inset-0 z-10 m-2 bg-surface-container-highest border border-primary/50 text-[10px] text-primary" value="${p.override}" onblur="toggleOverrideInput(${i})" onchange="updateRow(${i}, 'override', this.value)"/>
                </td>
                <td class="px-4 py-2.5 text-center"><div class="relative w-4 h-4 rounded-full border border-outline-variant/20 overflow-hidden"><input type="color" value="${p.color}" onchange="updateRow(${i}, 'color', this.value)" class="absolute -inset-1 w-8 h-8 cursor-pointer"/></div></td>
                <td class="px-4 py-2.5 text-right"><button onclick="deleteRow(${i})" class="text-outline hover:text-error transition-all p-1"><span class="material-symbols-outlined text-base">delete</span></button></td>
            `;
            tbody.appendChild(tr);
        });
    }

    function renderCalendar() {
        if (!calendarGrid) return;
        calendarGrid.innerHTML = "";
        const year = parseInt(needsData.year), month = parseInt(needsData.month);
        const firstDay = new Date(year, month - 1, 1).getDay();
        const daysInMonth = new Date(year, month, 0).getDate();
        for (let i = 0; i < firstDay; i++) {
            const empty = document.createElement("div");
            empty.className = "bg-surface-container-lowest/10 rounded-xl opacity-10 border border-dashed border-outline-variant/10 day-cell";
            calendarGrid.appendChild(empty);
        }
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month - 1, d);
            const isWeekendVal = (date.getDay() === 0 || date.getDay() === 6);
            const cell = document.createElement("div");
            cell.className = isWeekendVal ? "bg-error-container/5 rounded-xl p-2.5 border border-error-container/10 relative day-cell" : "bg-surface-container-high rounded-xl p-2.5 border border-outline-variant/10 day-cell";
            if (isWeekendVal) {
                cell.innerHTML = `<span class="text-xs font-bold text-error/30 absolute top-2 left-2.5">${d}</span><span class="text-[9px] font-black text-error/30 uppercase tracking-widest absolute bottom-2 right-2.5">Weekend</span>`;
            } else {
                const dayOfWeek = (date.getDay() + 6) % 7;
                const ovr = needsData.overrides[d.toString()];
                const pat = needsData.daily_needs[dayOfWeek.toString()];
                const am = ovr?.AM !== undefined ? ovr.AM : pat.AM;
                const pm = ovr?.PM !== undefined ? ovr.PM : pat.PM;
                const isClosed = (am === 0 && pm === 0);
                cell.innerHTML = `
                    <div class="flex justify-between items-start mb-2"><span class="text-xs font-bold text-on-surface">${d}</span><button onclick="toggleDayClosed(${d})" class="text-outline hover:text-error"><span class="material-symbols-outlined text-sm">${isClosed ? 'add' : 'remove'}</span></button></div>
                    <div class="space-y-1">
                        <div class="flex items-center justify-between"><span class="text-[8px] font-bold text-outline-variant">AM</span><select onchange="updateDayNeed(${d}, 'AM', this.value)" class="bg-surface-container-lowest text-[10px] rounded px-1.5 py-0.5 w-11"><option value="0" ${am==0?'selected':''}>0</option><option value="1" ${am==1?'selected':''}>1</option><option value="2" ${am==2?'selected':''}>2</option></select></div>
                        <div class="flex items-center justify-between"><span class="text-[8px] font-bold text-outline-variant">PM</span><select onchange="updateDayNeed(${d}, 'PM', this.value)" class="bg-surface-container-lowest text-[10px] rounded px-1.5 py-0.5 w-11"><option value="0" ${pm==0?'selected':''}>0</option><option value="1" ${pm==1?'selected':''}>1</option><option value="2" ${pm==2?'selected':''}>2</option></select></div>
                    </div>
                `;
            }
            calendarGrid.appendChild(cell);
        }
        updateCalculations();
    }

    function renderSchedule() {
        if (!scheduleGrid || !scheduleResults) return;
        scheduleGrid.innerHTML = "";
        const { schedule, stats, alerts, metadata } = scheduleResults;
        const year = metadata.year, month = metadata.month;
        if (currentPeriodLabel) currentPeriodLabel.textContent = `${new Date(year, month - 1).toLocaleString('default', { month: 'long' })} ${year}`;
        const daysInMonth = new Date(year, month, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month - 1, d);
            if (date.getDay() === 0 || date.getDay() === 6) continue;
            const slots = schedule[d.toString()] || { AM: [], PM: [] };
            const cell = document.createElement("div");
            cell.className = "min-h-0 border-r border-b border-outline-variant/20 hover:bg-primary/5 transition-colors flex flex-col day-cell";
            const amHtml = slots.AM.map(name => {
                const p = rosterData.find(pd => pd.name === name) || { color: '#888' };
                return `<span class="px-2 py-0.5 rounded text-[9px] font-bold truncate" style="background-color: ${p.color}22; color: ${p.color}; border: 1px solid ${p.color}44;">${name}</span>`;
            }).join('');
            const pmHtml = slots.PM.map(name => {
                const p = rosterData.find(pd => pd.name === name) || { color: '#888' };
                return `<span class="px-2 py-0.5 rounded text-[9px] font-bold truncate" style="background-color: ${p.color}22; color: ${p.color}; border: 1px solid ${p.color}44;">${name}</span>`;
            }).join('');
            cell.innerHTML = `
                <div class="p-2 flex justify-between items-start"><span class="text-xs font-bold text-primary">${d < 10 ? '0'+d : d}</span></div>
                <div class="flex-1 flex flex-col p-1 gap-1">
                    <div class="flex-1 bg-surface-container-highest/30 rounded-md p-1 border relative"><span class="absolute top-0 right-1 text-[7px] text-outline/60 font-black">AM</span><div class="flex flex-col gap-0.5 mt-1">${amHtml}</div></div>
                    <div class="flex-1 bg-surface-container-highest/10 rounded-md p-1 border relative"><span class="absolute top-0 right-1 text-[7px] text-outline/40 font-black">PM</span><div class="flex flex-col gap-0.5 mt-1">${pmHtml}</div></div>
                </div>
            `;
            scheduleGrid.appendChild(cell);
        }
        if (scheduleStatsBody) {
            scheduleStatsBody.innerHTML = "";
            Object.entries(stats).forEach(([name, s]) => {
                const p = rosterData.find(pd => pd.name === name) || { color: '#888' };
                const net = s.actual - s.target;
                const tr = document.createElement("tr");
                tr.innerHTML = `<td class="px-3 py-2 font-medium flex items-center gap-2"><div class="w-1.5 h-1.5 rounded-full" style="background:${p.color}"></div> ${name}</td><td class="text-center">${s.target}</td><td class="text-center text-primary font-bold">${s.actual}</td><td class="text-right ${net==0?'text-secondary-container':(net>0?'text-warning':'text-error')}">${net>0?'+':''}${net}</td>`;
                scheduleStatsBody.appendChild(tr);
            });
        }
        if (scheduleAlertsList) {
            scheduleAlertsList.innerHTML = "";
            alerts.forEach(a => {
                const isGap = a.includes("gap") || a.includes("Deficit");
                scheduleAlertsList.innerHTML += `<div class="p-2 border-l-2 ${isGap?'border-error bg-error/5':'border-primary bg-primary/5'} text-[10px] leading-tight"><p>${a}</p></div>`;
            });
        }
    }

    function updateCalculations() {
        if (!totalPhysStat) return;
        const activePhys = rosterData.filter(p => p.active);
        totalPhysStat.textContent = rosterData.length;
        activePhysStat.textContent = activePhys.length;
        const totalTargets = activePhys.reduce((sum, p) => sum + (parseInt(p.target) || 0), 0);
        capacityTargets.textContent = totalTargets;
        let totalNeeded = 0;
        const daysInMonth = new Date(needsData.year, needsData.month, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(needsData.year, needsData.month - 1, d);
            if (date.getDay() === 0 || date.getDay() === 6) continue;
            const dayOfWeek = (date.getDay() + 6) % 7;
            const am = needsData.overrides[d.toString()]?.AM !== undefined ? needsData.overrides[d.toString()].AM : (needsData.daily_needs[dayOfWeek.toString()]?.AM || 0);
            const pm = needsData.overrides[d.toString()]?.PM !== undefined ? needsData.overrides[d.toString()].PM : (needsData.daily_needs[dayOfWeek.toString()]?.PM || 0);
            totalNeeded += (parseInt(am) || 0) + (parseInt(pm) || 0);
        }
        if (capacityNeeds) capacityNeeds.textContent = totalNeeded;
        if (capacityBar && capacityPct) {
            const pct = totalNeeded > 0 ? Math.round((totalTargets / totalNeeded) * 100) : 0;
            capacityPct.textContent = pct + "%";
            capacityBar.style.width = Math.min(pct, 100) + "%";
            capacityBar.className = (pct < 95) ? "bg-warning h-full" : (pct > 105 ? "bg-error h-full" : "bg-gradient-to-r from-primary to-secondary h-full");
        }
    }

    function showToast(msg, type) { console.log(`[TOAST: ${type}] ${msg}`); }

    // --- EVENT LISTENERS ---
    if (saveRosterBtn) saveRosterBtn.addEventListener("click", () => saveData("roster"));
    if (saveNeedsBtn) saveNeedsBtn.addEventListener("click", () => saveData("needs"));
    if (regenerateBtn) regenerateBtn.addEventListener("click", generateSchedule);
    if (monthSelect) monthSelect.addEventListener("change", (e) => { needsData.month = parseInt(e.target.value); renderCalendar(); });
    if (yearSelect) yearSelect.addEventListener("change", (e) => { needsData.year = parseInt(e.target.value); renderCalendar(); });
    if (addBtn) addBtn.addEventListener("click", () => {
        saveSnapshot();
        rosterData.push({ name: "New Doctor", target: 4, active: true, half_month: "All", preferred: "", avoid: "", override: "", color: "#ffffff", full_day_ok: false });
        renderRoster(); updateCalculations();
    });

    loadAllData();
});
