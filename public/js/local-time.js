(function () {
  'use strict';

  function formatLocalTime(el) {
    var iso = el.getAttribute('datetime');
    if (!iso) {
      return;
    }

    var date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return;
    }

    var mode = el.getAttribute('data-mode') || 'datetime';
    var options = mode === 'date'
      ? { dateStyle: 'medium' }
      : { dateStyle: 'medium', timeStyle: 'short' };

    el.textContent = new Intl.DateTimeFormat(undefined, options).format(date);
  }

  document.querySelectorAll('time.local-time').forEach(formatLocalTime);
})();
