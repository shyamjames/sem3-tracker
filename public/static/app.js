import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Firebase configuration provided by user
const firebaseConfig = {
  apiKey: "AIzaSyCSKuNpJoPBe7ixc7vRdYtMVeIRXhk19yE",
  authDomain: "sem3-tracker-2849f.firebaseapp.com",
  projectId: "sem3-tracker-2849f",
  storageBucket: "sem3-tracker-2849f.firebasestorage.app",
  messagingSenderId: "813560141495",
  appId: "1:813560141495:web:f9c12d3ef8b8ae3f3a9f32"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const STORAGE_KEY = "sem3_study_tracker_topics";

// Valid topic IDs injected from server to purge stale/obsolete keys from previous schema versions
const validTopicIdsElem = document.getElementById("valid-topic-ids");
let validTopicIds = null;
try {
  if (validTopicIdsElem && validTopicIdsElem.textContent) {
    validTopicIds = new Set(JSON.parse(validTopicIdsElem.textContent));
  }
} catch (e) {
  console.warn("Could not parse valid topic IDs:", e);
}

// In-memory / local progress map: { [topicId]: true/false }
let progressState = {};

try {
  const cached = localStorage.getItem(STORAGE_KEY);
  if (cached) {
    progressState = JSON.parse(cached);
  }
} catch (e) {
  console.warn("Could not load from localStorage:", e);
}

// Purge obsolete/orphaned keys from previous versions immediately
function purgeObsoleteTopics() {
  if (!validTopicIds || validTopicIds.size === 0) return;
  let changed = false;
  for (const tId of Object.keys(progressState)) {
    if (!validTopicIds.has(tId)) {
      delete progressState[tId];
      changed = true;
    }
  }
  if (changed) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progressState));
    } catch (_) {}
  }
}
purgeObsoleteTopics();

// Active Firestore unsubscribe callback
let unsubscribeFirestore = null;

// Determine if an exam has already concluded based on date and time
function isExamDatePassed(examDateStr, examTimeStr) {
  if (!examDateStr) return false;
  const now = new Date();

  // If time range is present (e.g. "9:30 AM - 12:30 PM"), check against the end time
  if (examTimeStr && examTimeStr.includes("-")) {
    const parts = examTimeStr.split("-");
    const endStr = parts[1].trim();
    const match = endStr.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = match[2] ? parseInt(match[2], 10) : 0;
      const meridiem = match[3].toUpperCase();
      if (meridiem === "PM" && hours < 12) hours += 12;
      if (meridiem === "AM" && hours === 12) hours = 0;

      const [y, m, d] = examDateStr.split("-").map((n) => parseInt(n, 10));
      const examEndDate = new Date(y, m - 1, d, hours, minutes, 0, 0);
      return now >= examEndDate;
    }
  }

  // Fallback: compare calendar date against end of day (23:59:59)
  const [y, m, d] = examDateStr.split("-").map((n) => parseInt(n, 10));
  const dayEndDate = new Date(y, m - 1, d, 23, 59, 59, 999);
  return now > dayEndDate;
}

// Function to update all DOM elements based on progressState
function updateDOM() {
  const banner = document.getElementById("overall-banner");
  const totalSyllabusTopics = banner ? (parseInt(banner.dataset.overallTotal, 10) || 388) : 388;

  // 1. Check if we are on Dashboard
  const subjectCards = document.querySelectorAll(".subject-card");
  if (subjectCards.length > 0) {
    let overallDone = 0;

    subjectCards.forEach((card) => {
      const code = card.dataset.subjectCode;
      const total = parseInt(card.dataset.subjectTotal, 10) || 0;
      const examDate = card.dataset.examDate || "";
      const examTime = card.dataset.examTime || "";

      // Count topics for this subject that are true and exist in current syllabus
      let done = 0;
      for (const [tId, isDone] of Object.entries(progressState)) {
        if (isDone && tId.startsWith(code + "-") && (!validTopicIds || validTopicIds.has(tId))) {
          done++;
        }
      }
      done = Math.min(done, total);
      overallDone += done;

      const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

      const countElem = document.getElementById(`card-count-${code}`);
      const pctElem = document.getElementById(`card-pct-${code}`);
      const barElem = document.getElementById(`card-bar-${code}`);
      const statusElem = document.getElementById(`card-status-${code}`);

      if (countElem) countElem.textContent = `${done} / ${total} topics`;
      if (pctElem) pctElem.textContent = `${percent}%`;
      if (barElem) barElem.style.width = `${percent}%`;

      const isPassed = isExamDatePassed(examDate, examTime);
      const isCheckedOff = total > 0 && done >= total;
      const isFinished = isPassed || isCheckedOff;

      card.dataset.isFinished = isFinished ? "true" : "false";
      card.classList.toggle("is-finished", isFinished);

      if (statusElem) {
        if (isPassed) {
          statusElem.textContent = "Concluded";
          statusElem.className = "card-status-tag status-concluded";
          statusElem.style.display = "inline-flex";
        } else if (isCheckedOff) {
          statusElem.textContent = "Complete";
          statusElem.className = "card-status-tag status-completed";
          statusElem.style.display = "inline-flex";
        } else {
          statusElem.textContent = "";
          statusElem.className = "card-status-tag";
          statusElem.style.display = "none";
        }
      }
    });

    // Reorder cards in container: active/unfinished first, finished last
    const gridContainer = document.querySelector(".cards-asymmetric-grid");
    if (gridContainer) {
      const cardsArray = Array.from(subjectCards);
      cardsArray.sort((a, b) => {
        const aFin = a.dataset.isFinished === "true";
        const bFin = b.dataset.isFinished === "true";

        if (aFin !== bFin) {
          return aFin ? 1 : -1;
        }

        const dateA = a.dataset.examDate || "";
        const dateB = b.dataset.examDate || "";
        return dateA.localeCompare(dateB);
      });

      let orderChanged = false;
      for (let i = 0; i < cardsArray.length; i++) {
        if (gridContainer.children[i] !== cardsArray[i]) {
          orderChanged = true;
          break;
        }
      }

      if (orderChanged) {
        cardsArray.forEach((c) => gridContainer.appendChild(c));
      }
    }

    overallDone = Math.min(overallDone, totalSyllabusTopics);
    const overallPct = totalSyllabusTopics > 0 ? Math.min(100, Math.round((overallDone / totalSyllabusTopics) * 100)) : 0;
    const overallPctElem = document.getElementById("overall-pct");
    const overallCountElem = document.getElementById("overall-count");
    const overallBarElem = document.getElementById("overall-bar-fill");

    if (overallPctElem) overallPctElem.textContent = `${overallPct}%`;
    if (overallCountElem) overallCountElem.textContent = `${overallDone} / ${totalSyllabusTopics} topics complete`;
    if (overallBarElem) overallBarElem.style.width = `${overallPct}%`;
  }

  // 2. Check if we are on Subject Page
  const subjectHeaderCard = document.querySelector(".subject-header-card");
  if (subjectHeaderCard) {
    const subjectCode = subjectHeaderCard.dataset.subjectCode;
    const subjectTotal = parseInt(subjectHeaderCard.dataset.subjectTotal, 10) || 0;

    let subjectDone = 0;

    // Update checkboxes
    const checkboxes = document.querySelectorAll(".topic-checkbox");
    checkboxes.forEach((cb) => {
      const topicId = cb.dataset.topicId;
      const isDone = !!progressState[topicId];
      cb.checked = isDone;

      const row = cb.closest(".topic-row");
      if (row) {
        if (isDone) {
          row.classList.add("is-done");
        } else {
          row.classList.remove("is-done");
        }
      }

      if (isDone && topicId.startsWith(subjectCode + "-")) {
        subjectDone++;
      }
    });

    // Update modules, sections & check-all states
    for (let m = 1; m <= 5; m++) {
      const moduleCard = document.getElementById(`module-section-${m}`);
      if (moduleCard) {
        const modTotal = parseInt(moduleCard.dataset.moduleTotal, 10) || 0;
        let modDone = 0;

        // Find all subtopics in this module
        const modSubtopics = moduleCard.querySelectorAll(".topic-checkbox");
        modSubtopics.forEach((cb) => {
          if (progressState[cb.dataset.topicId]) {
            modDone++;
          }
        });

        // Update module check-all checkbox
        const modCheckAll = document.getElementById(`check-mod-${m}`);
        if (modCheckAll) {
          if (modDone === modTotal && modTotal > 0) {
            modCheckAll.checked = true;
            modCheckAll.indeterminate = false;
          } else if (modDone > 0) {
            modCheckAll.checked = false;
            modCheckAll.indeterminate = true;
          } else {
            modCheckAll.checked = false;
            modCheckAll.indeterminate = false;
          }
        }

        // Update section check-all checkboxes in this module
        const sectionGroups = moduleCard.querySelectorAll(".section-group");
        sectionGroups.forEach((secGroup) => {
          const secRef = secGroup.dataset.sectionRef;
          const secSubtopics = secGroup.querySelectorAll(".topic-checkbox");
          const secTotal = secSubtopics.length;
          let secDone = 0;
          secSubtopics.forEach((cb) => {
            if (progressState[cb.dataset.topicId]) {
              secDone++;
            }
          });

          const secCheckAll = secGroup.querySelector(".section-check-all");
          if (secCheckAll) {
            if (secDone === secTotal && secTotal > 0) {
              secCheckAll.checked = true;
              secCheckAll.indeterminate = false;
            } else if (secDone > 0) {
              secCheckAll.checked = false;
              secCheckAll.indeterminate = true;
            } else {
              secCheckAll.checked = false;
              secCheckAll.indeterminate = false;
            }
          }

          const secCounter = document.getElementById(`section-count-${m}-${secRef}`);
          if (secCounter) {
            secCounter.textContent = `${secDone} / ${secTotal}`;
          }
        });

        const modPct = modTotal > 0 ? Math.round((modDone / modTotal) * 100) : 0;
        const badge = document.getElementById(`module-badge-${m}`);
        const bar = document.getElementById(`module-bar-${m}`);

        if (badge) badge.textContent = `${modDone} / ${modTotal} done (${modPct}%)`;
        if (bar) bar.style.width = `${modPct}%`;
      }
    }

    // Update subject header stats
    const subjPct = subjectTotal > 0 ? Math.round((subjectDone / subjectTotal) * 100) : 0;
    const subjCountElem = document.getElementById("subject-count-text");
    const subjPctElem = document.getElementById("subject-pct-text");
    const subjBarElem = document.getElementById("subject-bar-fill");

    if (subjCountElem) subjCountElem.textContent = `${subjectDone} / ${subjectTotal} completed`;
    if (subjPctElem) subjPctElem.textContent = `${subjPct}%`;
    if (subjBarElem) subjBarElem.style.width = `${subjPct}%`;
  }
}

// Batch save topic statuses locally and sync to Firestore
async function setBatchTopicStatus(topicIds, isDone) {
  if (!topicIds || topicIds.length === 0) return;

  const updates = {};
  topicIds.forEach((id) => {
    progressState[id] = isDone;
    updates[id] = isDone;
  });

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progressState));
  } catch (e) {
    console.warn("Could not save to localStorage:", e);
  }

  updateDOM();

  // If user is logged in, sync batch to Firestore
  if (auth.currentUser) {
    try {
      const userDocRef = doc(db, "users", auth.currentUser.uid);
      await setDoc(userDocRef, {
        topics: updates,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.error("Firestore batch sync error:", err);
    }
  }

  // Notify server endpoint in background
  try {
    fetch("/toggle-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic_ids: topicIds, done: isDone })
    }).catch(() => {});
  } catch (_) {}
}

// Save topic status locally and sync to Firestore
async function setTopicStatus(topicId, isDone) {
  progressState[topicId] = isDone;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progressState));
  } catch (e) {
    console.warn("Could not save to localStorage:", e);
  }

  updateDOM();

  // If user is logged in, sync to Firestore
  if (auth.currentUser) {
    try {
      const userDocRef = doc(db, "users", auth.currentUser.uid);
      await setDoc(userDocRef, {
        topics: { [topicId]: isDone },
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.error("Firestore sync error:", err);
    }
  }

  // Also notify server endpoint in background (non-blocking)
  try {
    fetch(`/toggle/${encodeURIComponent(topicId)}`, { method: "POST" }).catch(() => {});
  } catch (_) {}
}

document.addEventListener("DOMContentLoaded", () => {
  // Initial immediate DOM update from cached state
  updateDOM();

  // Handle Checkbox Changes
  const checkboxes = document.querySelectorAll(".topic-checkbox");
  checkboxes.forEach((cb) => {
    cb.addEventListener("change", () => {
      setTopicStatus(cb.dataset.topicId, cb.checked);
    });
  });

  // Handle Module Check-All Changes
  const moduleCheckboxes = document.querySelectorAll(".module-check-all");
  moduleCheckboxes.forEach((modCb) => {
    modCb.addEventListener("change", () => {
      const m = modCb.dataset.moduleNo;
      const targetDone = modCb.checked;
      const subtopics = document.querySelectorAll(`.topic-checkbox[data-module-no="${m}"]`);
      const topicIds = Array.from(subtopics).map((cb) => cb.dataset.topicId);
      setBatchTopicStatus(topicIds, targetDone);
    });
  });

  // Handle Section Check-All Changes
  const sectionCheckboxes = document.querySelectorAll(".section-check-all");
  sectionCheckboxes.forEach((secCb) => {
    secCb.addEventListener("change", () => {
      const m = secCb.dataset.moduleNo;
      const secRef = secCb.dataset.sectionRef;
      const targetDone = secCb.checked;
      const subtopics = document.querySelectorAll(`.topic-checkbox[data-module-no="${m}"][data-section-ref="${secRef}"]`);
      const topicIds = Array.from(subtopics).map((cb) => cb.dataset.topicId);
      setBatchTopicStatus(topicIds, targetDone);
    });
  });

  // Handle Row Clicks (full row tap target on mobile)
  const topicRows = document.querySelectorAll(".topic-row");
  topicRows.forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target !== row.querySelector(".topic-checkbox") && !e.target.closest("label")) {
        const checkbox = row.querySelector(".topic-checkbox");
        if (checkbox && !checkbox.disabled) {
          checkbox.checked = !checkbox.checked;
          setTopicStatus(checkbox.dataset.topicId, checkbox.checked);
        }
      }
    });
  });

  // Auth UI elements
  const btnLoginGoogle = document.getElementById("btn-login-google");
  const btnLogout = document.getElementById("btn-logout");
  const userProfileWrap = document.getElementById("user-profile-wrap");
  const userAvatar = document.getElementById("user-avatar");
  const userName = document.getElementById("user-name");

  // Google Login click
  if (btnLoginGoogle) {
    btnLoginGoogle.addEventListener("click", async () => {
      try {
        await signInWithPopup(auth, provider);
      } catch (err) {
        console.error("Google sign in error:", err);
        if (err.code === "auth/unauthorized-domain") {
          alert("Authorization needed: Please add this domain to 'Authorized Domains' in your Firebase Console (Authentication > Settings > Authorized Domains).");
        } else if (err.code !== "auth/popup-closed-by-user") {
          alert(`Sign-in error: ${err.message}`);
        }
      }
    });
  }

  // Logout click
  if (btnLogout) {
    btnLogout.addEventListener("click", async () => {
      try {
        if (unsubscribeFirestore) {
          unsubscribeFirestore();
          unsubscribeFirestore = null;
        }
        await signOut(auth);
      } catch (err) {
        console.error("Sign out error:", err);
      }
    });
  }

  // Auth State Listener
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // User is signed in
      if (btnLoginGoogle) btnLoginGoogle.style.display = "none";
      if (userProfileWrap) userProfileWrap.style.display = "inline-flex";
      if (userAvatar) userAvatar.src = user.photoURL || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23E8C547"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>';
      if (userName) userName.textContent = user.displayName ? user.displayName.split(" ")[0] : "Scholar";

      // Listen to Firestore changes in real-time
      const userDocRef = doc(db, "users", user.uid);
      unsubscribeFirestore = onSnapshot(userDocRef, async (docSnap) => {
        if (docSnap.exists()) {
          const remoteTopics = docSnap.data().topics || {};
          let hadObsolete = false;
          const cleanRemote = {};
          for (const [k, v] of Object.entries(remoteTopics)) {
            if (!validTopicIds || validTopicIds.has(k)) {
              cleanRemote[k] = v;
            } else {
              hadObsolete = true;
            }
          }
          // Merge remote topics with local
          progressState = { ...progressState, ...cleanRemote };
          purgeObsoleteTopics();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(progressState));
          updateDOM();

          // If Firestore contained stale keys from older versions, overwrite with clean state
          if (hadObsolete) {
            setDoc(userDocRef, { topics: progressState, updatedAt: new Date().toISOString() }, { merge: false }).catch(() => {});
          }
        } else {
          // Document does not exist yet for new user; seed with current local progress
          if (Object.keys(progressState).length > 0) {
            await setDoc(userDocRef, {
              email: user.email,
              displayName: user.displayName,
              topics: progressState,
              createdAt: new Date().toISOString()
            }, { merge: true });
          }
        }
      }, (err) => {
        console.warn("Firestore snapshot subscription error:", err);
      });
    } else {
      // User is signed out
      if (btnLoginGoogle) btnLoginGoogle.style.display = "inline-flex";
      if (userProfileWrap) userProfileWrap.style.display = "none";
    }
  });
});
