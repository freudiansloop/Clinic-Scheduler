document.addEventListener("DOMContentLoaded", () => {
    
    // --- SHARED STATE ---
    let rosterData = [];
    let needsData = { year: 2024, month: 3, daily_needs: {}, overrides: {}, desperation_stage: 1 };
    let scheduleResults = null;
    let history = [];
    const MAX_HISTORY = 20;

    // --- DEFAULTS (v1.6.0) ---
    const DEFAULT_ROSTER = [
        { name: "Gandhi", target: 8, color: "#87CEFA", full_day_ok: true },
        { name: "Wesley", target: 8, color: "#CC5500", full_day_ok: true },
        { name: "Khaja", target: 2, color: "#FFDAB9", full_day_ok: false },
        { name: "Rendon", target: 2, color: "#FFC0CB", full_day_ok: false },
        { name: "Reymunde", target: 2, color: "#800080", full_day_ok: false },
        { name: "Dash", target: 2, color: "#008000", full_day_ok: false },
        { name: "Govindu", target: 2, color: "#C8A2C8", full_day_ok: false },
        { name: "Lee", target: 2, color: "#F0E68C", full_day_ok: false },
        { name: "Koney", target: 2, color: "#98FF98", full_day_ok: false },
        { name: "Aisenberg", target: 2, color: "#A9A9A9", full_day_ok: false },
        { name: "Bhandari", target: 2, color: "#FFFF00", full_day_ok: false },
        { name: "Huq", target: 2, color: "#4C6A92", full_day_ok: false }
    ];

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
    const regenerateBtn = document.getElementById("regenerate-btn");
    const undoBtn = document.getElementById("undo-btn");
    const resetBtn = document.getElementById("reset-btn");
    const saveBtn = document.getElementById("save-btn");
    const defaultBtn = document.getElementById("default-btn");
    const clearDatesBtn = document.getElementById("clear-dates-btn");
    const monthSelect = document.getElementById("month-select");
    const yearSelect = document.getElementById("year-select");
    const addBtn = document.getElementById("add-physician-btn");

    // --- UTILITIES ---

    function saveSnapshot() {
        history.push(JSON.parse(JSON.stringify(rosterData)));
        if (history.length > MAX_HISTORY) history.shift();
    }

    function showToast(msg, type) { 
        console.log(`[TOAST: ${type}] ${msg}`);
        // Simple visual feedback if possible, or just console
    }

    window.parseDateString = (str) => {
        if (!str || typeof str !== 'string') return [];
        const slots = [];
        const parts = str.split(',').map(p => p.trim());
        
        parts.forEach(part => {
            if (!part) return;
            const match = part.match(/^(\d+)(?:-(\d+))?([AP]M|BOTH)?$/i);
            if (!match) return;

            const start = parseInt(match[1]);
            const end = match[2] ? parseInt(match[2]) : start;
            let slot = (match[3] || 'BOTH').toUpperCase();

            for (let d = start; d <= end; d++) {
                if (slot === 'BOTH') {
                    slots.push({ day: d, slot: 'AM' });
                    slots.push({ day: d, slot: 'PM' });
                } else {
                    slots.push({ day: d, slot: slot });
                }
            }
        });
        return slots;
    };

    window.cleanDateInput = (input) => {
        input.value = input.value.toUpperCase().replace(/[^0-9\-\,\sAMPM]/g, '');
    };

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
            history = [JSON.parse(JSON.stringify(rosterData))];
        } catch (e) { console.error("Failed to load data", e); }
    }

    async function saveData(type = "roster") {
        try {
            const url = type === "roster" ? "/api/roster" : "/api/needs";
            const body = type === "roster" ? { physicians: rosterData } : needsData;
            const resp = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
            const data = await resp.json();
            if (data.success) {
                showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} Saved Successfully`, "success");
            } else {
                showToast(`Save failed: ${data.error}`, "error");
            }
        } catch (e) { showToast("Backend save error", "error"); }
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
        if (field === 'override') renderRoster();
    };

    window.updateHalfMode = (index, mode) => {
        saveSnapshot();
        if (rosterData[index].half_month === mode) {
            rosterData[index].half_month = "All";
        } else {
            rosterData[index].half_month = mode;
        }
        renderRoster();
        updateCalculations();
    };

    window.toggleOverrideInput = (index) => {
        const p = rosterData[index];
        const row = document.querySelector(`tr[data-index="${index}"]`);
        if (!row) return;
        const input = row.querySelector('.override-input');
        const btn = row.querySelector('.override-btn');

        const hasData = p.override && p.override.trim() !== "";
        if (hasData) {
            input.classList.remove('hidden'); btn.classList.add('hidden');
        } else {
            if (input.classList.contains('hidden')) {
                input.classList.remove('hidden'); btn.classList.add('hidden'); input.focus();
            } else {
                input.classList.add('hidden'); btn.classList.remove('hidden');
            }
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

    window.undo = () => {
        if (history.length > 1) {
            const current = JSON.parse(JSON.stringify(rosterData));
            rosterData = history.pop();
            if (JSON.stringify(rosterData) === JSON.stringify(current) && history.length > 0) {
                rosterData = history.pop();
            }
            renderAll();
            showToast("Changes Undone", "info");
        } else showToast("Nothing to undo", "info");
    };

    window.resetRoster = () => {
        if (confirm("Reset roster to original state? Unsaved changes will be lost.")) {
            loadAllData();
            showToast("Roster Reset", "info");
        }
    };

    window.setDefaultRoster = () => {
        if (confirm("Revert to default physician settings? All current rows will be replaced.")) {
            saveSnapshot();
            rosterData = DEFAULT_ROSTER.map(d => ({
                name: d.name,
                target: d.target,
                active: true,
                half_month: "All",
                preferred: "",
                avoid: "",
                override: "",
                color: d.color,
                full_day_ok: d.full_day_ok || false
            }));
            renderAll();
            showToast("Default Roster Applied", "success");
        }
    };

    window.clearDates = () => {
        if (confirm("Are you sure you want to clear ALL preferences, avoids, and overrides?")) {
            saveSnapshot();
            rosterData.forEach(p => {
                p.preferred = "";
                p.avoid = "";
                p.override = "";
            });
            renderRoster();
            updateCalculations();
            showToast("All Dates Cleared", "info");
        }
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
            
            const hasOverride = p.override && p.override.trim() !== "";
            const overrideBtnClass = hasOverride ? 'hidden' : 'override-btn px-2 py-1 rounded border border-outline-variant/20 text-[9px] font-bold text-outline hover:text-secondary transition-all';
            const overrideInputClass = hasOverride ? 'override-input block absolute inset-0 z-10 m-2 bg-surface-container-highest border border-secondary/30 rounded px-2 py-1 text-[10px] text-secondary font-bold font-mono' : 'override-input hidden absolute inset-0 z-10 m-2 bg-surface-container-highest border border-primary/50 rounded px-2 py-1 text-[10px] text-primary';

            tr.innerHTML = `
                <td class="px-4 py-2.5"><input type="checkbox" ${p.active ? 'checked' : ''} onchange="updateRow(${i}, 'active', this.checked)" class="w-4 h-4 rounded bg-surface-container-high text-secondary border-outline-variant/30 cursor-pointer accent-secondary"/></td>
                <td class="px-4 py-2.5">
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black" style="background-color: ${p.color}22; color: ${p.color}; border: 1px solid ${p.color}44;">${p.name.substring(0,2).toUpperCase()}</div>
                        <input type="text" class="bg-transparent border-none text-xs font-bold text-on-surface p-0 focus:ring-0 w-32" value="${p.name}" onchange="updateRow(${i}, 'name', this.value)"/>
                    </div>
                </td>
                <td class="px-4 py-2.5 text-center"><input class="w-10 bg-surface-container-lowest border-none rounded py-1 text-[11px] font-black text-center text-on-surface" type="text" value="${p.target}" onchange="updateRow(${i}, 'target', parseInt(this.value) || 0)"/></td>
                <td class="px-4 py-2.5 text-center"><input type="radio" name="half-${i}" ${p.half_month === '1st' ? 'checked' : ''} onclick="updateHalfMode(${i}, '1st')" class="w-4 h-4 text-secondary cursor-pointer accent-secondary"/></td>
                <td class="px-4 py-2.5 text-center"><input type="radio" name="half-${i}" ${p.half_month === '2nd' ? 'checked' : ''} onclick="updateHalfMode(${i}, '2nd')" class="w-4 h-4 text-secondary cursor-pointer accent-secondary"/></td>
                <td class="px-4 py-2.5 text-center"><input type="checkbox" ${p.full_day_ok ? 'checked' : ''} onchange="updateRow(${i}, 'full_day_ok', this.checked)" class="w-4 h-4 text-secondary cursor-pointer accent-secondary"/></td>
                <td class="px-4 py-2.5"><input type="text" class="bg-surface-container-lowest border border-outline-variant/10 rounded px-2 py-1 text-[10px] text-secondary font-mono w-28 font-bold" value="${p.preferred}" oninput="cleanDateInput(this)" onchange="updateRow(${i}, 'preferred', this.value)"/></td>
                <td class="px-4 py-2.5"><input type="text" class="bg-surface-container-lowest border border-outline-variant/10 rounded px-2 py-1 text-[10px] text-error/70 font-mono w-28" value="${p.avoid}" oninput="cleanDateInput(this)" onchange="updateRow(${i}, 'avoid', this.value)"/></td>
                <td class="px-4 py-2.5 text-center relative">
                    <button onclick="toggleOverrideInput(${i})" class="${overrideBtnClass}">Set</button>
                    <input type="text" class="${overrideInputClass}" value="${p.override || ''}" oninput="cleanDateInput(this)" onblur="toggleOverrideInput(${i})" onchange="updateRow(${i}, 'override', this.value)"/>
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
        const { schedule, metadata } = scheduleResults;
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
    }

    window.renderFriction = () => {
        if (!frictionList) return;
        frictionList.innerHTML = "";
        const alerts = [];
        const activePhys = rosterData.filter(p => p.active);

        let weekdaysInMonth = 0;
        let totalNeeded = 0;
        const vacationMap = {}; // day -> unique doctor count
        const popularMap = {}; // day -> unique doctor count
        const overrideConflictMap = {}; // day_slot -> set of doc names
        
        const monthNum = parseInt(needsData.month);
        const yearNum = parseInt(needsData.year);
        const daysInMonthTotal = new Date(yearNum, monthNum, 0).getDate();
        
        for (let d = 1; d <= daysInMonthTotal; d++) {
            const date = new Date(yearNum, monthNum - 1, d);
            if (date.getDay() === 0 || date.getDay() === 6) continue;
            weekdaysInMonth++;
            const dayOfWeek = (date.getDay() + 6) % 7;
            const am = needsData.overrides[d.toString()]?.AM !== undefined ? needsData.overrides[d.toString()].AM : (needsData.daily_needs[dayOfWeek.toString()]?.AM || 0);
            const pm = needsData.overrides[d.toString()]?.PM !== undefined ? needsData.overrides[d.toString()].PM : (needsData.daily_needs[dayOfWeek.toString()]?.PM || 0);
            totalNeeded += (parseInt(am) || 0) + (parseInt(pm) || 0);
        }

        const totalTargets = activePhys.reduce((sum, p) => sum + (parseInt(p.target) || 0), 0);
        if (totalTargets < totalNeeded) {
            alerts.push({ title: "Staffing Deficit", msg: `Total Targets (${totalTargets}) < Clinic Needs (${totalNeeded}). Holes likely.`, type: "error" });
        }

        activePhys.forEach(p => {
            const overrides = window.parseDateString(p.override);
            const avoids = window.parseDateString(p.avoid);
            const preferred = window.parseDateString(p.preferred);
            
            const uniqueAvoidDays = [...new Set(avoids.map(a => a.day))];
            const uniquePreferredDays = [...new Set(preferred.map(pr => pr.day))];

            uniqueAvoidDays.forEach(d => { vacationMap[d] = (vacationMap[d] || 0) + 1; });
            uniquePreferredDays.forEach(d => { popularMap[d] = (popularMap[d] || 0) + 1; });

            overrides.forEach(o => {
                const key = `${o.day}_${o.slot}`;
                if (!overrideConflictMap[key]) overrideConflictMap[key] = new Set();
                overrideConflictMap[key].add(p.name);
            });

            if (p.target > weekdaysInMonth) {
                alerts.push({ title: "Impossible Target", msg: `${p.name}: Target ${p.target} exceeds total weekdays (${weekdaysInMonth}).`, type: "warning" });
            }
        });

        // 1. Conflict Check: Overrides vs Needs vs Other Docs
        Object.entries(overrideConflictMap).forEach(([key, docs]) => {
            const [dayStr, slot] = key.split('_');
            const dayNum = parseInt(dayStr);
            const dayOfWeek = (new Date(yearNum, monthNum-1, dayNum).getDay() + 6) % 7;
            const need = needsData.overrides[dayStr]?.[slot] !== undefined ? needsData.overrides[dayStr][slot] : (needsData.daily_needs[dayOfWeek.toString()]?.[slot] || 0);
            
            if (docs.size > 1) {
                alerts.push({ title: "Override Conflict", msg: `Day ${dayNum} ${slot}: Overridden by ${Array.from(docs).join(', ')}. Overlap!`, type: "error" });
            }
            if (docs.size > need) {
                alerts.push({ title: "Over-Staffed Override", msg: `Day ${dayNum} ${slot}: ${docs.size} overrides exceeds need of ${need}.`, type: "warning" });
            }
        });

        // 2. Competitive Under-Pressure Analysis
        activePhys.forEach(p => {
            const preferred = window.parseDateString(p.preferred);
            const uniquePreferredDays = [...new Set(preferred.map(pr => pr.day))];
            if (p.target > uniquePreferredDays.length && uniquePreferredDays.length > 0) {
                uniquePreferredDays.forEach(d => {
                    if (popularMap[d] > 1) {
                        alerts.push({ title: "Low Risk", msg: `Day ${d}: ${p.name} needs this competitive day (Target ${p.target} > Preferred ${uniquePreferredDays.length}).`, type: "info" });
                    }
                });
            }
        });

        // 3. Anchor & Gap Logic
        const anchorNames = ["Wesley", "Gandhi"];
        anchorNames.forEach(name => {
            if (!activePhys.some(p => p.name.includes(name))) {
                alerts.push({ title: "Operational Risk", msg: `Anchor Physician ${name} inactive.`, type: "error" });
            }
        });

        Object.entries(vacationMap).forEach(([day, count]) => {
            if (count >= 6) alerts.push({ title: "Likely Hole", msg: `Day ${day}: ${count} physicians avoiding. High risk gap.`, type: "error" });
            else if (count >= 4) alerts.push({ title: "Possible Hole", msg: `Day ${day}: ${count} physicians avoiding.`, type: "warning" });
        });

        if (alerts.length === 0) {
            frictionList.innerHTML = `<div class="px-4 py-4 text-[9px] text-outline italic text-center">No structural friction found.</div>`;
        } else {
            alerts.forEach(a => {
                const color = a.type === 'error' ? 'text-error' : (a.type === 'warning' ? 'text-amber-400' : 'text-primary');
                const icon = a.type === 'error' ? 'report' : (a.type === 'warning' ? 'warning' : 'info');
                frictionList.innerHTML += `
                    <div class="px-4 py-2 border-b border-outline-variant/10 hover:bg-surface-container-highest/20 transition-colors">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="material-symbols-outlined text-sm ${color}">${icon}</span>
                            <span class="text-[9px] font-black uppercase tracking-tight ${color}">${a.title}</span>
                        </div>
                        <p class="text-[8px] text-on-surface-variant leading-tight">${a.msg}</p>
                    </div>
                `;
            });
        }
    };

    function updateCalculations() {
        if (!totalPhysStat) return;
        const activePhys = rosterData.filter(p => p.active);
        totalPhysStat.textContent = rosterData.length;
        activePhysStat.textContent = activePhys.length;
        const totalTargets = activePhys.reduce((sum, p) => sum + (parseInt(p.target) || 0), 0);
        if (capacityTargets) capacityTargets.textContent = totalTargets;
        
        let totalNeeded = 0;
        const monthNum = parseInt(needsData.month);
        const yearNum = parseInt(needsData.year);
        const daysInMonth = new Date(yearNum, monthNum, 0).getDate();

        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(yearNum, monthNum - 1, d);
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
            const barWidth = pct === 0 ? 0 : Math.max(3, Math.min(pct, 100));
            capacityBar.style.width = barWidth + "%";
            capacityBar.className = (pct > 120) ? "bg-error h-full transition-all duration-500" : ((pct < 95) ? "bg-amber-500 h-full transition-all duration-500" : "bg-gradient-to-r from-primary to-secondary h-full transition-all duration-500");
        }
        if (window.renderFriction) window.renderFriction();
    }

    // --- EVENT LISTENERS ---
    if (regenerateBtn) regenerateBtn.addEventListener("click", generateSchedule);
    if (undoBtn) undoBtn.addEventListener("click", () => window.undo());
    if (resetBtn) resetBtn.addEventListener("click", () => window.resetRoster());
    if (saveBtn) saveBtn.addEventListener("click", () => saveData("roster"));
    if (defaultBtn) defaultBtn.addEventListener("click", () => window.setDefaultRoster());
    if (clearDatesBtn) clearDatesBtn.addEventListener("click", () => window.clearDates());
    
    if (monthSelect) monthSelect.addEventListener("change", (e) => { needsData.month = parseInt(e.target.value); renderCalendar(); });
    if (yearSelect) yearSelect.addEventListener("change", (e) => { needsData.year = parseInt(e.target.value); renderCalendar(); });
    
    if (addBtn) addBtn.addEventListener("click", () => {
        saveSnapshot();
        rosterData.push({ name: "New Doctor", target: 4, active: true, half_month: "All", preferred: "", avoid: "", override: "", color: "#ffffff", full_day_ok: false });
        renderRoster(); updateCalculations();
    });

    loadAllData();
});
