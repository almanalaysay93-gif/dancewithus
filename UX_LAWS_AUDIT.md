# UX Laws Audit: Hero, Step Fit with Drei

Evidence: puppeteer-core + Chrome QA at 390×844 (mobile emulation) and 1440×900, plus a reduced-motion pass (2026-10-26). No horizontal overflow at either width, and no console errors.

| # | Law | Status | Evidence / decision |
|---|-----|--------|---------------------|
| 1 | Fitts | PASS | Primary CTA is 52px tall and full-contrast magenta. The nav "Reserve" button and scroll cue are ≥44px. |
| 2 | Hick | PASS | There is one primary action (Reserve a slot). The nav repeats it, and there are no competing CTAs. |
| 3 | Jakob | PASS | Familiar layout: logo top left, CTA top right, headline then details then CTA, with the photo on the right. |
| 4 | Miller | PASS | The flyer details are chunked into 4 facts (date, time, place, capacity) and 4 benefits. |
| 5 | Tesler | PASS | "Class 2 full" is stated up front, so users don't discover it at booking. The price includes the stepper. |
| 6 | Aesthetic-usability | PASS | The brush style comes from the flyer. The facts sit on a solid paper card for legibility. |
| 7 | Doherty | PASS | Hover/press feedback is ≤150ms. Intro content is readable within ~2s, and the MP4 is 838 KB with a poster fallback. |
| 8 | Peak-end | PASS | Peak: the STEP/FIT stomp on the beat. End: the "See you there! ☺" sign-off in the reserve section. |
| 9 | Serial position | PASS | The title comes first and the CTA + price last in the copy column. |
| 10 | Von Restorff | PASS | Only the CTA and the "Beginner friendly" tag use solid magenta in the copy column. "Class 2 full" is magenta text. |
| 11 | Pareto | PASS | Date, time, place and price (what most visitors need) are all above the fold on desktop. |
| 12 | Occam | PASS | Vanilla Vite with GSAP + Lenis only. No 3D layer, because the brief didn't need one. |
| 13 | Postel | PASS | Works without JS: content is visible by default, and a 3s fallback removes the intro gate. Reduced motion: no Lenis, no pin, video paused. |
| 14 | Zeigarnik | PASS* | The registration form (ported from the Grok build) shows spots left, inline errors, and a "You're on the list" confirmation that takes focus. |

\* Saving to the Sheet works only after the Apps Script web app is deployed and its `/exec` URL is in `src/config.js`. Until then, the form shows "The list isn't connected yet." Flows were verified with a mocked backend: validation, duplicate, success, and live count.
