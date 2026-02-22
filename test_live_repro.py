
import json
from scheduler_logic import SchedulerLogic
from scheduler_models import Physician

# TEST: Live Roster Simulation
# We load the physicians from the JSON state.
# We apply a heavy load to force Desperation Mode.
# We analyze the distribution of assignments.

def test_live_roster():
    print("--- TESTING LIVE ROSTER FAIRNESS ---")
    
    # 1. Load Data
    with open('physician_state.json', 'r') as f:
        data = json.load(f)
    
    physicians = [Physician.from_dict(d) for d in data.get('physicians', [])]
    
    # 2. Setup Needs: Heavy Load
    # Total Target is ~24. Let's ask for 35 shifts. (11 extras).
    # We distribute them across the month to hit various constraints.
    # Month: January 2026 (31 days)
    
    daily_needs = {}
    total_needed = 0
    
    # Weekdays only (Standard clinic)
    # 1st-15th (1st Half): Heavy load to test Gandhi vs Rendon
    # 16th-31st (2nd Half): Heavy load to test Wesley vs Others
    
    for d in range(1, 32):
        # Weekday check implicitly handled by logic but let's just spam needs
        # Logic will ignore weekend needs if we set them, so let's stick to M-F to be accurate
        # Jan 2026: 1st is Thu.
        import calendar
        if calendar.weekday(2026, 1, d) >= 5: continue
        
        # AM/PM for everyone
        daily_needs[d] = {'AM': 1, 'PM': 1} 
        total_needed += 2

    # Detailed setup to force "Double Shift" constraint conflicts
    # Physicians who are !full_day_ok can only take 1 per day.
    
    print(f"Total Needs: {total_needed}")
    total_target = sum(p.target for p in physicians)
    print(f"Total Target: {total_target}")
    print(f"Desperation Gap: {total_needed - total_target}")

    logic = SchedulerLogic(physicians, 2026, 1, daily_needs, split_day=16)
    
    # RUN (Desperation Stage 1)
    logic.run(algorithm="Proportional", desperation_stage=1)
    
    # REPORT
    print("\n--- RESULTS ---")
    print(f"{'Name':<10} | {'Tgt':<5} | {'Act':<5} | {'Delta':<5} | {'Constraints'}")
    print("-" * 60)
    
    for p in logic.physicians:
        delta = len(p.assigned_shifts) - p.target
        constraints = []
        if p.half_month != "All": constraints.append(p.half_month)
        if not p.full_day_ok: constraints.append("NoFull")
        if p.avoid_str: constraints.append(f"Av:{p.avoid_str}")
        
        days_list = sorted([d for d, t in p.assigned_shifts])
        c_str = ", ".join(constraints)
        print(f"{p.name:<10} | {p.target:<5} | {len(p.assigned_shifts):<5} | {delta:<5} | {days_list}")

if __name__ == "__main__":
    test_live_roster()
