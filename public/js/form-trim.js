(function () {
  'use strict';

  var SKIP_INPUT_TYPES = {
    password: true,
    file: true,
    checkbox: true,
    radio: true,
    hidden: true,
    submit: true,
    button: true,
    image: true,
  };

  function normalizeLineEndings(value) {
    return value.replace(/\r\n?/g, '\n');
  }

  function trimField(el) {
    if (el.tagName === 'TEXTAREA') {
      el.value = normalizeLineEndings(el.value).trim();
      return;
    }
    if (el.tagName !== 'INPUT') {return;}
    var type = (el.type || 'text').toLowerCase();
    if (!SKIP_INPUT_TYPES[type]) {
      el.value = el.value.trim();
    }
  }

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') {return;}
    form.querySelectorAll('input, textarea').forEach(trimField);
  }, true);
})();
