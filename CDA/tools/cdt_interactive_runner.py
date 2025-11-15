import json
from pathlib import Path
from cdt_logger import log_event

EXPORT_DIR = Path("CDA/export")

def load_module():
    # hent den seneste full-fil i export
    files = sorted(EXPORT_DIR.glob("*_cdt_full_module.json"))
    if not files:
        print("Ingen CDT-moduler fundet i export/")
        return None
    path = files[-1]
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    print(f"🔹 Åbner: {path.name}")
    return data

def run_quiz(mod):
    from cdt_logger import log_event  # lokal import for at undgå cirkulær afhængighed
    print(f"\n🧩 QUIZ: {mod['prompt']}")
    for i, c in enumerate(mod["choices"], start=1):
        print(f"{i}. {c}")

    choice = input("Vælg (1-3): ")
    try:
        answer = mod["choices"][int(choice) - 1]
    except Exception:
        print("Ugyldigt valg.")
        return

    if answer == mod["answer"]:
        print(f"✅ Korrekt!\n{mod['feedback']}")
        result = "rigtigt"
        feedback = mod["feedback"]
    else:
        print(f"❌ Ikke helt. Rigtigt svar: {mod['answer']}")
        result = "forkert"
        feedback = ""

    # 🔹 Log hændelsen
    log_event(
        module_id=mod.get("prompt", "ukendt_modul"),
        step_type="quiz",
        user_choice=answer,
        result=result,
        feedback=feedback
    )

def run_reflection(mod):
    print(f"\n💭 REFLEKSION ({mod['context']}):")
    print(mod["prompt"])
    _ = input("Tryk Enter når du har tænkt over det...")

def run_roleplay(mod):
    print(f"\n🎭 ROLEPLAY – {mod['scenario']}")
    for step in mod["steps"]:
        print(f"\nValgmulighed: {step['choice']}")
        cont = input("Vil du vælge dette? (j/n): ").lower()
        if cont == "j":
            print(f"➡️  Resultat: {step['result']}")
            print(f"💬 Feedback: {step['feedback']}")
            break

def run_module():
    data = load_module()
    if not data:
        return
    print(f"\n=== Starter træning: {data['title']} ===")
    for mod in data["modules"]:
        t = mod["type"]
        if t == "quiz": run_quiz(mod)
        elif t == "reflection": run_reflection(mod)
        elif t == "roleplay": run_roleplay(mod)
    print("\n🏁 Træningsmodul færdigt.")

if __name__ == "__main__":
    run_module()
