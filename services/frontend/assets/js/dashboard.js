(function initDashboardNavigation() {
  const cards = document.querySelectorAll('.module-card[data-href]');
  if (!cards.length) return;

  cards.forEach((card) => {
    card.setAttribute('role', 'link');
    card.setAttribute('tabindex', '0');
    card.style.cursor = 'pointer';

    const goToModule = () => {
      const href = card.getAttribute('data-href');
      if (href) {
        window.location.href = href;
      }
    };

    card.addEventListener('click', goToModule);
    card.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        goToModule();
      }
    });
  });
})();
