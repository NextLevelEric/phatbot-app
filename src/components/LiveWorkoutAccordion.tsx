"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const LIVE_SESSION_PATH = /^\/sessions\/[^/]+$/;

function findExerciseCards() {
  const main = document.querySelector("main");
  if (!main) return [] as HTMLElement[];

  return Array.from(main.querySelectorAll(":scope > section")).filter((node): node is HTMLElement => {
    if (!(node instanceof HTMLElement)) return false;
    const firstChild = node.firstElementChild;
    return Boolean(firstChild?.querySelector("h2"));
  });
}

function cardKey(card: HTMLElement) {
  const title = card.querySelector("h2")?.textContent?.trim() ?? "exercise";
  const position = card.firstElementChild?.querySelector("span")?.textContent?.trim() ?? "";
  return `${position}:${title}`;
}

function coachTarget(card: HTMLElement) {
  const paragraphs = Array.from(card.querySelectorAll("p"));
  const target = paragraphs.find((p) => p.textContent?.trim().startsWith("Coach target:"));
  return target?.textContent?.replace(/^Coach target:\s*/, "")?.trim() ?? "";
}

export default function LiveWorkoutAccordion() {
  const pathname = usePathname();
  const activeKey = useRef<string | null>(null);

  useEffect(() => {
    if (!LIVE_SESSION_PATH.test(pathname)) return;

    let observer: MutationObserver | null = null;
    let applying = false;

    function apply() {
      if (applying) return;
      applying = true;
      try {
        const cards = findExerciseCards();
        if (!cards.length) return;

        const keys = cards.map(cardKey);
        if (!activeKey.current || !keys.includes(activeKey.current)) {
          activeKey.current = keys[0];
        }

        cards.forEach((card) => {
          const key = cardKey(card);
          const isOpen = key === activeKey.current;
          card.dataset.phatLiveExerciseCard = "true";
          card.dataset.phatOpen = isOpen ? "true" : "false";
          card.dataset.phatSummary = coachTarget(card)
            ? `Coach target: ${coachTarget(card)} · Tap to open`
            : "Tap to open";
          const header = card.firstElementChild as HTMLElement | null;
          if (header) {
            header.dataset.phatExerciseHeader = "true";
            header.setAttribute("role", "button");
            header.setAttribute("tabindex", "0");
            header.setAttribute("aria-expanded", isOpen ? "true" : "false");
          }
        });
      } finally {
        applying = false;
      }
    }

    function activate(card: HTMLElement) {
      activeKey.current = cardKey(card);
      apply();
    }

    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest("button,a,input,textarea,select,label")) return;
      const card = target.closest('[data-phat-live-exercise-card="true"]');
      if (!(card instanceof HTMLElement)) return;
      const header = target.closest('[data-phat-exercise-header="true"]');
      if (header || card.dataset.phatOpen === "false") activate(card);
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = event.target as HTMLElement | null;
      const header = target?.closest('[data-phat-exercise-header="true"]');
      if (!(header instanceof HTMLElement)) return;
      const card = header.closest('[data-phat-live-exercise-card="true"]');
      if (!(card instanceof HTMLElement)) return;
      event.preventDefault();
      activate(card);
    }

    apply();
    observer = new MutationObserver(() => apply());
    const main = document.querySelector("main");
    if (main) observer.observe(main, { childList: true, subtree: true });
    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKey);

    return () => {
      observer?.disconnect();
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
      activeKey.current = null;
    };
  }, [pathname]);

  if (!LIVE_SESSION_PATH.test(pathname)) return null;

  return (
    <style jsx global>{`
      [data-phat-live-exercise-card="true"] {
        transition: border-color 160ms ease, background-color 160ms ease;
      }
      [data-phat-live-exercise-card="true"][data-phat-open="true"] {
        border-color: rgba(255, 0, 50, 0.45);
      }
      [data-phat-live-exercise-card="true"] > [data-phat-exercise-header="true"] {
        cursor: pointer;
        position: relative;
        padding-right: 2rem;
      }
      [data-phat-live-exercise-card="true"] > [data-phat-exercise-header="true"]::after {
        content: "⌄";
        position: absolute;
        right: 0;
        top: 0.15rem;
        color: rgb(161 161 170);
        font-size: 1.35rem;
        font-weight: 800;
        transform: rotate(-90deg);
        transition: transform 160ms ease;
      }
      [data-phat-live-exercise-card="true"][data-phat-open="true"] > [data-phat-exercise-header="true"]::after {
        transform: rotate(0deg);
        color: #ff0032;
      }
      [data-phat-live-exercise-card="true"][data-phat-open="false"] > :not(:first-child) {
        display: none !important;
      }
      [data-phat-live-exercise-card="true"][data-phat-open="false"]::after {
        content: attr(data-phat-summary);
        display: block;
        margin-top: 0.7rem;
        color: rgb(161 161 170);
        font-size: 0.8rem;
        line-height: 1.35rem;
      }
    `}</style>
  );
}
