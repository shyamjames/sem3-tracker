document.addEventListener('DOMContentLoaded', () => {
  const checkboxes = document.querySelectorAll('.topic-checkbox');

  checkboxes.forEach((checkbox) => {
    checkbox.addEventListener('change', async (event) => {
      const topicId = checkbox.dataset.topicId;
      const topicRow = checkbox.closest('.topic-row');
      const originalChecked = !checkbox.checked;

      checkbox.disabled = true;

      try {
        const response = await fetch(`/toggle/${encodeURIComponent(topicId)}`, {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Toggle request failed with status ${response.status}`);
        }

        const data = await response.json();

        // Update row styling
        if (data.done) {
          topicRow.classList.add('is-done');
          checkbox.checked = true;
        } else {
          topicRow.classList.remove('is-done');
          checkbox.checked = false;
        }

        // Update module numbers and bar
        const moduleNo = data.module_no;
        const moduleBadge = document.getElementById(`module-badge-${moduleNo}`);
        const moduleBar = document.getElementById(`module-bar-${moduleNo}`);

        if (moduleBadge) {
          moduleBadge.textContent = `${data.module_done} / ${data.module_total} done (${data.module_percent}%)`;
        }
        if (moduleBar) {
          moduleBar.style.width = `${data.module_percent}%`;
        }

        // Update subject header numbers and bar
        const subjectCountElem = document.getElementById('subject-count-text');
        const subjectPctElem = document.getElementById('subject-pct-text');
        const subjectBar = document.getElementById('subject-bar-fill');

        if (subjectCountElem) {
          subjectCountElem.textContent = `${data.subject_done} / ${data.subject_total} completed`;
        }
        if (subjectPctElem) {
          subjectPctElem.textContent = `${data.subject_percent}%`;
        }
        if (subjectBar) {
          subjectBar.style.width = `${data.subject_percent}%`;
        }
      } catch (err) {
        console.error('Error toggling topic status:', err);
        checkbox.checked = originalChecked;
      } finally {
        checkbox.disabled = false;
      }
    });
  });
});
