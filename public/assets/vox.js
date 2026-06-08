// Shared VoxTalk overlay controls — consistent across all pages.
(function () {
  var VOX_EMBED = 'voxtalk-embed.html';
  var VOX_EMBED_AUTOSTART = 'voxtalk-embed.html?autostart=1';

  function byId(id) {
    return document.getElementById(id);
  }

  window.openVox = function () {
    var overlay = byId('vox-overlay');
    if (!overlay) return;
    overlay.classList.add('open');
    overlay.style.display = 'flex';
  };

  window.closeVox = function () {
    var iframe = byId('vox-iframe');
    if (iframe && iframe.contentWindow) {
      try {
        iframe.contentWindow.postMessage({ type: 'voxtalk-stop' }, '*');
      } catch (err) {}
    }
    var overlay = byId('vox-overlay');
    if (!overlay) return;
    overlay.style.display = 'none';
    overlay.classList.remove('open');
    if (iframe) {
      setTimeout(function () {
        iframe.src = iframe.src;
      }, 150);
    }
  };

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') window.closeVox();
  });

  document.addEventListener('click', function (e) {
    var overlay = byId('vox-overlay');
    if (!overlay || overlay.style.display === 'none') return;
    if (overlay.classList.contains('vox-fullscreen') && e.target === overlay) {
      window.closeVox();
    }
  });

  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'voxtalk-close') {
      window.closeVox();
    }
  });

  window.VOX_EMBED = VOX_EMBED;
  window.VOX_EMBED_AUTOSTART = VOX_EMBED_AUTOSTART;
})();
