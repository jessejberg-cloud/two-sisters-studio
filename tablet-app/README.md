# Two Sisters tablet app

A tiny Android app for the girls' Fire tablets. It opens the site's Add art page first and lets them look at the
rest of the site. Amazon Kids' own browser blocks the camera and the photo picker for web pages; inside this app
they work. It shows only twosistersstudio.com.

- Built by GitHub on every change here (`.github/workflows/tablet-app.yml`); the finished app lands in
  `site-src/assets/app/two-sisters-studio.apk` and is downloadable at `/assets/app/two-sisters-studio.apk` (login needed).
- Signed with `family.keystore` (password in `app/build.gradle`). Keep it: every version must use the same key or it
  will not install over the old one. Raise `versionCode` for each new version.
- The page knows it is inside the app by ` TwoSistersApp/` in the user agent (shows Take a photo and Camera with light
  on a girl's tablet).
