// ================== FIREBASE INIT ==================
const firebaseConfig = {
  apiKey: "AIzaSyALIq-7sKX_yi4qbikHldoIDbymSem2gxg",
  authDomain: "sampledb-9009e.firebaseapp.com",
  projectId: "sampledb-9009e",
  storageBucket: "sampledb-9009e.firebasestorage.app",
  messagingSenderId: "894153581819",
  appId: "1:894153581819:web:d1d73e4345957781cb3c5e",
  measurementId: "G-7EDBYZMJVR"
};

// Avoid re-initialization if firebase.apps already exists
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// ================== HELPERS ==================
function showLoader(show, message = "") {
  const loader = document.getElementById("loader");
  if (loader) {
    loader.style.display = show ? "block" : "none";
    if (message) loader.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${message}`;
  }
}

function saveUserToken(user) {
  user.getIdToken().then(token => {
    localStorage.setItem("userToken", token);
  });
}

// ================== SIGNUP ==================
function signup() {
  const name = document.getElementById("name").value;
  const dept = document.getElementById("department").value;
  const email = document.getElementById("email").value;
  const pass = document.getElementById("password").value;
  const confirmPass = document.getElementById("confirmPassword").value;

  if (pass !== confirmPass) {
    document.getElementById("message").textContent = "Passwords do not match!";
    return;
  }

  showLoader(true, "Creating account...");
  firebase.auth().createUserWithEmailAndPassword(email, pass)
    .then(userCred => {
      const user = userCred.user;
      saveUserToken(user);

      return user.updateProfile({ displayName: name })
        .then(() => {
          return db.collection("users").doc(user.uid).set({
            name,
            department: dept,
            email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        })
        .then(() => {
          // Cache locally for instant greeting
          localStorage.setItem("userName", name);
          localStorage.setItem("userDept", dept);
          window.location.href = "index1.html";
        });
    })
    .catch(err => {
      document.getElementById("message").textContent = err.message;
    })
    .finally(() => showLoader(false));
}

// ================== LOGIN ==================
function login() {
  const email = document.getElementById("loginEmail").value;
  const pass = document.getElementById("loginPassword").value;

  showLoader(true, "Signing in...");
  firebase.auth().signInWithEmailAndPassword(email, pass)
    .then(userCred => {
      const user = userCred.user;
      saveUserToken(user);
      return db.collection("users").doc(user.uid).get();
    })
    .then(doc => {
      if (doc.exists) {
        console.log("User Data:", doc.data());
      }
      window.location.href = "index1.html";
    })
    .catch(err => {
      document.getElementById("message").textContent = "Invalid Credentials :(";
    })
    .finally(() => showLoader(false));
}

// ================== LOGOUT ==================
function logout() {
  showLoader(true, "Logging out...");
  firebase.auth().signOut()
    .then(() => {
      localStorage.clear();
      showLoader(false);
      window.location.href = "login.html";
    })
    .catch(err => {
      console.error("Logout Error:", err);
      showLoader(false);
      alert("Error logging out. Try again.");
    });
}

// ================== GREETING (INDEX1 ONLY) ==================
firebase.auth().onAuthStateChanged(async (user) => {
  const greetEl = document.getElementById("greeting");

  if (user) {
    try {
      // Use cached first (after signup)
      const cachedName = localStorage.getItem("userName");
      const cachedDept = localStorage.getItem("userDept");

      if (greetEl && cachedName && cachedDept) {
        greetEl.textContent = `Hi, ${cachedName} (${cachedDept})`;
        return;
      }

      // Otherwise fetch from Firestore
      const doc = await db.collection("users").doc(user.uid).get();
      if (doc.exists && greetEl) {
        const data = doc.data();
        greetEl.textContent = `Hi, ${data.name} (${data.department})`;

        // Cache for faster future load
        localStorage.setItem("userName", data.name);
        localStorage.setItem("userDept", data.department);
      }
    } catch (err) {
      console.error("Error fetching user data:", err);
    }
  } else {
    // Redirect only if on protected pages (like index1.html)
    const path = window.location.pathname;
    const isLogin = path.includes("login.html");
    const isSignup = path.includes("index.html");

    if (!isLogin && !isSignup) {
      window.location.href = "login.html";
    }
  }
});

// ================== PAGE LOADER FIX ==================
window.addEventListener("load", () => {
  const pageLoader = document.getElementById("pageLoader");
  if (pageLoader) pageLoader.style.display = "none";
});
