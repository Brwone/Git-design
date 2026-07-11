(function () {
  const scrollVideos = document.querySelectorAll(".work-detail__scroll-video");

  if (scrollVideos.length && "IntersectionObserver" in window) {
    scrollVideos.forEach(function (video) {
      const observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              if (video.readyState === 0) {
                video.load();
              }

              video.currentTime = 0;
              const playPromise = video.play();
              if (playPromise !== undefined) {
                playPromise.catch(function () {});
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
