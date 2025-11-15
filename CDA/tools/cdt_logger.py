import json
from datetime import datetime
from pathlib import Path
import re

LOG_DIR = Path("CDA/logs")
LOG_DIR.mkdir(exist_ok=True)

def sanitize_filename(name: str) -> str:
    """Fjerner tegn der ikke må bruges i Windows-filer."""
    return re.sub(r'[^a-zA-Z0-9_\-]', '_', name)

def log_event(module_id, step_type, user_choice, result, feedback):
    safe_id = sanitize_filename(module_id)
    log_entry = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "module_id": module_id,
        "step_type": step_type,
        "user_choice": user_choice,
        "result": result,
        "feedback": feedback
    }

    log_file = LOG_DIR / f"{safe_id}_sessionlog.jsonl"
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")

    print(f"📝 Logget: {step_type} → {user_choice} ({result})")
