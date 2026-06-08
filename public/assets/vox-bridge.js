(function () {
  var VOICE_URL = '/voice/'

  function iframe() {
    var o = document.getElementById('vox-overlay')
    if (!o) return null
    return document.getElementById('vox-iframe') || o.querySelector('iframe')
  }

  function post(frame, type) {
    if (!frame || !frame.contentWindow) return
    try {
      frame.contentWindow.postMessage({ type: type }, '*')
    } catch (e) {}
  }

  window.openVox = function () {
    var o = document.getElementById('vox-overlay')
    if (!o) return
    o.classList.add('open')
    o.style.display = o.style.display === 'flex' ? 'flex' : 'block'

    var f = iframe()
    if (!f) return
    f.style.display = 'block'

    function start() {
      post(f, 'voxtalk-start')
    }

    if (f.getAttribute('data-vox-ready') === '1') {
      start()
      return
    }

    f.onload = function () {
      f.setAttribute('data-vox-ready', '1')
      start()
    }

    if (!f.src || f.src.indexOf('/voice') === -1) {
      f.src = VOICE_URL
    } else if (f.contentDocument && f.contentDocument.readyState === 'complete') {
      f.setAttribute('data-vox-ready', '1')
      start()
    }
  }

  window.closeVox = function () {
    var f = iframe()
    if (f) {
      post(f, 'voxtalk-stop')
      f.removeAttribute('data-vox-ready')
      f.src = 'about:blank'
      f.style.display = 'none'
    }
    var o = document.getElementById('vox-overlay')
    if (o) {
      o.style.display = 'none'
      o.classList.remove('open')
    }
  }

  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'voxtalk-ready') {
      var f = iframe()
      if (f && f.contentWindow === e.source) {
        f.setAttribute('data-vox-ready', '1')
      }
    }
  })
})()
