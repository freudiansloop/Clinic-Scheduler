
from scheduler_logic import SchedulerLogic
from scheduler_models import Physician

# TEST: Burden of Flexibility
# Scenario:
# Doc Flexible: Target 2. No Avoids.
# Doc Rigid: Target 2. Avoids Day 2.
# Needs: Day 1 (1 slot), Day 2 (1 slot).
# Total Available: 4 Capacity vs 2 Needs. (Easy, but we simulate Desperation Logic by pre-filling them)

# To test Desperation Fairness specifically:
# We will set Targets to 0 so they are "At Target" instantly.
# Then we ask for 2 shifts.
# Logic should give 1 to Flex, 1 to Rigid.
# ISSUE hypothesis: If Day 1 is processed first, who gets it?
# Both are Delta 0. Random choice or Target (Tie).
# If Flex gets Day 1 (now Delta +1).
# Day 2 comes up. Rigid AVOIDS Day 2.
# Flex MUST take Day 2. (Now Delta +2).
# Result: Flex +2, Rigid +0. UNFAIR.
# Desired: Rigid takes Day 1. Flex takes Day 2. (Both +1).

def test_fairness():
    print("--- TESTING FAIRNESS (Flexibility Burden) ---")
    
    # Setup
    p_flex = Physician("Dr. Flex", target=0, avoid="")
    p_rigid = Physician("Dr. Rigid", target=0, avoid="2") # Cannot do Day 2
    
    # We force them into Desperation Mode by having Target=0 but Needs > 0
    # Desperation Stage 1 (Ignore Target)
    
    logic = SchedulerLogic([p_flex, p_rigid], 2024, 1, daily_needs={
        1: {'AM': 1, 'PM': 0}, # Both can do
        2: {'AM': 1, 'PM': 0}  # Only Flex can do
    })
    
    # Run Desperation Stage 1
    # We skip standard run or just let it fail (targets are 0)
    print("Running Desperation Stage 1...")
    logic.run_desperation(stage=1)
    
    count_flex = len(p_flex.assigned_shifts)
    count_rigid = len(p_rigid.assigned_shifts)
    
    print(f"Dr. Flex  (No Avoids): {count_flex} shifts")
    print(f"Dr. Rigid (Avoid D2) : {count_rigid} shifts")
    
    if count_flex == 2 and count_rigid == 0:
        print("UNFAIR RESULT REPRODUCED: Flexible Doc took all shifts.")
    elif count_flex == 1 and count_rigid == 1:
        print("FAIR RESULT: Shifts distributed evenly.")
    else:
        print(f"❓ OTHER RESULT: {count_flex} vs {count_rigid}")

if __name__ == "__main__":
    test_fairness()
