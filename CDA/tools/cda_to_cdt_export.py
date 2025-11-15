import json
from pathlib import Path

BASE = Path("CDA")
BRIDGE_FILE = BASE / "meta/cda_cdt_bridge.json"

# Vælg den case du vil eksportere
CASE_FILE = BASE / "cases/laerer/adhd_klasseovergange_10-12.json"

OUTPUT_DIR = BASE / "export"
OUTPUT_DIR.mkdir(exist_ok=True)

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def export_to_cdt(case, bridge):
    training = case.get("training", {})
    mapping = bridge["mapping"]

    cdt_quiz = {
        "id": case["id"],
        "title": case["title"],
        "mode": training.get("mode"),
        "prompt": training.get("question"),
        "choices": training.get("options", []),
        "correct": training.get("answer"),
        "explanation": training.get("feedback"),
        "source_case": str(CASE_FILE)
    }

    return cdt_quiz

if __name__ == "__main__":
    bridge = load_json(BRIDGE_FILE)
    case = load_json(CASE_FILE)

    cdt_module = export_to_cdt(case, bridge)

    output_path = OUTPUT_DIR / f"{case['id']}_cdt_module.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(cdt_module, f, ensure_ascii=False, indent=2)

    print(f"✅ CDT-quizmodul genereret: {output_path}")
    print(json.dumps(cdt_module, indent=2, ensure_ascii=False))
