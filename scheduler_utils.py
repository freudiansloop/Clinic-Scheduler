import sys
import os
import calendar

APP_NAME = "Clinic Physician Scheduler Pro"
STATE_FILE = "physician_state.json"

# specific default colors
DEFAULT_COLORS = {
    "Gandhi": "#87CEFA",    # Light Blue
    "Wesley": "#CC5500",    # Burnt Orange
    "Aisenberg": "#A9A9A9", # Dark Gray (adjusted for visibility)
    "Govindu": "#C8A2C8",   # Lilac
    "Reymunde": "#800080",  # Purple
    "Koney": "#98FF98",     # Mint
    "Lee": "#F0E68C",       # Khaki
    "Huq": "#4C6A92",       # Light Navy
    "Rendon": "#FFC0CB",    # Pink
    "Bhandari": "#FFFF00",  # Highlighter Yellow
    "Dash": "#008000",      # Green
    "Khaja": "#FFDAB9"      # Light Orange
}

# Fallback palette
COLOR_PALETTE = [
    "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#00FFFF", "#FF00FF", 
    "#C0C0C0", "#800000", "#808000", "#008000", "#800080", "#008080", 
    "#000080", "#FF4500", "#DA70D6", "#FA8072", "#20B2AA", "#778899", 
    "#B0C4DE", "#FFFFE0", "#FFD700", "#ADFF2F", "#7FFFD4", "#FF69B4"
]

DEFAULT_ROSTER_DATA = [
    ("Gandhi", 8), ("Wesley", 8), ("Khaja", 2), ("Rendon", 2),
    ("Reymunde", 2), ("Dash", 2), ("Govindu", 2), ("Lee", 2),
    ("Koney", 2), ("Aisenberg", 2), ("Bhandari", 2), ("Huq", 2)
]

def get_app_path():
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

def parse_date_input(text, year, month):
    if not text.strip():
        return []
    
    parts = [p.strip() for p in text.split(',')]
    result = []
    
    _, last_day = calendar.monthrange(year, month)

    for p in parts:
        if not p: continue
        p = p.upper()

        # Check for Range (e.g. "3-17" or "10-15AM")
        if '-' in p:
            # Detect shift type from the whole string
            s_type = None
            if "AM" in p: s_type = "AM"
            elif "PM" in p: s_type = "PM"
            
            # Remove text to get numbers
            clean_p = p.replace("AM","").replace("PM","").strip()
            try:
                start_str, end_str = clean_p.split('-')
                start = int(''.join(filter(str.isdigit, start_str)))
                end = int(''.join(filter(str.isdigit, end_str)))
                
                # Swap if backwards
                if start > end: start, end = end, start
                
                for day in range(start, end + 1):
                    if day < 1 or day > last_day: continue
                    if s_type:
                        result.append({'day': day, 'type': s_type})
                    else:
                        result.append({'day': day, 'type': 'AM'})
                        result.append({'day': day, 'type': 'PM'})
            except ValueError:
                continue
        else:
            # Single Date
            try:
                day_str = ''.join(filter(str.isdigit, p))
                if not day_str: continue
                day = int(day_str)
                if day < 1 or day > last_day: continue
    
                if "AM" in p:
                    result.append({'day': day, 'type': 'AM'})
                elif "PM" in p:
                    result.append({'day': day, 'type': 'PM'})
                else:
                    result.append({'day': day, 'type': 'AM'})
                    result.append({'day': day, 'type': 'PM'})
            except ValueError:
                continue
                
    return result
