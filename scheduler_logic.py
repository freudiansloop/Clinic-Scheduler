import calendar
import random
from scheduler_utils import parse_date_input

class SchedulerLogic:
    def __init__(self, physicians, year, month, daily_needs, split_day=16):
        self.physicians = [p for p in physicians if p.active]
        self.year = year
        self.month = month
        self.daily_needs = daily_needs # Expected format: { day: { 'AM': need, 'PM': need } }
        self.split_day = split_day
        self.schedule = {} 
        self.warnings = [] 
        
        _, self.last_day = calendar.monthrange(year, month)
        for d in range(1, self.last_day + 1):
            self.schedule[d] = {'AM': [], 'PM': []}

    def is_weekend(self, day):
        weekday = calendar.weekday(self.year, self.month, day)
        return weekday >= 5

    def can_assign(self, physician, day, shift_type, check_target=True, check_avoid=True, check_half=True, check_full_day=True):
        if not physician.active: return False
        
        # 1. Already Assigned to this exact slot?
        for assigned_d, assigned_t in physician.assigned_shifts:
            if assigned_d == day and assigned_t == shift_type:
                return False

        # 2. Target Check
        if check_target and len(physician.assigned_shifts) >= physician.target:
            return False

        # 3. Half-Month Check
        if check_half:
            if physician.half_month == "1st" and day >= self.split_day: return False
            if physician.half_month == "2nd" and day < self.split_day: return False

        # 4. Full Day Check (If they don't do full days, check if they are already working the OTHER shift today)
        if check_full_day and not physician.full_day_ok:
            other_type = 'PM' if shift_type == 'AM' else 'AM'
            for assigned_d, assigned_t in physician.assigned_shifts:
                if assigned_d == day and assigned_t == other_type:
                    return False

        # 5. Avoidance Check
        if check_avoid:
            avoids = parse_date_input(physician.avoid_str, self.year, self.month)
            for av in avoids:
                if av['day'] == day and av['type'] == shift_type:
                    return False

        return True

    def run(self, algorithm="Standard", desperation_stage=1):
        # Reset physician states
        for p in self.physicians:
            p.assigned_shifts = []

        # Phase 1: Overrides (Ignore Target, Ignore Avoid, Ignore Half)
        # But we still check if the doctor is ALREADY in the slot.
        self.assign_overrides()

        # Phase 2: Preferences (Strict Constraints)
        self.assign_preferences()

        # Phase 3: Randomized Round Robin (The "Filler")
        self.run_round_robin(algorithm)

        # Phase 4: Desperation (Only if requested and holes remain)
        if self.has_open_slots() and desperation_stage > 0:
            self.run_desperation(desperation_stage)

        # Final Audit
        self.run_audits()

    def assign_overrides(self):
        for p in self.physicians:
            overrides = parse_date_input(p.override_str, self.year, self.month)
            for req in overrides:
                d, s_type = req['day'], req['type']
                if d > self.last_day: continue
                
                # We check only basic conflict (already in slot)
                if any(ad == d and at == s_type for ad, at in p.assigned_shifts): continue

                needed = self.daily_needs.get(d, {}).get(s_type, 0)
                current = len(self.schedule[d][s_type])

                # Assign regardless of target/avoid, but warn if slot wasn't needed
                if current < needed:
                    self.schedule[d][s_type].append(p.name)
                    p.assigned_shifts.append((d, s_type))
                else:
                    # In v1.6.0, overrides still happened even if "not needed" in some contexts?
                    # We'll allow it but warn.
                    self.schedule[d][s_type].append(p.name)
                    p.assigned_shifts.append((d, s_type))
                    self.warnings.append(f"[OVERRIDE] {p.name} assigned D{d} {s_type} (Capacity exceeded).")

    def assign_preferences(self):
        for p in self.physicians:
            prefs = parse_date_input(p.preferred_str, self.year, self.month)
            for req in prefs:
                d, s_type = req['day'], req['type']
                if d > self.last_day: continue

                needed = self.daily_needs.get(d, {}).get(s_type, 0)
                current = len(self.schedule[d][s_type])

                if current < needed and self.can_assign(p, d, s_type):
                    self.schedule[d][s_type].append(p.name)
                    p.assigned_shifts.append((d, s_type))

    def run_round_robin(self, algorithm="Ratio"):
        # We iterate and pick one valid slot at random for each doc until stable
        max_iterations = self.last_day * len(self.physicians) * 2
        
        for _ in range(max_iterations):
            if not self.has_open_slots(): break
            
            # Identify eligible doctors
            eligible = [p for p in self.physicians if len(p.assigned_shifts) < p.target]
            
            # Statistical Gravity Tie-Breaker:
            # Instead of a pure random.shuffle(), we use their original list position as a tiny weight penalty.
            # random() produces 0.0 - 1.0. A doctor 10 spots down gets a +0.5 penalty.
            # This makes lower-ranked physicians statistically lose ties slightly more often.
            def round_robin_sort_key(p):
                try:
                    row_idx = self.physicians.index(p)
                except ValueError:
                    row_idx = 0
                
                tiebreaker = random.random() + (row_idx * 0.05)
                
                if algorithm == "Ratio":
                    # Primary: How many shifts away from target they are (most needy first).
                    # Secondary: The weighted tiebreaker.
                    deficit = len(p.assigned_shifts) - p.target
                    return (deficit, tiebreaker)
                else: # Standard Mode
                    return (tiebreaker,)
            
            eligible.sort(key=round_robin_sort_key)
            
            assigned_someone = False
            for p in eligible:
                # Find ALL valid slots for THIS specific physician
                possible_slots = []
                for d in range(1, self.last_day + 1):
                    if self.is_weekend(d): continue
                    for s_type in ['AM', 'PM']:
                        needed = self.daily_needs.get(d, {}).get(s_type, 0)
                        current = len(self.schedule[d][s_type])
                        if current < needed and self.can_assign(p, d, s_type):
                            possible_slots.append((d, s_type))
                
                if possible_slots:
                    pick_d, pick_t = random.choice(possible_slots)
                    self.schedule[pick_d][pick_t].append(p.name)
                    p.assigned_shifts.append((pick_d, pick_t))
                    assigned_someone = True
                    break # Restart sort and iterate
            
            if not assigned_someone: break

    def run_desperation(self, stage):
        # Stages of ignoring constraints to fill holes
        # 1. Ignore Target
        # 2. Ignore Half-Month
        # 3. Ignore Avoid/Full-Day
        
        strategies = [
            {'check_target': False},
            {'check_target': False, 'check_half': False},
            {'check_target': False, 'check_half': False, 'check_avoid': False, 'check_full_day': False}
        ]
        
        for i in range(min(stage, len(strategies))):
            if not self.has_open_slots(): break
            config = strategies[i]
            
            for d in range(1, self.last_day + 1):
                if self.is_weekend(d): continue
                for s_type in ['AM', 'PM']:
                    needed = self.daily_needs.get(d, {}).get(s_type, 0)
                    current = len(self.schedule[d][s_type])
                    
                    while current < needed:
                        # Find best candidates for this specific hole
                        candidates = [p for p in self.physicians]
                        random.shuffle(candidates)
                        candidates.sort(key=lambda p: len(p.assigned_shifts)) # Spare those already over-worked
                        
                        found = False
                        for p in candidates:
                            if self.can_assign(p, d, s_type, **config):
                                self.schedule[d][s_type].append(p.name)
                                p.assigned_shifts.append((d, s_type))
                                self.warnings.append(f"[DESPERATION] {p.name} assigned to D{d} {s_type} (Level {i+1})")
                                found = True
                                break
                        
                        if not found: break
                        current = len(self.schedule[d][s_type])

    def has_open_slots(self):
        for d in range(1, self.last_day + 1):
            if self.is_weekend(d): continue
            for s_type in ['AM', 'PM']:
                needed = self.daily_needs.get(d, {}).get(s_type, 0)
                current = len(self.schedule[d][s_type])
                if current < needed:
                    return True
        return False

    def run_audits(self):
        # Physician targets
        for p in self.physicians:
            if len(p.assigned_shifts) < p.target:
                self.warnings.append(f"[UNMET TARGET] {p.name} - Goal: {p.target}, Got: {len(p.assigned_shifts)}")
        
        # Clinic Holes
        for d in range(1, self.last_day + 1):
            if self.is_weekend(d): continue
            for s_type in ['AM', 'PM']:
                needed = self.daily_needs.get(d, {}).get(s_type, 0)
                current = len(self.schedule[d][s_type])
                if current < needed:
                    self.warnings.append(f"[CRITICAL] Clinic Hole on D{d} {s_type}")
