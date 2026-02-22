import calendar
import random
from scheduler_utils import parse_date_input

class SchedulerLogic:
    def __init__(self, physicians, year, month, daily_needs, split_day=16):
        self.physicians = [p for p in physicians if p.active]
        self.year = year
        self.month = month
        self.daily_needs = daily_needs
        self.split_day = split_day
        self.schedule = {} 
        self.logs = []
        self.warnings = [] 
        self.desperation_assignments = set() # (day, type, name)
        
        _, self.last_day = calendar.monthrange(year, month)
        for d in range(1, self.last_day + 1):
            self.schedule[d] = {'AM': [], 'PM': []}
            
    def is_weekend(self, day):
        weekday = calendar.weekday(self.year, self.month, day)
        return weekday >= 5

    def get_valid_days(self, physician):
        valid = []
        for d in range(1, self.last_day + 1):
            if self.is_weekend(d): continue
            
            # Use dynamic split day
            if physician.half_month == "1st" and d >= self.split_day: continue
            if physician.half_month == "2nd" and d < self.split_day: continue
            
            valid.append(d)
        return valid

    def can_assign(self, physician, day, shift_type, check_avoid=True):
        if not physician.active: return False
        
        # Check Full Day Constraint
        if not physician.full_day_ok:
            for assigned_d, assigned_t in physician.assigned_shifts:
                if assigned_d == day: # Already working this day
                     return False
                     
        # Check 1st Half / 2nd Half Constraint
        if physician.half_month == "1st" and day > self.split_day - 1: return False # Adjusted to be consistent with split_day logic
        if physician.half_month == "2nd" and day < self.split_day: return False
        
        if check_avoid:
            avoids = parse_date_input(physician.avoid_str, self.year, self.month)
            for avoid in avoids:
                if avoid['day'] == day and avoid['type'] == shift_type:
                    self.warnings.append(f"Avoidance Conflict: {physician.name} avoided D{day} {shift_type} but was placed via override.")
                    return False

        for assigned_d, assigned_t in physician.assigned_shifts:
            if assigned_d == day and assigned_t == shift_type:
                return False
        
        return True

    def run(self, algorithm="Standard", desperation_stage=0):
        if algorithm == "Proportional":
            self.run_proportional()
        else:
            self.run_standard()
            
        if self.has_open_slots() and desperation_stage > 0:
            self.run_desperation(desperation_stage)

    def run_standard(self):
        self.warnings = []
        for p in self.physicians:
            p.assigned_shifts = []

        # 1. Overrides
        self.assign_overrides()

        # 2. Preferences
        self.assign_preferences()

        # 3. Round Robin (Standard)
        phys_idx = 0
        max_iterations = len(self.physicians) * self.last_day * 2 * 3

        for i in range(max_iterations):
            eligible_physicians = [p for p in self.physicians if len(p.assigned_shifts) < p.target]

            if not eligible_physicians: break

            # Check for any open slots
            if not self.has_open_slots(): break

            p_index = phys_idx % len(eligible_physicians)
            p = eligible_physicians[p_index]

            if self.try_assign_hardest_slot(p):
                phys_idx += 1
            else:
                phys_idx += 1

        # 4. Audits
        self.run_audits()

    def run_proportional(self):
        """
        Prioritizes physicians who are farthest from their target (Assign/Target ratio).
        Iterates through the sorted list until someone takes a slot.
        """
        self.warnings = []
        for p in self.physicians:
            p.assigned_shifts = []

        # 1. Overrides
        self.assign_overrides()

        # 2. Preferences
        self.assign_preferences()

        max_iterations = 2000
        for _ in range(max_iterations):
            if not self.has_open_slots():
                break

            # Sort applicable physicians by completion ratio (Ascending)
            # We filter for active docs who have ANY chance of working (target > 0)
            eligible = [p for p in self.physicians if p.active and p.target > 0]
            
            if not eligible: break

            # Sort keys: 
            # 1. Delta (Assigned - Target) - Most negative (largest deficit) goes first.
            # 2. Random - Tie breaker (Ensures random distribution of deficits)
            eligible.sort(key=lambda p: (len(p.assigned_shifts) - p.target, random.random()))
            
            assigned_someone = False
            
            # Iterate down the list!
            for p in eligible:
                # check if they are full
                if len(p.assigned_shifts) >= p.target:
                    continue 

                # V11: Use Hardest Slot Logic here too
                if self.try_assign_hardest_slot(p):
                    assigned_someone = True
                    break # We filled a slot! Restart sort.
            
            if not assigned_someone:
                 # If we went through the ENTIRE list and no one could take a slot, we are stuck.
                 break
        
        # 4. Audits
        self.run_audits()

    def run_desperation(self, stage):
        """
        Stage 1: Ignore Target, Ignore Half-Month
        Stage 2: Ignore above + Ignore Avoid, Ignore Full Day OK
        """
        # We process levels sequentially to use the "least bad" option first
        
        # LEVELS for Stage 1
        levels = []
        levels.append("IGNORE_TARGET_ONLY") # Level 1 (implied, we just pick anyone)
        levels.append("IGNORE_HALF")        # Level 2
        
        if stage >= 2:
             levels.append("IGNORE_AVOID")    # Level 3
             levels.append("IGNORE_FULLDAY")  # Level 4
             levels.append("IGNORE_ALL")      # Nuclear
        
        for lvl in levels:
             if not self.has_open_slots(): break
             
             # NEW STRATEGY (V10): Sort Slots by Difficulty
             # We want to fill the "Hard" slots (fewest candidates) first.
             # This prevents the "Burden of Flexibility" where flexible docs fill easy slots early,
             # and then are forced to fill hard slots later, ending up with way more shifts.
             
             # 1. Gather all open slots
             open_slots = []
             for d in range(1, self.last_day + 1):
                 if d not in self.daily_needs: continue
                 for s_type in ['AM', 'PM']:
                     needed = self.daily_needs[d].get(s_type, 0)
                     current = len(self.schedule[d][s_type])
                     if current < needed:
                         # Calculate Difficulty: How many active docs can possibly take this slot at this level?
                         # (We don't need exact check, just a rough count of who isn't blocked by static constraints)
                         possible_count = 0
                         for p in self.physicians:
                             if not p.active: continue
                             # Check basic blocking for this level
                             is_blocked = False
                             
                             # Check Half Month (unless ignored)
                             if lvl not in ["IGNORE_HALF", "IGNORE_AVOID", "IGNORE_FULLDAY", "IGNORE_ALL"]:
                                 if (p.half_month == "1st" and d > self.split_day - 1) or (p.half_month == "2nd" and d < self.split_day):
                                     is_blocked = True
                             
                             # Check Avoid (unless ignored)
                             if not is_blocked and lvl not in ["IGNORE_AVOID", "IGNORE_FULLDAY", "IGNORE_ALL"]:
                                 pass 

                             if not is_blocked:
                                 possible_count += 1
                                 
                         candidates_for_slot = 0
                         for p in self.physicians:
                             if self.can_assign_at_level(p, d, s_type, lvl):
                                 candidates_for_slot += 1
                         
                         open_slots.append({
                             'day': d, 'type': s_type,
                             'candidates': candidates_for_slot
                         })

             # 2. Sort Open Slots: Fewest Candidates First
             random.shuffle(open_slots) 
             open_slots.sort(key=lambda x: x['candidates'])
             
             # 3. Fill them in order
             for slot in open_slots:
                 d, s_type = slot['day'], slot['type']
                 
                 needed = self.daily_needs[d].get(s_type, 0)
                 current = len(self.schedule[d][s_type])
                 
                 while current < needed:
                     assigned = self.try_assign_desperate_slot(d, s_type, lvl)
                     if assigned:
                         current += 1
                     else:
                         break 

    def can_assign_at_level(self, p, day, s_type, level):
         if not p.active: return False
         
         # Basic Checks
         for ad, at in p.assigned_shifts:
             if ad == day and at == s_type: return False
             
         # Level Checks
         fail_half = False
         if p.half_month == "1st" and day > self.split_day - 1: fail_half = True
         if p.half_month == "2nd" and day < self.split_day: fail_half = True
         if fail_half and level not in ["IGNORE_HALF", "IGNORE_AVOID", "IGNORE_FULLDAY", "IGNORE_ALL"]: return False

         fail_full = False
         if not p.full_day_ok:
              for ad, at in p.assigned_shifts:
                  if ad == day: fail_full = True
         if fail_full and level not in ["IGNORE_FULLDAY", "IGNORE_ALL"]: return False
         
         fail_avoid = False
         # Quick avoid check (optimization)
         if str(day) in p.avoid_str: # Rough check
             avoids = parse_date_input(p.avoid_str, self.year, self.month)
             for av in avoids:
                 if av['day'] == day and av['type'] == s_type:
                     fail_avoid = True
         if fail_avoid and level not in ["IGNORE_AVOID", "IGNORE_FULLDAY", "IGNORE_ALL"]: return False
         
         return True

    def try_assign_desperate_slot(self, day, s_type, level):
        # Sort potential candidates by:
        # 1. Delta (Assigned - Target): Prioritize under-target, then at-target, then over-target.
        # 2. Target Size (Descending): Larger targets get priority for same Delta.
        candidates = list(self.physicians)
        candidates.sort(key=lambda p: (len(p.assigned_shifts) - p.target, -p.target, random.random()))
        
        for p in candidates:
             if not p.active: continue
             
             # Check basic hard constraints that are NEVER broken (like already scheduled this slot)
             already_assigned = False
             for ad, at in p.assigned_shifts:
                 if ad == day and at == s_type: 
                     already_assigned = True
                     break
             if already_assigned: continue
             
             # Now check constraints based on Level
             
             # 1. Half Month
             fail_half = False
             if p.half_month == "1st" and day > self.split_day - 1: fail_half = True
             if p.half_month == "2nd" and day < self.split_day: fail_half = True
             
             if fail_half and level not in ["IGNORE_HALF", "IGNORE_AVOID", "IGNORE_FULLDAY", "IGNORE_ALL"]:
                 continue

             # 2. Full Day OK
             fail_full = False
             if not p.full_day_ok:
                 for ad, at in p.assigned_shifts:
                     if ad == day: fail_full = True
             
             if fail_full and level not in ["IGNORE_FULLDAY", "IGNORE_ALL"]:
                 continue
                 
             # 3. Avoid
             fail_avoid = False
             avoids = parse_date_input(p.avoid_str, self.year, self.month)
             for av in avoids:
                 if av['day'] == day and av['type'] == s_type:
                     fail_avoid = True
             
             if fail_avoid and level not in ["IGNORE_AVOID", "IGNORE_FULLDAY", "IGNORE_ALL"]:
                 continue
                 
             # If we passed all checks for this level, ASSIGN
             self.schedule[day][s_type].append(p.name)
             p.assigned_shifts.append((day, s_type))
             self.warnings.append(f"[DESPERATE {level}] {p.name} assigned D{day} {s_type}")
             return True
             
        return False

    def assign_overrides(self):
        for p in self.physicians:
            overrides = parse_date_input(p.override_str, self.year, self.month)
            for req in overrides:
                day, s_type = req['day'], req['type']
                if day > self.last_day: continue

                can_assign_result = self.can_assign(p, day, s_type, check_avoid=True)
                if not can_assign_result:
                    self.warnings.append(f"[OVERRIDE WARN] {p.name}: Override on D{day} {s_type} conflicts with Avoid. Assigned anyway.")

                needed = self.daily_needs.get(day, {}).get(s_type, 0)
                current = len(self.schedule[day][s_type])

                if current < needed:
                    self.schedule[day][s_type].append(p.name)
                    p.assigned_shifts.append((day, s_type))
                else:
                    self.warnings.append(f"[OVERRIDE FAIL] {p.name}: D{day} {s_type} - Clinic slot not needed (Needs: {needed}).")

    def assign_preferences(self):
        for p in self.physicians:
            prefs = parse_date_input(p.preferred_str, self.year, self.month)
            for req in prefs:
                day, s_type = req['day'], req['type']
                if day > self.last_day: continue

                if len(p.assigned_shifts) >= p.target:
                    self.warnings.append(f"[PREF IGNORED] {p.name}: D{day} {s_type} - Target ({p.target}) met.")
                    continue

                needed = self.daily_needs.get(day, {}).get(s_type, 0)
                current = len(self.schedule[day][s_type])

                if current < needed and self.can_assign(p, day, s_type, check_avoid=True):
                    self.schedule[day][s_type].append(p.name)
                    p.assigned_shifts.append((day, s_type))
                else:
                    # Only warn if they got ZERO assignments on a Preferred Day
                    # If they wanted AM+PM (implied by just "12") but got just AM, that is NOT a failure.
                    # parse_date_input returns specific AM/PM for "12". If user put "12", it expands to 12AM, 12PM.
                    # We check if they have ANY assignment on this day.
                    has_assignment_on_day = any(d == day for d, t in p.assigned_shifts)
                    if not has_assignment_on_day:
                         self.warnings.append(f"[PREF FAILED]  {p.name}: D{day} {s_type} - Slot unavailable.")

    def run_audits(self):
        for p in self.physicians:
            act = len(p.assigned_shifts)
            if act < p.target:
                self.warnings.append(f"[TARGET UNMET] {p.name}: Needed {p.target}, Granted {act}.")

        for d in range(1, self.last_day + 1):
            if d in self.daily_needs:
                for s_type in ['AM', 'PM']:
                    needed = self.daily_needs[d].get(s_type, 0)
                    current = len(self.schedule[d][s_type])
                    if current < needed:
                        self.warnings.append(f"[CRITICAL]     Unfilled Slot: D{d} {s_type} ({needed - current} needed).")

    def has_open_slots(self):
        for d in range(1, self.last_day + 1):
            if d in self.daily_needs:
                for s_type in ['AM', 'PM']:
                    needed = self.daily_needs[d].get(s_type, 0)
                    current = len(self.schedule[d][s_type])
                    if current < needed:
                        return True
        return False

    def try_assign_hardest_slot(self, p):
        """
        V11: Smart Capacity Reservation.
        Instead of picking a random slot, we identify ALL valid slots for 'p'.
        We sort them by 'Score' (How many OTHER people can take them?).
        We assign 'p' to the slot with the FEWEST alternatives.
        This forces 'p' to use their capacity on the slots ONLY THEY can do.
        """
        valid_options = []
        
        # 1. Identify all valid slots
        # To optimize, we won't iterate the whole month if we can avoid it,
        # but for accuracy we sort of have to.
        # This is n_physicians * n_days * 2 per assignment loop.
        # Complexity is high but manageable for small clinics.
        
        # Pre-calc valid days for P
        for d in range(1, self.last_day + 1):
            if d not in self.daily_needs: continue
            
            # Check p constraints (Half Month, Avoid)
            if self.is_weekend(d): continue
            if p.half_month == "1st" and d >= self.split_day: continue
            if p.half_month == "2nd" and d < self.split_day: continue
            if not self.can_assign(p, d, 'AM', check_avoid=True) and not self.can_assign(p, d, 'PM', check_avoid=True):
                 continue

            for s_type in ['AM', 'PM']:
                needed = self.daily_needs.get(d, {}).get(s_type, 0)
                current = len(self.schedule[d][s_type])
                
                if current < needed:
                    if self.can_assign(p, d, s_type, check_avoid=True):
                        # Found a valid option. Calculate SCORE (Difficulty).
                        # Score = How many OTHER active physicians can take this?
                        competitors = 0
                        for other in self.physicians:
                            if other == p: continue
                            if not other.active: continue
                            if self.can_assign(other, d, s_type, check_avoid=True):
                                competitors += 1
                        
                        valid_options.append({
                            'day': d, 'type': s_type,
                            'competitors': competitors
                        })

        if not valid_options:
            return False

        # 2. Sort by Competitors (Ascending). 
        # Fewer competitors = Harder Slot = Higher Priority for P to take it.
        # Random tie breaker
        random.shuffle(valid_options)
        valid_options.sort(key=lambda x: x['competitors'])
        
        # 3. Pick the best one
        choice = valid_options[0]
        pick_day, pick_type = choice['day'], choice['type']
        
        self.schedule[pick_day][pick_type].append(p.name)
        p.assigned_shifts.append((pick_day, pick_type))
        return True

    def run_desperation(self, stage):
        """
        Stage 1: Ignore Target, Ignore Half-Month
        Stage 2: Ignore above + Ignore Avoid, Ignore Full Day OK
        """
        # We process levels sequentially to use the "least bad" option first
        
        # LEVELS for Stage 1
        levels = []
        levels.append("IGNORE_TARGET_ONLY") # Level 1 (implied, we just pick anyone)
        levels.append("IGNORE_HALF")        # Level 2
        
        if stage >= 2:
             levels.append("IGNORE_AVOID")    # Level 3
             levels.append("IGNORE_FULLDAY")  # Level 4
             levels.append("IGNORE_ALL")      # Nuclear
        
        for lvl in levels:
             if not self.has_open_slots(): break
             
             if not self.has_open_slots(): break
             
             # NEW STRATEGY (V10): Sort Slots by Difficulty
             # We want to fill the "Hard" slots (fewest candidates) first.
             # This prevents the "Burden of Flexibility" where flexible docs fill easy slots early,
             # and then are forced to fill hard slots later, ending up with way more shifts.
             
             # 1. Gather all open slots
             open_slots = []
             for d in range(1, self.last_day + 1):
                 if d not in self.daily_needs: continue
                 for s_type in ['AM', 'PM']:
                     needed = self.daily_needs[d].get(s_type, 0)
                     current = len(self.schedule[d][s_type])
                     if current < needed:
                         # Calculate Difficulty: How many active docs can possibly take this slot at this level?
                         # (We don't need exact check, just a rough count of who isn't blocked by static constraints)
                         possible_count = 0
                         for p in self.physicians:
                             if not p.active: continue
                             # Check basic blocking for this level
                             is_blocked = False
                             
                             # Check Half Month (unless ignored)
                             if lvl not in ["IGNORE_HALF", "IGNORE_AVOID", "IGNORE_FULLDAY", "IGNORE_ALL"]:
                                 if (p.half_month == "1st" and d > self.split_day - 1) or (p.half_month == "2nd" and d < self.split_day):
                                     is_blocked = True
                             
                             # Check Avoid (unless ignored)
                             if not is_blocked and lvl not in ["IGNORE_AVOID", "IGNORE_FULLDAY", "IGNORE_ALL"]:
                                 pass 

                             if not is_blocked:
                                 possible_count += 1
                                 
                         # Append to list: ((Day, Type), DifficultyScore)
                         
                         candidates_for_slot = 0
                         for p in self.physicians:
                             if self.can_assign_at_level(p, d, s_type, lvl):
                                 candidates_for_slot += 1
                         
                         open_slots.append({
                             'day': d, 'type': s_type,
                             'candidates': candidates_for_slot
                         })

             # 2. Sort Open Slots: Fewest Candidates First
             random.shuffle(open_slots) 
             open_slots.sort(key=lambda x: x['candidates'])
             
             # 3. Fill them in order
             for slot in open_slots:
                 d, s_type = slot['day'], slot['type']
                 
                 needed = self.daily_needs[d].get(s_type, 0)
                 current = len(self.schedule[d][s_type])
                 
                 while current < needed:
                     assigned = self.try_assign_desperate_slot(d, s_type, lvl)
                     if assigned:
                         current += 1
                     else:
                         break 

    def can_assign_at_level(self, p, day, s_type, level):
         if not p.active: return False
         
         # Basic Checks
         for ad, at in p.assigned_shifts:
             if ad == day and at == s_type: return False
             
         # Level Checks
         fail_half = False
         if p.half_month == "1st" and day > self.split_day - 1: fail_half = True
         if p.half_month == "2nd" and day < self.split_day: fail_half = True
         if fail_half and level not in ["IGNORE_HALF", "IGNORE_AVOID", "IGNORE_FULLDAY", "IGNORE_ALL"]: return False

         fail_full = False
         if not p.full_day_ok:
              for ad, at in p.assigned_shifts:
                  if ad == day: fail_full = True
         if fail_full and level not in ["IGNORE_FULLDAY", "IGNORE_ALL"]: return False
         
         fail_avoid = False
         # Quick avoid check (optimization)
         if str(day) in p.avoid_str: # Rough check
             avoids = parse_date_input(p.avoid_str, self.year, self.month)
             for av in avoids:
                 if av['day'] == day and av['type'] == s_type:
                     fail_avoid = True
         if fail_avoid and level not in ["IGNORE_AVOID", "IGNORE_FULLDAY", "IGNORE_ALL"]: return False
         
         return True

    def try_assign_desperate_slot(self, day, s_type, level):
        # Sort potential candidates by:
        # 1. Delta (Assigned - Target): Prioritize under-target, then at-target, then over-target.
        # 2. Target Size (Descending): Larger targets get priority for same Delta.
        candidates = list(self.physicians)
        candidates.sort(key=lambda p: (len(p.assigned_shifts) - p.target, -p.target, random.random()))
        
        for p in candidates:
             if not p.active: continue
             
             # Check basic hard constraints that are NEVER broken (like already scheduled this slot)
             already_assigned = False
             for ad, at in p.assigned_shifts:
                 if ad == day and at == s_type: 
                     already_assigned = True
                     break
             if already_assigned: continue
             
             # Now check constraints based on Level
             
             # 1. Half Month
             fail_half = False
             if p.half_month == "1st" and day > self.split_day - 1: fail_half = True
             if p.half_month == "2nd" and day < self.split_day: fail_half = True
             
             if fail_half and level not in ["IGNORE_HALF", "IGNORE_AVOID", "IGNORE_FULLDAY", "IGNORE_ALL"]:
                 continue

             # 2. Full Day OK
             fail_full = False
             if not p.full_day_ok:
                 for ad, at in p.assigned_shifts:
                     if ad == day: fail_full = True
             
             if fail_full and level not in ["IGNORE_FULLDAY", "IGNORE_ALL"]:
                 continue
                 
             # 3. Avoid
             fail_avoid = False
             avoids = parse_date_input(p.avoid_str, self.year, self.month)
             for av in avoids:
                 if av['day'] == day and av['type'] == s_type:
                     fail_avoid = True
             
             if fail_avoid and level not in ["IGNORE_AVOID", "IGNORE_FULLDAY", "IGNORE_ALL"]:
                 continue
                 
             # If we passed all checks for this level, ASSIGN
             self.schedule[day][s_type].append(p.name)
             p.assigned_shifts.append((day, s_type))
             self.desperation_assignments.add((day, s_type, p.name))
             self.warnings.append(f"[DESPERATE {level}] {p.name} assigned D{day} {s_type}")
             return True
             
        return False

    def assign_overrides(self):
        for p in self.physicians:
            overrides = parse_date_input(p.override_str, self.year, self.month)
            for req in overrides:
                day, s_type = req['day'], req['type']
                if day > self.last_day: continue

                can_assign_result = self.can_assign(p, day, s_type, check_avoid=True)
                if not can_assign_result:
                    self.warnings.append(f"[OVERRIDE WARN] {p.name}: Override on D{day} {s_type} conflicts with Avoid. Assigned anyway.")

                needed = self.daily_needs.get(day, {}).get(s_type, 0)
                current = len(self.schedule[day][s_type])

                if current < needed:
                    self.schedule[day][s_type].append(p.name)
                    p.assigned_shifts.append((day, s_type))
                else:
                    self.warnings.append(f"[OVERRIDE FAIL] {p.name}: D{day} {s_type} - Clinic slot not needed (Needs: {needed}).")

    def assign_preferences(self):
        for p in self.physicians:
            prefs = parse_date_input(p.preferred_str, self.year, self.month)
            for req in prefs:
                day, s_type = req['day'], req['type']
                if day > self.last_day: continue

                if len(p.assigned_shifts) >= p.target:
                    self.warnings.append(f"[PREF IGNORED] {p.name}: D{day} {s_type} - Target ({p.target}) met.")
                    continue

                needed = self.daily_needs.get(day, {}).get(s_type, 0)
                current = len(self.schedule[day][s_type])

                if current < needed and self.can_assign(p, day, s_type, check_avoid=True):
                    self.schedule[day][s_type].append(p.name)
                    p.assigned_shifts.append((day, s_type))
                else:
                    # Only warn if they got ZERO assignments on a Preferred Day
                    # If they wanted AM+PM (implied by just "12") but got just AM, that is NOT a failure.
                    # parse_date_input returns specific AM/PM for "12". If user put "12", it expands to 12AM, 12PM.
                    # We check if they have ANY assignment on this day.
                    has_assignment_on_day = any(d == day for d, t in p.assigned_shifts)
                    if not has_assignment_on_day:
                         self.warnings.append(f"[PREF FAILED]  {p.name}: D{day} {s_type} - Slot unavailable.")

    def run_audits(self):
        for p in self.physicians:
            act = len(p.assigned_shifts)
            if act < p.target:
                self.warnings.append(f"[TARGET UNMET] {p.name}: Needed {p.target}, Granted {act}.")

        for d in range(1, self.last_day + 1):
            if d in self.daily_needs:
                for s_type in ['AM', 'PM']:
                    needed = self.daily_needs[d].get(s_type, 0)
                    current = len(self.schedule[d][s_type])
                    if current < needed:
                        self.warnings.append(f"[CRITICAL]     Unfilled Slot: D{d} {s_type} ({needed - current} needed).")

    def has_open_slots(self):
        for d in range(1, self.last_day + 1):
            if d in self.daily_needs:
                for s_type in ['AM', 'PM']:
                    needed = self.daily_needs[d].get(s_type, 0)
                    current = len(self.schedule[d][s_type])
                    if current < needed:
                        return True
        return False

    def try_assign_random_slot(self, p):
        valid_days = self.get_valid_days(p)

        # --- Non-Deterministic Fix ---
        possible_slots = []
        for day in valid_days:
            for s_type in ['AM', 'PM']:
                needed = self.daily_needs.get(day, {}).get(s_type, 0)
                current = len(self.schedule[day][s_type])
                if current < needed:
                        if self.can_assign(p, day, s_type, check_avoid=True):
                            possible_slots.append((day, s_type))

        if possible_slots:
            pick_day, pick_type = random.choice(possible_slots)
            self.schedule[pick_day][pick_type].append(p.name)
            p.assigned_shifts.append((pick_day, pick_type))
            return True
        return False
