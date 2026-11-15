import time
import argparse
from pathlib import Path
from youtube_comments import fetch_youtube_comments, merge_unique, YouTubeError
import requests
import mysql.connector
import torch
import numpy as np
import re
import os
from transformers import AutoTokenizer, AutoModelForSequenceClassification

# =========================
# SETTINGS
# =========================

DB_CONFIG = {
    "host": os.getenv("MYSQLHOST", "localhost"),
    "port": int(os.getenv("MYSQLPORT", "8889")),
    "user": os.getenv("MYSQLUSER", "root"),
    "password": os.getenv("MYSQLPASSWORD", "root"),
    "database": os.getenv("MYSQLDATABASE", "dira_db"),
}

# Model is hosted on Hugging Face (too big for GitHub)
MODEL_PATH = os.getenv("MODEL_PATH", "rathath/dira-toxicity-model")

MAX_REVIEWS_PER_GAME = 100
GAME_LIMIT = 133 
BATCH_SIZE = 16
THRESHOLD = 0.5
REANALYZE_ALL = False

weights = {
    "sexual_harassment": 0.266,
    "hate_speech": 0.201,
    "bullying": 0.195,
    "threat": 0.182,
    "other_toxicity": 0.156
}

# =========================
# DATABASE
# =========================

conn = mysql.connector.connect(**DB_CONFIG)
cursor = conn.cursor(dictionary=True)

# =========================
# MODEL
# =========================

tokenizer = AutoTokenizer.from_pretrained(MODEL_PATH)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_PATH)
model.eval()

# =========================
# FETCH STEAM REVIEWS
# =========================

def fetch_steam_reviews(steam_app_id, max_reviews=100):
    all_reviews = []
    cursor_value = "*"

    while len(all_reviews) < max_reviews:
        remaining = max_reviews - len(all_reviews)
        num_per_page = min(100, remaining)

        url = f"https://store.steampowered.com/appreviews/{steam_app_id}"

        params = {
            "json": 1,
            "filter": "recent",
            "language": "english",
            "num_per_page": num_per_page,
            "cursor": cursor_value
        }

        try:
            response = requests.get(url, params=params, timeout=20)
            data = response.json()
        except Exception as e:
            print(f"Steam request failed for AppID {steam_app_id}: {e}")
            break

        if not data or not data.get("success"):
            break

        reviews = data.get("reviews", [])

        if not reviews:
            break

        for review in reviews:
            text = review.get("review") or ""

            cleaned_text = clean_comment(text)

            if is_valid_comment(cleaned_text):
                all_reviews.append(cleaned_text)

            if len(all_reviews) >= max_reviews:
                break

        new_cursor = data.get("cursor")

        if not new_cursor or new_cursor == cursor_value:
            break

        cursor_value = new_cursor
        time.sleep(0.3)

    return all_reviews


# =========================
# CLEANING
# =========================

def clean_comment(text):
    if not text:
        return ""

    text = str(text)

    # Remove links
    text = re.sub(
        r"https?://\S+|www\.\S+",
        "",
        text,
        flags=re.IGNORECASE
    )

    # Normalize whitespace
    text = re.sub(
        r"\s+",
        " ",
        text
    ).strip()

    return text


def is_valid_comment(text):
    text = clean_comment(text)

    if not text:
        return False

    if len(text) < 20:
        return False

    if len(text.split()) < 3:
        return False

    # Must contain English letters
    if not re.search(r"[A-Za-z]", text):
        return False

    return True


# =========================
# ANALYSIS
# =========================

def analyze_comments(comments):
    counts = {
        "threat": 0,
        "bullying": 0,
        "sexual_harassment": 0,
        "hate_speech": 0,
        "other_toxicity": 0
    }

    for i in range(0, len(comments), BATCH_SIZE):
        batch_texts = comments[i:i + BATCH_SIZE]

        inputs = tokenizer(
            batch_texts,
            return_tensors="pt",
            truncation=True,
            padding=True,
            max_length=256
        )

        with torch.no_grad():
            outputs = model(**inputs)

        probs = torch.sigmoid(outputs.logits).numpy()
        preds = (probs >= THRESHOLD).astype(int)

        # LABEL_0 = is_toxic (not used in final scoring)
        # LABEL_1 = threat
        # LABEL_2 = bullying
        # LABEL_3 = sexual_harassment
        # LABEL_4 = hate_speech
        # LABEL_5 = other_toxicity

        counts["threat"] += int(preds[:, 1].sum())
        counts["bullying"] += int(preds[:, 2].sum())
        counts["sexual_harassment"] += int(preds[:, 3].sum())
        counts["hate_speech"] += int(preds[:, 4].sum())
        counts["other_toxicity"] += int(preds[:, 5].sum())

    total = len(comments)

    percentages = {
        label: round((count / total) * 100, 2)
        for label, count in counts.items()
    }

    weighted_scores = {
        "sexual_harassment": round(percentages["sexual_harassment"] * weights["sexual_harassment"], 2),
        "hate_speech": round(percentages["hate_speech"] * weights["hate_speech"], 2),
        "bullying": round(percentages["bullying"] * weights["bullying"], 2),
        "threat": round(percentages["threat"] * weights["threat"], 2),
        "other_toxicity": round(percentages["other_toxicity"] * weights["other_toxicity"], 2)
    }

    overall = round(sum(weighted_scores.values()), 2)

    if overall <= 30:
        level = "Low"
    elif overall <= 69:
        level = "Medium"
    else:
        level = "High"

    return counts, overall, level


def analyze_single_comment(text):
    cleaned_text = clean_comment(text)

    if not is_valid_comment(cleaned_text):
        return None

    inputs = tokenizer(
        [cleaned_text],
        return_tensors="pt",
        truncation=True,
        padding=True,
        max_length=256
    )

    with torch.no_grad():
        outputs = model(**inputs)

    probs = torch.sigmoid(outputs.logits).numpy()
    preds = (probs >= THRESHOLD).astype(int)[0]

    return {
        "threat": int(preds[1]),
        "bullying": int(preds[2]),
        "sexual_harassment": int(preds[3]),
        "hate_speech": int(preds[4]),
        "other_toxicity": int(preds[5])
    }

def calculate_overall_from_counts(counts, total_comments):
    if total_comments <= 0:
        return 0.0, "New"

    percentages = {
        label: (count / total_comments) * 100
        for label, count in counts.items()
    }

    overall = (
        percentages["sexual_harassment"] * weights["sexual_harassment"]
        + percentages["hate_speech"] * weights["hate_speech"]
        + percentages["bullying"] * weights["bullying"]
        + percentages["threat"] * weights["threat"]
        + percentages["other_toxicity"] * weights["other_toxicity"]
    )

    overall = round(overall, 2)

    if overall <= 30:
        level = "Low"
    elif overall <= 69:
        level = "Medium"
    else:
        level = "High"

    return overall, level

def update_game_with_single_comment(game_id, prediction):
    cursor.execute("""
        SELECT
            threat,
            bullying,
            sexual_harassment,
            hate_speech,
            other_toxicity,
            comments_count
        FROM games
        WHERE game_id = %s
        LIMIT 1
    """, (game_id,))

    game = cursor.fetchone()

    if not game:
        raise ValueError("Game not found")

    new_counts = {
        "threat":
            int(game["threat"] or 0) + prediction["threat"],

        "bullying":
            int(game["bullying"] or 0) + prediction["bullying"],

        "sexual_harassment":
            int(game["sexual_harassment"] or 0) + prediction["sexual_harassment"],

        "hate_speech":
            int(game["hate_speech"] or 0) + prediction["hate_speech"],

        "other_toxicity":
            int(game["other_toxicity"] or 0) + prediction["other_toxicity"]
    }

    new_total = int(game["comments_count"] or 0) + 1

    overall, level = calculate_overall_from_counts(
        new_counts,
        new_total
    )

    cursor.execute("""
        UPDATE games
        SET
            threat = %s,
            bullying = %s,
            sexual_harassment = %s,
            hate_speech = %s,
            other_toxicity = %s,
            comments_count = %s,
            overall_risk_percent = %s,
            overall_risk_level = %s,
            analysis_status = 'analyzed',
            analyzed_at = CURRENT_TIMESTAMP
        WHERE game_id = %s
    """, (
        new_counts["threat"],
        new_counts["bullying"],
        new_counts["sexual_harassment"],
        new_counts["hate_speech"],
        new_counts["other_toxicity"],
        new_total,
        overall,
        level,
        game_id
    ))

    conn.commit()

    return {
        "counts": new_counts,
        "comments_count": new_total,
        "overall_risk_percent": overall,
        "overall_risk_level": level
    }
# =========================
# SAVE RESULTS
# =========================

def save_analyzed_result(game_id, scores, overall, level, comments_count, db=None):
    db_conn, db_cursor = db or (conn, cursor)
    db_cursor.execute("""
    UPDATE games
    SET
      threat = %s,
      bullying = %s,
      sexual_harassment = %s,
      hate_speech = %s,
      other_toxicity = %s,
      overall_risk_percent = %s,
      overall_risk_level = %s,
      comments_count = %s,
      analysis_status = 'analyzed',
      analyzed_at = CURRENT_TIMESTAMP
    WHERE game_id = %s
    """, (
        scores["threat"],
        scores["bullying"],
        scores["sexual_harassment"],
        scores["hate_speech"],
        scores["other_toxicity"],
        overall,
        level,
        comments_count,
        game_id
    ))
    db_conn.commit()


def save_no_comments_result(game_id, db=None):
    db_conn, db_cursor = db or (conn, cursor)
    db_cursor.execute("""
    UPDATE games
    SET
      threat = 0,
      bullying = 0,
      sexual_harassment = 0,
      hate_speech = 0,
      other_toxicity = 0,
      overall_risk_percent = 0,
      overall_risk_level = 'New',
      comments_count = 0,
      analysis_status = 'no_comments',
      analyzed_at = CURRENT_TIMESTAMP
    WHERE game_id = %s
    """, (game_id,))
    db_conn.commit()


# =========================
# PIPELINE
# =========================

def count_games(mode="all", game_id=None):
    """How many games a run would process (used by the admin page)."""
    db_conn = mysql.connector.connect(**DB_CONFIG)
    db_cursor = db_conn.cursor(dictionary=True)
    try:
        return len(select_games(db_cursor, mode, game_id))
    finally:
        db_cursor.close()
        db_conn.close()


def select_games(db_cursor, mode="all", game_id=None):
    if mode == "one":
        # one specific game (also re-analyzes it if it was analyzed before)
        db_cursor.execute("""
            SELECT game_id, api_game_id, game_name
            FROM games
            WHERE game_id = %s
        """, (game_id,))
    elif mode == "new":
        # games added from the admin page that are still waiting for analysis
        db_cursor.execute("""
            SELECT game_id, api_game_id, game_name
            FROM games
            WHERE COALESCE(analysis_status, 'no_comments') <> 'analyzed'
               OR COALESCE(comments_count, 0) = 0
            ORDER BY game_id ASC
        """)
    else:
        db_cursor.execute("""
            SELECT game_id, api_game_id, game_name
            FROM games
            ORDER BY game_id ASC
        """)
    return db_cursor.fetchall()


def site_extras(db_cursor, game_id):
    """
    What players added on Dir'a itself, so a re-analysis doesn't lose it:
      - comments written on the game page (site_comments, labels from the model)
      - resolved, non-spam complaints that were counted in the score
    Returns (counts per label, number of items).
    """
    counts = {"threat": 0, "bullying": 0, "sexual_harassment": 0, "hate_speech": 0, "other_toxicity": 0}
    n = 0
    try:
        db_cursor.execute("""
            SELECT COUNT(*) AS n,
                   COALESCE(SUM(threat), 0) AS threat,
                   COALESCE(SUM(bullying), 0) AS bullying,
                   COALESCE(SUM(sexual_harassment), 0) AS sexual_harassment,
                   COALESCE(SUM(hate_speech), 0) AS hate_speech,
                   COALESCE(SUM(other_toxicity), 0) AS other_toxicity
            FROM site_comments WHERE game_id = %s
        """, (game_id,))
        row = db_cursor.fetchone() or {}
        n += int(row.get("n") or 0)
        for k in counts:
            counts[k] += int(row.get(k) or 0)
    except Exception:
        pass  # table not created yet
    try:
        # same mapping as api/report-score.php
        db_cursor.execute("""
            SELECT COUNT(*) AS n,
                   COALESCE(SUM(behavior_threat = 1), 0) AS threat,
                   COALESCE(SUM(behavior_bullying = 1), 0) AS bullying,
                   COALESCE(SUM(behavior_sexual = 1), 0) AS sexual_harassment,
                   COALESCE(SUM(behavior_hate = 1), 0) AS hate_speech,
                   COALESCE(SUM(behavior_toxic = 1 OR TRIM(COALESCE(behavior_other, '')) <> ''), 0) AS other_toxicity
            FROM reports
            WHERE game_id = %s AND counted_in_score = 1
        """, (game_id,))
        row = db_cursor.fetchone() or {}
        n += int(row.get("n") or 0)
        for k in counts:
            counts[k] += int(row.get(k) or 0)
    except Exception:
        pass  # column not created yet
    return counts, n


def process_games(mode="all", game_id=None, refresh_youtube=False, dry_run=False,
                  on_progress=None, should_stop=None):
    """
    Fetch comments, run the model and save the results.
    mode: "one" (needs game_id), "new" (not analyzed yet) or "all".
    on_progress(done, total, game_name, message) is called as it goes.
    Uses its own database connection, so it can run in a background thread.
    Returns a summary dict.
    """
    db_conn = mysql.connector.connect(**DB_CONFIG)
    db_cursor = db_conn.cursor(dictionary=True)
    db = (db_conn, db_cursor)
    summary = {"total": 0, "analyzed": 0, "no_comments": 0, "skipped": 0, "errors": []}

    def report(done, total, name, message):
        print(message)
        if on_progress:
            try:
                on_progress(done, total, name, message)
            except Exception:
                pass

    try:
        db_cursor.execute("SELECT game_name FROM games")
        catalog = [row['game_name'] for row in db_cursor.fetchall() if row['game_name']]

        games = select_games(db_cursor, mode, game_id)
        total = len(games)
        summary["total"] = total
        report(0, total, None, f"Found {total} games to process.")

        for i, game in enumerate(games):
            if should_stop and should_stop():
                report(i, total, None, "Stopped by the admin.")
                summary["stopped"] = True
                break

            gid = game["game_id"]
            steam_app_id = game["api_game_id"]
            game_name = game["game_name"]
            report(i, total, game_name, f"Processing: {game_name} | game_id={gid} | Steam AppID={steam_app_id}")

            try:
                steam_comments = fetch_steam_reviews(steam_app_id, MAX_REVIEWS_PER_GAME) if steam_app_id else []

                try:
                    youtube_comments = fetch_youtube_comments(
                        game_name, catalog, clean_comment, is_valid_comment,
                        refresh=refresh_youtube
                    )
                except YouTubeError as error:
                    summary["skipped"] += 1
                    summary["errors"].append(f"{game_name}: {error}")
                    report(i + 1, total, game_name, f"Skipping game {gid}: {error}. Existing results kept.")
                    continue

                comments = merge_unique(steam_comments + youtube_comments, clean_comment, is_valid_comment)
                extra_counts, extra_n = site_extras(db_cursor, gid)

                if not comments and extra_n == 0:
                    if not dry_run:
                        save_no_comments_result(gid, db)
                    summary["no_comments"] += 1
                    report(i + 1, total, game_name, f"{game_name}: no comments found.")
                    continue

                scores = {k: 0 for k in extra_counts}
                if comments:
                    scores, _, _ = analyze_comments(comments)

                # add back what players shared on Dir'a (comments + resolved complaints)
                all_counts = {k: int(scores[k]) + int(extra_counts[k]) for k in extra_counts}
                all_total = len(comments) + extra_n
                overall, level = calculate_overall_from_counts(all_counts, all_total)

                if not dry_run:
                    save_analyzed_result(gid, all_counts, overall, level, all_total, db)
                summary["analyzed"] += 1
                report(i + 1, total, game_name,
                       f"{game_name}: {len(comments)} Steam/YouTube + {extra_n} from Dir'a, overall={overall}, level={level}")

            except Exception as error:  # keep going with the next game
                summary["errors"].append(f"{game_name}: {error}")
                report(i + 1, total, game_name, f"Error on {game_name}: {error}")

        return summary
    finally:
        db_cursor.close()
        db_conn.close()


# =========================
# COMMAND LINE
# =========================

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--game-id', type=int, help='Process one game, including previously analyzed games')
    parser.add_argument('--dry-run', action='store_true', help='Fetch and classify without database writes')
    parser.add_argument('--refresh-youtube', action='store_true', help="Ignore this month's cache")
    parser.add_argument('--only-new', action='store_true', help='Process only games that have not been analyzed yet')
    args = parser.parse_args()

    run_mode = "one" if args.game_id else ("new" if args.only_new else "all")
    result = process_games(run_mode, args.game_id, args.refresh_youtube, args.dry_run)
    print("\nDone.", result)

    cursor.close()
    conn.close()
