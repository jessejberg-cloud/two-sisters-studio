# Two Sisters Studio: how to

Plain steps for Jesse. The site is **twosistersstudio.com** (family password). Claude does the technical parts.

## Add art
1. On your phone, open the **Add art** app (twosistersstudio.com/upload/, or its home-screen icon).
2. Tap **Leora** or **Amaya**.
3. Tap **Take a photo** (once per picture) or **Choose photos** (several at once).
4. Under each picture, type a caption in her own words if she has one. It's optional.
   Tap **Show big** on the one or two best pieces of the season.
5. Check **Date it was made** (it starts as today).
6. Tap **Save to OneDrive**. Wait for "Saved".
7. When you want them on the site, tell Claude **"new art is in"**. Claude checks every picture for last names
   or school names, adds them, and tells you what went up.

Not signed in to Microsoft, or Save isn't working? Tap **Share to OneDrive app instead**, pick OneDrive,
and open the folder the app names (Apps › Two Sisters Studio › the girl › the year › School Year or Summer).

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
- **The Add art app asks you to sign in again:** that's normal. Microsoft makes this kind of app sign in again
  about once a day; it's one tap.
- **Anything else:** tell Claude what you saw. Nothing on the site can delete the originals in OneDrive.

## One-time: connect the Add art app to OneDrive
1. Open [App registrations](https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
   and sign in with the Microsoft account whose OneDrive should hold the art.
   If Microsoft says you need an Azure account, a directory, or a credit card, **stop** and tell Claude.
   The Share button keeps working without this.
2. Click **New registration**.
   - Name: `Two Sisters Studio`
   - Who can use it: **Personal Microsoft accounts only**
   - Redirect URI: choose **Single-page application (SPA)** and type `https://twosistersstudio.com/upload/`
   - Click **Register**.
3. Copy the **Application (client) ID** (a long code with dashes) and send it to Claude. It isn't a secret.
4. After Claude says it's live: on your phone, open twosistersstudio.com/upload/, enter the family password,
   tap **Sign in to Microsoft**, and allow it. The app can only see its own folder, `Apps / Two Sisters Studio`.
5. To put it on your home screen: in Chrome, tap **⋮** → **Add to Home screen** (or **Install app**).
