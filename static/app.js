document.addEventListener("DOMContentLoaded", () => {
    
    // --- SHARED STATE ---
    let rosterData = [];
    let needsData = { year: 2024, month: 3, daily_needs: {}, overrides: {}, desperation_stage: 1, split_day: "Automatic" };
    let scheduleResults = null;
    let scheduleViewMode = localStorage.getItem('scheduleViewMode') || 'colors';
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

    const STANDARD_NEEDS = {
        "0": { "AM": 1, "PM": 0 }, // Monday
        "1": { "AM": 2, "PM": 0 }, // Tuesday
        "2": { "AM": 0, "PM": 1 }, // Wednesday
        "3": { "AM": 2, "PM": 1 }, // Thursday
        "4": { "AM": 1, "PM": 0 }, // Friday
        "5": { "AM": 0, "PM": 0 }, // Saturday
        "6": { "AM": 0, "PM": 0 }  // Sunday
    };

    // --- DOM ELEMENTS ---
    const tbody = document.getElementById("roster-tbody");
    const calendarGrid = document.getElementById("calendar-grid");
    const scheduleGrid = document.getElementById("schedule-grid");

    const totalPhysStat = document.getElementById("total-physicians-stat");
    const activePhysStat = document.getElementById("active-physicians-stat");
    const capacityPct = document.getElementById("capacity-pct");
    const capacityBar = document.getElementById("capacity-bar");
    const capacityTargets = document.getElementById("capacity-targets");
    const capacityNeeds = document.getElementById("capacity-needs");
    const frictionList = document.getElementById("friction-list");

    const scheduleStatsBody = document.getElementById("schedule-stats-body");
    const scheduleAlertsList = document.getElementById("schedule-alerts-list");
    const currentPeriodLabel = document.getElementById("current-period");

    const regenerateBtn = document.getElementById("regenerate-btn");
    const undoBtn = document.getElementById("undo-btn");
    const resetBtn = document.getElementById("reset-btn");
    const saveBtn = document.getElementById("save-btn");
    const defaultBtn = document.getElementById("default-btn");
    const clearDatesBtn = document.getElementById("clear-dates-btn");
    const monthSelect = document.getElementById("month-select");
    const yearSelect = document.getElementById("year-select");
    const splitSelect = document.getElementById("split-select");
    const addBtn = document.getElementById("add-physician-btn");

    const resetNeedsBtn = document.getElementById("reset-needs-btn");
    const saveNeedsBtn = document.getElementById("save-needs-btn");

    // --- UTILITIES ---

    function saveSnapshot() {
        history.push(JSON.parse(JSON.stringify(rosterData)));
        if (history.length > MAX_HISTORY) history.shift();
    }

    function showToast(msg, type) { 
        console.log(`[TOAST: ${type}] ${msg}`);
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

    function parseDateInputJS(text, daysInMonth) {
        if (!text || !text.trim()) return [];
        const parts = text.split(',').map(p => p.trim().toUpperCase());
        const result = [];
        
        parts.forEach(p => {
            if (!p) return;
            if (p.includes('-')) {
                let sType = null;
                if (p.includes('AM')) sType = 'AM';
                else if (p.includes('PM')) sType = 'PM';
                
                const cleanP = p.replace('AM', '').replace('PM', '').trim();
                const [startStr, endStr] = cleanP.split('-');
                let start = parseInt(startStr), end = parseInt(endStr);
                if (isNaN(start) || isNaN(end)) return;
                if (start > end) { const temp = start; start = end; end = temp; }
                
                for (let day = start; day <= end; day++) {
                    if (day < 1 || day > daysInMonth) continue;
                    if (sType) result.push({day, type: sType});
                    else { result.push({day, type: 'AM'}); result.push({day, type: 'PM'}); }
                }
            } else {
                const dayStr = p.replace(/[^0-9]/g, '');
                if (!dayStr) return;
                const day = parseInt(dayStr);
                if (day < 1 || day > daysInMonth) return;
                
                if (p.includes('AM')) result.push({day, type: 'AM'});
                else if (p.includes('PM')) result.push({day, type: 'PM'});
                else { result.push({day, type: 'AM'}); result.push({day, type: 'PM'}); }
            }
        });
        return result;
    }

    window.validateDateInput = (str, daysInMonth) => {
        if (!str || str.trim() === "") return null;
        const parts = str.split(',').map(p => p.trim());
        for (let part of parts) {
            if (!part) continue;
            if (/[A-Z]/i.test(part) && !/[AP]M|BOTH/i.test(part)) return `Invalid text: "${part}"`;
            const match = part.match(/^(\d+)(?:-(\d+))?([AP]M|BOTH)?$/i);
            if (!match) return `Invalid syntax: "${part}"`;
            const start = parseInt(match[1]);
            const end = match[2] ? parseInt(match[2]) : start;
            if (start < 1 || start > daysInMonth) return `Day out of range: ${start}`;
            if (end < 1 || end > daysInMonth) return `Day out of range: ${end}`;
            if (start > end) return `Start (${start}) > End (${end})`;
        }
        return null;
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
                if (needsData.desperation_stage === undefined) needsData.desperation_stage = 1;
                if (needsData.ratio_logic === undefined) needsData.ratio_logic = true;
                
                if (monthSelect) monthSelect.value = needsData.month;
                if (yearSelect) yearSelect.value = needsData.year;
                if (splitSelect) splitSelect.value = needsData.split_day || "Automatic";
                
                // Set UI state for Desperation & Ratio based on loaded backend
                const dRadio = document.querySelector(`input[name="desperation"][value="${needsData.desperation_stage}"]`);
                if (dRadio) dRadio.checked = true;
                const ratioTog = document.getElementById("ratio-logic-toggle");
                if (ratioTog) ratioTog.checked = needsData.ratio_logic;
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
                showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} Saved`, "success");
            }
        } catch (e) { showToast("Save error", "error"); }
    }

    async function generateSchedule() {
        if (!regenerateBtn) return;
        const oldText = regenerateBtn.innerHTML;
        regenerateBtn.disabled = true;
        regenerateBtn.innerHTML = `<span class="animate-spin material-symbols-outlined text-sm">autorenew</span> Generating...`;
        
        try {
            const resp = await fetch("/api/generate", { method: "POST" });
            const data = await resp.json();
            if (data.success) {
                showToast("Schedule Generated Successfully", "success");
                const schedResp = await fetch("/api/schedule");
                const schedJson = await schedResp.json();
                if (schedJson.success) scheduleResults = schedJson.data;
                renderSchedule();
                renderStats(); // Update the load stats
            } else {
                // Surface actual backend error if provided
                showToast(data.error || "Generation Failed", "error");
                console.error("Generation Error:", data.error);
            }
        } catch (e) { 
            showToast("Network or Server error", "error"); 
            console.error("Fetch Error:", e);
        }
        finally {
            regenerateBtn.disabled = false;
            // Let renderSchedule update the button text to "Regenerate"
            renderSchedule(); 
        }
    }

    let needsSaveTimeout = null;
    function autoSaveNeeds() {
        if (needsSaveTimeout) clearTimeout(needsSaveTimeout);
        needsSaveTimeout = setTimeout(() => { saveData("needs"); }, 500); 
    }

    let rosterSaveTimeout = null;
    function autoSaveRoster() {
        if (rosterSaveTimeout) clearTimeout(rosterSaveTimeout);
        rosterSaveTimeout = setTimeout(() => { saveData("roster"); }, 750); 
    }

    // --- GLOBAL HELPERS ---
    window.addPhysician = () => {
        saveSnapshot();
        const newPhys = {
            name: "New Physician", target: 4, active: true, half_month: "All",
            preferred: "", avoid: "", override: "", color: "#ffffff", full_day_ok: false
        };
        rosterData.push(newPhys);
        renderRoster();
        updateCalculations();
    };

    window.deleteRow = (index) => {
        if (confirm(`Remove ${rosterData[index].name} from roster?`)) {
            saveSnapshot();
            rosterData.splice(index, 1);
            autoSaveRoster();
            renderRoster();
            updateCalculations();
        }
    };

    window.moveRowUp = (index) => {
        if (index > 0) {
            saveSnapshot();
            const temp = rosterData[index];
            rosterData[index] = rosterData[index - 1];
            rosterData[index - 1] = temp;
            autoSaveRoster();
            renderRoster();
        }
    };

    window.moveRowDown = (index) => {
        if (index < rosterData.length - 1) {
            saveSnapshot();
            const temp = rosterData[index];
            rosterData[index] = rosterData[index + 1];
            rosterData[index + 1] = temp;
            autoSaveRoster();
            renderRoster();
        }
    };

    window.clearDates = () => {
        if (confirm("Clear ALL preferred, avoid, and override entries?")) {
            saveSnapshot();
            rosterData.forEach(p => { p.preferred = ""; p.avoid = ""; p.override = ""; });
            autoSaveRoster();
            renderRoster();
            updateCalculations();
        }
    };

    window.updateRow = (index, field, value) => {
        saveSnapshot();
        rosterData[index][field] = value;
        autoSaveRoster();
        updateCalculations();
        // Do not renderRoster on text input fields natively to prevent cursor focus from snapping away on fast typing
        if (field === 'color' || field === 'active' || field === 'half_month' || field === 'full_day_ok') renderRoster();
    };

    window.updateHalfMode = (index, mode) => {
        saveSnapshot();
        if (rosterData[index].half_month === mode) rosterData[index].half_month = "All";
        else rosterData[index].half_month = mode;
        autoSaveRoster();
        renderRoster();
        updateCalculations();
    };

    window.toggleOverrideInput = (index) => {
        const p = rosterData[index];
        const row = document.querySelector(`tr[data-index="${index}"]`);
        if (!row) return;
        const input = row.querySelector('.override-input');
        const btn = row.querySelector('.override-btn');
        if (p.override && p.override.trim() !== "") {
            input.classList.remove('hidden'); btn.classList.add('hidden');
        } else {
            if (input.classList.contains('hidden')) {
                input.classList.remove('hidden'); btn.classList.add('hidden'); input.focus();
            } else {
                input.classList.add('hidden'); btn.classList.remove('hidden');
            }
        }
    };

    window.updateDayNeed = (day, slot, value) => {
        if (!needsData.overrides[day.toString()]) needsData.overrides[day.toString()] = {};
        needsData.overrides[day.toString()][slot] = parseInt(value);
        updateCalculations();
        autoSaveNeeds();
    };

    window.toggleDayClosed = (day) => {
        const dayKey = day.toString();
        const isCurrentlyClosed = (needsData.overrides[dayKey]?.AM === 0 && needsData.overrides[dayKey]?.PM === 0);
        if (isCurrentlyClosed) delete needsData.overrides[dayKey];
        else needsData.overrides[dayKey] = { AM: 0, PM: 0 };
        renderCalendar();
        autoSaveNeeds();
    };

    window.undo = () => {
        if (history.length > 1) {
            rosterData = history.pop();
            renderAll();
            showToast("Undone", "info");
        }
    };

    window.resetRoster = () => { if (confirm("Reset roster?")) loadAllData(); };

    window.setDefaultRoster = () => {
        if (confirm("Apply Default Roster?")) {
            saveSnapshot();
            rosterData = DEFAULT_ROSTER.map(d => ({ ...d, active: true, half_month: "All", preferred: "", avoid: "", override: "" }));
            autoSaveRoster();
            renderAll();
        }
    };

    window.resetNeedsToStandards = () => {
        if (confirm("Reset Clinic Needs to standard v1.6.0 values?")) {
            needsData.daily_needs = JSON.parse(JSON.stringify(STANDARD_NEEDS));
            needsData.overrides = {};
            renderCalendar(); saveData("needs");
            showToast("Needs Reset to Standards", "success");
        }
    };

    // --- RENDERING ---
    function renderRoster() {
        if (!tbody) return;
        tbody.innerHTML = "";
        rosterData.forEach((p, i) => {
            const tr = document.createElement("tr");
            tr.setAttribute("data-index", i);
            tr.className = "hover:bg-surface-container-high/50 transition-colors border-b border-outline-variant/5";
            const hasOverride = p.override && p.override.trim() !== "";
            tr.innerHTML = `
                <td class="px-4 py-2.5"><input type="checkbox" ${p.active ? 'checked' : ''} onchange="updateRow(${i}, 'active', this.checked)" class="w-4 h-4 rounded bg-surface-container-high text-secondary border-outline-variant/30 cursor-pointer accent-secondary"/></td>
                <td class="px-4 py-2.5">
                    <div class="flex items-center gap-2">
                        <div class="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black" style="background-color: ${p.color}22; color: ${p.color}; border: 1px solid ${p.color}44;">${p.name.substring(0,2).toUpperCase()}</div>
                        <input type="text" class="bg-transparent border-none text-xs font-bold text-on-surface p-0 focus:ring-0 w-32" value="${p.name}" oninput="updateRow(${i}, 'name', this.value)"/>
                    </div>
                </td>
                <td class="px-4 py-2.5 text-center"><input class="w-10 bg-surface-container-lowest border-none rounded py-1 text-[11px] font-black text-center text-on-surface" type="text" value="${p.target}" title="Expected Shift Target Count" oninput="updateRow(${i}, 'target', parseInt(this.value) || 0)"/></td>
                <td class="px-4 py-2.5 text-center"><input type="radio" name="half-${i}" ${p.half_month === '1st' ? 'checked' : ''} onclick="updateHalfMode(${i}, '1st')" class="w-4 h-4 text-secondary cursor-pointer accent-secondary"/></td>
                <td class="px-4 py-2.5 text-center"><input type="radio" name="half-${i}" ${p.half_month === '2nd' ? 'checked' : ''} onclick="updateHalfMode(${i}, '2nd')" class="w-4 h-4 text-secondary cursor-pointer accent-secondary"/></td>
                <td class="px-4 py-2.5 text-center"><input type="checkbox" ${p.full_day_ok ? 'checked' : ''} onchange="updateRow(${i}, 'full_day_ok', this.checked)" class="w-4 h-4 text-secondary cursor-pointer accent-secondary"/></td>
                <td class="px-4 py-2.5"><input type="text" placeholder="Date(s)" class="bg-surface-container-lowest border border-outline-variant/10 rounded px-2 py-1 text-[10px] text-secondary font-mono w-28 font-bold" value="${p.preferred}" oninput="cleanDateInput(this); updateRow(${i}, 'preferred', this.value)"/></td>
                <td class="px-4 py-2.5"><input type="text" placeholder="Date(s)" class="bg-surface-container-lowest border border-outline-variant/10 rounded px-2 py-1 text-[10px] text-error/70 font-mono w-28" value="${p.avoid}" oninput="cleanDateInput(this); updateRow(${i}, 'avoid', this.value)"/></td>
                <td class="px-4 py-2.5 text-center relative">
                    <button onclick="toggleOverrideInput(${i})" class="${hasOverride ? 'hidden' : 'override-btn px-2 py-1 rounded border border-outline-variant/20 text-[9px] font-bold text-outline hover:text-secondary transition-all'}">Set</button>
                    <input type="text" class="${hasOverride ? 'override-input block absolute inset-0 z-10 m-2 bg-surface-container-highest border border-secondary/30 rounded px-2 py-1 text-[10px] text-secondary font-bold font-mono' : 'override-input hidden absolute inset-0 z-10 m-2 bg-surface-container-highest border border-primary/50 rounded px-2 py-1 text-[10px] text-primary'}" value="${p.override || ''}" oninput="cleanDateInput(this); updateRow(${i}, 'override', this.value)" onblur="toggleOverrideInput(${i})"/>
                </td>
                <td class="px-4 py-2.5 text-center"><div class="relative w-4 h-4 rounded-full border border-outline-variant/20 overflow-hidden mx-auto"><input type="color" value="${p.color}" oninput="updateRow(${i}, 'color', this.value)" class="absolute -inset-1 w-8 h-8 cursor-pointer"/></div></td>
                <td class="px-2 py-2.5 text-right w-24">
                    <div class="flex items-center gap-0.5 justify-end">
                        <button onclick="moveRowUp(${i})" class="text-secondary hover:text-primary transition-all select-none" title="Move Up"><span class="material-symbols-outlined loaded text-lg cursor-pointer">keyboard_arrow_up</span></button>
                        <button onclick="moveRowDown(${i})" class="text-secondary hover:text-primary transition-all select-none" title="Move Down"><span class="material-symbols-outlined loaded text-lg cursor-pointer">keyboard_arrow_down</span></button>
                        <button onclick="deleteRow(${i})" class="text-error/70 hover:text-error transition-all ml-1 select-none" title="Delete"><span class="material-symbols-outlined loaded text-lg cursor-pointer">delete</span></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function renderCalendar() {
        if (!calendarGrid) return;
        calendarGrid.innerHTML = "";
        const year = parseInt(needsData.year), month = parseInt(needsData.month);
        const daysInMonth = new Date(year, month, 0).getDate();
        const firstDay = new Date(year, month - 1, 1).getDay();
        let actualSplitOn = needsData.split_day === "Automatic" ? Math.ceil(daysInMonth / 2) + 1 : parseInt(needsData.split_day);
        for (let i = 0; i < firstDay; i++) {
            const empty = document.createElement("div"); empty.className = "bg-surface-container-lowest/10 rounded-xl opacity-10 border border-dashed border-outline-variant/10 day-cell";
            calendarGrid.appendChild(empty);
        }
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month - 1, d);
            const isWeekendVal = (date.getDay() === 0 || date.getDay() === 6);
            const dayOfWeek = (date.getDay() + 6) % 7;
            const ovr = needsData.overrides[d.toString()];
            const pat = needsData.daily_needs[dayOfWeek.toString()];
            const am = ovr?.AM !== undefined ? ovr.AM : (pat ? pat.AM : 0);
            const pm = ovr?.PM !== undefined ? ovr.PM : (pat ? pat.PM : 0);
            const isClosed = !isWeekendVal && (am === 0 && pm === 0);
            const isCurrentSplitStart = (d === actualSplitOn);
            const cell = document.createElement("div"); cell.className = (isWeekendVal || isClosed) ? "bg-error/5 rounded-xl p-2.5 border border-error/10 relative day-cell" : "bg-surface-container-high rounded-xl p-2.5 border border-outline-variant/10 relative day-cell";
            const btnText = isClosed ? '+' : '-';
            const btnClass = isClosed ? 'bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30' : 'bg-error/20 border border-error/30 text-error hover:bg-error/30';
            let labelHtml = isCurrentSplitStart ? `<div class="absolute -top-1 right-2 px-1.5 py-0.5 bg-[#4f46e5] text-white text-[7px] font-black rounded shadow-sm z-10 transition-all uppercase tracking-tighter">2nd Half</div>` : "";
            if (isWeekendVal) cell.innerHTML = `${labelHtml}<div class="flex justify-between items-start mb-1"><span class="text-xs font-bold text-outline/20">${d}</span></div><div class="flex items-center justify-center mt-6"><span class="text-[9px] font-black text-outline/20 uppercase tracking-[0.2em]">Weekend</span></div>`;
            else if (isClosed) cell.innerHTML = `${labelHtml}<div class="flex justify-between items-start mb-1"><span class="text-xs font-bold text-on-surface/40">${d}</span><button onclick="toggleDayClosed(${d})" class="w-6 h-6 flex items-center justify-center rounded-full ${btnClass} transition-all z-10 relative"><span class="text-lg font-black leading-none pb-0.5 cursor-pointer">${btnText}</span></button></div><div class="flex items-center justify-center mt-6"><span class="text-[9px] font-black text-error/40 uppercase tracking-[0.2em]">Closed</span></div>`;
            else cell.innerHTML = `${labelHtml}<div class="flex justify-between items-start mb-1"><span class="text-xs font-bold text-on-surface">${d}</span><button onclick="toggleDayClosed(${d})" class="w-6 h-6 flex items-center justify-center rounded-full ${btnClass} transition-all z-10 relative"><span class="text-lg font-black leading-none pb-0.5 cursor-pointer">${btnText}</span></button></div><div class="flex flex-col items-center justify-center space-y-2 mt-2"><div class="flex items-center gap-2"><span class="text-[8px] font-black text-outline/50 w-4">AM</span><select onchange="updateDayNeed(${d}, 'AM', this.value)" class="bg-surface-container-lowest text-[10px] font-bold rounded-md px-1 py-0.5 w-12 border-none ring-1 ring-outline-variant/10"><option value="0" ${am==0?'selected':''}>0</option><option value="1" ${am==1?'selected':''}>1</option><option value="2" ${am==2?'selected':''}>2</option></select></div><div class="flex items-center gap-2"><span class="text-[8px] font-black text-outline/50 w-4">PM</span><select onchange="updateDayNeed(${d}, 'PM', this.value)" class="bg-surface-container-lowest text-[10px] font-bold rounded-md px-1 py-0.5 w-12 border-none ring-1 ring-outline-variant/10"><option value="0" ${pm==0?'selected':''}>0</option><option value="1" ${pm==1?'selected':''}>1</option><option value="2" ${pm==2?'selected':''}>2</option></select></div></div>`;
            calendarGrid.appendChild(cell);
        }
    }

    function renderSchedule() {
        if (!scheduleGrid) return;
        scheduleGrid.innerHTML = "";
        
        // Sync with Tab 2 Current Selection
        const year = parseInt(needsData.year), month = parseInt(needsData.month);
        if (currentPeriodLabel) currentPeriodLabel.textContent = `${new Date(year, month - 1).toLocaleString('default', { month: 'long' })} ${year}`;
        
        console.log("Rendering Schedule for:", { year, month });
        
        const daysInMonth = new Date(year, month, 0).getDate();
        const firstDay = new Date(year, month - 1, 1).getDay(); // 0-6 (Sun-Sat)
        
        // Fetch current month results from shared state
        // Use Loose Equality (==) to handle cases where metadata might be string vs integer
        const schedule = (scheduleResults && 
                          scheduleResults.metadata.month == month && 
                          scheduleResults.metadata.year == year) 
                         ? scheduleResults.schedule : null;

        console.log("Schedule Data State:", { 
            hasResults: !!scheduleResults, 
            matched: !!schedule,
            meta: scheduleResults ? scheduleResults.metadata : "none"
        });

        // Button Label Toggle
        if (regenerateBtn) {
            const hasData = schedule !== null;
            regenerateBtn.innerHTML = hasData 
                ? `<span class="material-symbols-outlined">sync</span> REGENERATE SCHEDULE`
                : `<span class="material-symbols-outlined">sync</span> GENERATE SCHEDULE`;
        }
        
        // 1. Padding Cells (Workdays Only: Mon-Fri)
        // If the 1st is Monday(1), offset is 0.
        // If the 1st is Friday(5), offset is 4.
        // If the 1st is Sat(6) or Sun(0), the first workday is the following Monday (Offset 0).
        const isActuallyWeekend = (firstDay === 0 || firstDay === 6);
        const mondayOffset = isActuallyWeekend ? 0 : Math.max(0, firstDay - 1);
        
        for (let i = 0; i < mondayOffset; i++) {
            const empty = document.createElement("div"); 
            empty.className = "bg-surface-container-lowest/5 rounded-xl border border-dashed border-outline-variant/5 day-cell flex items-center justify-center";
            empty.innerHTML = `<span class="material-symbols-outlined text-outline/5 text-lg">calendar_today</span>`;
            scheduleGrid.appendChild(empty);
        }

        // Track assignment counts sequentially for the Targets view overflow logic
        const shiftCount = {};
        const splitDay = needsData.split_day === "Automatic" ? Math.floor(daysInMonth / 2) + 1 : parseInt(needsData.split_day);

        const renderPill = (name, d, type) => {
            const p = rosterData.find(pd => pd.name === name);
            if (!p) return `<span class="px-2 py-0.5 rounded text-[9px] font-bold truncate">${name}</span>`;

            shiftCount[name] = (shiftCount[name] || 0) + 1;
            let bg = `${p.color}22`, fg = p.color, border = `${p.color}44`;

            if (scheduleViewMode === 'ampm') {
                if (type === 'AM') {
                    bg = '#fef3c7'; fg = '#78350f'; border = '#fde68a'; // Muted amber background, dark brown text
                } else {
                    bg = '#172554'; fg = '#bfdbfe'; border = '#1e3a8a'; // Dark blue -> light blue
                }
            } else if (scheduleViewMode === 'targets') {
                const avoids = parseDateInputJS(p.avoid, daysInMonth);
                const isAvoid = avoids.some(req => req.day === d && req.type === type);
                
                const prefs = parseDateInputJS(p.preferred, daysInMonth);
                const overrs = parseDateInputJS(p.override, daysInMonth);
                const isReq = [...prefs, ...overrs].some(req => req.day === d && req.type === type);
                
                let algoError = false;
                if (p.half_month === "1st" && d >= splitDay) algoError = true;
                if (p.half_month === "2nd" && d < splitDay) algoError = true;
                
                const daySlots = schedule[d.toString()] || {AM: [], PM: []};
                if (!p.full_day_ok && daySlots.AM.includes(name) && daySlots.PM.includes(name)) algoError = true;

                if (isAvoid) {
                    bg = '#7f1d1d'; fg = '#fecaca'; border = '#b91c1c'; // Red (Avoid violation)
                } else if (algoError) {
                    bg = '#c2410c'; fg = '#ffedd5'; border = '#ea580c'; // Orange (Algorithm constraint error)
                } else if (isReq) {
                    bg = '#14532d'; fg = '#bbf7d0'; border = '#16a34a'; // Green (Requested & Granted)
                } else if (shiftCount[name] > p.target) {
                    bg = '#ca8a04'; fg = '#fef08a'; border = '#eab308'; // Yellow (Exceeded target limit)
                } else {
                    bg = '#1e3a8a'; fg = '#dbeafe'; border = '#2563eb'; // Blue (Normal, meets target)
                }
            }
            return `<span class="px-2 py-0.5 rounded text-[9px] font-bold truncate shadow-sm" style="background-color: ${bg}; color: ${fg}; border: 1px solid ${border};">${name}</span>`;
        };

        // 2. Schedule Cells (Strict Workdays Only)
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month - 1, d); 
            const dayOfWeek = date.getDay(); // 0-6
            const isWeekendVal = (dayOfWeek === 0 || dayOfWeek === 6);
            
            if (isWeekendVal) continue; // OMIT WEEKENDS ENTIRELY

            const backendDayOfWeekStr = ((dayOfWeek + 6) % 7).toString();
            const slots = (schedule && schedule[d.toString()]) ? schedule[d.toString()] : { AM: [], PM: [] };
            
            const reqAM = needsData.overrides[d.toString()]?.AM !== undefined ? needsData.overrides[d.toString()].AM : (needsData.daily_needs[backendDayOfWeekStr]?.AM || 0);
            const reqPM = needsData.overrides[d.toString()]?.PM !== undefined ? needsData.overrides[d.toString()].PM : (needsData.daily_needs[backendDayOfWeekStr]?.PM || 0);
            const isClosed = (reqAM === 0 && reqPM === 0);

            const amStatusHtml = (reqAM > slots.AM.length) ? '<span class="text-[8px] font-bold text-error bg-error/10 px-1 py-0.5 rounded uppercase text-center block w-full mt-0.5 shadow-sm border border-error/20 inline-block w-auto">Unfilled</span>' : '';
            const pmStatusHtml = (reqPM > slots.PM.length) ? '<span class="text-[8px] font-bold text-error bg-error/10 px-1 py-0.5 rounded uppercase text-center block w-full mt-0.5 shadow-sm border border-error/20 inline-block w-auto">Unfilled</span>' : '';

            const cell = document.createElement("div"); 
            
            if (isClosed) {
                cell.className = "bg-error/10 rounded-xl p-2 border border-error/20 relative day-cell flex flex-col items-center justify-center text-center hover:bg-error/20 transition-all";
                cell.innerHTML = `
                    <div class="absolute top-2 left-2 text-xs font-bold text-error/60">${d < 10 ? '0'+d : d}</div>
                    <span class="text-[12px] font-black tracking-widest text-error/70 uppercase">CLOSED</span>
                `;
            } else {
                cell.className = "bg-surface-container-high rounded-xl p-2 border border-outline-variant/10 relative day-cell hover:bg-primary/5 transition-all";
                
                const amHtml = slots.AM.map(name => renderPill(name, d, 'AM')).join('');
                const pmHtml = slots.PM.map(name => renderPill(name, d, 'PM')).join('');
                
                cell.innerHTML = `
                    <div class="flex justify-between items-start mb-1">
                        <span class="text-xs font-bold text-primary">${d < 10 ? '0'+d : d}</span>
                    </div>
                    <div class="flex flex-col gap-1.5 mt-1">
                        <div class="bg-surface-container-highest/30 rounded-lg p-1.5 border border-outline-variant/10 relative h-[68px] overflow-hidden">
                            <span class="absolute top-1 right-1.5 text-[9px] text-outline/60 font-black tracking-widest">AM</span>
                            <div class="flex flex-col gap-1 mt-1 pr-4">${amHtml || amStatusHtml}</div>
                        </div>
                        <div class="mx-3 h-[2px] bg-[#666666] rounded-full"></div>
                        <div class="bg-surface-container-highest/10 rounded-lg p-1.5 border border-outline-variant/5 relative h-[68px] overflow-hidden">
                            <span class="absolute top-1 right-1.5 text-[9px] text-outline/40 font-black tracking-widest">PM</span>
                            <div class="flex flex-col gap-1 mt-1 pr-4">${pmHtml || pmStatusHtml}</div>
                        </div>
                    </div>
                `;
            }
            scheduleGrid.appendChild(cell);
        }

        // Render Sidebar Stats & Alerts
        renderStats();
        renderAlerts();
    }

    function renderStats() {
        if (!scheduleStatsBody) return;
        scheduleStatsBody.innerHTML = "";
        
        const year = parseInt(needsData.year), month = parseInt(needsData.month);
        const schedule = (scheduleResults && scheduleResults.metadata.month === month && scheduleResults.metadata.year === year) ? scheduleResults.schedule : null;
        
        if (!schedule) {
             scheduleStatsBody.innerHTML = `<tr><td colspan="4" class="px-3 py-6 text-[9px] text-outline italic text-center">No current schedule generated.</td></tr>`;
             return;
        }

        // Calculate dynamic load per physician
        const loadMap = {};
        Object.values(schedule).forEach(day => {
            day.AM.forEach(name => { loadMap[name] = (loadMap[name] || 0) + 1; });
            day.PM.forEach(name => { loadMap[name] = (loadMap[name] || 0) + 1; });
        });

        rosterData.filter(p => p.active).forEach(p => {
            const actual = loadMap[p.name] || 0;
            const delta = actual - p.target;
            const deltaColor = delta > 0 ? "text-error" : (delta < 0 ? "text-amber-500" : "text-primary");
            
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td class="px-3 py-2 font-bold text-on-surface">${p.name}</td>
                <td class="px-2 py-2 text-center text-outline">${p.target}</td>
                <td class="px-2 py-2 text-center font-black">${actual}</td>
                <td class="px-3 py-2 text-right font-black ${deltaColor}">${delta > 0 ? '+'+delta : delta}</td>
            `;
            scheduleStatsBody.appendChild(tr);
        });
    }

    function renderAlerts() {
        if (!scheduleAlertsList) return;
        scheduleAlertsList.innerHTML = "";
        const year = parseInt(needsData.year), month = parseInt(needsData.month);
        const alerts = (scheduleResults && scheduleResults.metadata.month === month && scheduleResults.metadata.year === year) ? scheduleResults.alerts : [];
        if (alerts.length === 0) {
             scheduleAlertsList.innerHTML = `<div class="p-4 text-[9px] text-outline italic text-center">No structural alerts found.</div>`;
        } else {
             alerts.forEach(msg => {
                  const tr = document.createElement("div");
                  tr.className = "px-4 py-2 bg-surface-container-highest/20 border-l-2 border-primary rounded-r-lg mb-2";
                  tr.innerHTML = `<p class="text-[9px] font-bold text-on-surface-variant leading-tight">${msg}</p>`;
                  scheduleAlertsList.appendChild(tr);
             });
        }
    }

    window.renderFriction = () => {
        if (!frictionList) return;
        frictionList.innerHTML = "";
        const alerts = [];
        const activePhys = rosterData.filter(p => p.active);
        const yearNum = parseInt(needsData.year);
        const monthNum = parseInt(needsData.month);
        const dInMonth = new Date(yearNum, monthNum, 0).getDate();
        
        let weekdaysInMonth = 0; let totalNeeded = 0;
        const avoidCounts = {}; 
        const popularMap = {}; // day -> count
        const overrideSlotMap = {}; // day_slot -> Set(physicians)

        for (let d = 1; d <= dInMonth; d++) {
            const date = new Date(yearNum, monthNum - 1, d); if (date.getDay() === 0 || date.getDay() === 6) continue;
            weekdaysInMonth++;
            const dOfWk = (date.getDay() + 6) % 7;
            const am = needsData.overrides[d.toString()]?.AM !== undefined ? needsData.overrides[d.toString()].AM : (needsData.daily_needs[dOfWk.toString()]?.AM || 0);
            const pm = needsData.overrides[d.toString()]?.PM !== undefined ? needsData.overrides[d.toString()].PM : (needsData.daily_needs[dOfWk.toString()]?.PM || 0);
            totalNeeded += (parseInt(am) || 0) + (parseInt(pm) || 0);
        }

        const anchorNames = ["Wesley", "Gandhi"];
        anchorNames.forEach(name => {
            if (!activePhys.some(p => p.name.toLowerCase().includes(name.toLowerCase()))) {
                alerts.push({ title: "Operational Risk", msg: `Anchor Physician ${name} is NOT active in the roster.`, type: "error" });
            }
        });

        activePhys.forEach(p => {
            const prefErr = window.validateDateInput(p.preferred, dInMonth);
            const avoidErr = window.validateDateInput(p.avoid, dInMonth);
            const ovrErr = window.validateDateInput(p.override, dInMonth);
            if (prefErr) alerts.push({ title: "Syntax Error", msg: `${p.name} (Pref): ${prefErr}`, type: "error" });
            if (avoidErr) alerts.push({ title: "Syntax Error", msg: `${p.name} (Avoid): ${avoidErr}`, type: "error" });
            if (ovrErr) alerts.push({ title: "Syntax Error", msg: `${p.name} (Ovr): ${ovrErr}`, type: "error" });

            const pDates = window.parseDateString(p.preferred);
            const aDates = window.parseDateString(p.avoid);
            const oDates = window.parseDateString(p.override);

            const uniquePDays = [...new Set(pDates.map(pd => pd.day))];
            uniquePDays.forEach(d => { popularMap[d] = (popularMap[d] || 0) + 1; });
            
            const uniqueADays = [...new Set(aDates.map(ad => ad.day))];
            uniqueADays.forEach(d => { avoidCounts[d] = (avoidCounts[d] || 0) + 1; });

            oDates.forEach(od => {
                const key = `${od.day}_${od.slot}`;
                if (!overrideSlotMap[key]) overrideSlotMap[key] = new Set();
                overrideSlotMap[key].add(p.name);
            });

            if (p.target > weekdaysInMonth) alerts.push({ title: "Impossible Target", msg: `${p.name}: Target ${p.target} > Weekdays (${weekdaysInMonth}).`, type: "warning" });

            if (p.target > uniquePDays.length && uniquePDays.length > 0) {
                uniquePDays.forEach(d => {
                    if (popularMap[d] > 1) {
                        alerts.push({ title: "Low Risk", msg: `Day ${d}: ${p.name} needs this competitive day (Target ${p.target} > Preferred ${uniquePDays.length}).`, type: "info" });
                    }
                });
            }
        });

        Object.entries(avoidCounts).forEach(([day, count]) => {
            if (count >= 6) alerts.push({ title: "Likely Hole", msg: `Day ${day}: ${count} physicians avoiding. High risk gap.`, type: "error" });
            else if (count >= 4) alerts.push({ title: "Possible Hole", msg: `Day ${day}: ${count} physicians avoiding.`, type: "warning" });
        });

        Object.entries(popularMap).forEach(([day, count]) => {
            if (count >= 3) alerts.push({ title: "Low Risk: Popular Day", msg: `Day ${day}: ${count} physicians requested.`, type: "info" });
        });

        Object.entries(overrideSlotMap).forEach(([key, docs]) => {
            const [dayStr, slot] = key.split('_');
            const dayNum = parseInt(dayStr);
            const dOfWk = (new Date(yearNum, monthNum - 1, dayNum).getDay() + 6) % 7;
            const need = needsData.overrides[dayStr]?.[slot] !== undefined ? needsData.overrides[dayStr][slot] : (needsData.daily_needs[dOfWk.toString()]?.[slot] || 0);
            
            if (docs.size > 1) {
                alerts.push({ title: "High Risk: Override Conflict", msg: `Day ${dayNum} ${slot}: Overridden by multiple docs (${Array.from(docs).join(', ')}).`, type: "error" });
            }
            if (docs.size > need && need > 0) {
                alerts.push({ title: "Over-Staffed Override", msg: `Day ${dayNum} ${slot}: ${docs.size} overrides exceeds need of ${need}.`, type: "warning" });
            }
        });

        const totalT = activePhys.reduce((sum, p) => sum + (parseInt(p.target) || 0), 0);
        if (totalT < totalNeeded) alerts.push({ title: "Staffing Deficit", msg: `Total Targets (${totalT}) < Clinic Needs (${totalNeeded}). Holes likely.`, type: "error" });

        if (alerts.length === 0) frictionList.innerHTML = `<div class="p-4 text-[9px] text-outline italic text-center">No structural friction found.</div>`;
        else alerts.forEach(a => {
            const color = a.type === 'error' ? 'text-error' : (a.type === 'warning' ? 'text-amber-400' : 'text-primary');
            const icon = a.type === 'error' ? 'report' : (a.type === 'warning' ? 'warning' : 'info');
            frictionList.innerHTML += `<div class="px-4 py-2 border-b border-outline-variant/10 hover:bg-surface-container-highest/20 transition-all"><div class="flex items-center gap-2 mb-1"><span class="material-symbols-outlined text-sm ${color}">${icon}</span><span class="text-[9px] font-black uppercase tracking-tight ${color}">${a.title}</span></div><p class="text-[8px] text-on-surface-variant leading-tight">${a.msg}</p></div>`;
        });
    };

    function updateCalculations() {
        if (!totalPhysStat) return;
        const activePhys = rosterData.filter(p => p.active);
        totalPhysStat.textContent = rosterData.length;
        activePhysStat.textContent = activePhys.length;
        const totalT = activePhys.reduce((sum, p) => sum + (parseInt(p.target) || 0), 0);
        if (capacityTargets) capacityTargets.textContent = totalT;
        let totalNeeded = 0;
        const dInMonth = new Date(needsData.year, needsData.month, 0).getDate();
        for (let d = 1; d <= dInMonth; d++) {
            const date = new Date(needsData.year, needsData.month - 1, d); if (date.getDay() === 0 || date.getDay() === 6) continue;
            const dOfWk = (date.getDay() + 6) % 7;
            const am = needsData.overrides[d.toString()]?.AM !== undefined ? needsData.overrides[d.toString()].AM : (needsData.daily_needs[dOfWk.toString()]?.AM || 0);
            const pm = needsData.overrides[d.toString()]?.PM !== undefined ? needsData.overrides[d.toString()].PM : (needsData.daily_needs[dOfWk.toString()]?.PM || 0);
            totalNeeded += (parseInt(am) || 0) + (parseInt(pm) || 0);
        }
        if (capacityNeeds) capacityNeeds.textContent = totalNeeded;
        if (capacityBar && capacityPct) {
            const pct = totalNeeded > 0 ? Math.round((totalT / totalNeeded) * 100) : 0;
            capacityPct.textContent = pct + "%"; capacityBar.style.width = Math.min(pct, 100) + "%";
            capacityBar.className = (pct > 120) ? "bg-error h-full transition-all duration-500" : ((pct < 95) ? "bg-amber-500 h-full transition-all duration-500" : "bg-gradient-to-r from-primary to-secondary h-full transition-all duration-500");
        }
        if (window.renderFriction) window.renderFriction();
        renderSchedule(); // Sync Tab 3 labels/shell
    }

    function renderAll() { renderRoster(); renderCalendar(); renderSchedule(); updateCalculations(); }

    window.createCheckpoint = async () => {
        try {
            const resp = await fetch("/api/roster/checkpoint", { method: "POST" });
            const data = await resp.json();
            if (data.success) showToast("Checkpoint Created successfully", "success");
            else showToast("Failed to create checkpoint", "error");
        } catch(e) { showToast("Error creating checkpoint", "error"); }
    };

    window.restoreCheckpoint = async () => {
        if (!confirm("Are you sure you want to restore the last checkpoint? This will overwrite your current active changes.")) return;
        try {
            const resp = await fetch("/api/roster/restore", { method: "POST" });
            const data = await resp.json();
            if (data.success) {
                rosterData = data.physicians;
                renderRoster();
                updateCalculations();
                autoSaveRoster();
                showToast("Checkpoint Restored", "success");
            } else showToast("No Checkpoint found or failed to restore", "error");
        } catch(e) { showToast("Error restoring checkpoint", "error"); }
    };

    if (addBtn) addBtn.addEventListener("click", () => window.addPhysician());
    
    if (regenerateBtn) regenerateBtn.onclick = () => generateSchedule();
    if (undoBtn) undoBtn.addEventListener("click", () => window.undo());
    if (resetBtn) resetBtn.addEventListener("click", () => window.restoreCheckpoint());
    if (saveBtn) saveBtn.addEventListener("click", () => window.createCheckpoint());
    if (defaultBtn) defaultBtn.addEventListener("click", () => window.setDefaultRoster());
    if (clearDatesBtn) clearDatesBtn.addEventListener("click", () => window.clearDates());
    if (resetNeedsBtn) resetNeedsBtn.addEventListener("click", () => window.resetNeedsToStandards());
    if (saveNeedsBtn) saveNeedsBtn.addEventListener("click", () => saveData("needs"));

    const exportBtn = document.getElementById("export-btn");
    if (exportBtn) {
        exportBtn.addEventListener("click", (e) => {
            e.preventDefault();
            window.open("/api/export", "_blank");
        });
    }

    const importBtn = document.getElementById("import-btn");
    const importFile = document.getElementById("import-file");
    if (importBtn && importFile) {
        importBtn.addEventListener("click", () => importFile.click());
        importFile.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const formData = new FormData();
            formData.append("file", file);
            try {
                const resp = await fetch("/api/import", {
                    method: "POST",
                    body: formData
                });
                const data = await resp.json();
                if (data.success) {
                    showToast("Schedule Imported Successfully", "success");
                    loadInitial(); // reload everything
                } else {
                    showToast("Failed to Import: " + (data.error || "Unknown"), "error");
                }
            } catch (err) {
                showToast("Error importing file.", "error");
            }
        });
    }

    // Desperation Mode and Ratio Logic Listeners
    document.querySelectorAll('input[name="desperation"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            needsData.desperation_stage = parseInt(e.target.value);
            autoSaveNeeds();
        });
    });
    
    const ratioToggle = document.getElementById("ratio-logic-toggle");
    if (ratioToggle) {
        ratioToggle.addEventListener("change", (e) => {
            needsData.ratio_logic = e.target.checked;
            autoSaveNeeds();
        });
    }

    if (monthSelect) monthSelect.addEventListener("change", (e) => { 
        needsData.month = parseInt(e.target.value); 
        renderCalendar(); 
        if (scheduleResults) {
            // Clear current schedule result if month mismatch, forcing a re-render/regenerate
            if (scheduleResults.metadata && scheduleResults.metadata.month != needsData.month) scheduleResults = null;
        }
        renderSchedule();
        saveData("needs"); 
        updateCalculations(); 
    });
    if (yearSelect) yearSelect.addEventListener("change", (e) => { 
        needsData.year = parseInt(e.target.value); 
        renderCalendar(); 
        if (scheduleResults) {
            if (scheduleResults.metadata && scheduleResults.metadata.year != needsData.year) scheduleResults = null;
        }
        renderSchedule();
        saveData("needs"); 
        updateCalculations(); 
    });
    if (splitSelect) splitSelect.addEventListener("change", (e) => { needsData.split_day = e.target.value; renderCalendar(); saveData("needs"); updateCalculations(); });

    // View Mode Listener
    document.querySelectorAll('input[name="viewmode"]').forEach(radio => {
        if (radio.value === scheduleViewMode) radio.checked = true; // Set initial state
        radio.addEventListener('change', (e) => {
            scheduleViewMode = e.target.value;
            localStorage.setItem('scheduleViewMode', scheduleViewMode);
            renderSchedule();
        });
    });

    loadAllData();
});
