//src/firebase.js
// Import the functions you need from the SDKs you need
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';       // ✅ this line is missing in your file
import { getFirestore } from 'firebase/firestore';
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCth9nO_5D5NFs-PCQtxMngRIztIE1Rnx8",
  authDomain: "inventory-manager-82ed2.firebaseapp.com",
  projectId: "inventory-manager-82ed2",
  storageBucket: "inventory-manager-82ed2.firebasestorage.app",
  messagingSenderId: "521428895910",
  appId: "1:521428895910:web:e4823fa22c4b4f11b50c67",
  measurementId: "G-6FZB033S67"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export const auth = getAuth(app);
export const db = getFirestore(app);