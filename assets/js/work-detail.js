(function () {
  const backToTopButton = document.querySelector('[data-footer-action="top"]');

  if (backToTopButton) {
    backToTopButton.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  const scrollVideos = document.querySelectorAll(".work-detail__scroll-video");

  function syncSoundToggle(button, video) {
    const isMuted = video.muted;
    button.setAttribute("aria-pressed", isMuted ? "false" : "true");
    button.setAttribute("aria-label", isMuted ? "开启声音" : "关闭声音");
    button.classList.toggle("is-unmuted", !isMuted);
  }

  function createSoundToggle(video) {
    const figure = video.closest(".work-detail__figure--video") || video.parentElement;
    if (!figure) {
      return null;
    }

    let button = figure.querySelector(".work-detail__sound-toggle");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "work-detail__sound-toggle";
      button.innerHTML =
        '<svg class="work-detail__sound-icon work-detail__sound-icon--muted" viewBox="0 0 24 24" aria-hidden="true">' +
        '<path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"/>' +
        "</svg>" +
        '<svg class="work-detail__sound-icon work-detail__sound-icon--on" viewBox="0 0 24 24" aria-hidden="true">' +
        '<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>' +
        "</svg>";
      figure.appendChild(button);
    }

    // Keep autoplay policy happy until the user explicitly enables sound.
    video.defaultMuted = true;
    video.muted = true;
    video.setAttribute("muted", "");
    video.volume = 1;
    syncSoundToggle(button, video);

    if (button.dataset.bound === "true") {
      return button;
    }
    button.dataset.bound = "true";

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();

      if (video.muted) {
        video.muted = false;
        video.defaultMuted = false;
        video.removeAttribute("muted");
        video.volume = 1;
        video.dataset.soundEnabled = "true";

        // User gesture: resume with sound if browser paused muted autoplay.
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.catch(function () {});
        }
      } else {
        video.muted = true;
        video.defaultMuted = true;
        video.setAttribute("muted", "");
        delete video.dataset.soundEnabled;
      }

      syncSoundToggle(button, video);
    });

    return button;
  }

  if (scrollVideos.length) {
    scrollVideos.forEach(function (video) {
      createSoundToggle(video);

      if (!("IntersectionObserver" in window)) {
        return;
      }

      const observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              // Avoid load() after first play — it re-applies the muted attribute.
              if (video.readyState === 0) {
                video.load();
                if (!video.dataset.soundEnabled) {
                  video.muted = true;
                  video.setAttribute("muted", "");
                }
              }

              if (video.paused) {
                const playPromise = video.play();
                if (playPromise !== undefined) {
                  playPromise.catch(function () {});
                }
              }
            } else {
              video.pause();
            }
          });
        },
        {
          threshold: 0.35,
          rootMargin: "0px 0px -5% 0px",
        }
      );

      observer.observe(video);
    });
  }

  document.querySelectorAll(".work-detail__figure--click-video").forEach(function (figure) {
    const video = figure.querySelector(".work-detail__click-video");
    const playBtn = figure.querySelector(".work-detail__click-video-btn");

    if (!video || !playBtn) {
      return;
    }

    function startPlayback() {
      if (playBtn.hidden) {
        return;
      }

      if (video.readyState === 0) {
        video.load();
      }

      video.muted = false;
      video.controls = true;
      playBtn.hidden = true;
      figure.classList.add("is-playing");

      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(function () {
          playBtn.hidden = false;
          video.controls = false;
          figure.classList.remove("is-playing");
        });
      }
    }

    playBtn.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();
      startPlayback();
    });

    video.addEventListener("click", function () {
      if (video.paused) {
        startPlayback();
      }
    });

    video.addEventListener("ended", function () {
      video.controls = false;
      playBtn.hidden = false;
      figure.classList.remove("is-playing");
    });
  });
})();
