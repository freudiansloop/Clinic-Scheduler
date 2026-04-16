import os
import sys
import json
from flask import Flask, render_template, jsonify, request
from scheduler_models import Physician
from scheduler_logic import SchedulerLogic
from scheduler_utils import get_app_path, STATE_FILE, CLINIC_DATA_FILE

SETTINGS_FILE = "settings_state.json"

if getattr(sys, 'frozen', False):
    template_folder = os.path.join(sys._MEIPASS, 'templates')
    static_folder = os.path.join(sys._MEIPASS, 'static')
    app = Flask(__name__, template_folder=template_folder, static_folder=static_folder)
else:
    app = Flask(__name__)
# --- DATA HELPERS ---

def get_unified_path():
    return os.path.join(get_app_path(), CLINIC_DATA_FILE)

def load_unified_data():
    unified_path = get_unified_path()
    
    # 1. Try to load unified file
    if os.path.exists(unified_path):
        with open(unified_path, "r", encoding="utf-8") as f:
            return json.load(f)
            
    # 2. Migration Logic: Try to load legacy files
    physician_path = os.path.join(get_app_path(), STATE_FILE)
    settings_path = os.path.join(get_app_path(), SETTINGS_FILE)
    
    physicians = []
    if os.path.exists(physician_path):
        with open(physician_path, "r", encoding="utf-8") as f:
            physicians = json.load(f).get("physicians", [])
            
    needs = {
        "daily_needs": {
            "0": {"AM": 1, "PM": 0}, "1": {"AM": 2, "PM": 0}, "2": {"AM": 0, "PM": 1}, 
            "3": {"AM": 2, "PM": 1}, "4": {"AM": 1, "PM": 0}, "5": {"AM": 0, "PM": 0}, 
            "6": {"AM": 0, "PM": 0}
        },
        "month": 3, "year": 2024, "split_day": "Automatic", "overrides": {}, "desperation_stage": 1
    }
    
    if os.path.exists(settings_path):
        with open(settings_path, "r", encoding="utf-8") as f:
            needs.update(json.load(f))

    unified = {
        "physicians": physicians if physicians else [],
        "needs": needs
    }
    
    # If no physicians found, load defaults (v1.6.0)
    if not unified["physicians"]:
        from scheduler_utils import DEFAULT_ROSTER_DATA, DEFAULT_COLORS
        unified["physicians"] = generate_default_roster(DEFAULT_ROSTER_DATA, DEFAULT_COLORS)
    
    # Save the migrated data immediately
    save_unified_data(unified)
    return unified

def save_unified_data(data):
    unified_path = get_unified_path()
    with open(unified_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=4)

def generate_default_roster(roster_data, colors):
    return [
        {
            "name": name, "target": target, "active": True, "half_month": "All",
            "preferred": "", "avoid": "", "override": "",
            "color": colors.get(name, "#ffffff"),
            "full_day_ok": True if name in ["Gandhi", "Wesley"] else False
        }
        for name, target in roster_data
    ]

# --- VIEW ROUTES ---
@app.route("/")
def view_physicians(): return render_template("physicians.html")

@app.route("/needs")
def view_needs(): return render_template("clinic_needs.html")

@app.route("/schedule")
def view_schedule(): return render_template("schedule.html")

@app.route("/data")
def view_data(): return render_template("data_management.html")

@app.route("/instructions")
def view_instructions(): return render_template("instructions.html")

# --- API ROUTES ---

@app.route("/api/roster", methods=["GET"])
def get_roster():
    data = load_unified_data()
    return jsonify({"physicians": data["physicians"], "success": True})

@app.route("/api/roster", methods=["POST"])
def update_roster():
    try:
        new_roster = request.json.get("physicians", [])
        data = load_unified_data()
        data["physicians"] = new_roster
        save_unified_data(data)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route("/api/roster/checkpoint", methods=["POST"])
def checkpoint_roster():
    try:
        data = load_unified_data()
        with open("clinic_roster_checkpoint.json", "w") as f:
            json.dump(data["physicians"], f, indent=4)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route("/api/roster/restore", methods=["POST"])
def restore_roster_checkpoint():
    try:
        if not os.path.exists("clinic_roster_checkpoint.json"):
            return jsonify({"success": False, "error": "No checkpoint found"})
        with open("clinic_roster_checkpoint.json", "r") as f:
            checkpoint_data = json.load(f)
        data = load_unified_data()
        data["physicians"] = checkpoint_data
        save_unified_data(data)
        return jsonify({"success": True, "physicians": checkpoint_data})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route("/api/needs", methods=["GET"])
def get_needs():
    data = load_unified_data()
    return jsonify({"success": True, "data": data["needs"]})

@app.route("/api/needs", methods=["POST"])
def update_needs():
    try:
        new_needs = request.json
        data = load_unified_data()
        data["needs"] = new_needs
        save_unified_data(data)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route("/api/generate", methods=["POST"])
def run_generation():
    try:
        # Force a reload of the logic module to ensure on-disk changes are reflected
        import importlib
        import scheduler_logic
        importlib.reload(scheduler_logic)
        from scheduler_logic import SchedulerLogic

        data = load_unified_data()
        phys_data = data["physicians"]
        needs_data = data["needs"]

        from scheduler_models import Physician
        physicians = [Physician.from_dict(p) for p in phys_data]

        # Extract settings
        desperation = int(needs_data.get("desperation_stage", 1))
        ratio_logic = bool(needs_data.get("ratio_logic", True))
        
        year = int(needs_data.get("year", 2024))
        month = int(needs_data.get("month", 3))
        patterns = needs_data.get("daily_needs", {})
        overrides = needs_data.get("overrides", {})
        
        # 1. Calculate Actual Daily Needs (Merging Patterns + Specific Overrides)
        import calendar
        _, last_day = calendar.monthrange(year, month)
        actual_daily_needs = {}
        for d in range(1, last_day + 1):
            dow_key = str(calendar.weekday(year, month, d))
            pattern = patterns.get(dow_key, {"AM": 0, "PM": 0})
            
            # Merge with Ovr
            ovr = overrides.get(str(d), {})
            actual_daily_needs[d] = {
                "AM": ovr.get("AM", pattern.get("AM", 0)),
                "PM": ovr.get("PM", pattern.get("PM", 0))
            }

        # 2. Resolve Split Day
        split_setting = needs_data.get("split_day", "Automatic")
        if split_setting == "Automatic":
            split_day = (last_day // 2) + 1
        else:
            try: split_day = int(split_setting)
            except: split_day = 16

        # 3. Running the actual Engine
        logic = SchedulerLogic(
            physicians=physicians, 
            year=year, 
            month=month, 
            daily_needs=actual_daily_needs, 
            split_day=split_day
        )
        algo_mode = "Ratio" if ratio_logic else "Standard"
        logic.run(algorithm=algo_mode, desperation_stage=desperation)
        
        # 4. Save and return
        output_path = os.path.join(get_app_path(), "output_schedule.json")
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump({
                "schedule": logic.schedule, 
                "stats": {}, # Placeholder for future expanded stats
                "alerts": logic.warnings,
                "metadata": {"year": year, "month": month}
            }, f, indent=4)
            
        return jsonify({"success": True, "message": "Schedule Generated"})
    except Exception as e:
        import traceback
        error_msg = traceback.format_exc()
        print(f"GENERATION ERROR:\n{error_msg}")
        return jsonify({"success": False, "error": str(e)})

from flask import send_file
import tempfile
import exporter

@app.route("/api/export", methods=["GET"])
def export_schedule():
    try:
        data = load_unified_data()
        output_path = os.path.join(get_app_path(), "output_schedule.json")
        schedule_results = None
        if os.path.exists(output_path):
            with open(output_path, "r", encoding="utf-8") as f:
                schedule_results = json.load(f)
        
        fd, temp_path = tempfile.mkstemp(suffix=".xlsx")
        os.close(fd)
        
        exporter.generate_export_excel(data, schedule_results, temp_path)
        
        # We send the file, Flask will handle serving it
        # We don't delete immediately to allow Flask to read it
        return send_file(temp_path, as_attachment=True, download_name=f"Clinic_Schedule_{data['needs'].get('month', 'X')}_{data['needs'].get('year', '202X')}.xlsx")
    except Exception as e:
        return str(e), 500

@app.route("/api/import", methods=["POST"])
def import_schedule():
    try:
        if 'file' not in request.files:
            return jsonify({"success": False, "error": "No file uploaded"})
        file = request.files['file']
        if file.filename == '':
            return jsonify({"success": False, "error": "No file selected"})
            
        fd, temp_path = tempfile.mkstemp(suffix=".xlsx")
        os.close(fd)
        file.save(temp_path)
        
        parsed_data = exporter.parse_import_excel(temp_path)
        os.remove(temp_path)
        
        if parsed_data:
            save_unified_data(parsed_data)
            return jsonify({"success": True})
        else:
            return jsonify({"success": False, "error": "Invalid format or missing Calendar & Settings sheet data in A80."})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

try:
    from flaskwebgui import FlaskUI
    HAS_DESKTOP_UI = True
except ImportError:
    HAS_DESKTOP_UI = False
    import threading
    import webbrowser
    import time

@app.route("/api/schedule", methods=["GET"])
def get_schedule():
    path = os.path.join(get_app_path(), "output_schedule.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return jsonify({"success": True, "data": json.load(f)})
    return jsonify({"success": False, "error": "No schedule found"})

def start_server():
    if HAS_DESKTOP_UI:
        print("Launching Clinic Scheduler Pro as Desktop Application...")
        # width=1280, height=800 chosen for a good HD desktop experience
        ui = FlaskUI(app=app, server="flask", width=1280, height=800)
        ui.run()
    else:
        print("flaskwebgui not found. Falling back to browser-tab mode...")
        # Fallback to the previous threading/webbrowser method
        def open_browser(port):
            time.sleep(1.5)
            webbrowser.open(f"http://127.0.0.1:{port}")
        
        port = 5000
        print(f"Starting Clinic Scheduler Pro on http://127.0.0.1:{port}")
        threading.Thread(target=open_browser, args=(port,), daemon=True).start()
        app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False)

if __name__ == "__main__":
    start_server()
