from datetime import datetime
from typing import Any, Dict, List, Sequence, Union


def calculate_percentage(done: int, total: int) -> int:
    """
    Calculate integer completion percentage from done and total counts.
    Returns 0 if total is 0 or done is 0.
    """
    if total <= 0 or done <= 0:
        return 0
    if done >= total:
        return 100
    return round((done / total) * 100)


def sort_subjects_by_exam_date(subjects: Sequence[Union[Dict[str, Any], Any]]) -> List[Any]:
    """
    Sort a list of subject dicts or sqlite3.Row objects by exam_date ascending.
    """
    return sorted(subjects, key=lambda s: s["exam_date"])


def format_exam_date(iso_date: str) -> str:
    """
    Format ISO date 'YYYY-MM-DD' into a readable format e.g. 'Oct 23 (Fri)'.
    Falls back to the input string if parsing fails.
    """
    try:
        dt = datetime.strptime(iso_date.strip(), "%Y-%m-%d")
        return dt.strftime("%b %d (%a)")
    except Exception:
        return iso_date


def calculate_module_progress(topics: Sequence[Union[Dict[str, Any], Any]]) -> Dict[int, Dict[str, Any]]:
    """
    Given a list of topics for a subject, group them by module_no (1-5),
    and calculate total, done, percent, list of topics, and grouped sections for each module.
    """
    modules: Dict[int, Dict[str, Any]] = {
        m: {"module_no": m, "total": 0, "done": 0, "percent": 0, "topics": [], "sections": []}
        for m in range(1, 6)
    }

    for topic in topics:
        m_no = topic["module_no"]
        if m_no not in modules:
            modules[m_no] = {"module_no": m_no, "total": 0, "done": 0, "percent": 0, "topics": [], "sections": []}
        modules[m_no]["total"] += 1
        if topic["done"]:
            modules[m_no]["done"] += 1
        modules[m_no]["topics"].append(topic)

    for m_no, m_data in modules.items():
        m_data["percent"] = calculate_percentage(m_data["done"], m_data["total"])

        sections_dict: Dict[str, Dict[str, Any]] = {}
        for t in m_data["topics"]:
            s_ref = ""
            try:
                s_ref = t["ref"]
            except Exception:
                s_ref = ""
            if not s_ref:
                s_ref = f"{m_no}.1"

            if s_ref not in sections_dict:
                s_title = ""
                try:
                    s_title = t["section_title"]
                except Exception:
                    s_title = ""
                if not s_title:
                    s_title = f"Section {s_ref}"

                sections_dict[s_ref] = {
                    "ref": s_ref,
                    "title": s_title,
                    "topics": [],
                    "total": 0,
                    "done": 0,
                    "percent": 0,
                }
            sections_dict[s_ref]["topics"].append(t)
            sections_dict[s_ref]["total"] += 1
            if t["done"]:
                sections_dict[s_ref]["done"] += 1

        for s_ref, s_data in sections_dict.items():
            s_data["percent"] = calculate_percentage(s_data["done"], s_data["total"])

        m_data["sections"] = list(sections_dict.values())

    return modules


def calculate_subject_summary(
    subject: Union[Dict[str, Any], Any],
    topics: Sequence[Union[Dict[str, Any], Any]],
) -> Dict[str, Any]:
    """
    Calculate summary stats for a single subject: done, total, percent, formatted date,
    and module breakdown.
    """
    total = len(topics)
    done = sum(1 for t in topics if t["done"])
    percent = calculate_percentage(done, total)
    module_data = calculate_module_progress(topics)

    return {
        "code": subject["code"],
        "name": subject["name"],
        "exam_date": subject["exam_date"],
        "exam_date_display": format_exam_date(subject["exam_date"]),
        "exam_time": subject["exam_time"],
        "total": total,
        "done": done,
        "percent": percent,
        "modules": module_data,
    }


def calculate_overall_summary(
    all_subjects: Sequence[Union[Dict[str, Any], Any]],
    all_topics: Sequence[Union[Dict[str, Any], Any]],
) -> Dict[str, Any]:
    """
    Calculate overall dashboard stats and subject cards list in exam_date order.
    """
    sorted_subjects = sort_subjects_by_exam_date(all_subjects)

    topics_by_code: Dict[str, List[Any]] = {}
    for t in all_topics:
        code = t["code"]
        if code not in topics_by_code:
            topics_by_code[code] = []
        topics_by_code[code].append(t)

    subjects_summary = [
        calculate_subject_summary(s, topics_by_code.get(s["code"], []))
        for s in sorted_subjects
    ]

    overall_total = len(all_topics)
    overall_done = sum(1 for t in all_topics if t["done"])
    overall_percent = calculate_percentage(overall_done, overall_total)

    return {
        "total": overall_total,
        "done": overall_done,
        "percent": overall_percent,
        "subjects": subjects_summary,
    }
