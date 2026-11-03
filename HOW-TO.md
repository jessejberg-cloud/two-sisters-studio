# Two Sisters Studio: how to

Plain steps for Jesse. The site is **twosistersstudio.com** (family password). Claude does the technical parts.

## Add art
1. On your phone, open the **Add art** app (twosistersstudio.com/upload/, or its home-screen icon).
2. Tap **Leora** or **Amaya**.
3. Tap **Take a photo** (once per picture) or **Choose photos** (several at once).
4. Under each picture, type a caption in her own words if she has one. It's optional.
   Tap **Show big** on the one or two best pieces of the season.
5. Check **Date it was made** (it starts as today).
6. Tap **Save to Google Drive**.
   - Once Google sign-in is set up, it saves by itself. Wait for "Saved".
   - Until then, your phone's share list opens: pick **Drive**, choose the **Two Sisters Studio** folder, tap **Save**.
7. When you want them on the site, tell Claude **"new art is in"**. Claude checks every picture for last names
   or school names, adds them, and tells you what went up.

Each school year, tell Claude each girl's grade once (for example "Leora is in 5th grade this year"), so the
labels say "5th grade · fall".

## Add a Pet Parents episode
1. **Listen to the whole episode first.** Claude can't hear audio. Cut anything with last names, school or teacher
   names, places that show where you live, ages or birthdays.
2. Make a folder for the episode in the Pet Parents incoming folder with the audio, the drawing, and `notes.txt`:
   ```
   Title: Biscuit the Very Good Boy
   Date: 11/15/2026
   Description: One or two sentences about the episode.
   Guests: Maya
   Pets: Biscuit (dog), Pepper (cat)
   ```
   First names only.
3. Tell Claude **"new episode is in"**.

## If something breaks
- **The site shows an old version, or a change didn't appear:** open [Deploys](https://app.netlify.com/projects/two-sisters-studio/deploys).
  If the top one says **Failed**, tell Claude "the deploy failed". The old site stays up until it's fixed, and
  the privacy check stops any deploy that would show a last name.
- **The password page doesn't appear or the password stopped working:** [Visitor access](https://app.netlify.com/projects/two-sisters-studio/configuration/general#visitor-access)
  → Password protection. You can change the password there any time.
- **The Add art app asks you to sign in to Google again:** that's normal. The sign-in lasts about an hour; it's one tap.
- **Anything else:** tell Claude what you saw. Nothing on the site can delete the originals in Google Drive.

## One-time: make the Two Sisters Studio folder
In [Google Drive](https://drive.google.com/) (your personal Gmail), click **New** → **New folder**, name it
`Two Sisters Studio`. That's where the originals live.

## One-time: let the Add art app save to Google Drive by itself (optional, about 10 minutes)
Without this, the Share button works fine. With it, Save files everything into the right folders for you.
Sign in to each link with your personal Gmail.
1. [Make a project](https://console.cloud.google.com/projectcreate): name it `Two Sisters Studio`, click **Create**.
2. [Turn on the Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com): check the top says
   Two Sisters Studio, click **Enable**.
3. [Set up sign-in](https://console.cloud.google.com/auth/overview): click **Get started**. App name
   `Two Sisters Studio`, support email your Gmail, Audience **External**, contact email your Gmail, agree, **Create**.
4. [Add yourself as a tester](https://console.cloud.google.com/auth/audience): under **Test users**, click
   **Add users**, type your Gmail, **Save**.
5. [Make the app's ID](https://console.cloud.google.com/auth/clients): **Create client** → type
   **Web application**, name `Two Sisters Studio`.
   - Authorized JavaScript origins: `https://twosistersstudio.com`
   - Authorized redirect URIs: `https://twosistersstudio.com/upload/`
   - Click **Create** and send Claude the **Client ID** (ends in `.apps.googleusercontent.com`; not a secret).
6. After Claude says it's live: open twosistersstudio.com/upload/ on your phone, enter the family password,
   tap **Sign in to Google**. Google may say the app isn't verified: tap **Continue** (it's your own app).
7. To put it on your home screen: in Chrome, tap **⋮** → **Add to Home screen** (or **Install app**).
