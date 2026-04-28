(function initCarouselModule() {
  const namespace = window.CR360 || {};

  function create(options = {}) {
    const carousel = options.carousel || document.querySelector(options.carouselSelector || '.services-carousel');
    const prevBtn = options.prevButton || document.querySelector(options.prevSelector || '.carousel-btn.prev');
    const nextBtn = options.nextButton || document.querySelector(options.nextSelector || '.carousel-btn.next');

    if (!carousel || !prevBtn || !nextBtn) {
      return null;
    }

    const getStep = () => {
      const card = carousel.querySelector(options.itemSelector || '.card');
      if (!card) return 320;

      const cardStyles = window.getComputedStyle(card);
      const carouselStyles = window.getComputedStyle(carousel);
      const gap = parseFloat(carouselStyles.columnGap || carouselStyles.gap || '0');
      return card.clientWidth + (Number.isNaN(gap) ? 0 : gap) + parseFloat(cardStyles.marginRight || '0');
    };

    const scrollCards = (direction) => {
      carousel.scrollBy({ left: getStep() * direction, behavior: 'smooth' });
    };

    const syncControls = () => {
      const maxScrollLeft = carousel.scrollWidth - carousel.clientWidth;
      const atStart = carousel.scrollLeft <= 8;
      const atEnd = carousel.scrollLeft >= maxScrollLeft - 8;

      prevBtn.disabled = atStart;
      nextBtn.disabled = atEnd;
    };

    prevBtn.addEventListener('click', () => scrollCards(-1));
    nextBtn.addEventListener('click', () => scrollCards(1));
    carousel.addEventListener('scroll', syncControls, { passive: true });
    window.addEventListener('resize', syncControls);
    syncControls();

    const cards = carousel.querySelectorAll(options.itemSelector || '.card');
    if (!('IntersectionObserver' in window)) {
      cards.forEach((card) => card.classList.add('is-visible'));
      return { syncControls };
    }

    const cardObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          cardObserver.unobserve(entry.target);
        });
      },
      { root: carousel, threshold: 0.2 },
    );

    cards.forEach((card) => cardObserver.observe(card));
    return { syncControls };
  }

  namespace.carousel = { create };
  window.CR360 = namespace;
})();
