# Implementation Plan: Exam Revision Dashboard (Flask)

Audience: the coding agent that will build this app.
Owner: Shyam (MCA, Semester III exams, Oct 23 - Nov 6, 2026).

## 0. Ground rules

1. **Read `design.md` (in this project folder) before anything else.** It is the single source of truth for visual design, layout and styling. Follow it exactly. Do not invent design choices it does not cover; if something is unspecified, ask the user instead of guessing.
2. **Do not add features that are not listed in this plan** (no login, no notes, no timers, no charts beyond what is listed, no extra pages). The app is a revision tracker, nothing more.
3. **Do not edit the syllabus content.** Use `syllabus_seed.json` exactly as provided. It was transcribed from the user's syllabus PDF.
4. If this plan and `design.md` conflict, stop and ask the user.

## 1. Purpose

A personal exam revision dashboard. The user ticks off syllabus topics as they revise them and sees, per subject and overall, how many are done and how many remain.

## 2. Scope (what the app does)

| # | Feature |
|---|---|
| F1 | **Dashboard**: overall progress (done / total topics, %), plus one card per subject showing exam date and time, done / total topics, and a progress bar |
| F2 | **Subject page**: the subject's modules, each listing its topics with a checkbox. Ticking or unticking saves immediately |
| F3 | **Module progress**: each module shows done / total topics |
| F4 | **Exam order**: subject cards on the dashboard are ordered by exam date (earliest first) |
| F5 | **Persistence**: all progress is stored in a SQLite database (see section 4) |

Out of scope: user accounts, multiple users, notes, study schedules, reminders, import/export UI, mobile app.

## 3. Data

### 3.1 Subjects (7) and topic counts

Source file: `syllabus_seed.json`. Each subject has 5 modules; each topic has a `ref` (the syllabus numbering, e.g. `2.3`) and its `text`.

| Code | Subject | Exam date (2026) | Time | Topics |
|---|---|---|---|---|
| MCA302 | Theory of Computation and Compilers | Oct 23 (Fri) | 9:30 AM - 12:30 PM | 20 |
| MCA303 | Machine Learning | Oct 26 (Mon) | 9:30 AM - 12:30 PM | 18 |
| MCA304 | Cyber Security Essentials | Oct 28 (Wed) | 9:30 AM - 12:30 PM | 19 |
| MCA322 | .NET | Oct 30 (Fri) | 9:30 AM - 12:30 PM | 15 |
| MCA301 | Internet of Things | Nov 2 (Mon) | 9:30 AM - 4:30 PM | 21 |
| MCA306 | Data Analytics using Python | Nov 4 (Wed) | 9:30 AM - 4:30 PM | 20 |
| MCA307 | Android | Nov 6 (Fri) | 9:30 AM - 4:30 PM | 20 |

Total: **133 topics**.

### 3.2 Items the user should confirm (do not resolve these yourself)

- **Year of the exams**: the timetable gave no year. 2026 is used because the weekdays match 2026. Confirm.
- **MCA301 Internet of Things**: the syllabus lists it as a Core theory course, but the timetable marks it "(Lab)". Topics follow the syllabus.
- **MCA301 module 5**: the syllabus has five items but only labels 5.1 to 5.4. The seed uses `5.1a` for "Planning and designing an IoT project" to keep all five items. Confirm the numbering.
- **MCA322 .NET**: the course objectives mention ASP.NET Core / Entity Framework Core, but the module content covers C#, ADO.NET, serialization, remoting and Windows Forms. The seed follows the module content.
- **MCA311 Deep Learning** is not included; the user's Oct 30 paper is .NET.

## 4. Storage (SQLite)

Decision (from the user): use a simple database instead of Excel. SQLite is used via Python's built-in `sqlite3` module, so no extra dependency is needed.

File: `progress.db`, created on first run and seeded from `syllabus_seed.json` if the tables are empty.

**Table `subjects`**

| Column | Type | Content |
|---|---|---|
| `code` | TEXT, primary key | e.g. MCA302 |
| `name` | TEXT | Subject name |
| `exam_date` | TEXT | ISO date |
| `exam_time` | TEXT | Text as in the table in section 3.1 |

**Table `topics`**

| Column | Type | Content |
|---|---|---|
| `topic_id` | TEXT, primary key | `<code>-<module_no>-<ref>`, e.g. `MCA302-2-2.3` |
| `code` | TEXT, foreign key to `subjects.code` | Subject code |
| `module_no` | INTEGER | 1 to 5 |
| `ref` | TEXT | Syllabus numbering |
| `text` | TEXT | Topic text |
| `done` | INTEGER | `0` or `1` (default `0`) |

Rules:
- Only `topics.done` is ever changed by the app. Never modify the syllabus text after seeding.
- Seeding runs only when the tables are empty, so restarting the app never resets progress.
- Use parameterised queries only. Open a connection per request and close it afterwards.
- Progress figures (done, total, %) are computed with queries when a page loads. Do not store them.

## 5. Application structure

```
exam-revision-app/
  design.md                 (provided by user; read first)
  syllabus_seed.json        (provided)
  IMPLEMENTATION_PLAN.md
  app.py                    Flask app factory and routes
  storage.py                SQLite connection, schema, seeding, queries
  progress.py               Pure functions: counts, percentages, ordering
  templates/
    base.html
    dashboard.html
    subject.html
  static/                     CSS/JS as dictated by design.md
  requirements.txt            flask
  tests/
    test_progress.py
    test_storage.py
    test_routes.py
```

### 5.1 Routes

| Method | Path | Behaviour |
|---|---|---|
| GET | `/` | Dashboard (F1, F4) |
| GET | `/subject/<code>` | Subject page (F2, F3); 404 for unknown code |
| POST | `/toggle/<topic_id>` | Flip `done`, save, return the updated counts (JSON) so the page updates without a reload; 404 for unknown id |

### 5.2 Page content

**Dashboard**
- Overall: done / total topics and percentage.
- One card per subject, ordered by exam date: code, name, exam date and time, done / total, progress bar, link to the subject page.

**Subject page**
- Header: code, name, exam date and time, done / total.
- Five module sections, each with "done / total" and the topic checklist (`ref` + `text`).
- Back link to the dashboard.

All visual treatment comes from `design.md`.

## 6. Build phases

| Phase | Work | Done when |
|---|---|---|
| 1 | Project skeleton, `requirements.txt`, read `design.md`, base template and styling per design | App starts, base page renders in the specified style |
| 2 | `storage.py`: create schema, seed `progress.db` from `syllabus_seed.json`; read topics; toggle a topic | Fresh run creates a database with 7 subjects and 133 topics; toggling persists across restarts |
| 3 | `progress.py` + dashboard page | Dashboard shows correct overall and per-subject counts, ordered by exam date |
| 4 | Subject page + `/toggle` with in-page update | Ticking a topic updates module, subject and (on return) dashboard counts |
| 5 | Error handling and tests | All tests below pass; unknown-id and restart-without-reset cases handled |

## 7. Acceptance criteria

1. First run with no `progress.db` creates it with exactly 7 subjects and 133 topics, all not done.
2. Total of per-subject topic counts equals 133 and matches the table in section 3.1.
3. Ticking a topic changes only that row's `done` value; restarting the app keeps it ticked and does not re-seed.
4. Dashboard percentages equal done / total for each subject and overall; 0 topics done shows 0%.
5. Subject cards are in exam-date order: MCA302, MCA303, MCA304, MCA322, MCA301, MCA306, MCA307.
6. The UI matches `design.md`. Any deviation is listed in the final report to the user.
7. No feature outside section 2 exists.

## 8. Tests

- `test_progress.py`: counts and percentages for 0, partial and full completion; ordering by date.
- `test_storage.py`: seeding, no re-seed on restart, toggle round-trip, unknown id, that only `done` changes.
- `test_routes.py`: `/` returns 200 with all 7 subjects; `/subject/MCA302` returns 200; `/subject/XYZ` returns 404; `POST /toggle/<id>` returns updated counts.

## 9. Final report the agent must give the user

- How to install and run (commands).
- Where `progress.db` is created.
- Any place where `design.md` was unclear and what was asked or decided.
- Answers needed for the items in section 3.2.
