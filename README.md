# callmaout-website

The landing page for [calLMAOut](../callmaout): a short description, the extension as a `.zip` download, and a demo video. The site asks for the camera when it opens (there's no visible preview), and pressing **Download for Chrome** turns your webcam frame into a GIF, made the same way the extension makes them (smile check, label, stickers, animated GIF), as a demo.

## Develop

```bash
npm install
npm run dev
```

## Syncing with the extension

The face detection, smile model, stickers and GIF code are the extension's own, copied into `src/extension/` along with the models and artwork in `public/`. The download is a fresh build of the extension, zipped to `public/callmaout.zip`. To update all of it from a checkout at `../callmaout` (or set `CALLMAOUT_DIR`):

```bash
npm run sync
```

Don't edit `src/extension/`; change the extension and sync again.

## Demo video

The demo is the YouTube video [Jc_cGOw6P00](https://youtu.be/Jc_cGOw6P00), embedded with YouTube's privacy-enhanced player. To change it, edit the `iframe` in `src/main.tsx`.

## Deploy to GitHub Pages

The repo needs a GitHub remote (`origin`) first. Then:

```bash
npm run deploy
```

This builds the site and pushes `dist/` to the `gh-pages` branch. The first time, open the repo's **Settings → Pages** on GitHub and set the source to **Deploy from a branch**, branch `gh-pages`, folder `/ (root)`. The site then lives at `https://<your-username>.github.io/callmaout-website/`.

Everything runs in the visitor's browser; nothing is uploaded. `dist/` is plain static files, so any other static host works too.
