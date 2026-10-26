/*
  firebase-config.js — tells the app WHICH Firebase project (database) to use.

  ▶ This is filled in for the "Fundraiser App" Firebase project
    (project id: fundraiser-app-9dd8f). It's the only file that changes per project.
    If you ever make a new Firebase project, replace these values with the new ones
    from Firebase → Settings → General → Your apps, keeping the quotes.

  Is it safe to put this on GitHub? Yes. These values only say where the database
  is — they're not a password. What protects your data is:
    1. the security rules you published in step 3 (firestore.rules), and
    2. your team code, which is NOT in any file — people type it into the app.
*/
export const firebaseConfig = {
  apiKey: "AIzaSyDcI2kOkuaaJEkXbfkE3onvQV99tNS4FaE",          // which project's "front door" to use
  authDomain: "fundraiser-app-9dd8f.firebaseapp.com",          // used for the automatic sign-in
  projectId: "fundraiser-app-9dd8f",                            // the project's unique name
  storageBucket: "fundraiser-app-9dd8f.firebasestorage.app",    // file storage (not used by this app)
  messagingSenderId: "889754891348",                            // notifications (not used by this app)
  appId: "1:889754891348:web:26a06fbb013aff629da9c1"            // this web app's ID inside the project
};
