import random
import calendar
from scheduler_logic import SchedulerLogic
from scheduler_models import Physician

class ScenarioBuilder:
    def __init__(self, name):
        self.name = name
        self.physicians = []
        self.needs = {}
        self.year = 2026
        self.month = 2
        self.last_day = 28
    
    def add_physician(self, name, target, half="All", full_day=True, avoids="", prefs=""):
        p = Physician(name, target, half_month=half, full_day_ok=full_day, avoid=avoids, preferred=prefs)
        self.physicians.append(p)
        return self

    def set_uniform_needs(self, am_needed=1, pm_needed=1):
        for d in range(1, self.last_day + 1):
            if calendar.weekday(self.year, self.month, d) >= 5: continue
            self.needs[d] = {'AM': am_needed, 'PM': pm_needed}
        return self
        
    def run(self, algorithm="Proportional", desperation=1, auto_balance=True):
        print(f"\n{'='*70}")
        print(f" SCENARIO: {self.name}")
        print(f" Algorithm: {algorithm} | Desperation: {desperation} | Auto-Balance: {auto_balance}")
        print(f"{'='*70}")
        
        # 1. Analyze Capacity
        total_target = sum(p.target for p in self.physicians)
        total_needs = sum(self.needs[d]['AM'] + self.needs[d]['PM'] for d in self.needs)
        
        print(f"\n[ANALYTICS]")
        print(f"Total Docs: {len(self.physicians)} | Total Targets: {total_target} | Total Needs: {total_needs}")
        if total_target < total_needs:
            print(f"WARNING: Under-capacity by {total_needs - total_target} shifts.")
        
        # 2. Run Logic
        # Update logic constructor for auto_balance if it exists (SchedulerLogic currently uses target logic)
        # Actually, let's just pass auto_balance?
        logic = SchedulerLogic(self.physicians, self.year, self.month, self.needs)
        # Manually force ratios if proportional and auto balance true (done inside logic)
        try:
            logic.run(algorithm=algorithm, desperation_stage=desperation)
        except Exception as e:
            print(f"CRITICAL FAULT: {e}")
            return False
        
        # 3. Analyze Coverage
        open_slots = 0
        filled_slots = 0
        for d in self.needs:
            for st in ['AM', 'PM']:
                needed = self.needs[d][st]
                actual = len(logic.schedule.get(d, {}).get(st, []))
                if actual < needed: open_slots += (needed - actual)
                filled_slots += actual
                
        # 4. Analyze Fairness (Deltas)
        print(f"\n[COVERAGE RESULTS]")
        if open_slots == 0:
            print(f"SUCCESS: All {filled_slots} slots filled.")
        else:
            print(f"FAILURE: {open_slots} slots remaining open. Filled {filled_slots}/{total_needs}.")
            
        print(f"\n[FAIRNESS METRICS  (Delta = Assigned - Target)]")
        deltas = []
        for p in logic.physicians:
            shifts_assigned = len(p.assigned_shifts)
            delta = shifts_assigned - p.target
            deltas.append(delta)
            
            # Formatted stats per doc
            status = "PERFECT" if delta == 0 else f"+{delta}" if delta > 0 else f"{delta}"
            print(f" - {p.name:<10} | Target: {p.target:>2} | Assigned: {shifts_assigned:>2} | Delta: {status:<8} | Constraints: {p.half_month}, Avoids: {p.avoid_str}")
        
        if deltas:
            max_d = max(deltas)
            min_d = min(deltas)
            spread = max_d - min_d
            print(f"\nDelta Spread (Max - Min): {spread}")
            if spread <= 1:
                print("CONCLUSION: Extremely Fair. Workload is distributed as evenly as mathematically possible.")
            elif spread == 2:
                print("CONCLUSION: Moderately Fair. Minor variations due to strict constraints.")
            else:
                print("CONCLUSION: Unfair Distributon detected. Some doctors took a disproportionately heavy load compared to others.")
        
        return open_slots == 0


def run_tests():
    # TEST 1: Simple / Typical Usage
    # Standard group of docs, perfect capacity match, no heavy constraints
    s1 = ScenarioBuilder("Test 1: Simple & Perfect Capacity Match")
    s1.add_physician("Alpha", 8).add_physician("Beta", 8)
    s1.add_physician("Charlie", 8).add_physician("Delta", 8)
    s1.add_physician("Echo", 8)  # 5 docs * 8 = 40 targets. 
    # 20 workdays * 2 shifts = 40 needs. Perfect match.
    s1.set_uniform_needs(1, 1).run()
    
    # TEST 2: Under-Capacity & Auto-Balancing (The Flexibility Test)
    # Docs want 20 shifts total, Clinic needs 40. 
    # Who absorbs the extra 20 shifts? Should be spread evenly among open docs.
    s2 = ScenarioBuilder("Test 2: Under-Capacity Auto-Balancing (Fairness Stress)")
    s2.add_physician("RigidDoc", 4, half="1st") # Can only work 1st half
    s2.add_physician("FlexDoc1", 4)
    s2.add_physician("FlexDoc2", 4)
    s2.add_physician("FlexDoc3", 4)
    s2.add_physician("FlexDoc4", 4)
    s2.set_uniform_needs(1, 1).run()
    
    # TEST 3: Extreme Constraints (Avoids & Half-Months)
    s3 = ScenarioBuilder("Test 3: Extreme Constraints & Desperation Level 1")
    # Total needs = 40.
    s3.add_physician("Avoids1", 10, avoids="1,2,3,4,5,8,9,10,11,12") # Hates early month
    s3.add_physician("Avoids2", 10, avoids="20,21,22,23,24,25,26,27,28") # Hates late month
    s3.add_physician("HalfEarly", 10, half="1st")
    s3.add_physician("HalfLate", 10, half="2nd")
    s3.set_uniform_needs(1, 1).run(desperation=1)
    
    # TEST 4: Double Booking Stress
    # Total Needs = 60 (3 docs a day!).
    s4 = ScenarioBuilder("Test 4: High Density (Checking Double Shifts)")
    s4.add_physician("NoDouble", 15, full_day=False) 
    s4.add_physician("YesDouble1", 15, full_day=True)
    s4.add_physician("YesDouble2", 15, full_day=True)
    s4.add_physician("YesDouble3", 15, full_day=True)
    s4.set_uniform_needs(2, 1).run()

if __name__ == "__main__":
    run_tests()
