// ============================================================
// FIREBASE KONFIGURATION
// ============================================================
// Erstelle ein kostenloses Firebase-Projekt und füge hier
// deine Config ein. Anleitung: siehe SETUP.md
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyD49Qr8X1p1W3ydbcMXQlCFR41oh6MnN9c",
  authDomain: "minigolf-scorecard-95b1c.firebaseapp.com",
  databaseURL: "https://minigolf-scorecard-95b1c-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "minigolf-scorecard-95b1c",
  storageBucket: "minigolf-scorecard-95b1c.firebasestorage.app",
  messagingSenderId: "304647018806",
  appId: "1:304647018806:web:d74e5885960932b12dbb97"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
