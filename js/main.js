/* ============================================================================
   main.js
   ----------------------------------------------------------------------------
   General site behavior that has nothing to do with the Google Sheet:
   mobile nav toggle, highlighting the active nav link while scrolling,
   and the contact form submit handler.

   To change where contact form submissions go, see the CONTACT FORM
   section near the bottom -- it's currently wired for Formspree
   (https://formspree.io), a free service that emails you form
   submissions with no backend server needed. Swap in your own endpoint,
   or replace with a `mailto:` link if you'd rather keep it simple.
   ============================================================================ */

document.addEventListener("DOMContentLoaded", () => {
  /* --------------------------- Mobile nav toggle -------------------------- */
  const toggle = document.querySelector(".nav-toggle");
  const navLinks = document.querySelector(".nav-links");

  if (toggle && navLinks) {
    toggle.addEventListener("click", () => {
      const isOpen = navLinks.classList.toggle("is-open");
      toggle.classList.toggle("is-open", isOpen);
      toggle.setAttribute("aria-expanded", String(isOpen));
      // Lock background scroll while the full-screen mobile menu is open,
      // so the page underneath doesn't shift/scroll behind it.
      document.body.style.overflow = isOpen ? "hidden" : "";
    });

    // Close the mobile menu after tapping a link
    navLinks.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        navLinks.classList.remove("is-open");
        document.body.style.overflow = "";
        toggle.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ------------------- Highlight nav link for visible section ------------ */
  const sections = document.querySelectorAll("main section[id]");
  const navAnchors = document.querySelectorAll(".nav-links a");

  if (sections.length && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.getAttribute("id");
          navAnchors.forEach((a) => {
            a.classList.toggle("is-active", a.getAttribute("href") === `#${id}`);
          });
        });
      },
      { rootMargin: "-40% 0px -55% 0px" }
    );
    sections.forEach((s) => observer.observe(s));
  }

  /* ------------------------------ Contact form ---------------------------- */
  const form = document.getElementById("contact-form");
  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const status = form.querySelector(".form-status");
      const button = form.querySelector('button[type="submit"]');
      const data = new FormData(form);

      // The <altcha-widget> renders a hidden input named "altcha" inside
      // the form once the visitor's browser has solved the puzzle. If it's
      // missing, they haven't completed (or haven't finished) the captcha.
      const altcha = data.get("altcha");
      if (!altcha) {
        if (status) status.textContent = "Please complete the \u201cI'm not a robot\u201d check above.";
        return;
      }

      button.disabled = true;
      if (status) status.textContent = "Sending...";

      const payload = {
        name: data.get("name"),
        email: data.get("email"),
        subject: data.get("subject"),
        message: data.get("message"),
        altcha,
      };

      try {
        const response = await fetch("/api/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => ({}));

        if (response.ok) {
          form.reset();
          if (status) status.textContent = "Thanks -- your message has been sent.";
        } else {
          if (status) status.textContent = result.error || "Something went wrong. Please email us directly.";
        }
      } catch (err) {
        if (status) status.textContent = "Something went wrong. Please email us directly.";
      } finally {
        button.disabled = false;
      }
    });
  }

  /* ---------------------------- Footer year ------------------------------- */
  const yearEl = document.getElementById("current-year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* --------------------------------- Lightbox ------------------------------
     Enlarges any image inside .gallery-grid or .branch-photos when clicked.
     If the clicked card groups more than one photo (see groupRowsByOrder in
     js/sheet-data.js -- rows sharing the same whole-number "order" value),
     this opens as a swipeable carousel with prev/next arrows, a "2 / 5"
     counter, keyboard arrow-key support, and touch swipe -- rather than
     just a single static image.

     Uses event delegation (one listener on document) instead of binding to
     each <img> individually, because the images in those two grids are
     added later by js/sheet-data.js from the Google Sheet -- a per-image
     listener set up here at page load would miss them entirely.
  --------------------------------------------------------------------------- */
  const lightbox = document.getElementById("lightbox");
  const lightboxImage = document.getElementById("lightbox-image");
  const lightboxCaption = document.getElementById("lightbox-caption");
  const lightboxCounter = document.getElementById("lightbox-counter");
  const lightboxClose = document.getElementById("lightbox-close");
  const lightboxPrev = document.getElementById("lightbox-prev");
  const lightboxNext = document.getElementById("lightbox-next");

  if (lightbox && lightboxImage && lightboxClose) {
    let currentPhotos = [];
    let currentIndex = 0;

    const renderCurrentPhoto = () => {
      const photo = currentPhotos[currentIndex];
      if (!photo) return;
      lightboxImage.src = photo.src;
      lightboxImage.alt = photo.caption || "";
      lightboxCaption.textContent = photo.caption || "";

      const hasMultiple = currentPhotos.length > 1;
      if (lightboxCounter) {
        lightboxCounter.textContent = `${currentIndex + 1} / ${currentPhotos.length}`;
        lightboxCounter.hidden = !hasMultiple;
      }
      if (lightboxPrev) lightboxPrev.hidden = !hasMultiple;
      if (lightboxNext) lightboxNext.hidden = !hasMultiple;
    };

    const showNext = () => {
      if (currentPhotos.length < 2) return;
      currentIndex = (currentIndex + 1) % currentPhotos.length;
      renderCurrentPhoto();
    };

    const showPrev = () => {
      if (currentPhotos.length < 2) return;
      currentIndex = (currentIndex - 1 + currentPhotos.length) % currentPhotos.length;
      renderCurrentPhoto();
    };

    const openLightbox = (figure, startIndex) => {
      let photos = [];
      try {
        photos = JSON.parse(decodeURIComponent(figure.dataset.images || ""));
      } catch (e) {
        photos = [];
      }
      // Fallback for any figure without data-images (shouldn't normally
      // happen, but keeps this working even on hand-edited markup): build
      // a single-photo "gallery" straight from the <img>/<figcaption>.
      if (!photos.length) {
        const img = figure.querySelector("img");
        const captionEl = figure.querySelector("figcaption");
        if (img) {
          photos = [{ src: img.currentSrc || img.src, caption: captionEl ? captionEl.textContent : "" }];
        }
      }
      if (!photos.length) return;

      currentPhotos = photos;
      currentIndex = Math.min(Math.max(startIndex || 0, 0), photos.length - 1);
      renderCurrentPhoto();

      lightbox.classList.add("is-open");
      lightbox.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    };

    const closeLightbox = () => {
      lightbox.classList.remove("is-open");
      lightbox.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    };

    // Delegated click listener -- catches clicks on any current OR future
    // image inside these two grids.
    document.addEventListener("click", (e) => {
      const img = e.target.closest(".gallery-grid img, .branch-photos img");
      if (!img) return;
      const figure = img.closest("figure");
      if (!figure) return;
      openLightbox(figure, Number(figure.dataset.index || 0));
    });

    lightboxClose.addEventListener("click", closeLightbox);
    if (lightboxPrev) lightboxPrev.addEventListener("click", showPrev);
    if (lightboxNext) lightboxNext.addEventListener("click", showNext);

    // Click on the dark backdrop (but not the image itself) also closes it.
    lightbox.addEventListener("click", (e) => {
      if (e.target === lightbox) closeLightbox();
    });

    // Esc closes it; left/right arrow keys move through a multi-photo card.
    document.addEventListener("keydown", (e) => {
      if (!lightbox.classList.contains("is-open")) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowRight") showNext();
      if (e.key === "ArrowLeft") showPrev();
    });

    // Touch swipe -- left swipe = next photo, right swipe = previous.
    let touchStartX = null;
    lightbox.addEventListener(
      "touchstart",
      (e) => {
        touchStartX = e.changedTouches[0].clientX;
      },
      { passive: true }
    );
    lightbox.addEventListener(
      "touchend",
      (e) => {
        if (touchStartX === null) return;
        const deltaX = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(deltaX) > 40) {
          if (deltaX < 0) showNext();
          else showPrev();
        }
        touchStartX = null;
      },
      { passive: true }
    );
  }
});
