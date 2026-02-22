import random

class Physician:
    def __init__(self, name, target, active=True, half_month="All", preferred="", avoid="", override="", color="#FFFFFF", full_day_ok=False):
        self.id = str(random.getrandbits(32))
        self.name = name
        self.target = int(target)
        self.active = active
        self.half_month = half_month # "All", "1st", "2nd"
        self.preferred_str = preferred
        self.avoid_str = avoid
        self.override_str = override
        self.color = color
        self.full_day_ok = full_day_ok
        self.assigned_shifts = [] 
    
    def to_dict(self):
        return {
            "name": self.name,
            "target": self.target,
            "active": self.active,
            "half_month": self.half_month,
            "preferred": self.preferred_str,
            "avoid": self.avoid_str,
            "override": self.override_str,
            "color": self.color,
            "full_day_ok": self.full_day_ok
        }

    @classmethod
    def from_dict(cls, data):
        return cls(
            name=data.get("name", ""),
            target=data.get("target", 0),
            active=data.get("active", True),
            half_month=data.get("half_month", "All"),
            preferred=data.get("preferred", ""),
            avoid=data.get("avoid", ""),
            override=data.get("override", ""),
            color=data.get("color", "#FFFFFF"),
            full_day_ok=data.get("full_day_ok", False)
        )
