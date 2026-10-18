import unittest

import progress


class TestProgress(unittest.TestCase):
    def test_calculate_percentage_zero(self):
        self.assertEqual(progress.calculate_percentage(0, 0), 0)
        self.assertEqual(progress.calculate_percentage(0, 20), 0)

    def test_calculate_percentage_full(self):
        self.assertEqual(progress.calculate_percentage(20, 20), 100)
        self.assertEqual(progress.calculate_percentage(15, 15), 100)

    def test_calculate_percentage_partial(self):
        # 1 out of 20 = 5%
        self.assertEqual(progress.calculate_percentage(1, 20), 5)
        # 10 out of 20 = 50%
        self.assertEqual(progress.calculate_percentage(10, 20), 50)
        # 1 out of 3 = 33% (rounded)
        self.assertEqual(progress.calculate_percentage(1, 3), 33)
        # 2 out of 3 = 67% (rounded)
        self.assertEqual(progress.calculate_percentage(2, 3), 67)

    def test_sort_subjects_by_exam_date(self):
        subjects = [
            {"code": "MCA307", "exam_date": "2026-11-06"},
            {"code": "MCA302", "exam_date": "2026-10-23"},
            {"code": "MCA304", "exam_date": "2026-10-28"},
            {"code": "MCA303", "exam_date": "2026-10-26"},
        ]
        sorted_subs = progress.sort_subjects_by_exam_date(subjects)
        expected_codes = ["MCA302", "MCA303", "MCA304", "MCA307"]
        self.assertEqual([s["code"] for s in sorted_subs], expected_codes)

    def test_format_exam_date(self):
        self.assertEqual(progress.format_exam_date("2026-10-23"), "Oct 23 (Fri)")
        self.assertEqual(progress.format_exam_date("2026-11-02"), "Nov 02 (Mon)")

    def test_calculate_module_progress(self):
        topics = [
            {"topic_id": "T1", "module_no": 1, "done": 1},
            {"topic_id": "T2", "module_no": 1, "done": 0},
            {"topic_id": "T3", "module_no": 2, "done": 1},
            {"topic_id": "T4", "module_no": 2, "done": 1},
        ]
        module_data = progress.calculate_module_progress(topics)
        self.assertEqual(module_data[1]["total"], 2)
        self.assertEqual(module_data[1]["done"], 1)
        self.assertEqual(module_data[1]["percent"], 50)

        self.assertEqual(module_data[2]["total"], 2)
        self.assertEqual(module_data[2]["done"], 2)
        self.assertEqual(module_data[2]["percent"], 100)

        # Empty module 3
        self.assertEqual(module_data[3]["total"], 0)
        self.assertEqual(module_data[3]["done"], 0)
        self.assertEqual(module_data[3]["percent"], 0)

    def test_calculate_overall_summary(self):
        subjects = [
            {"code": "MCA302", "name": "Theory of Computation", "exam_date": "2026-10-23", "exam_time": "9:30 AM"},
            {"code": "MCA303", "name": "Machine Learning", "exam_date": "2026-10-26", "exam_time": "9:30 AM"},
        ]
        topics = [
            {"topic_id": "MCA302-1-1.1", "code": "MCA302", "module_no": 1, "ref": "1.1", "text": "Topic 1", "done": 1},
            {"topic_id": "MCA302-1-1.2", "code": "MCA302", "module_no": 1, "ref": "1.2", "text": "Topic 2", "done": 0},
            {"topic_id": "MCA303-1-1.1", "code": "MCA303", "module_no": 1, "ref": "1.1", "text": "Topic 3", "done": 0},
            {"topic_id": "MCA303-1-1.2", "code": "MCA303", "module_no": 1, "ref": "1.2", "text": "Topic 4", "done": 0},
        ]
        summary = progress.calculate_overall_summary(subjects, topics)
        self.assertEqual(summary["total"], 4)
        self.assertEqual(summary["done"], 1)
        self.assertEqual(summary["percent"], 25)
        self.assertEqual(len(summary["subjects"]), 2)
        self.assertEqual(summary["subjects"][0]["code"], "MCA302")
        self.assertEqual(summary["subjects"][0]["percent"], 50)
        self.assertEqual(summary["subjects"][1]["code"], "MCA303")
        self.assertEqual(summary["subjects"][1]["percent"], 0)


if __name__ == "__main__":
    unittest.main()
