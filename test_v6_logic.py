import sys
import calendar
from datetime import datetime

# Import components from the script
# We'll use a trick to import from a filename with spaces
import importlib.util
spec = importlib.util.spec_from_file_location("scheduler_v6", "Scheduler v6.py")
v6 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v6)

def test_date_parsing():
    print("--- Testing Date Parsing (Ranges) ---")
    year, month = 2026, 1
    
    # Test 1: Simple Range
    res1 = v6.parse_date_input("3-5", year, month)
    print(f"Input '3-5': {res1}")
    # Expect: [{'day': 3, 'type': 'AM'}, {'day': 3, 'type': 'PM'}, {'day': 4, 'type': 'AM'}, {'day': 4, 'type': 'PM'}, {'day': 5, 'type': 'AM'}, {'day': 5, 'type': 'PM'}]
    assert len(res1) == 6
    
    # Test 2: Range with AM
    res2 = v6.parse_date_input("10-12 AM", year, month)
    print(f"Input '10-12 AM': {res2}")
    # Expect: Only AM for 10, 11, 12
    assert len(res2) == 3
    assert all(r['type'] == 'AM' for r in res2)

    # Test 3: Mixed
    res3 = v6.parse_date_input("1, 3-4 PM", year, month)
    print(f"Input '1, 3-4 PM': {res3}")
    # Expect: 1 (AM/PM) + 3-4 (PM)
    assert len(res3) == 4 # (1AM, 1PM, 3PM, 4PM)

    print("Date Parsing Tests Passed!")

def test_scheduler_logic():
    print("\n--- Testing Scheduler Logic (Auto-Split) ---")
    # Sample Physician
    p1 = v6.Physician("Tester", 2, active=True, half_month="1st")
    
    # Needs: 1 slot on day 15, 1 slot on day 16 (AM)
    needs = {15: {'AM': 1, 'PM': 0}, 16: {'AM': 1, 'PM': 0}}
    
    # Case 1: Split is 16. Tester (1st Half) should ONLY get day 15.
    logic = v6.SchedulerLogic([p1], 2026, 1, needs, split_day=16)
    logic.run()
    
    print(f"Physician shifts: {p1.assigned_shifts}")
    # Tester is 1st half. Split is 16. Valid days are < 16. 
    # Day 15 is valid. Day 16 is NOT.
    assert (15, 'AM') in p1.assigned_shifts
    assert (16, 'AM') not in p1.assigned_shifts
    
    print("Scheduler Logic (Splitting) Tests Passed!")

if __name__ == "__main__":
    try:
        test_date_parsing()
        test_scheduler_logic()
        print("\nALL LOGIC TESTS PASSED successfully.")
    except Exception as e:
        print(f"\nTEST FAILED: {str(e)}")
        sys.exit(1)
