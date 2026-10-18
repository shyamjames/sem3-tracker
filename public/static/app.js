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

// Active Firestore unsubscribe callback
let unsubscribeFirestore = null;

// Function to update all DOM elements based on progressState
function updateDOM() {
  const totalSyllabusTopics = 133;

  // 1. Check if we are on Dashboard
  const subjectCards = document.querySelectorAll(".subject-card");
  if (subjectCards.length > 0) {
    let overallDone = 0;

    subjectCards.forEach((card) => {
      const code = card.dataset.subjectCode;
      const total = parseInt(card.dataset.subjectTotal, 10) || 0;

      // Count topics for this subject that are true
      let done = 0;
      for (const [tId, isDone] of Object.entries(progressState)) {
        if (isDone && tId.startsWith(code + "-")) {
          done++;
        }
      }
      overallDone += done;

      const percent = total > 0 ? Math.round((done / total) * 100) : 0;

      const countElem = document.getElementById(`card-count-${code}`);
      const pctElem = document.getElementById(`card-pct-${code}`);
      const barElem = document.getElementById(`card-bar-${code}`);

      if (countElem) countElem.textContent = `${done} / ${total} topics`;
      if (pctElem) pctElem.textContent = `${percent}%`;
      if (barElem) barElem.style.width = `${percent}%`;
    });

    const overallPct = Math.round((overallDone / totalSyllabusTopics) * 100);
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

    // Update modules 1 to 5
    for (let m = 1; m <= 5; m++) {
      const moduleCard = document.getElementById(`module-section-${m}`);
      if (moduleCard) {
        const modTotal = parseInt(moduleCard.dataset.moduleTotal, 10) || 0;
        let modDone = 0;
        for (const [tId, isDone] of Object.entries(progressState)) {
          if (isDone && tId.startsWith(`${subjectCode}-${m}-`)) {
            modDone++;
          }
        }
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
          // Merge remote topics with local
          progressState = { ...progressState, ...remoteTopics };
          localStorage.setItem(STORAGE_KEY, JSON.stringify(progressState));
          updateDOM();
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
