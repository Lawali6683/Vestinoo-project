import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-analytics.js";
  
const firebaseConfig = {
  apiKey: "AIzaSyAc5lJGs_JyMdlgxLcpzPcTo0GqfuE5raE",
  authDomain: "vestinoo-ad0ca.firebaseapp.com",
  databaseURL: "https://vestinoo-ad0ca-default-rtdb.firebaseio.com",
  projectId: "vestinoo-ad0ca",
  storageBucket: "vestinoo-ad0ca.firebasestorage.app",
  messagingSenderId: "255162772594",
  appId: "1:255162772594:web:52cfb7f5d751094548a6eb",
  measurementId: "G-07T6Z51EFP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Export so other files can use them
export { app, analytics, firebaseConfig };
