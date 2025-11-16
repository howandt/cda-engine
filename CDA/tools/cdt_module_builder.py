import json
from pathlib import Path

BASE = Path("CDA")
CASES_DIR = BASE / "cases"
EXPORT_DIR = BASE / "export"
EXPORT_DIR.mkdir(exist_ok=True)

def load_case(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def build_quiz(case):
    t = case.get("training", {})
    return {
        "type": "quiz",
        "prompt": t.get("question"),
        "choices": t.get("options", []),
        "answer": t.get("answer"),
        "feedback": t.get("feedback")
    }

def build_reflection(case):
    """Tilføjer en refleksionsdel ud fra case-feltet 'reflection'."""
    return {
        "type": "reflection",
        "prompt": case.get("reflection"),
        "context": case.get("theme"),
        "age_group": case.get("age_group")
    }

def build_roleplay(case):
    """Simuler et lille rollespilsscenarie baseret på training-feltet."""
    t = case.get("training", {})
    options = t.get("options", [])
    answer = t.get("answer")
    scenario = case.get("problem", "")

    steps = []
    for opt in options:
        result = "rigtigt valg" if opt == answer else "forkert valg"
        feedback = (
            t.get("feedback")
            if opt == answer
            else "Det valg giver mere modstand hos barnet – prøv en mere støttende tilgang."
        )
        steps.append({
            "choice": opt,
            "result": result,
            "feedback": feedback
        })

    return {
        "type": "roleplay",
        "scenario": scenario,
        "steps": steps
    }

def export_module(case_path):
    case = load_case(case_path)
    module = {
        "id": case["id"],
        "title": case["title"],
        "modules": [
            build_quiz(case),
            build_reflection(case),
            build_roleplay(case)
        ]
    }
    out = EXPORT_DIR / f"{case['id']}_cdt_full_module.json"
    with open(out, "w", encoding="utf-8") as f:
        json.dump(module, f, ensure_ascii=False, indent=2)
    print(f"✅ CDT modul gemt: {out}")

if __name__ == "__main__":
    path = CASES_DIR / "laerer/adhd_klasseovergange_10-12.json"
    export_module(path)
