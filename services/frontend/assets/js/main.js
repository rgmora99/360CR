(function initHome() {
  const carousel = document.querySelector('.services-carousel');
  const prevBtn = document.querySelector('.carousel-btn.prev');
  const nextBtn = document.querySelector('.carousel-btn.next');

  if (!carousel || !prevBtn || !nextBtn) return;

  const getStep = () => {
    const card = carousel.querySelector('.card');
    if (!card) return 320;

    const cardStyles = window.getComputedStyle(card);
    const gap = parseFloat(window.getComputedStyle(carousel).columnGap || window.getComputedStyle(carousel).gap || '0');
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

  const cards = carousel.querySelectorAll('.card');
  if (!('IntersectionObserver' in window)) {
    cards.forEach((card) => card.classList.add('is-visible'));
    return;
  }

  const cardObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        cardObserver.unobserve(entry.target);
      });
    },
    { root: carousel, threshold: 0.2 }
  );

  cards.forEach((card) => cardObserver.observe(card));
})();
