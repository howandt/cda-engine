import json
from pathlib import Path
from datetime import datetime
from cdt_logger import log_event

EXPORT_DIR = Path("CDA/export")
LOG_PATH = Path("CDA/logs/session_summary.jsonl")


def load_module():
    """Hent den seneste fulde CDT-fil fra export-mappen."""
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
    """Kør en quiz-del og log resultatet."""
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
        points = 10
    else:
        print(f"❌ Ikke helt. Rigtigt svar: {mod['answer']}")
        result = "forkert"
        feedback = ""
        points = 0

    log_event(
        module_id=mod.get("prompt", "ukendt_modul"),
        step_type="quiz",
        user_choice=answer,
        result=result,
        feedback=feedback
    )
    return points


def run_reflection(mod):
    """Vis refleksionsspørgsmål."""
    print(f"\n💭 REFLEKSION ({mod['context']}):")
    print(mod["prompt"])
    input("Tryk Enter når du har tænkt over det...")


def run_roleplay(mod):
    """Kør et roleplay-scenarie."""
    print(f"\n🎭 ROLEPLAY – {mod['scenario']}")
    for step in mod["steps"]:
        print(f"\nValgmulighed: {step['choice']}")
        cont = input("Vil du vælge dette? (j/n): ").lower()
        if cont == "j":
            print(f"➡️  Resultat: {step['result']}")
            print(f"💬 Feedback: {step['feedback']}")
            log_event(
                module_id=mod.get("scenario", "ukendt_roleplay"),
                step_type="roleplay",
                user_choice=step["choice"],
                result=step["result"],
                feedback=step["feedback"]
            )
            return 5
    return 0


def run_module():
    """Kør hele træningsforløbet: quiz → refleksion → roleplay → opsummering."""
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
            pts = run_quiz(mod) or 0
            score += pts
            results.append({"type": "quiz", "points": pts})

        elif t == "reflection":
            print("\n💭 DEL 2: REFLEKSION")
            run_reflection(mod)
            results.append({"type": "reflection", "points": 0})

        elif t == "roleplay":
            print("\n🎭 DEL 3: ROLEPLAY")
            pts = run_roleplay(mod) or 0
            score += pts
            results.append({"type": "roleplay", "points": pts})

    # afslutning
    print("\n🏁 TRÆNINGSFORLØB FÆRDIGT 🏁")
    print("------------------------------------")
    print(f"📅 Dato: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"📘 Modul: {data['title']}")
    print("------------------------------------")

    print(f"🔹 Samlet score: {score} point")

    if score >= 15:
        print("✅ Stærk indsats! Du har forstået casens kerne.")
    elif score >= 5:
        print("🟡 Godt på vej – overvej at genbesøge quiz eller rollespil.")
    else:
        print("❌ Prøv igen – fokusér på struktur og forudsigelighed.")

    print("------------------------------------")
    print("Heidi siger: “Vil du tage en ny case eller gentage denne?”")

    summary = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "module_title": data["title"],
        "total_points": score,
        "details": results
    }
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(summary, ensure_ascii=False) + "\n")

    print("📝 Session gemt i CDA/logs/session_summary.jsonl")


if __name__ == "__main__":
    run_module()
