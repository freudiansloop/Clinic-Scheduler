import os
import json
from flask import Flask, render_template, jsonify, request
from scheduler_models import Physician
from scheduler_logic import SchedulerLogic
from scheduler_utils import get_app_path, STATE_FILE

SETTINGS_FILE = "settings_state.json"

app = Flask(__name__)

# --- VIEW ROUTES ---
@app.route("/")
def view_physicians():
    return render_template("physicians.html")

@app.route("/needs")
def view_needs():
    return render_template("clinic_needs.html")

@app.route("/schedule")
def view_schedule():
    return render_template("schedule.html")

@app.route("/data")
def view_data():
    return render_template("data_management.html")

@app.route("/instructions")
def view_instructions():
    return render_template("instructions.html")

# --- API ROUTES ---
@app.route("/api/roster", methods=["GET"])
def get_roster():
    state_path = os.path.join(get_app_path(), STATE_FILE)
    if os.path.exists(state_path):
        with open(state_path, "r", encoding="utf-8") as f:
            state = json.load(f)
            data = state.get("physicians", [])
    else:
        data = []
    return jsonify({"physicians": data, "success": True})

@app.route("/api/roster", methods=["POST"])
def update_roster():
    try:
        data = request.json
        state_path = os.path.join(get_app_path(), STATE_FILE)
        
        state = {"physicians": data.get("physicians", [])}
        with open(state_path, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=4)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route("/api/generate", methods=["POST"])
def run_generation():
    try:
        # Load data
        roster_path = os.path.join(get_app_path(), STATE_FILE)
        settings_path = os.path.join(get_app_path(), SETTINGS_FILE)
        
        with open(roster_path, "r", encoding="utf-8") as f:
            roster_data = json.load(f).get("physicians", [])
        
        with open(settings_path, "r", encoding="utf-8") as f:
            settings_data = json.load(f)

        # Convert roster to Physician objects
        from scheduler_models import Physician
        physicians = [Physician.from_dict(p) for p in roster_data]
        
        # Prepare logic
        logic = SchedulerLogic(physicians)
        
        # Determine desperation stage (default 1)
        stage = settings_data.get("desperation_stage", 1)
        logic.desperation_stage = stage
        
        # Generate
        year = settings_data.get("year", 2024)
        month = settings_data.get("month", 3)
        daily_needs = settings_data.get("daily_needs", {})
        overrides = settings_data.get("overrides", {})
        
        # Logic takes daily_needs as a week-day pattern, and we might need to handle per-day overrides.
        # scheduler_logic.py's run_generator usually takes (year, month, daily_needs).
        # We may need to pass the overrides too. Let's check scheduler_logic.py.
        # Actually, for now let's use the weekly pattern as requested by the original logic.
        
        result_schedule, stats, alerts = logic.run_generator(year, month, daily_needs)
        
        # Save results
        output_path = os.path.join(get_app_path(), "output_schedule.json")
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump({
                "schedule": result_schedule,
                "stats": stats,
                "alerts": alerts,
                "metadata": {"year": year, "month": month}
            }, f, indent=4)
            
        return jsonify({"success": True, "message": "Schedule Generated"})
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return jsonify({"success": False, "error": str(e)})

@app.route("/api/schedule", methods=["GET"])
def get_schedule():
    path = os.path.join(get_app_path(), "output_schedule.json")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return jsonify({"success": True, "data": json.load(f)})
    return jsonify({"success": False, "error": "No schedule found"})

@app.route("/api/needs", methods=["GET"])
def get_needs():
    settings_path = os.path.join(get_app_path(), SETTINGS_FILE)
    if os.path.exists(settings_path):
        with open(settings_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        # Default needs map (Mon-Fri 08:00-17:00 etc)
        # 0: Mon, 1: Tue, 2: Wed, 3: Thu, 4: Fri, 5: Sat, 6: Sun
        # Values: (AM, PM)
        default_map = {
            "0": {"AM": 1, "PM": 0}, 
            "1": {"AM": 2, "PM": 0}, 
            "2": {"AM": 0, "PM": 1}, 
            "3": {"AM": 2, "PM": 1}, 
            "4": {"AM": 1, "PM": 0}, 
            "5": {"AM": 0, "PM": 0}, 
            "6": {"AM": 0, "PM": 0}
        }
        data = {"daily_needs": default_map, "month": 3, "year": 2024, "split_day": "Automatic"}
    return jsonify({"success": True, "data": data})

@app.route("/api/needs", methods=["POST"])
def update_needs():
    try:
        data = request.json
        settings_path = os.path.join(get_app_path(), SETTINGS_FILE)
        with open(settings_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

def start_server(port=5000):
    app.run(host="127.0.0.1", port=port, debug=False, use_reloader=False)

if __name__ == "__main__":
    start_server()
