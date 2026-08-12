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
      const endpoint = form.getAttribute("action");

      // If no real endpoint has been configured yet, tell the developer
      // (not the visitor) via the console, and fall back to a mailto link
      // so the form still "works" during setup.
      if (!endpoint || endpoint.includes("YOUR_FORM_ID")) {
        console.warn(
          "[slsc] Contact form has no live endpoint yet. Set the form's " +
            "action= attribute in index.html to a Formspree endpoint " +
            "(https://formspree.io/f/xeajgyzp) or your own form backend."
        );
        const data = new FormData(form);
        const subject = encodeURIComponent(data.get("subject") || "Website inquiry");
        const body = encodeURIComponent(
          `Name: ${data.get("name")}\nEmail: ${data.get("email")}\n\n${data.get("message")}`
        );
        window.location.href = `mailto:strellas_davaomain@outlook.com?subject=${subject}&body=${body}`;
        return;
      }

      button.disabled = true;
      if (status) status.textContent = "Sending...";

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          body: new FormData(form),
          headers: { Accept: "application/json" },
        });
        if (response.ok) {
          form.reset();
          if (status) status.textContent = "Thanks -- your message has been sent.";
        } else {
          if (status) status.textContent = "Something went wrong. Please email us directly.";
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
});
