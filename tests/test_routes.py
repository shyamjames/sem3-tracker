import json
import os
import tempfile
import unittest

from app import create_app
import storage


class TestRoutes(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "test_routes.db")
        self.app = create_app(db_path=self.db_path, test_config={"TESTING": True})
        self.client = self.app.test_client()

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_dashboard_returns_200_and_all_subjects(self):
        """GET / returns 200 with all 7 subjects and overall progress."""
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)

        # Check all 7 subject codes appear in response
        expected_codes = ["MCA302", "MCA303", "MCA304", "MCA322", "MCA301", "MCA306", "MCA307"]
        for code in expected_codes:
            self.assertIn(code, html)

        # Check total count mentions 388
        self.assertIn("388", html)

    def test_subject_page_valid_returns_200(self):
        """GET /subject/MCA302 returns 200 with syllabus modules and topics."""
        response = self.client.get("/subject/MCA302")
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)

        self.assertIn("Theory of Computation and Compilers", html)
        self.assertIn("Module 1", html)
        self.assertIn("Module 5", html)
        self.assertIn("MCA302-1-1.1.1", html)

    def test_subject_page_invalid_returns_404(self):
        """GET /subject/XYZ returns 404."""
        response = self.client.get("/subject/XYZ")
        self.assertEqual(response.status_code, 404)

    def test_toggle_route_returns_updated_counts(self):
        """POST /toggle/<topic_id> flips done and returns JSON with updated counts."""
        topic_id = "MCA302-1-1.1.1"

        # Initially 0 done. Toggle to 1
        response = self.client.post(f"/toggle/{topic_id}")
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.get_data(as_text=True))

        self.assertTrue(data["success"])
        self.assertEqual(data["topic_id"], topic_id)
        self.assertEqual(data["done"], 1)
        self.assertEqual(data["module_no"], 1)
        self.assertEqual(data["module_done"], 1)
        self.assertEqual(data["module_total"], 13)
        self.assertEqual(data["module_percent"], 8)
        self.assertEqual(data["subject_code"], "MCA302")
        self.assertEqual(data["subject_done"], 1)
        self.assertEqual(data["subject_total"], 53)
        self.assertEqual(data["subject_percent"], 2)
        self.assertEqual(data["overall_done"], 1)
        self.assertEqual(data["overall_total"], 388)
        self.assertEqual(data["overall_percent"], 0)

        # Toggle back to 0
        response2 = self.client.post(f"/toggle/{topic_id}")
        self.assertEqual(response2.status_code, 200)
        data2 = json.loads(response2.get_data(as_text=True))

        self.assertEqual(data2["done"], 0)
        self.assertEqual(data2["module_done"], 0)
        self.assertEqual(data2["module_percent"], 0)
        self.assertEqual(data2["subject_done"], 0)
        self.assertEqual(data2["overall_done"], 0)

    def test_toggle_unknown_id_returns_404(self):
        """POST /toggle/<unknown_id> returns 404."""
        response = self.client.post("/toggle/NON-EXISTENT-TOPIC-ID")
        self.assertEqual(response.status_code, 404)

    def test_vercel_rewrite_subject(self):
        """Simulate Vercel routing /subject/MCA302 via /api/index?__path=subject/MCA302."""
        response = self.client.get("/api/index?__path=subject/MCA302")
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertIn("Theory of Computation and Compilers", html)
        self.assertIn("Module 1", html)

    def test_vercel_rewrite_toggle(self):
        """Simulate Vercel routing /toggle/<id> via /api/index?__path=toggle/<id>."""
        topic_id = "MCA302-1-1.1.1"
        response = self.client.post(f"/api/index?__path=toggle/{topic_id}")
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.get_data(as_text=True))
        self.assertTrue(data["success"])
        self.assertEqual(data["topic_id"], topic_id)


if __name__ == "__main__":
    unittest.main()

