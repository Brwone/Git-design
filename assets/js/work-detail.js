(function () {
  const scrollVideos = document.querySelectorAll(".work-detail__scroll-video");

  if (!scrollVideos.length || !("IntersectionObserver" in window)) {
    return;
  }

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
})();
