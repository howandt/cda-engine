import json
from datetime import datetime
from pathlib import Path

LOG_DIR = Path("CDA/logs")
LOG_DIR.mkdir(exist_ok=True)

def log_event(module_id, step_type, user_choice, result, feedback):
    log_entry = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "module_id": module_id,
        "step_type": step_type,
        "user_choice": user_choice,
        "result": result,
        "feedback": feedback
    }
    log_file = LOG_DIR / f"{module_id}_sessionlog.jsonl"
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")

    print(f"📝 Logget: {step_type} → {user_choice} ({result})")
