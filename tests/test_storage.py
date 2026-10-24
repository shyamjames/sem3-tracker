import os
import tempfile
import unittest

import storage


class TestStorage(unittest.TestCase):
    def setUp(self):
        # Create a temporary database file for each test
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_progress.db")

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_seeding_creates_exact_counts(self):
        """First run creates exactly 7 subjects and 388 granular topics, all with done = 0."""
        storage.init_db(self.db_path)

        subjects = storage.get_all_subjects(self.db_path)
        self.assertEqual(len(subjects), 7)

        topics = storage.get_all_topics(self.db_path)
        self.assertEqual(len(topics), 388)
        self.assertTrue(all(t["done"] == 0 for t in topics))

        # Check expected subject codes
        codes = [s["code"] for s in subjects]
        expected_codes = ["MCA302", "MCA303", "MCA304", "MCA322", "MCA301", "MCA306", "MCA307"]
        self.assertEqual(codes, expected_codes)

        # Check per-subject topic counts match granularized syllabus
        expected_counts = {
            "MCA302": 53,
            "MCA303": 70,
            "MCA304": 55,
            "MCA322": 59,
            "MCA301": 39,
            "MCA306": 53,
            "MCA307": 59,
        }
        for code, expected_cnt in expected_counts.items():
            subj_topics = storage.get_topics_for_subject(code, self.db_path)
            self.assertEqual(len(subj_topics), expected_cnt, f"Mismatch for {code}")

    def test_no_reseed_on_restart(self):
        """Calling init_db again does not reset modified topic progress or create duplicates."""
        storage.init_db(self.db_path)

        # Toggle a topic
        topic_id = "MCA302-1-1.1.1"
        updated = storage.toggle_topic(topic_id, self.db_path)
        self.assertEqual(updated["done"], 1)

        # Simulate app restart by re-invoking init_db
        storage.init_db(self.db_path)

        # Verify counts are still 7 and 388
        subjects = storage.get_all_subjects(self.db_path)
        self.assertEqual(len(subjects), 7)
        topics = storage.get_all_topics(self.db_path)
        self.assertEqual(len(topics), 388)

        # Verify the toggled topic is still done = 1
        persisted = storage.get_topic_by_id(topic_id, self.db_path)
        self.assertIsNotNone(persisted)
        self.assertEqual(persisted["done"], 1)

    def test_toggle_round_trip(self):
        """Toggling 0 -> 1 -> 0 works and returns updated row."""
        storage.init_db(self.db_path)
        topic_id = "MCA303-2-2.1.1"

        initial = storage.get_topic_by_id(topic_id, self.db_path)
        self.assertEqual(initial["done"], 0)

        # Toggle to 1
        toggled_1 = storage.toggle_topic(topic_id, self.db_path)
        self.assertEqual(toggled_1["done"], 1)

        # Toggle back to 0
        toggled_0 = storage.toggle_topic(topic_id, self.db_path)
        self.assertEqual(toggled_0["done"], 0)

    def test_toggle_unknown_id(self):
        """Toggling non-existent topic ID returns None."""
        storage.init_db(self.db_path)
        res = storage.toggle_topic("NON_EXISTENT_ID", self.db_path)
        self.assertIsNone(res)

    def test_only_done_changes(self):
        """Toggling a topic changes only 'done', preserving all other syllabus columns."""
        storage.init_db(self.db_path)
        topic_id = "MCA304-3-3.1.1"

        before = dict(storage.get_topic_by_id(topic_id, self.db_path))
        storage.toggle_topic(topic_id, self.db_path)
        after = dict(storage.get_topic_by_id(topic_id, self.db_path))

        self.assertEqual(before["topic_id"], after["topic_id"])
        self.assertEqual(before["code"], after["code"])
        self.assertEqual(before["module_no"], after["module_no"])
        self.assertEqual(before["ref"], after["ref"])
        self.assertEqual(before["text"], after["text"])
        self.assertNotEqual(before["done"], after["done"])
        self.assertEqual(after["done"], 1)


if __name__ == "__main__":
    unittest.main()
