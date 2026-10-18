import os
from typing import Any, Dict, Optional

from flask import Flask, abort, jsonify, render_template, request

import progress
import storage


def create_app(db_path: Optional[str] = None, test_config: Optional[Dict[str, Any]] = None) -> Flask:
    """Application factory for the MCA Exam Revision Dashboard."""
    app = Flask(__name__)

    # Default configuration
    resolved_db_path = db_path if db_path is not None else storage.get_default_db_path()
    app.config["DATABASE"] = resolved_db_path

    if test_config is not None:
        app.config.update(test_config)

    # Initialize SQLite database and seed initial topics if empty
    storage.init_db(app.config["DATABASE"])

    @app.route("/")
    def dashboard():
        """Render main revision dashboard with overall progress and subjects in exam-date order."""
        db = app.config["DATABASE"]
        subjects = storage.get_all_subjects(db)
        topics = storage.get_all_topics(db)
        overall = progress.calculate_overall_summary(subjects, topics)
        return render_template("dashboard.html", overall=overall)

    @app.route("/subject/<code>")
    def subject_page(code: str):
        """Render subject page listing 5 modules with interactive topic checklists."""
        db = app.config["DATABASE"]
        subject = storage.get_subject_by_code(code, db)
        if subject is None:
            abort(404)

        topics = storage.get_topics_for_subject(code, db)
        subject_summary = progress.calculate_subject_summary(subject, topics)
        return render_template("subject.html", subject=subject_summary)

    @app.route("/toggle/<path:topic_id>", methods=["POST"])
    def toggle_topic_status(topic_id: str):
        """Toggle a topic's done state and return updated progress figures."""
        db = app.config["DATABASE"]
        updated_topic = storage.toggle_topic(topic_id, db)
        if updated_topic is None:
            abort(404)

        code = updated_topic["code"]
        module_no = updated_topic["module_no"]

        # Recalculate progress numbers
        subject_topics = storage.get_topics_for_subject(code, db)
        all_topics = storage.get_all_topics(db)

        # Module stats
        mod_topics = [t for t in subject_topics if t["module_no"] == module_no]
        mod_total = len(mod_topics)
        mod_done = sum(1 for t in mod_topics if t["done"])
        mod_percent = progress.calculate_percentage(mod_done, mod_total)

        # Subject stats
        subj_total = len(subject_topics)
        subj_done = sum(1 for t in subject_topics if t["done"])
        subj_percent = progress.calculate_percentage(subj_done, subj_total)

        # Overall stats
        overall_total = len(all_topics)
        overall_done = sum(1 for t in all_topics if t["done"])
        overall_percent = progress.calculate_percentage(overall_done, overall_total)

        return jsonify(
            {
                "success": True,
                "topic_id": updated_topic["topic_id"],
                "done": updated_topic["done"],
                "module_no": module_no,
                "module_done": mod_done,
                "module_total": mod_total,
                "module_percent": mod_percent,
                "subject_code": code,
                "subject_done": subj_done,
                "subject_total": subj_total,
                "subject_percent": subj_percent,
                "overall_done": overall_done,
                "overall_total": overall_total,
                "overall_percent": overall_percent,
            }
        )

    @app.errorhandler(404)
    def not_found(e):
        """Handle 404 errors for both API and browser requests."""
        if (
            request.path.startswith("/toggle/")
            or request.headers.get("Accept") == "application/json"
        ):
            return jsonify({"error": "Resource not found"}), 404
        return render_template("404.html"), 404

    return app


app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
