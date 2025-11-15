import json
from pathlib import Path

# --- Filstier ---
BASE = Path("CDA")

# Skift denne linje når du vil teste en anden case:
# Eksempler:
# CASE_FILE = BASE / "cases/born/adhd_overgange_10-12.json"
# CASE_FILE = BASE / "cases/laerer/adhd_klasseovergange_10-12.json"
# CASE_FILE = BASE / "cases/paedagog/bornehave/autisme_garderobe_overgang_3-6.json"
CASE_FILE = BASE / "cases/familiesager/adhd_hjemme_overgange_10-12.json"

VIEW_SCHEMA_FILE = BASE / "views/viewSchema.json"

# --- Funktion: hent data ---
def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

# --- Funktion: vis filtreret view ---
def show_view(view_name):
    case = load_json(CASE_FILE)
    schema = load_json(VIEW_SCHEMA_FILE)

    if view_name not in schema["views"]:
        print(f"View '{view_name}' findes ikke.")
        return

    fields = schema["views"][view_name]["fields"]
    print(f"\n=== {view_name.upper()} VIEW ===\n")

    for field in fields:
        # Understøtter nested felter som "training.question"
        parts = field.split(".")
        value = case
        for p in parts:
            value = value.get(p) if isinstance(value, dict) else None
        if value is not None:
            print(f"{field}: {value}")
    print("\n")

# --- Testkørsel ---
if __name__ == "__main__":
    show_view("overview")
    show_view("solution")
    show_view("training")
