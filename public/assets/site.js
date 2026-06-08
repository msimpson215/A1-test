// Shared JS to keep behavior consistent across pages.
// Safe: it checks for elements before acting.

(function () {
  function byId(id){ return document.getElementById(id); }

  // Close mobile menu when clicking outside (if present)
  document.addEventListener('click', function (e) {
    var menu = byId('mobileMenu');
    if (!menu) return;

    if (!menu.classList.contains('open')) return;

    var hamburger = e.target.closest ? e.target.closest('.hamburger') : null;
    if (!menu.contains(e.target) && !hamburger) {
      menu.classList.remove('open');
    }
  });

})();
