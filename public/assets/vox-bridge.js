(function () {
  var VOICE_URL = '/voice/'
  var sessionActive = false
  var closing = false

  function iframe() {
    var o = document.getElementById('vox-overlay')
    if (!o) return null
    return document.getElementById('vox-iframe') || o.querySelector('iframe')
  }

  function overlayOpen() {
    var o = document.getElementById('vox-overlay')
    return !!(o && o.classList.contains('open'))
  }

  function post(frame, msg) {
    if (!frame || !frame.contentWindow) return
    var payload = typeof msg === 'string' ? { type: msg } : msg
    try {
      frame.contentWindow.postMessage(payload, '*')
    } catch (e) {}
  }

  function normalizeIframe(frame) {
    if (!frame) return
    frame.style.display = 'block'
    frame.style.position = ''
    frame.style.inset = ''
    frame.style.width = ''
    frame.style.height = ''
    frame.style.zIndex = ''
    frame.style.border = 'none'
    frame.style.background = 'transparent'
  }

  function lockScroll(on) {
    document.body.style.overflow = on ? 'hidden' : ''
  }

  window.openVox = function () {
    var o = document.getElementById('vox-overlay')
    if (!o || closing) return

    if (o.classList.contains('open')) {
      closeVox(true)
      return
    }

    o.classList.add('open')
    o.style.display = 'flex'
    lockScroll(true)

    var f = iframe()
    if (!f) return
    normalizeIframe(f)

    var returning = sessionStorage.getItem('a1-vox-returning') === '1'

    function start() {
      if (closing) return
      sessionActive = true
      post(f, { type: 'voxtalk-start', returning: returning })
    }

    if (f.getAttribute('data-vox-ready') === '1' && f.src && f.src.indexOf('/voice') !== -1) {
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

  window.closeVox = function (immediate) {
    if (closing) return
    closing = true
    var wasActive = sessionActive

    var f = iframe()

    function finishClose() {
      if (wasActive) {
        try { sessionStorage.setItem('a1-vox-returning', '1') } catch (e) {}
      }
      if (f) {
        f.removeAttribute('data-vox-ready')
        f.src = 'about:blank'
        f.style.display = 'none'
      }
      var o = document.getElementById('vox-overlay')
      if (o) {
        o.style.display = 'none'
        o.classList.remove('open')
      }
      lockScroll(false)
      sessionActive = false
      closing = false
    }

    if (f && f.getAttribute('data-vox-ready') === '1' && sessionActive) {
      post(f, 'voxtalk-stop')
      finishClose()
    } else {
      finishClose()
    }
  }

  window.addEventListener('message', function (e) {
    if (!e.data || !e.data.type) return

    if (e.data.type === 'voxtalk-ready') {
      var f = iframe()
      if (f && f.contentWindow === e.source) {
        f.setAttribute('data-vox-ready', '1')
      }
      return
    }

    if (e.data.type === 'voxtalk-stopped') {
      sessionActive = false
      return
    }

    if (e.data.type === 'voxtalk-close') {
      sessionActive = false
      if (!closing) closeVox(true)
    }
  })

  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden' && overlayOpen()) {
      closeVox(true)
    }
  })

  window.addEventListener('pagehide', function () {
    if (overlayOpen()) closeVox(true)
  })

  window.addEventListener('popstate', function () {
    if (overlayOpen()) closeVox(true)
  })

  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href]')
    if (!link || !overlayOpen()) return
    var href = (link.getAttribute('href') || '').trim()
    if (!href || href.charAt(0) === '#' || href.indexOf('javascript:') === 0) return
    closeVox(true)
  }, true)
})()
