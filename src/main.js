import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { initRegister } from "./register.js";

gsap.registerPlugin(ScrollTrigger);

const root = document.documentElement;
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const video = document.querySelector(".hero__video");

initRegister();

// Pause the background loop whenever the hero is off screen.
if (video) {
  if (reduceMotion) {
    video.removeAttribute("autoplay");
    video.pause();
  } else {
    new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) video.play().catch(() => {});
      else video.pause();
    }).observe(video);
  }
}

if (reduceMotion) {
  root.classList.remove("intro");
} else {
  initSmoothScroll();
  initIntro();
  initScroll();
}

function initSmoothScroll() {
  const lenis = new Lenis({ autoRaf: false, lerp: 0.12 });
  lenis.on("scroll", ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    const id = link.getAttribute("href");
    if (id.length < 2) return;
    link.addEventListener("click", (e) => {
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { duration: 1.1 });
      target.setAttribute("tabindex", "-1");
      target.focus({ preventScroll: true });
    });
  });
}

// 120 BPM, same tempo as the HyperFrames loop: one beat = 0.5 s.
function initIntro() {
  const BEAT = 0.5;
  const q = (sel) => document.querySelectorAll(sel);

  // Reveal, then build every from() in the same frame so nothing flashes.
  root.classList.remove("intro");

  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

  tl.from(".title__plate", { clipPath: "inset(0 100% 0 0)", duration: BEAT, ease: "power2.inOut" }, 0)
    .from(".kicker", { y: 16, opacity: 0, duration: BEAT }, BEAT * 0.5)
    // each word lands on a beat, squashes on impact like a foot on the step
    .from(q('[data-intro="stomp"]')[0], { y: -140, opacity: 0, duration: BEAT * 0.6, ease: "power3.in" }, BEAT)
    .fromTo(q('[data-intro="stomp"]')[0], { scaleY: 0.82, scaleX: 1.08 }, { scaleY: 1, scaleX: 1, duration: BEAT * 0.5, transformOrigin: "50% 100%", immediateRender: false }, BEAT * 1.6)
    .from(q('[data-intro="stomp"]')[1], { y: -140, opacity: 0, duration: BEAT * 0.6, ease: "power3.in" }, BEAT * 2)
    .fromTo(q('[data-intro="stomp"]')[1], { scaleY: 0.82, scaleX: 1.08 }, { scaleY: 1, scaleX: 1, duration: BEAT * 0.5, transformOrigin: "50% 100%", immediateRender: false }, BEAT * 2.6)
    .from(".title__with", { clipPath: "inset(0 100% 0 0)", duration: BEAT * 0.8, ease: "power2.out" }, BEAT * 2.7)
    .from(".drei", { y: 160, opacity: 0, duration: BEAT * 2, ease: "expo.out" }, BEAT * 0.8)
    .from(".tag", { scale: 0.6, rotation: -14, opacity: 0, duration: BEAT * 0.7, ease: "back.out(2.2)" }, BEAT * 3.4)
    .from(".facts, .cta", { y: 30, opacity: 0, duration: BEAT * 1.2, stagger: BEAT * 0.4 }, BEAT * 3.6)
    .from(".b span", { x: 60, opacity: 0, duration: BEAT * 0.7, stagger: BEAT * 0.5, ease: "back.out(1.8)" }, BEAT * 4)
    .from(".quote", { clipPath: "inset(0 100% 0 0)", duration: BEAT * 1.2, ease: "power2.out" }, BEAT * 4.5)
    .from(".sticker", { scale: 0, rotation: 20, duration: BEAT * 0.8, ease: "back.out(2)" }, BEAT * 6)
    .from(".scroll-cue", { opacity: 0, duration: BEAT }, BEAT * 6.5);

  // after landing, Drei keeps a half-tempo step bounce
  tl.add(() => {
    gsap.to(".drei__img", { y: -6, duration: BEAT * 2, ease: "sine.inOut", yoyo: true, repeat: -1 });
  });
}

function initScroll() {
  const mm = gsap.matchMedia();

  mm.add("(min-width: 900px)", () => {
    const tl = gsap.timeline({
      scrollTrigger: { trigger: ".hero", start: "top top", end: "+=80%", pin: true, scrub: 0.6 },
      defaults: { ease: "none" },
    });

    tl.to(".hero__video", { scale: 1.12, yPercent: 4 }, 0)
      .to(".hero__copy", { y: -90, opacity: 0.15 }, 0)
      .to(".drei-wrap", { y: -30, scale: 1.06, transformOrigin: "50% 100%" }, 0)
      .to(".scroll-cue span", { opacity: 0, duration: 0.2 }, 0);

    // depth layers drift up and outward at their own rate
    document.querySelectorAll(".hero__stage [data-depth]").forEach((el) => {
      const d = parseFloat(el.dataset.depth);
      if (el.classList.contains("drei-wrap")) return;
      tl.to(el, { y: -70 * d, x: 26 * d, rotation: d * 2 }, 0);
    });
  });

  mm.add("(max-width: 899px)", () => {
    gsap.to(".drei-wrap", {
      y: -40,
      ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true },
    });
  });
}
