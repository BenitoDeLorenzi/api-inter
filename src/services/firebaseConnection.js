const { initializeApp } = require("firebase/app");
const { getAuth } = require("firebase/auth");
const { getFirestore } = require("firebase/firestore");
const { getStorage } = require("firebase/storage");

const firebaseConfig = {
    apiKey: "AIzaSyBeH5letCri58pbcswnVw8MBQM1szhzYoA",
    authDomain: "fortusys.firebaseapp.com",
    projectId: "fortusys",
    storageBucket: "fortusys.appspot.com",
    messagingSenderId: "983707258579",
    appId: "1:983707258579:web:e39139b8b1358846390e26",
    measurementId: "G-LL27J8V6LD",
};

const firebaseApp = initializeApp(firebaseConfig);

const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

module.exports = { auth, db, storage };
