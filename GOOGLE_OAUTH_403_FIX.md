# Fix 403: access_denied (Google OAuth)

Follow these steps in **Google Cloud Console**: https://console.cloud.google.com/

## 1. Add yourself as a Test user

- Go to **APIs & Services** → **OAuth consent screen**
- Scroll to **Test users**
- Click **+ ADD USERS**
- Add your Gmail address (the one you use to sign in)
- Click **Save**

Without this, Google blocks sign-in when the app is in **Testing** mode.

---

## 2. Add the Drive scope to the consent screen

- On the same **OAuth consent screen** page, click **EDIT APP**
- Go to **Scopes** → **ADD OR REMOVE SCOPES**
- Add: **Google Drive API** → **See and download all your Google Drive files**  
  (scope: `https://www.googleapis.com/auth/drive.readonly`)
- Also ensure **User info** scopes are there: email, profile, openid
- Click **Update** → **Save and Continue**

---

## 3. Enable Google Drive API

- Go to **APIs & Services** → **Library**
- Search for **Google Drive API**
- Open it and click **Enable**

---

## 4. Authorized redirect URIs (if you still get errors)

- Go to **APIs & Services** → **Credentials**
- Open your **OAuth 2.0 Client ID** (Web application)
- Under **Authorized redirect URIs** ensure you have:
  - `http://localhost:3000`
  - `http://localhost:3000/`  
  (the app may use a relay URL; having localhost is still required)
- Save

After this, sign in again. If the app is in Testing mode, only the Gmail accounts you added as Test users can sign in.
