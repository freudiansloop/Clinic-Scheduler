import unittest
from scheduler_utils import parse_date_input
from scheduler_models import Physician
from scheduler_logic import SchedulerLogic

class TestSchedulerUtils(unittest.TestCase):
    def test_parse_range_simple(self):
        # "3-5" -> 3 AM/PM, 4 AM/PM, 5 AM/PM
        res = parse_date_input("3-5", 2026, 1)
        # 3 days * 2 shifts = 6 items
        self.assertEqual(len(res), 6)
        days = sorted(list(set(r['day'] for r in res)))
        self.assertEqual(days, [3, 4, 5])
    
    def test_parse_range_shift(self):
        # "10-12 AM"
        res = parse_date_input("10-12 AM", 2026, 1)
        self.assertEqual(len(res), 3)
        for r in res:
            self.assertEqual(r['type'], "AM")
        days = sorted([r['day'] for r in res])
        self.assertEqual(days, [10, 11, 12])
        
    def test_parse_mixed(self):
        # "1, 3-4 PM"
        res = parse_date_input("1, 3-4 PM", 2026, 1)
        # Day 1: AM & PM (2)
        # Day 3: PM (1)
        # Day 4: PM (1)
        self.assertEqual(len(res), 4)

class TestSchedulerLogic(unittest.TestCase):
    def setUp(self):
        self.p1 = Physician("DocA", 2, active=True, half_month="1st") # Valid: D1-15
        self.p2 = Physician("DocB", 2, active=True, half_month="2nd") # Valid: D16+
        self.needs = {d: {'AM': 1, 'PM': 1} for d in range(1, 32)}
        
    def test_split_logic(self):
        # Logic with split day 16
        logic = SchedulerLogic([self.p1, self.p2], 2026, 1, self.needs, split_day=16)
        
        # Manually force run or just test helpers
        valid_p1 = logic.get_valid_days(self.p1)
        # p1 is 1st half, so days < 16. Also exclude weekends.
        for d in valid_p1:
            self.assertLess(d, 16)
            
        valid_p2 = logic.get_valid_days(self.p2)
        # p2 is 2nd half, so days >= 16.
        for d in valid_p2:
            self.assertGreaterEqual(d, 16)

    def test_override_assignment(self):
        # Force DocA on Day 20 (Conflict with 1st Half rule, but override wins)
        self.p1.override_str = "20" 
        logic = SchedulerLogic([self.p1], 2026, 1, self.needs, split_day=16)
        logic.run()
        
        # Check if D20 assigned
        assigned_days = [d for d, t in self.p1.assigned_shifts]
        self.assertIn(20, assigned_days)
        # Should have a warning about half-month or just ignored? 
        # Logic V5/V6 doesn't explicitly warn on Half-Month violation if Override is used, 
        # it just does it. But logic.can_assign might catch avoid.
        
if __name__ == '__main__':
    unittest.main()
