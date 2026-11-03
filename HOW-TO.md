# Two Sisters Studio: how to

Plain steps for Jesse. The site is **twosistersstudio.com** (family password). Claude does the technical parts.

## Add art
1. On your phone, open the **Add art** app (twosistersstudio.com/upload/, or its home-screen icon).
2. Tap **Leora** or **Amaya**.
3. Tap **Take a photo** (it opens your Pixel camera) or **Choose photos** (several at once).
   Or start in **Google Photos**: open a picture, tap **Share**, pick **Add art**, then pick the girl
   (this shows up once the app is on your home screen).
   (Edit in Google Photos first if you want bigger fixes.)
4. Tap a picture to **Crop**, **Turn** it, or add **Glow** (brighter colors with a soft glow). The untouched
   original is always saved too.
5. Under each picture, type a caption in her own words if she has one. It's optional.
   Tap **Show big** on the one or two best pieces of the season.
6. Check **Date it was made** (it starts as today).
7. Tap **Save to Google Drive**. The pictures are kept on the phone first, so this works with no internet and
   without being signed in. They go to Google Drive by themselves once you're online and signed in. If some are
   waiting, the first screen says so, with a **Send now** button.
8. When you want them on the site, tell Claude **"new art is in"**. Claude adds them and tells you what went up.

Each school year, tell Claude each girl's grade once (for example "Leora is in 5th grade this year"), so the
labels say "5th grade · fall".

## Add family photos (Family Moments)
1. In Google Drive, open **Two Sisters Studio**, then make a folder **Family Moments** (once).
2. Inside it, make one folder per event, named with the date and a short title, like **2026-06-14 Wedding**.
3. Copy the photos you want into that folder (from Google Photos: select them, Share, Drive, pick the folder).
4. Tell Claude **"new family photos are in"**. Claude puts them on the page. Each event gets a **Download all** button for photo books.
5. Optional: a caption for a photo goes in a `.json` file with the same name, like `{"caption": "Dancing with Grandma"}`.

## Save pictures to a phone or computer
- Tap any drawing or photo to open it big, then tap **Save this picture**. On an iPhone, pick **Save Image** in the
  list that opens (it goes to Photos). On Android or a computer it downloads (on Android it shows up in Photos or Gallery).
- Family Moments: **Save all to this phone** saves every photo of that event (on an iPhone, 20 at a time).
  **Download all as one zip** is for a computer or a photo book.

## Add a Pet Parents episode
1. Make a folder for the episode in the Pet Parents incoming folder with the audio, the drawing, and `notes.txt`:
   ```
   Title: Biscuit the Very Good Boy
   Date: 11/15/2026
   Description: One or two sentences about the episode.
   Guests: Maya
   Pets: Biscuit (dog), Pepper (cat)
   ```
2. Tell Claude **"new episode is in"**.

## If something breaks
- **The site shows an old version, or a change didn't appear:** open [Deploys](https://app.netlify.com/projects/two-sisters-studio/deploys).
  If the top one says **Failed**, tell Claude "the deploy failed". The old site stays up until it's fixed.
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
