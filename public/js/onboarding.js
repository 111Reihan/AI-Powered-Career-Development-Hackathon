// Used by onboarding.html and settings.html (same profile form).
(function () {
  const { esc, $, $$ } = Orbit, D = OrbitData;
  document.addEventListener('DOMContentLoaded', () => {
    const form = $('#profileForm');
    const s = Orbit.state, p = s.profile;
    const isSettings = document.body.dataset.page === 'settings';
    form.innerHTML = `
      <div class="grid g2">
        <div class="field"><label for="name">Your name</label><input id="name" type="text" maxlength="40" autocomplete="given-name" value="${esc(p.name)}" required></div>
        <div class="field"><label for="study">What are you studying?</label><input id="study" type="text" maxlength="60" placeholder="e.g. Computer science" value="${esc(p.study)}"></div>
        <div class="field"><label for="year">Year</label><select id="year">${['', 'Year 1', 'Year 2', 'Year 3', 'Year 4+', 'Postgraduate', 'Recent graduate', 'High school'].map((y) => `<option${p.year === y ? ' selected' : ''}>${y}</option>`).join('')}</select></div>
        <div class="field"><label for="hours">Hours you can learn each week</label><input id="hours" type="number" min="1" max="40" value="${esc(p.hours)}"></div>
        <div class="field"><label for="weeks">Goal: be job-ready in how many weeks?</label><input id="weeks" type="number" min="4" max="104" value="${esc(p.weeks)}"></div>
      </div>
      <fieldset class="field"><legend>What interests you? (pick any)</legend><div class="chips">
        ${Object.entries(D.INTERESTS).map(([k, l]) => `<label class="chip logo-chip"><input type="checkbox" name="interest" value="${k}"${p.interests.includes(k) ? ' checked' : ''}><span>${OrbitIcons.icon(D.LOGO.interest[k], 20, l)} ${esc(l)}</span></label>`).join('')}</div></fieldset>
      <fieldset class="field"><legend>How much do you enjoy each kind of work? (1 = not much, 5 = a lot)</legend>
        ${Object.entries(D.STYLES).map(([k, l]) => `<div class="range"><label for="st-${k}">${esc(l)}</label><output id="o-${k}">${p.style[k]}</output><input id="st-${k}" type="range" min="1" max="5" value="${p.style[k]}" style="grid-column:1/-1"></div>`).join('')}</fieldset>
      <div id="err" class="notice bad" role="alert" hidden></div>
      <button class="btn" type="submit">${isSettings ? 'Save changes' : 'Save and see my careers →'}</button>`;
    $$('input[type=range]', form).forEach((r) => r.addEventListener('input', () => { $('#o-' + r.id.slice(3)).textContent = r.value; }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = $('#name').value.trim();
      const hours = Number($('#hours').value), weeks = Number($('#weeks').value);
      const err = $('#err');
      const msg = !name ? 'Please enter your name.' : !(hours >= 1 && hours <= 40) ? 'Weekly hours must be between 1 and 40.' : !(weeks >= 4 && weeks <= 104) ? 'Goal weeks must be between 4 and 104.' : '';
      if (msg) { err.textContent = msg; err.hidden = false; err.scrollIntoView({ block: 'center' }); return; }
      Orbit.save((st) => {
        st.profile = {
          name, study: $('#study').value.trim(), year: $('#year').value, hours, weeks,
          interests: $$('input[name=interest]:checked', form).map((i) => i.value),
          style: Object.fromEntries(Object.keys(D.STYLES).map((k) => [k, Number($('#st-' + k).value)])),
        };
        st.onboarded = true; if (!st.startedAt) st.startedAt = Date.now();
      });
      Orbit.markActive();
      if (isSettings) { Orbit.toast('Saved.'); setTimeout(() => location.reload(), 500); } else location.href = 'careers.html';
    });
    if (isSettings) {
      $('#exportBtn').addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(Orbit.state, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'orbit-data.json'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
      $('#resetBtn').addEventListener('click', () => {
        if (confirm('Erase your profile, skills and progress on this device? This cannot be undone.')) { Orbit.reset(); location.href = 'index.html'; }
      });
    }
  });
})();
