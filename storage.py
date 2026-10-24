import json
import os
import sqlite3
from typing import Any, Dict, List, Optional, Tuple

def get_default_db_path() -> str:
    """Return default database path, automatically adapting to /tmp on Vercel serverless environments."""
    if os.environ.get("DATABASE_PATH"):
        return os.environ["DATABASE_PATH"]
    if os.environ.get("VERCEL"):
        return "/tmp/progress.db"
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), "progress.db")


DEFAULT_DB_PATH = get_default_db_path()
DEFAULT_SEED_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "syllabus_seed.json")


def get_db_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    """Create and return a new SQLite database connection configured with Row factory."""
    path = db_path if db_path is not None else get_default_db_path()
    conn = sqlite3.connect(path)
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: Optional[str] = None, seed_path: Optional[str] = None) -> None:
    """
    Initialize SQLite schema and seed initial data if empty.
    Seeding runs only when the tables are empty, so restarting the app never resets progress.
    """
    path = db_path if db_path is not None else get_default_db_path()

    seed_file = seed_path if seed_path is not None else DEFAULT_SEED_PATH

    conn = get_db_connection(path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS subjects (
                code TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                exam_date TEXT NOT NULL,
                exam_time TEXT NOT NULL
            );
            """
        )
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS topics (
                topic_id TEXT PRIMARY KEY,
                code TEXT NOT NULL,
                module_no INTEGER NOT NULL,
                ref TEXT NOT NULL,
                text TEXT NOT NULL,
                done INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (code) REFERENCES subjects(code)
            );
            """
        )
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_topics_code ON topics(code);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_topics_module ON topics(code, module_no);")

        cursor.execute("SELECT COUNT(*) FROM subjects;")
        subjects_count = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(*) FROM topics;")
        topics_count = cursor.fetchone()[0]

        with open(seed_file, "r", encoding="utf-8") as f:
            seed_data = json.load(f)

        seed_topics_count = sum(
            len(m.get("topics", []))
            for s in seed_data.get("subjects", [])
            for m in s.get("modules", [])
        )

        if subjects_count == 0 or topics_count != seed_topics_count:
            cursor.execute("DELETE FROM topics;")
            cursor.execute("DELETE FROM subjects;")

            for subject in seed_data.get("subjects", []):
                code = subject["code"]
                name = subject["name"]
                exam_date = subject["exam_date"]
                exam_time = subject["exam_time"]

                cursor.execute(
                    """
                    INSERT INTO subjects (code, name, exam_date, exam_time)
                    VALUES (?, ?, ?, ?);
                    """,
                    (code, name, exam_date, exam_time),
                )

                for module in subject.get("modules", []):
                    module_no = module["module_no"]
                    for topic in module.get("topics", []):
                        ref = topic["ref"]
                        text = topic["text"]
                        topic_id = f"{code}-{module_no}-{ref}"

                        cursor.execute(
                            """
                            INSERT INTO topics (topic_id, code, module_no, ref, text, done)
                            VALUES (?, ?, ?, ?, ?, 0);
                            """,
                            (topic_id, code, module_no, ref, text),
                        )
            conn.commit()
    finally:
        conn.close()


def get_all_subjects(db_path: Optional[str] = None) -> List[sqlite3.Row]:
    """Retrieve all subjects ordered by exam date ascending."""
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT code, name, exam_date, exam_time FROM subjects ORDER BY exam_date ASC;")
        return cursor.fetchall()
    finally:
        conn.close()


def get_subject_by_code(code: str, db_path: Optional[str] = None) -> Optional[sqlite3.Row]:
    """Retrieve a single subject by its subject code."""
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT code, name, exam_date, exam_time FROM subjects WHERE code = ?;", (code,))
        return cursor.fetchone()
    finally:
        conn.close()


def get_topics_for_subject(code: str, db_path: Optional[str] = None) -> List[sqlite3.Row]:
    """Retrieve all topics for a given subject in module and row insertion order."""
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT topic_id, code, module_no, ref, text, done
            FROM topics
            WHERE code = ?
            ORDER BY module_no ASC, rowid ASC;
            """,
            (code,),
        )
        return cursor.fetchall()
    finally:
        conn.close()


def get_all_topics(db_path: Optional[str] = None) -> List[sqlite3.Row]:
    """Retrieve all topics across all subjects."""
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT topic_id, code, module_no, ref, text, done FROM topics ORDER BY rowid ASC;")
        return cursor.fetchall()
    finally:
        conn.close()


def get_topic_by_id(topic_id: str, db_path: Optional[str] = None) -> Optional[sqlite3.Row]:
    """Retrieve a single topic by its unique topic ID."""
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT topic_id, code, module_no, ref, text, done FROM topics WHERE topic_id = ?;",
            (topic_id,),
        )
        return cursor.fetchone()
    finally:
        conn.close()


def toggle_topic(topic_id: str, db_path: Optional[str] = None) -> Optional[sqlite3.Row]:
    """
    Flip the done status (0 to 1, or 1 to 0) of the specified topic.
    Returns the updated topic row, or None if the topic does not exist.
    """
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT done FROM topics WHERE topic_id = ?;", (topic_id,))
        row = cursor.fetchone()
        if row is None:
            return None

        new_done = 0 if row["done"] else 1
        cursor.execute("UPDATE topics SET done = ? WHERE topic_id = ?;", (new_done, topic_id))
        conn.commit()

        cursor.execute(
            "SELECT topic_id, code, module_no, ref, text, done FROM topics WHERE topic_id = ?;",
            (topic_id,),
        )
        return cursor.fetchone()
    finally:
        conn.close()


def get_counts(db_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Compute progress counts (done and total) per subject, per module, and overall.
    Calculated dynamically from database tables without storing precomputed progress.
    """
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()

        # Overall counts
        cursor.execute("SELECT COUNT(*), COALESCE(SUM(done), 0) FROM topics;")
        overall_total, overall_done = cursor.fetchone()

        # Per-subject counts
        cursor.execute(
            """
            SELECT code, COUNT(*) as total, COALESCE(SUM(done), 0) as done
            FROM topics
            GROUP BY code;
            """
        )
        subject_counts = {row["code"]: {"total": row["total"], "done": row["done"]} for row in cursor.fetchall()}

        # Per-module counts
        cursor.execute(
            """
            SELECT code, module_no, COUNT(*) as total, COALESCE(SUM(done), 0) as done
            FROM topics
            GROUP BY code, module_no;
            """
        )
        module_counts: Dict[str, Dict[int, Dict[str, int]]] = {}
        for row in cursor.fetchall():
            s_code = row["code"]
            m_no = row["module_no"]
            if s_code not in module_counts:
                module_counts[s_code] = {}
            module_counts[s_code][m_no] = {"total": row["total"], "done": row["done"]}

        return {
            "overall": {"total": overall_total, "done": overall_done},
            "subjects": subject_counts,
            "modules": module_counts,
        }
    finally:
        conn.close()
