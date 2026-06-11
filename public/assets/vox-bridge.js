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

  function ensureEnergyField() {
    var o = document.getElementById('vox-overlay')
    if (!o || o.querySelector('.vox-energy')) return
    var wrap = document.createElement('div')
    wrap.className = 'vox-energy'
    wrap.setAttribute('aria-hidden', 'true')
    wrap.innerHTML =
      '<span class="vox-pinwheel vox-pinwheel--bright"></span>' +
      '<span class="vox-pinwheel vox-pinwheel--soft"></span>'
    o.insertBefore(wrap, o.firstChild)
  }

  ensureEnergyField()

  function closeMobileMenu() {
    var menu = document.getElementById('mobileMenu')
    if (menu) menu.classList.remove('open')
  }

  var lastTriggerAt = 0

  function isVoxTrigger(el) {
    if (!el) return false
    if (el.matches('[data-vox-open], .ai-nav, .ai-orb, #aiOrb')) return true
    var onclick = el.getAttribute('onclick') || ''
    return onclick.indexOf('openVox') !== -1
  }

  function handleVoxTrigger(e) {
    var trigger = e.target.closest('a, button, [data-vox-open], .ai-orb, #aiOrb')
    if (!isVoxTrigger(trigger)) return
    var now = Date.now()
    if (now - lastTriggerAt < 400) {
      e.preventDefault()
      return
    }
    lastTriggerAt = now
    e.preventDefault()
    e.stopPropagation()
    closeMobileMenu()
    openVox()
  }

  document.addEventListener('click', handleVoxTrigger, true)
  document.addEventListener('touchend', function (e) {
    if (isVoxTrigger(e.target.closest('a, button, [data-vox-open], .ai-orb, #aiOrb'))) {
      handleVoxTrigger(e)
    }
  }, { passive: false, capture: true })

  window.openVox = function () {
    var o = document.getElementById('vox-overlay')
    if (!o || closing) return

    if (o.classList.contains('open')) {
      closeVox(true)
      return
    }

    ensureEnergyField()
    closeMobileMenu()
    o.classList.add('open')
    o.style.display = 'flex'
    lockScroll(true)

    var f = iframe()
    if (!f) return
    normalizeIframe(f)

    function start() {
      if (closing) return
      sessionActive = true
      post(f, { type: 'voxtalk-start' })
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

    var f = iframe()

    function finishClose() {
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
