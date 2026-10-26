/*
  sw.js — the "service worker". It runs in the background on each phone and
  keeps a copy of the app's files, so the app still OPENS when there's no signal
  (the sales data itself is kept offline by Firebase, not by this file).

  Strategy:
  - Our own files (index.html, app.js, style.css …): try the internet first so
    everyone always gets the newest version; if there's no signal, use the copy.
  - Firebase code + fonts from Google: use the saved copy (they never change,
    because the version number is fixed in app.js).
  - Database traffic is NOT touched — Firebase handles that itself.

  If you ever change a file and a phone seems stuck on the old version, change
  the number in CACHE below (e.g. v1 → v2) and upload sw.js again.
*/
const CACHE = "cup-stand-v1";
const APP_FILES = [
  "./", "./index.html", "./style.css", "./app.js", "./firebase-config.js",
  "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png"
];
const LONG_LIVED = ["www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com"];

// When the service worker is installed: save the app's files.
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

// When a new version takes over: delete copies saved by older versions.
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Every time the app asks for a file:
self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;                       // only plain downloads
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // our files: internet first, saved copy as backup
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(hit => hit || caches.match("./index.html")))
    );
  } else if (LONG_LIVED.includes(url.hostname)) {
    // Firebase code + fonts: saved copy first, internet if we don't have it yet
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }))
    );
  }
  // anything else (the database itself) goes straight to the internet as normal
});
