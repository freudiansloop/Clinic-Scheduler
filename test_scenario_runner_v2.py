import random
import calendar
from scheduler_logic import SchedulerLogic
from scheduler_models import Physician

# ==========================================
# 🛠️ HELPER CLASSES
# ==========================================

class ScenarioBuilder:
    def __init__(self, name):
        self.name = name
        self.physicians = []
        self.needs = {}
        self.year = 2026
        self.month = 2
        self.last_day = 28
    
    def add_physician(self, name, target, half="All", full_day=True, avoids=""):
        p = Physician(name, target, half_month=half, full_day_ok=full_day, avoid=avoids)
        self.physicians.append(p)
        return self

    def set_uniform_needs(self, am_needed=1, pm_needed=1):
        for d in range(1, self.last_day + 1):
            if calendar.weekday(self.year, self.month, d) >= 5: continue
            self.needs[d] = {'AM': am_needed, 'PM': pm_needed}
        return self
        
    def set_spike_needs(self, day, am, pm):
        # We allow forcing a spike even on weekend if specifically requested, 
        # but realistically logic ignores it. 
        # For valid testing, we should probably stick to weekdays or update logic.
        # But let's assume if user asks for spike, they want it.
        # ...Logic currently ignores weekends HARD. So we should warn or skip.
        if calendar.weekday(self.year, self.month, day) >= 5: 
            print(f"WARNING: Setting needs on Day {day} (Weekend). Logic will ignore this!")
        self.needs[day] = {'AM': am, 'PM': pm}
        return self

    def run(self, algorithm="Proportional", desperation=0):
        print(f"\n{'='*60}")
        print(f" SCENARIO: {self.name.upper()}")
        print(f"{'='*60}")
        
        # 1. Analyze Capacity
        total_target = sum(p.target for p in self.physicians)
        total_needs = sum(self.needs[d]['AM'] + self.needs[d]['PM'] for d in self.needs)
        
        print(f" ANALYTICS:")
        print(f"   - Total Physicians: {len(self.physicians)}")
        print(f"   - Total Target Capacity: {total_target}")
        print(f"   - Total Clinic Needs:    {total_needs}")
        if total_target < total_needs:
            print(f"     IMPOSSIBLE: Capacity < Needs (Missing {total_needs - total_target} shifts)")
        else:
            print(f"     Theoretical Coverage: {total_target / total_needs * 100:.1f}%")

        # 2. Run Logic
        logic = SchedulerLogic(self.physicians, self.year, self.month, self.needs)
        logic.run(algorithm=algorithm, desperation_stage=desperation)
        
        # 3. Analyze Result
        open_slots = 0
        filled_slots = 0
        
        for d in self.needs:
            for st in ['AM', 'PM']:
                needed = self.needs[d][st]
                actual = len(logic.schedule.get(d, {}).get(st, []))
                if actual < needed:
                    open_slots += (needed - actual)
                filled_slots += actual
                
        print(f"\n RESULTS:")
        if open_slots == 0:
            print(f"    SUCCESS: All {filled_slots} slots filled.")
        else:
            print(f"    FAILURE: {open_slots} slots remaining open.")
            print(f"      (Filled {filled_slots}/{total_needs})")
            
        # 4. Diagnostics (Why fail?)
        if open_slots > 0:
            print(f"\n DIAGNOSTICS:")
            
            # BLAME LOGIC: Look at specific open slots
            shown_days = 0
            for d in range(1, self.last_day + 1):
                if d not in self.needs: continue
                for st in ['AM', 'PM']:
                    needed = self.needs[d][st]
                    actual = len(logic.schedule[d][st])
                    
                    if actual < needed:
                        if shown_days < 3: # Limit output spam
                            print(f"   [OPEN SLOT] Day {d} {st}")
                            # Check why each doc couldn't take it
                            for p in self.physicians:
                                reason = self.get_rejection_reason(logic, p, d, st)
                                if reason:
                                    print(f"      - {p.name}: {reason}")
                            shown_days += 1
                        elif shown_days == 3:
                            print(f"      ... (more open slots hidden) ...")
                            shown_days += 1

        return open_slots == 0

    def get_rejection_reason(self, logic, p, d, st):
        if not p.active: return "Inactive"
        
        # 1. Full Day Limit
        if not p.full_day_ok:
            for ad, at in p.assigned_shifts:
                if ad == d: return "Blocked by Full Day Limit (Already assigned)"

        # 2. Half Month
        if p.half_month == "1st" and d > 15: return "Blocked by 1st Half Limit"
        if p.half_month == "2nd" and d <= 15: return "Blocked by 2nd Half Limit"

        # 3. Already Assigned Same Slot (Not really a rejection, just valid)
        for ad, at in p.assigned_shifts:
            if ad == d and at == st: return None # They HAVE this slot (or double assignment logic)
        
        # 4. Avoids
        # Need to parse their avoid string directly since logic obj doesn't expose it easily per call
        # We can implement a mini parser or check logic warnings (harder).
        # Let's simple check string presence for this v2 runner
        if str(d) in p.avoid_str: # Very naive check for "Constraint" demo
             return "Blocked by Avoid Date"
             
        # 5. Theoretical Availability
        return "theoretically available (Algorithm skipped?)"


# ==========================================
# 🚀 TEST SUITE
# ==========================================

def run_suite():
    # 1. Baseline
    s1 = ScenarioBuilder("Baseline: Easy Mode")
    s1.add_physician("Doc1", 10).add_physician("Doc2", 10).add_physician("Doc3", 10)
    s1.set_uniform_needs(1, 0) # 28 shifts total
    s1.run()

    # 2. Stress: High Load (Exact Capacity)
    s2 = ScenarioBuilder("Stress 1: 100% Load")
    s2.add_physician("DocA", 14).add_physician("DocB", 14)
    s2.set_uniform_needs(1, 0) # 28 total
    s2.run()

    # 3. Constraint: Half Month Split
    # Needs are uniform, but Docs are split rigidly. 
    # Logic must balance them perfectly or fail.
    s3 = ScenarioBuilder("Constraint 1: The Great Divide (Half Month)")
    s3.add_physician("EarlyBird", 15, half="1st") # Days 1-15
    s3.add_physician("NightOwl", 15, half="2nd")  # Days 16-28
    s3.set_uniform_needs(1, 0)
    s3.run()

    # 4. Constraint: Full Day Blockade
    # Needs are 2 per day (AM+PM). Docs have capacity but NO double shifts allowed.
    # Total Needs: 56. Capacity: 60.
    # If logic puts DocA in AM, it CANNOT put DocA in PM same day.
    s4 = ScenarioBuilder("Constraint 2: No Double Shifts")
    s4.add_physician("DocX", 20, full_day=False)
    s4.add_physician("DocY", 20, full_day=False)
    s4.add_physician("DocZ", 20, full_day=False)
    s4.set_uniform_needs(1, 1) 
    s4.run()

    # 5. Complexity: "The Perfect Storm"
    # High Load + Specific Avoids on High Need Days
    s5 = ScenarioBuilder("Complexity: The Perfect Storm")
    s5.add_physician("BusyDoc", 10, avoids="1,2,3,4,5") # Avoids first week
    s5.add_physician("FreeDoc", 5)
    s5.set_uniform_needs(0, 0)
    s5.set_spike_needs(1, 1, 0) # Day 1 needs 1
    s5.set_spike_needs(2, 1, 0)
    s5.set_spike_needs(3, 1, 0)
    s5.set_spike_needs(15, 1, 1) # Mid month spike
    # Total needs small, but constraints tight on early days
    s5.run()
    
    # 6. Desperation Test
    # Impossible constraints that require breaking rules
    s6 = ScenarioBuilder("Desperation: Rule Breaking Needed")
    s6.add_physician("Stubborn", 5, avoids="1,2,3,4,5")
    s6.set_uniform_needs(0, 0)
    s6.set_spike_needs(1, 1, 0) # Day 1 needs 1, but Stubborn avoids it.
    print("\n--- Running Safe Mode (Should Fail) ---")
    s6.run(desperation=0)
    print("\n--- Running Desperation Stage 2 (Should Pass via Ignore Avoid) ---")
    s6.run(desperation=2)

if __name__ == "__main__":
    run_suite()
