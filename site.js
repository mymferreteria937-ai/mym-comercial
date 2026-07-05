const cursorGlow = document.querySelector('.cursor-glow');
if (cursorGlow) {
  window.addEventListener('pointermove', (event) => {
    cursorGlow.style.left = `${event.clientX}px`;
    cursorGlow.style.top = `${event.clientY}px`;
  });
}

const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');
menuToggle?.addEventListener('click', () => navLinks?.classList.toggle('open'));
navLinks?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => navLinks.classList.remove('open'));
});

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.section-reveal').forEach((el) => revealObserver.observe(el));

const tiltCards = document.querySelectorAll('.tilt-card');
tiltCards.forEach((card) => {
  card.addEventListener('pointermove', (event) => {
    const rect = card.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const rx = ((y / rect.height) - 0.5) * -8;
    const ry = ((x / rect.width) - 0.5) * 8;
    card.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) translateY(-6px)`;
  });
  card.addEventListener('pointerleave', () => {
    card.style.transform = '';
  });
});

const magneticItems = document.querySelectorAll('.magnetic');
magneticItems.forEach((item) => {
  item.addEventListener('pointermove', (event) => {
    const rect = item.getBoundingClientRect();
    const x = (event.clientX - rect.left - rect.width / 2) * 0.18;
    const y = (event.clientY - rect.top - rect.height / 2) * 0.18;
    item.style.transform = `translate(${x}px, ${y}px)`;
  });
  item.addEventListener('pointerleave', () => {
    item.style.transform = '';
  });
});
