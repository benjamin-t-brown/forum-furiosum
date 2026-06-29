(function () {
  'use strict';

  var SELECTOR = 'iframe.forum-furiosum-embed';
  var MAX_HEIGHT = 10000;

  function iframeOrigin(iframe) {
    try {
      return new URL(iframe.src, window.location.href).origin;
    } catch (_err) {
      return null;
    }
  }

  function wireIframes() {
    var iframes = document.querySelectorAll(SELECTOR);
    if (!iframes.length) {return;}

    window.addEventListener('message', function (event) {
      if (!event.data || event.data.type !== 'embed:resize') {return;}
      var height = event.data.height;
      if (typeof height !== 'number' || !Number.isFinite(height) || height < 0 || height > MAX_HEIGHT) {
        return;
      }

      iframes.forEach(function (iframe) {
        if (event.source !== iframe.contentWindow) {return;}
        var expectedOrigin = iframeOrigin(iframe);
        if (!expectedOrigin || event.origin !== expectedOrigin) {return;}
        iframe.style.height = Math.ceil(height) + 'px';
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireIframes);
  } else {
    wireIframes();
  }
})();
