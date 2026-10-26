# Yokohama Cup Snack Stand: setup guide

This folder is a phone app for the snack stand. Anyone on the team can install it, with no Claude account needed. Everyone using the same **team code** sees the same stand, and every tap shows up on everyone's phone straight away. If the signal drops, sales are saved on the phone and sent when it comes back.

**Time:** about 1 hour, once. **Cost:** free. **You need:** a computer, a Google account, and a GitHub account. You make the GitHub account in step 6.

> The screens on Firebase and GitHub change now and then, so a button may have a slightly different name than written here. Look for the closest match.

---

## What you're putting together

| Piece | What it does | Where it lives |
|---|---|---|
| **The app files** (this folder) | The screens and buttons | GitHub Pages: free hosting, gives you a web address |
| **Firebase Firestore** | The shared database that every phone reads and writes | Google's servers, free plan |
| **The team code** | The key to your team's data | In your heads only, never in a file |

---

## Step 1: Create a Firebase project

1. Go to **https://console.firebase.google.com** and sign in with a Google account.
   Use one the three of you can all get into, or one of you owns it and adds the others later (step 10).
2. Click **Create a project** (or **Add project**).
3. Name it something like `yokohama-cup-stand`, then click **Continue**.
4. When it asks about **Google Analytics**, switch it **off** (you don't need it). Click **Create project**.
5. Wait until it says it's ready, then click **Continue**.

## Step 2: Turn on the database

1. In the left menu, open **Build → Firestore Database**.
2. Click **Create database**.
3. If it asks for an **edition**, choose **Standard**.
4. **Location:** choose **asia-northeast1 (Tokyo)**. It's closest to Yokohama, so it's fastest. *This can't be changed later.*
5. Choose **Start in production mode**, then click **Create**.

## Step 3: Paste the security rules

The rules decide who's allowed to touch the data. Without this step the app gets "permission denied".

1. In **Firestore Database**, open the **Rules** tab.
2. Delete everything in the box.
3. Open the file **`firestore.rules`** from this folder, copy all of it, and paste it in.
4. Click **Publish**.

If Publish shows a red error, see *"Rules won't publish"* under Troubleshooting.

## Step 4: Turn on automatic sign-in

The app signs each phone in automatically and invisibly. Nobody types an email or password. You only need to switch it on once.

1. Left menu: **Build → Authentication**, then click **Get started**.
2. Open the **Sign-in method** tab.
3. Click **Anonymous**, switch **Enable** on, and click **Save**.

## Step 5: Connect the app to your database

1. Click the **⚙️ gear** next to "Project Overview" (top left), then **Project settings**.
2. Scroll to **Your apps** and click the **`</>`** (Web) icon.
3. Nickname: `stand app`. **Leave "Firebase Hosting" unticked** (we use GitHub instead). Click **Register app**.
4. You'll see a block of code containing `const firebaseConfig = { apiKey: "...", ... }`.
5. Open **`firebase-config.js`** from this folder in a text editor (Notepad, TextEdit, or VS Code).
6. Replace each `PASTE_...` value with the matching value from Firebase. **Keep the quotes.** For example:
   ```js
   apiKey: "AIzaSyB...your real key...",
   ```
7. Save the file.

> **Is it safe that this goes on GitHub?** Yes. These values only say *where* the database is; they're not a password. Your data is protected by the rules from step 3 and by the team code, which isn't in any file.

## Step 6: Put the app online with GitHub Pages

1. Go to **https://github.com** and **Sign up** for a free account if you don't have one. Remember your username; it becomes part of the app's address.
2. Click **+** (top right), then **New repository**.
   - Name: `yokohama-cup-stand`
   - **Public** (GitHub Pages is free for public repositories; your sales data is not in here, only the app)
   - Click **Create repository**.
3. On the new repository page, click **uploading an existing file**.
4. Open this folder on your computer, select **everything inside it** (all the files **and** the `icons` folder), and drag it all into the upload box in one go: `index.html`, `style.css`, `app.js`, `firebase-config.js` (the edited one), `manifest.webmanifest`, `sw.js`, `firestore.rules`, `README.md`, `icons/`.
   Drag the **contents** of the folder, not the `yokohama-cup-stand` folder itself, or the app ends up one level too deep.
5. Click **Commit changes**. Then check the file list: `index.html` is at the top level, and there's a folder called **icons** with 4 pictures in it.
6. Go to **Settings → Pages** (left menu).
7. Under **Build and deployment → Source**, pick **Deploy from a branch**. Branch: **main**, folder: **/ (root)**. Click **Save**.
8. Wait 1–2 minutes and refresh. A box appears: *"Your site is live at"*
   **`https://YOUR-USERNAME.github.io/yokohama-cup-stand/`**. That's the app's address.

## Step 7: Tell Firebase about the new address

1. Back in Firebase: **Authentication → Settings → Authorized domains**.
2. Click **Add domain** and type **`YOUR-USERNAME.github.io`** (just that, no `https://` and no `/yokohama-cup-stand`).
3. Click **Add**.

## Step 8: Choose your team code

Make up a code that is **16–64 characters** long, using lowercase letters, numbers and hyphens. Make it hard to guess. For example:

```
yokohama-cup-7fq2-k9mx-tsa
```

- **Don't** use something obvious like `yokohama-cup-2027`.
- Share it only with the people running the stand, in a private message.
- Anyone who has the app link **and** the code can change your stand's data, so treat it like a password.

## Step 9: Install it on everyone's phone

**iPhone (use Safari):**
1. Open the app address from step 6 in **Safari**.
2. Tap **Share** (the square with an arrow), then **Add to Home Screen**, then **Add**.
3. Open it from the new **Cup Stand** icon.

**Android (use Chrome):**
1. Open the address in **Chrome**.
2. Tap **⋮**, then **Install app** (or **Add to Home screen**).
3. Open it from the new icon.

**Then, on every phone:** type the team code and tap **Join team**.

**First phone only:** you'll see *"Set up your first stand"*. Tap **Start with the Nov 8 plan**. That loads Pocari, water, energy jelly, snacks and bananas with the planned prices and the ¥10,000 float. Change anything in **Goals & items**.

## Step 10: Test it before Nov 8 (10 minutes)

Do this with two phones side by side:

- [ ] Phone A taps **+** on Pocari, and phone B shows it within a second or two.
- [ ] Phone B sells **3** water with the Qty box, and both phones show the same **Money in**.
- [ ] **−** takes one back on both phones.
- [ ] Make a combo in **Goals & items**, and it appears on the other phone's Sell tab.
- [ ] Turn on **airplane mode** on one phone and sell something: the dot says *"Offline · saving on this phone"*. Turn airplane mode off and it shows up on the other phone.
- [ ] Close the app and reopen it from the home-screen icon. Everything's still there.
- [ ] **Undo** every test sale in *Latest sales* so you start Nov 8 at ¥0.

**Optional, recommended:** give Taishi and Sho access to Firebase too, so you're not the only one who can fix things.
Firebase: **⚙️ → Users and permissions → Add member**, enter their Google email, role **Editor**.

---

## Using it on the day

- **Sell tab:** **+** sells one, **−** takes one back, or type an amount and tap **Sell**.
- **Goals & items:** products, prices, combo deals, profit goal, float. Changes save for everyone automatically.
- **End of day:** count the cash box with a teacher and type the total. It tells you whether the cash matches the sales. **Copy sold counts** pastes straight into the budget spreadsheet.
- **April:** in *Goals & items → New stand*, create "Yokohama Cup · Day 1" (and Day 2). It copies your products and combos.

---

## Changing the app later

1. Edit the file on your computer, or click the file on GitHub, then the ✏️ pencil.
2. Upload or commit it to the repository. GitHub Pages updates in about a minute.
3. On the phones, close the app and open it again (twice if needed). It always fetches the newest version when there's internet.
4. If a phone still shows an old version: in `sw.js`, change `cup-stand-v1` to `cup-stand-v2`, upload `sw.js`, and reopen the app.

---

## Troubleshooting

| What you see | What to do |
|---|---|
| *"This app isn't connected to its database yet"* | `firebase-config.js` still has `PASTE_...` values. Redo step 5 and upload the file again. |
| *"Sign-in is switched off in Firebase"* | Step 4: turn on **Anonymous**. |
| *"The database refused this…"* | Either the rules aren't published (step 3), or the team code was typed differently. Codes must match exactly, so check for a typo. |
| *"Couldn't sign in (auth/unauthorized-domain)"* | Step 7: add `YOUR-USERNAME.github.io` to Authorized domains. |
| The page is blank or shows a 404 | GitHub Pages isn't on yet, or the files aren't in the main folder of the repository (step 6). `index.html` must be at the top level, not inside another folder. |
| The icon is missing when installing | The `icons` folder didn't upload as a folder. If you see the 4 `.png` files loose at the top level instead of inside `icons`, delete them, then drag the `icons` folder on its own into **Add file → Upload files**. |
| Phones don't update each other | Check the dot next to the date. If it says *Offline*, the phone has no internet, and its sales will send when it reconnects. If it says *Live* on both, make sure both used the **same** team code (*Goals & items → Team* shows its first and last 4 letters). |
| **Rules won't publish** (red error) | Use this simpler version instead. It has the same protection, without the record checks:<br>`rules_version = '2';`<br>`service cloud.firestore { match /databases/{database}/documents {`<br>`match /teams/{team}/events/{e} { allow read, write: if request.auth != null && team.size() >= 16;`<br>`match /sales/{s} { allow read, write: if request.auth != null && team.size() >= 16; } } } }` |
| Switching a phone to another team | *Goals & items → Team → Use a different team code* (tap twice). |

---

## Free limits (Firebase Spark plan)

The free plan allows about **50,000 reads and 20,000 writes per day**, with no credit card needed. A busy stand day is a few hundred sales across 3 phones, which is well under 5% of that. Don't add a billing account to the project, and it can never charge you.

---

## How the code is organised (for learning)

| File | Language | What it does |
|---|---|---|
| `index.html` | HTML | Everything you **see**: the join screen, tabs, buttons and boxes. Each box has an `id` that `app.js` uses to fill it in. |
| `style.css` | CSS | How it **looks**: colours, fonts, spacing, dark mode. |
| `app.js` | JavaScript | Everything it **does**. Read the box at the top first; the sections are numbered 1–14. |
| `firebase-config.js` | JavaScript | Which Firebase project to use (the one file you edit in step 5). |
| `sw.js` | JavaScript | The *service worker*: saves the app's files so it opens offline. |
| `manifest.webmanifest` | JSON | Tells the phone the app's name, icon and colours, so it can be installed. |
| `firestore.rules` | Firebase rules | Who's allowed to read and write the database. |
| `icons/` | Images | The home-screen icons. |

**How the data is stored in Firebase.** You can see it in Firebase under **Firestore Database → Data**:

```
teams/
  <your team code>/
    events/
      nov8                    ← one record per stand: name, date, float, goal, items, combos
        sales/
          a8f3k2…             ← one record per sale: items, kind, price, unit, count, at (time)
```

Each tap creates a **new sale record**; it doesn't change a running total. That way two people tapping at the same moment can never overwrite each other. Every number on screen is added up from those records (`totals()` and `soldOf()` in `app.js`).
