(function () {
  const cards = document.querySelectorAll(".work-card");

  if ("IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -5% 0px" }
    );

    cards.forEach(function (card, index) {
      card.style.transitionDelay = Math.min(index * 0.04, 0.32) + "s";
      revealObserver.observe(card);
    });
  } else {
    cards.forEach(function (card) {
      card.classList.add("is-visible");
    });
  }

  document.querySelectorAll(".work-card--hover-video").forEach(function (card) {
    const video = card.querySelector(".work-card__video");
    if (!video) return;

    function playPreview() {
      if (video.readyState === 0) {
        video.load();
      }

      video.currentTime = 0;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(function () {});
      }

      card.classList.add("is-playing");
    }

    function stopPreview() {
      video.pause();
      card.classList.remove("is-playing");
    }

    card.addEventListener("mouseenter", playPreview);
    card.addEventListener("mouseleave", stopPreview);
    card.addEventListener("focusin", playPreview);
    card.addEventListener("focusout", stopPreview);
  });
})();
