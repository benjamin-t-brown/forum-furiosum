(function () {
  'use strict';

  var MIN_INPUT_MAXLENGTH = 200;

  function shouldShowCounter(el) {
    var max = parseInt(el.getAttribute('maxlength'), 10);
    if (!max || max <= 0) {return false;}
    if (el.tagName === 'TEXTAREA') {return true;}
    if (el.tagName === 'INPUT') {
      var type = (el.type || 'text').toLowerCase();
      if (type === 'password' || type === 'hidden' || type === 'checkbox' || type === 'radio') {
        return false;
      }
      return max >= MIN_INPUT_MAXLENGTH;
    }
    return false;
  }

  function normalizeLineEndings(value) {
    return value.replace(/\r\n?/g, '\n');
  }

  function effectiveLength(value) {
    return normalizeLineEndings(value).length;
  }

  function formatRemaining(remaining) {
    var n = remaining.toLocaleString();
    return n + (remaining === 1 ? ' character left' : ' characters left');
  }

  function updateCounter(el, counter) {
    var max = parseInt(el.getAttribute('maxlength'), 10);
    var remaining = Math.max(0, max - effectiveLength(el.value));
    counter.textContent = formatRemaining(remaining);

    var warnAt = Math.min(100, Math.ceil(max * 0.1));
    counter.classList.toggle('char-counter--warn', remaining > 0 && remaining <= warnAt);
    counter.classList.toggle('char-counter--limit', remaining === 0);
  }

  function initCounter(el) {
    if (!shouldShowCounter(el) || el.dataset.charCounterInit) {return;}
    el.dataset.charCounterInit = '1';

    var counter = document.createElement('div');
    counter.className = 'char-counter';
    counter.setAttribute('aria-live', 'polite');
    counter.setAttribute('aria-atomic', 'true');
    counter.id = 'char-counter-' + Math.random().toString(36).slice(2, 10);
    el.insertAdjacentElement('afterend', counter);

    var describedBy = el.getAttribute('aria-describedby');
    el.setAttribute('aria-describedby', describedBy ? describedBy + ' ' + counter.id : counter.id);

    updateCounter(el, counter);
    el.addEventListener('input', function () {
      if (el.tagName === 'TEXTAREA' && el.value.indexOf('\r') !== -1) {
        el.value = normalizeLineEndings(el.value);
      }
      updateCounter(el, counter);
    });
  }

  function initAll(root) {
    (root || document).querySelectorAll('textarea[maxlength], input[maxlength]').forEach(initCounter);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { initAll(); });
  } else {
    initAll();
  }
})();
