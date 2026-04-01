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

  prevBtn.addEventListener('click', () => scrollCards(-1));
  nextBtn.addEventListener('click', () => scrollCards(1));
})();
