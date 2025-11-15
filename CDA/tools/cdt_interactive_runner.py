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

python CDA/tools/cdt_interactive_runner.py

def run_module():
    from cdt_logger import log_event
    import json
    from datetime import datetime
    data = load_module()
    if not data:
        return

    print(f"\n=== Starter træning: {data['title']} ===")

    score = 0
    results = []

    for mod in data["modules"]:
        t = mod["type"]

        if t == "quiz":
            print("\n🧩 DEL 1: QUIZ")
            run_quiz(mod)
            # simpelt point-estimat (kun som eksempel)
            if 'answer' in mod:
                score += 10
                results.append({"type": "quiz", "points": 10})

        elif t == "reflection":
            print("\n💭 DEL 2: REFLEKSION")
            run_reflection(mod)
            results.append({"type": "reflection", "points": 0})

        elif t == "roleplay":
            print("\n🎭 DEL 3: ROLEPLAY")
            run_roleplay(mod)
            results.append({"type": "roleplay", "points": 5})

    # afslutning
    print("\n🏁 TRÆNINGSFORLØB FÆRDIGT 🏁")
    print("------------------------------------")
    print(f"📅 Dato: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"📘 Modul: {data['title']}")
    print("------------------------------------")

    total_points = sum(r["points"] for r in results)
    print(f"🔹 Samlet score: {total_points} point")

    if total_points >= 15:
        print("✅ Stærk indsats! Du har forstået casens kerne.")
    elif total_points >= 5:
        print("🟡 Godt på vej – overvej at genbesøge quiz eller rollespil.")
    else:
        print("❌ Prøv igen – fokusér på struktur og forudsigelighed.")

    print("------------------------------------")
    print("Heidi siger: “Vil du tage en ny case eller gentage denne?”")

    # gem kort opsummering i log
    summary = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "module_title": data["title"],
        "total_points": total_points,
        "details": results
    }
    with open("CDA/logs/session_summary.jsonl", "a", encoding="utf-8") as f:
        f.write(json.dumps(summary, ensure_ascii=False) + "\n")

    print("📝 Session gemt i CDA/logs/session_summary.jsonl")

if __name__ == "__main__":
    run_module()
