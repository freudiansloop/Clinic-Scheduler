import random
import datetime
from scheduler_logic import SchedulerLogic
from scheduler_models import Physician

def generate_random_scenario():
    print("--- GENERATING RANDOM SCENARIO ---")
    physicians = []
    names = ["DocA", "DocB", "DocC", "DocD", "DocE", "DocF", "DocG"]
    total_target = 0
    
    for n in names:
        tgt = random.randint(2, 6)
        total_target += tgt
        p = Physician(n, tgt)
        # Randomly assign constraints
        if random.random() < 0.3:
            p.half_month = "1st" if random.random() < 0.5 else "2nd"
        
        # Random preferred/avoid
        if random.random() < 0.4:
            d = random.randint(1, 28)
            p.preferred_str = f"{d} AM"
        
        physicians.append(p)
    
    print(f"Total Target Capacity: {total_target}")
    
    # Generate Needs
    needs = {}
    total_needs = 0
    for d in range(1, 29): # Feb-ish
        am = 1 if random.random() > 0.2 else 0
        pm = 1 if random.random() > 0.2 else 0
        needs[d] = {'AM': am, 'PM': pm}
        total_needs += (am + pm)
        
    print(f"Total Clinic Needs: {total_needs}")
    
    # Auto-Retry Logic Simulation
    best_logic = None
    min_open = 999
    
    for i in range(10):
        logic = SchedulerLogic(physicians, 2026, 2, needs)
        logic.run(algorithm="Proportional")
        if not logic.has_open_slots():
            print(f"✅ Success on try {i+1}")
            best_logic = logic
            break
        else:
             # loose counting
             curr_open = len([w for w in logic.warnings if "Unfilled" in w])
             if curr_open < min_open:
                 min_open = curr_open
                 best_logic = logic
    
    if best_logic.has_open_slots():
         print(f"⚠️ Failed after 10 retries. Best has {min_open} warnings.")
    else:
         print("✅ All slots filled.")

if __name__ == "__main__":
    for i in range(3):
        print(f"\nRun #{i+1}")
        generate_random_scenario()
