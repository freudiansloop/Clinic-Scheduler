# Clinic Physician Scheduler Pro - Documentation

## Overview

**Clinic Physician Scheduler Pro** is a Python-based desktop application (GUI) designed to automate the complex process of assigning physician shifts. It uses a custom algorithm to balance requested targets, specific scheduling needs per day (AM/PM), personal preferences, and constraints.

**Current Version:** V5 (`Scheduler v5.py`)

## 🧠 Scheduling Algorithm Logic

The core logic resides in the `SchedulerLogic` class and operates in four distinct phases. It runs completely each time "REGENERATE SCHEDULE" is clicked.

### Phase 1: Hard Overrides ("The Nuclear Option")
*   **Input:** Dates entered in the "Override" field for a physician.
*   **Behavior:** 
    *   The system *forces* an assignment for the specified date and shift.
    *   It **ignores** almost all constraints (Target limits, Half-month restrictions).
    *   It **checks** but only **warns** about Avoidance conflicts or if the clinic slot isn't actually needed (i.e., slot is closed).
    *   *Use Case:* Fixed administrative days or mandatory shifts.

### Phase 2: Preferences
*   **Input:** Dates entered in the "Preferred" field.
*   **Behavior:** 
    *   The system attempts to grant these requests.
    *   **Conditions for Assignment:**
        1.  The clinic is open and needs a doctor for that slot.
        2.  The doctor has NOT reached their Target number of shifts.
        3.  The date is not listed in their "Avoid" list.
        4.  The date respects their "Half Month" setting (e.g., a "1st Half" doctor won't get a preferred date in the 2nd half).
    *   If any condition fails, the preference is skipped, and a warning is logged.

### Phase 3: Randomized Round Robin (The Filler)
*   **Input:** Remaining open clinic slots and physicians who haven't met their targets.
*   **Behavior:**
    *   The system iterates in a round-robin fashion through eligible physicians.
    *   **Non-Deterministic Selection:** For each turn, the system finds **ALL** valid available slots for that specific physician.
        *   *Valid* means: Clinic needs a doc, doc is free that AM/PM, doc doesn't avoid that date, and date fits half-month restriction.
    *   It selects **ONE** of those valid slots at **RANDOM**.
    *   This randomness ensures that if you re-run the schedule, you get a slightly different result, preventing one doctor from always getting the "bad" Mondays if they are first in the list.

### Phase 4: Audits & Validation
*   **Behavior:** After filling as much as possible, the system runs a final check:
    *   **Target Unmet:** Warns if a doctor has fewer shifts than their Target.
    *   **Unfilled Slots:** Critically warns if the clinic is understaffed on any day compared to the "Needs".

---

## ✨ Feature Inventory

### 1. Physician Roster Management (Tab 1)
*   **CRUD Operations:** Add new physicians, Delete physicians, Edit details.
*   **Ordering:** Move doctors up/down (Order dictates priority in the Round Robin phase).
*   **State Persistence:** Automatically saves roster state to `physician_state.json`.
*   **Undo Function:** Reverts changes to the roster (last 10 states).
*   **Reset Defaults:** Restores the roster to a hardcoded standard list.

### 2. Constraints & Rules
*   **Target System:** Define exactly how many shifts each doctor should get.
*   **Half-Month Splitting:**
    *   Global setting for when the "2nd Half" starts (Default: 16th, adjustable).
    *   Per-physician setting: "All Month", "1st Half Only", or "2nd Half Only".
*   **Date Inputs:** Flexible parsing for Preferences/Avoids/Overrides:
    *   `12` (Both AM/PM on the 12th)
    *   `12 AM`, `14 PM` (Specific shifts)
    *   Comma-separated lists.
*   **Avoidance Logic:** Prevents assignment unless overruled by an Override.
*   **Conflict Detection:** Prevents assigning a doctor to a slot they are already working.

### 3. Clinic Needs Management (Tab 2)
*   **Custom Grid:** visually toggle AM/PM slots for every day of the month.
*   **Staffing Levels:** Set how many doctors are needed (0, 1, or 2) per slot.
*   **Visual Feedback:** Blue for standard clinic, Red for closed/weekend.

### 4. Interactive Schedule Visualization (Tabs 3 & 3.5)
*   **Standard View:** Gray-scale view distinguishing AM (Light Gray) vs PM (Dark Gray).
*   **Colored View:** Uses physician-specific colors for at-a-glance identification.
*   **Statistics:** Real-time table showing Target vs. Actual shifts and the Net difference.
*   **Issues Log:** Text box listing all conflicts, unmet targets, and unfilled slots.

### 5. Excel Import/Export (Tab 4)
*   **Export:** Generates a professional `.xlsx` file.
    *   *Sheet 1:* Formatted "Group A / Group B" template for printing. Includes "Overflow" logic (if >1 doc is scheduled, the second goes to Group B or is listed as overflow).
    *   *Sheet 2:* A visual calendar view.
*   **State Embedding:** The export function **hides the full application state (JSON)** in Cell `A80` of Sheet 2.
*   **Import:** You can load a schedule Excel file, and the app will read Cell `A80` to restore the exact roster, targets, and preferences used to generate that schedule.

---

## 🛠️ Dependencies

The script relies on the following Python libraries. Using a Conda environment (as suggested by `Instructions.txt`) is recommended.

**Standard Library (Built-in)**
*   `tkinter`: GUI Toolkit
*   `calendar`: Date management
*   `datetime`: Time usage
*   `random`: Algorithm randomization
*   `json`: Data storage
*   `os`, `sys`, `copy`: System operations

**External Packages (Need Installation)**
*   `customtkinter`: For the modern, dark-mode UI elements.
    *   *Install:* `pip install customtkinter`
*   `openpyxl`: For reading/writing Excel files.
    *   *Install:* `pip install openpyxl`

---

## 📂 File Structure

*   `Scheduler v5.py`: Main application script.
*   `physician_state.json`: Automatically created file storing your saved roster.
*   `Instructions.txt`: Quick reminder for environment activation (`conda activate scheduler_env`).
