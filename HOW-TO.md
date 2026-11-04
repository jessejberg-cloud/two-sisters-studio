# Two Sisters Studio: how to

Plain steps for Jesse. The site is **twosistersstudio.com**. Claude does the technical parts.

## Logging in
- **Family** (you, your partner, the girls): the family password. It opens the whole site and the Add art app, and
  the phone stays logged in for about a year.
- **Parents**: the parent PIN, on the **For parents** page (in the Add art app, or twosistersstudio.com/parent/).
  It is asked again after 15 minutes. Only parents make share links and change passwords.
- **Friends**: a share link from a parent, plus the friends password. They see only the pages on their link,
  and never the Add art app.

## Add art
1. On your phone, open the **Add art** app (twosistersstudio.com/upload/, or its home-screen icon).
2. Tap **Leora**, **Amaya**, or **Both, made together**.
3. Tap **Take a photo** or **Choose photos** (several at once). Or start in **Google Photos**: open a picture,
   tap **Share**, pick **Add art**, then pick who made it.
   On an Android phone, **💡 Camera with light** keeps the phone's light on while you take the picture (tap
   **Light** to switch it off; tap the circle for each photo, then **Done**). The first time, allow the camera.
4. Each photo is one piece. For a 3D piece, tap **＋ Another photo of this piece** to add more sides; on the site
   people swipe through them.
5. Under each photo, tap one look: **Original**, **Auto**, **Paper white** (cleans up a grey paper background),
   **Vivid**, or **Glow**. **Turn or crop** opens the photo bigger. The untouched original is always saved too.
6. Type a caption in her own words if she has one (optional). Tap **Show big** on the best one or two of the season.
   If none is starred, the newest piece of the season shows big.
7. Check **Date it was made** (it starts as today). The grade label works itself out from the date and rolls
   over every September; summer pieces say "summer after 3rd grade".
8. Tap **Save**. It is on the site right away, and the original goes into Google Drive. With weak or no signal,
   it waits on the phone and goes up by itself later; the first screen says how many are waiting, with **Send now**.
9. If a picture looks like one already saved, the app says so. Save anyway, or tap **Take out**.

**Change or put away art:** in the app, tap **Recent uploads**. Change a caption or date, star one, or tap
**Put away**. Put-away art is kept for 30 days under **Recently put away** with **Bring back**. The originals in
Google Drive are never touched.

**If Save will not work:** tap **If Save will not work: share to the Drive app**, pick Drive and the
**Two Sisters Studio** folder, and tell Claude.

## Share with a friend
1. Open **For parents** and type the parent PIN.
2. Under **Share with a friend**, tick the pages (or **All of them**) and how long it works: a week, a month,
   a year, or no end date.
3. Tap **Make a link**. Then tap **Send link** (a text with only the link) and **Send password** (a text that says
   "Password for the art site: ..."). Each opens your phone's share list. On a computer they copy instead.
4. **Links you made** lists every link. Tap **Turn off** to stop one; anyone using it is logged out within a minute.
   Changing the friends password also logs out every friend, even on "no end date" links.

## Change a password or the PIN
On **For parents**, under **Passwords and PIN**, type the new one and tap **Change**. Every other phone and
computer using it is logged out; yours stays in. Family and friends passwords need at least 6 letters or
numbers; the PIN is 4 to 8 numbers. Tell the family the new family password yourself.
(The first passwords come from Netlify: **Project configuration → Environment variables**. Once you change one on
the For parents page, that page's version is the one that counts.)

## Which Google account, and Drive space
- The archive lives in **jessejberg@gmail.com**'s Google Drive, folder **Two Sisters Studio**: Leora / Amaya / Both,
  then school year, then School Year or Summer. Each piece has its original photo(s), an edited copy if you fixed
  it up, and a small details file. The `_site` folder holds the web copies the site uses. Leave both alone.
- Every family phone that uploads saves into that same Drive. Nobody else needs a Google account.
- **For parents → Google Drive** shows how much Drive space is used. A phone photo is about 3 to 5 MB, so 15 GB
  holds a few thousand pieces. If it fills up, Google One adds more.
- If the site is ever lost, **For parents → Rebuild now** puts every gallery back from Drive.

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
- **Nobody can log in:** check the five settings in Netlify, **Project configuration → Environment variables**:
  TSS_SECRET, FAMILY_PASSWORD, FRIENDS_PASSWORD, PARENT_PIN, GOOGLE_CLIENT_SECRET. Then tell Claude.
- **Save says Google Drive is not connected:** For parents → **Connect Google Drive** (or **Connect again**), with
  jessejberg@gmail.com.
- **Anything else:** tell Claude what you saw. Nothing on the site can delete the originals in Google Drive.
