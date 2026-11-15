# Demo screenshot slides

A standalone static walkthrough of the wedding demo captured on 15 November 2026.
Move through 47 screenshots, each with suggested spoken text and the matching click
instruction. Recording caveats are collapsed under each slide.

- Left / Right or Page Up / Page Down: previous / next slide
- Space: next; Shift + Space: previous
- Home / End: first / last
- F: full screen
- N: show / hide speaker text
- Use the slide picker to jump directly, or share a `#slide=25` link.

No build or dependencies are required. Serve this directory with any static host.
For local use: `python -m http.server 8798 --bind 127.0.0.1 --directory apps/demo-slides`.
The JSON file is fetched over HTTP, so opening `index.html` as a file is unsupported.

`slides.json` contains the title, image, speaker script, click instruction and notes.
The screenshot PNGs are unaltered captures of the synthetic Junction demo. The final
captured total is EUR 1,904.89 with five stock concerns and one allergen-data concern.

The intended public address is https://demo.hewston.ie/. Publish this directory as a
static Cloudflare Pages project and attach that custom hostname. It does not depend
on the live wedding app or its database, and requires no secrets in the site files.
