import os
import threading
from datetime import datetime, timezone

from flask import Flask, request, jsonify
from flask_cors import CORS

from process_all_games import (
    analyze_single_comment,
    update_game_with_single_comment,
    process_games,
    count_games
)

app = Flask(__name__)
CORS(app)


@app.route("/analyze-comment", methods=["POST"])
def analyze_comment():
    data = request.get_json()

    if not data:
        return jsonify({
            "success": False,
            "message": "Missing request data."
        }), 400

    game_id = data.get("game_id")
    comment = data.get("comment", "")

    if not game_id:
        return jsonify({
            "success": False,
            "message": "Missing game_id."
        }), 400

    prediction = analyze_single_comment(comment)

    if prediction is None:
        return jsonify({
            "success": False,
            "message": "Invalid comment."
        }), 400

    try:
        result = update_game_with_single_comment(
            int(game_id),
            prediction
        )

        return jsonify({
            "success": True,
            "message": "Comment analyzed successfully.",
            "prediction": prediction,
            "result": result
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "message": str(e)
        }), 500


# =========================
# MODEL 2: spam detection for complaints
# =========================
# Pretrained RoBERTa spam classifier (MIT licence): label 1 = spam, 0 = not spam.
# Loaded on the first request so the service starts as fast as before.
SPAM_MODEL = os.getenv("SPAM_MODEL", "mshenoda/roberta-spam")
spam_lock = threading.Lock()
spam_parts = {}


def spam_probability(text):
    import torch
    from transformers import AutoTokenizer, AutoModelForSequenceClassification
    with spam_lock:
        if not spam_parts:
            spam_parts["tok"] = AutoTokenizer.from_pretrained(SPAM_MODEL)
            spam_parts["model"] = AutoModelForSequenceClassification.from_pretrained(SPAM_MODEL)
            spam_parts["model"].eval()
    inputs = spam_parts["tok"]([text], return_tensors="pt", truncation=True, padding=True, max_length=256)
    with torch.no_grad():
        logits = spam_parts["model"](**inputs).logits
    probs = torch.softmax(logits, dim=-1)[0]
    return float(probs[1]) if probs.shape[0] > 1 else float(torch.sigmoid(logits[0][0]))


@app.route("/spam-check", methods=["POST"])
def spam_check():
    if ADMIN_TOKEN and request.headers.get("X-Admin-Token", "") != ADMIN_TOKEN:
        return jsonify({"success": False, "message": "Not allowed."}), 403
    data = request.get_json(silent=True) or {}
    text = str(data.get("text", "")).strip()[:1000]
    if not text:
        return jsonify({"success": False, "message": "Missing text."}), 400
    try:
        p = spam_probability(text)
        return jsonify({"success": True, "spam_probability": round(p, 4), "is_spam": p >= 0.5, "model": SPAM_MODEL})
    except Exception as error:
        return jsonify({"success": False, "message": str(error)}), 500


# =========================
# ADMIN: run the analysis in the background
# =========================
# Protected by a shared secret: the PHP site sends it in the X-Admin-Token header.
# Set the same ADMIN_TASK_TOKEN on this service and on the website.

ADMIN_TOKEN = os.getenv("ADMIN_TASK_TOKEN", "")
job_lock = threading.Lock()
job = {"running": False}
stop_flag = threading.Event()


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def authorized():
    return ADMIN_TOKEN != "" and request.headers.get("X-Admin-Token", "") == ADMIN_TOKEN


def run_job(mode, game_id):
    def progress(done, total, name, message):
        job.update({"done": done, "total": total, "current": name, "last_message": message})

    try:
        result = process_games(mode, game_id, on_progress=progress, should_stop=stop_flag.is_set)
        job.update({"result": result, "errors": result.get("errors", [])[-10:]})
    except Exception as error:
        job.update({"failed": str(error)})
    finally:
        job.update({"running": False, "finished_at": now_iso(), "current": None})


@app.route("/analyze-games", methods=["POST"])
def analyze_games():
    if not authorized():
        return jsonify({"success": False, "message": "Not allowed."}), 403

    data = request.get_json(silent=True) or {}
    mode = data.get("mode", "new")
    game_id = data.get("game_id")
    if mode not in ("one", "new", "all"):
        return jsonify({"success": False, "message": "Invalid mode."}), 400
    if mode == "one":
        try:
            game_id = int(game_id)
        except (TypeError, ValueError):
            return jsonify({"success": False, "message": "Choose a game."}), 400

    with job_lock:
        if job.get("running"):
            return jsonify({"success": False, "message": "An analysis is already running.", "job": job}), 409
        stop_flag.clear()
        job.clear()
        job.update({
            "running": True, "mode": mode, "game_id": game_id,
            "done": 0, "total": None, "current": None,
            "started_at": now_iso(), "finished_at": None, "errors": []
        })
        threading.Thread(target=run_job, args=(mode, game_id), daemon=True).start()

    return jsonify({"success": True, "job": job})


@app.route("/analyze-status", methods=["GET"])
def analyze_status():
    if not authorized():
        return jsonify({"success": False, "message": "Not allowed."}), 403
    return jsonify({"success": True, "job": job})


@app.route("/analyze-count", methods=["GET"])
def analyze_count():
    if not authorized():
        return jsonify({"success": False, "message": "Not allowed."}), 403
    try:
        return jsonify({"success": True, "new": count_games("new"), "all": count_games("all")})
    except Exception as error:
        return jsonify({"success": False, "message": str(error)}), 500


@app.route("/analyze-stop", methods=["POST"])
def analyze_stop():
    if not authorized():
        return jsonify({"success": False, "message": "Not allowed."}), 403
    if job.get("running"):
        stop_flag.set()
    return jsonify({"success": True, "job": job})


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=5000,
        debug=True
    )