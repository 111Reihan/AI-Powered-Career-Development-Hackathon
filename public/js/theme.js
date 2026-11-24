// Runs before first paint (loaded without defer) so there is no flash of the wrong theme.
(function () {
  var t = null;
  try { t = localStorage.getItem('orbit.theme'); } catch (e) {}
  if (t !== 'dark') t = 'light'; // light by default; dark only when the student turns it on
  document.documentElement.dataset.theme = t;
})();
