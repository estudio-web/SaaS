// ============================================================
// firebase.js — Configuración central de Firebase
// ⚠️  Reemplaza los valores con los de tu proyecto Firebase
// ============================================================

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCC3KTx8ZJatJXBySljIworEdB_REqqTG4",
  authDomain: "saas-9e0a1.firebaseapp.com",
  projectId: "saas-9e0a1",
  storageBucket: "saas-9e0a1.firebasestorage.app",
  messagingSenderId: "1062277368867",
  appId: "1:1062277368867:web:1dfe147e526d3c84583596"
};

// ── Inicialización ──────────────────────────────────────────
import { initializeApp }       from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore }        from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth }             from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const app  = initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };
